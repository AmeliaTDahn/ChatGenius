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

async function getUserChatHistory(userId: number): Promise<string> {
  try {
    const userMessages = await db.query.messages.findMany({
      where: eq(messages.userId, userId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit: 50,
    });

    return userMessages.map(msg => msg.content).join('\n');
  } catch (error) {
    console.error("Error fetching user chat history:", error);
    return "";
  }
}

async function getRecentMessages(channelId: number, limit: number = 10) {
  try {
    const recentMessages = await db.query.messages.findMany({
      where: eq(messages.channelId, channelId),
      orderBy: [desc(messages.createdAt)],
      limit,
      with: {
        user: {
          columns: {
            username: true,
            id: true
          }
        }
      }
    });

    return recentMessages.reverse();
  } catch (error) {
    console.error("Error fetching recent messages:", error);
    return [];
  }
}

const PERSONALITY_ANALYSIS_PROMPT = `Analyze the following message history to understand the user's personality, communication style, emotional patterns, and opinions. Focus on:

1. Emotional Expression:
   - How do they express strong emotions (anger, excitement, etc.)?
   - What topics trigger strong emotional responses?
   - Do they use caps, punctuation, or emojis for emphasis?

2. Topic-Specific Reactions:
   - What subjects do they feel strongly about (positive or negative)?
   - How do they express disagreement or frustration?
   - What are their common complaints or criticisms?

3. Communication Style:
   - Vocabulary and sentence structure
   - Use of slang, casual vs formal language
   - Emoji patterns and emphasis techniques

User's message history:
{userHistory}

Provide a detailed analysis of their communication style and emotional patterns:`;

const SUGGESTION_PROMPT = `Generate a brief but emotionally matched response based on this information:

1. User's Communication Profile and Emotional Patterns:
{personalityAnalysis}

2. Previous conversation for context:
{previousMessages}

3. Message to reply to:
{lastMessage}

Guidelines:
1. Keep the response SHORT and CONCISE (1-2 sentences max)
2. Match their emotional intensity about this topic:
   - Use their anger style if they get angry about similar topics
   - Mirror their excitement patterns if it's a positive topic
   - Match their criticism style if they're typically critical
3. Copy their style exactly:
   - Use CAPS/punctuation (!!!) if they do when emotional
   - Include their typical emojis
   - Use their common phrases/slang
4. Never mention being AI or include usernames - just provide the direct response
5. Keep formatting plain (no [color], **, or *)`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);
      const userHistory = await getUserChatHistory(userId);

      if (recentMessages.length === 0) {
        throw new Error("No messages to reply to");
      }

      const lastMessage = recentMessages[recentMessages.length - 1];

      if (lastMessage.userId === userId) {
        throw new Error("Cannot suggest a reply to your own message");
      }

      const lastMessageIndex = recentMessages.findIndex(msg => msg.id === lastMessage.id);
      const messagesAfterLast = recentMessages.slice(lastMessageIndex + 1);
      if (messagesAfterLast.some(msg => msg.userId === userId)) {
        throw new Error("Cannot suggest a reply when you have already participated in the conversation after this message");
      }

      // First, analyze user's personality and emotional patterns
      const personalityAnalysisPrompt = PERSONALITY_ANALYSIS_PROMPT.replace("{userHistory}", userHistory);

      const personalityAnalysis = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: personalityAnalysisPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const previousMessages = recentMessages
        .slice(0, -1)
        .map(msg => `${msg.user.username}: ${msg.content}`)
        .join('\n');

      const prompt = SUGGESTION_PROMPT
        .replace("{personalityAnalysis}", personalityAnalysis.choices[0].message.content || '')
        .replace("{previousMessages}", previousMessages)
        .replace("{lastMessage}", `${lastMessage.user.username}: ${lastMessage.content}`);

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: prompt
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
}

export const aiService = new AIService();