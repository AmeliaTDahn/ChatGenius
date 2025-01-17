import OpenAI from "openai";
import { db } from "@db";
import { messages, suggestionFeedback } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getUserMessages(userId: number, limit: number = 50): Promise<string> {
  try {
    const userMessages = await db.query.messages.findMany({
      where: eq(messages.userId, userId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit,
    });

    return userMessages.map(msg => msg.content).join('\n');
  } catch (error) {
    console.error("Error fetching user messages:", error);
    return "";
  }
}

async function getPastSuggestionFeedback(userId: number): Promise<{ 
  acceptedSuggestions: string[], 
  rejectedSuggestions: string[] 
}> {
  try {
    const feedback = await db.query.suggestionFeedback.findMany({
      where: eq(suggestionFeedback.userId, userId),
      orderBy: [desc(suggestionFeedback.createdAt)],
      limit: 20
    });

    return {
      acceptedSuggestions: feedback
        .filter(f => f.wasAccepted)
        .map(f => f.suggestedContent),
      rejectedSuggestions: feedback
        .filter(f => !f.wasAccepted)
        .map(f => f.suggestedContent)
    };
  } catch (error) {
    console.error("Error fetching suggestion feedback:", error);
    return { acceptedSuggestions: [], rejectedSuggestions: [] };
  }
}

const PERSONAL_STYLE_ANALYSIS_PROMPT = `Analyze the following message history from a single user to understand their unique communication style. Focus on:

1. Personal Expression:
   - Their typical emotional tone and intensity
   - Common phrases, slang, or expressions they use
   - How they emphasize things (caps, punctuation, emojis)

2. Opinion Patterns:
   - Topics they feel strongly about
   - How they express agreement/disagreement
   - Their typical stance on different subjects

3. Writing Style:
   - Vocabulary level and complexity
   - Sentence structure
   - Use of formatting (paragraphs, lists, etc.)
   - Emoji and punctuation patterns

User's message history:
{userHistory}

Previous well-received suggestions:
{acceptedSuggestions}

Previously rejected suggestions (avoid similar patterns):
{rejectedSuggestions}

Provide a detailed analysis of their personal communication style:`;

const PERSONALIZED_SUGGESTION_PROMPT = `Generate a brief reply that matches this user's personal style:

1. User's Personal Communication Style Analysis:
{personalityAnalysis}

2. Message to reply to:
{messageToReply}

3. Learning from past feedback:
Successful suggestions that the user liked:
{acceptedSuggestions}

Suggestions the user rejected (avoid similar patterns):
{rejectedSuggestions}

Guidelines:
1. Keep it SHORT (1-2 sentences max)
2. Match their personal style exactly:
   - Use CAPS/punctuation if they typically do
   - Include their commonly used emojis
   - Mirror their typical phrases and expressions
3. Reflect their usual opinion patterns and stance
4. Keep formatting clean (no special formatting tags)
5. Sound natural and casual like them
6. Never mention being AI or include usernames
7. Follow patterns from accepted suggestions
8. Avoid patterns from rejected suggestions`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const userHistory = await getUserMessages(userId);
      const { acceptedSuggestions, rejectedSuggestions } = await getPastSuggestionFeedback(userId);

      if (!userHistory) {
        throw new Error("No message history found for user");
      }

      // Get message to reply to
      const [messageToReply] = await db.query.messages.findMany({
        where: and(
          eq(messages.channelId, channelId),
          eq(messages.userId, userId)
        ),
        orderBy: [desc(messages.createdAt)],
        limit: 1
      });

      if (!messageToReply) {
        throw new Error("No message found to reply to");
      }

      // First, analyze user's personal communication style
      const personalStyleAnalysisPrompt = PERSONAL_STYLE_ANALYSIS_PROMPT
        .replace("{userHistory}", userHistory)
        .replace("{acceptedSuggestions}", acceptedSuggestions.join('\n'))
        .replace("{rejectedSuggestions}", rejectedSuggestions.join('\n'));

      const personalityAnalysis = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: personalStyleAnalysisPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const suggestionPrompt = PERSONALIZED_SUGGESTION_PROMPT
        .replace("{personalityAnalysis}", personalityAnalysis.choices[0].message.content || '')
        .replace("{messageToReply}", messageToReply.content)
        .replace("{acceptedSuggestions}", acceptedSuggestions.join('\n'))
        .replace("{rejectedSuggestions}", rejectedSuggestions.join('\n'));

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: suggestionPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 60,
        presence_penalty: 0.3,
        frequency_penalty: 0.5
      });

      const suggestion = response.choices[0].message.content || "Hey! How's it going?";

      // Store the generated suggestion in the feedback table (initially not accepted)
      await db.insert(suggestionFeedback).values({
        userId,
        channelId,
        suggestedContent: suggestion,
        messageLength: suggestion.length,
        wasAccepted: false
      });

      // Remove any quotes from the suggestion
      return suggestion.replace(/['"]/g, '');
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      throw error;
    }
  }

  async recordSuggestionFeedback(userId: number, channelId: number, content: string, wasAccepted: boolean): Promise<void> {
    try {
      await db.update(suggestionFeedback)
        .set({ 
          wasAccepted,
          messageLength: content.length 
        })
        .where(and(
          eq(suggestionFeedback.userId, userId),
          eq(suggestionFeedback.channelId, channelId),
          eq(suggestionFeedback.suggestedContent, content)
        ));
    } catch (error) {
      console.error("Error recording suggestion feedback:", error);
      throw error;
    }
  }

  async processMessage(content: string, userId: number): Promise<string> {
    try {
      const userHistory = await getUserMessages(userId);
      const { acceptedSuggestions } = await getPastSuggestionFeedback(userId);

      const prompt = `You are having a conversation with a user. Analyze their communication style from their message history and respond in a similar tone and style.

User's message history for context:
${userHistory}

Previous successful responses they liked:
${acceptedSuggestions.join('\n')}

Current message to respond to:
${content}

Guidelines:
1. Match their communication style (casual/formal, emoji usage, etc.)
2. Keep responses concise and natural
3. Don't mention being AI or analyzing their style
4. Focus on being helpful while maintaining their preferred tone
5. Follow patterns from previously successful responses`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 150
      });

      return response.choices[0].message.content || "I understand. Could you tell me more?";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();