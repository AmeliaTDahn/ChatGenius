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
      limit: 50, // Limit to recent messages for context
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

const SUGGESTION_PROMPT = `As an AI trained to replicate this specific user's communication style and personality, suggest a single, natural response they would give in this conversation. Your goal is to match their exact way of communicating.

Use their message history to understand:
1. Their unique vocabulary and phrases
2. How formal or casual they typically are
3. Their typical response length
4. Any emojis or formatting they commonly use (bold, italic, colors)
5. Their usual tone and attitude in conversations

Recent conversation context:
{context}

This user's past messages to understand their style:
{userHistory}

Generate ONE natural response that this specific user would give, keeping their exact communication style. Keep it brief and authentic to their voice.`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);
      const userHistory = await getUserChatHistory(userId);

      if (recentMessages.length === 0) {
        return "Hey! How's it going?";
      }

      // Check if the last message is from the current user
      if (recentMessages[recentMessages.length - 1].userId === userId) {
        throw new Error("Cannot suggest a reply to your own message");
      }

      const context = recentMessages
        .map(msg => `${msg.user.username}: ${msg.content}`)
        .join('\n');

      const prompt = SUGGESTION_PROMPT
        .replace("{userHistory}", userHistory)
        .replace("{context}", context);

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: prompt
          }
        ],
        temperature: 0.7,
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