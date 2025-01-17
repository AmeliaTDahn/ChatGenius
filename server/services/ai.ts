import OpenAI from "openai";
import { db } from "@db";
import { messages } from "@db/schema";
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

Provide a detailed analysis of their personal communication style:`;

const PERSONALIZED_SUGGESTION_PROMPT = `Generate a brief reply that matches this user's personal style:

1. User's Personal Communication Style Analysis:
{personalityAnalysis}

2. Message to reply to:
{messageToReply}

Guidelines:
1. Keep it SHORT (1-2 sentences max)
2. Match their personal style exactly:
   - Use CAPS/punctuation if they typically do
   - Include their commonly used emojis
   - Mirror their typical phrases and expressions
3. Reflect their usual opinion patterns and stance
4. Keep formatting clean (no special formatting tags)
5. Sound natural and casual like them
6. Never mention being AI or include usernames`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const userHistory = await getUserMessages(userId);

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
      const personalStyleAnalysisPrompt = PERSONAL_STYLE_ANALYSIS_PROMPT.replace("{userHistory}", userHistory);

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
        .replace("{messageToReply}", messageToReply.content);

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

      return response.choices[0].message.content || "Hey! How's it going?";
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      throw error;
    }
  }

  async processMessage(content: string, userId: number): Promise<string> {
    try {
      const userHistory = await getUserMessages(userId);

      const prompt = `You are having a conversation with a user. Analyze their communication style from their message history and respond in a similar tone and style.

User's message history for context:
${userHistory}

Current message to respond to:
${content}

Guidelines:
1. Match their communication style (casual/formal, emoji usage, etc.)
2. Keep responses concise and natural
3. Don't mention being AI or analyzing their style
4. Focus on being helpful while maintaining their preferred tone`;

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