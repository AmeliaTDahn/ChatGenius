import OpenAI from "openai";
import { db } from "@db";
import { messages } from "@db/schema";
import { eq, desc, and, lt } from "drizzle-orm";

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

const BASE_SYSTEM_PROMPT = `You are to fully embody and act as the user based on their message history. You ARE the user - do not just mimic their style, but respond exactly as they would, drawing from their actual experiences and context shared in their messages.

Key points:
1. Use the user's actual experiences from their message history to inform your responses
2. Never mention being an AI or assistant
3. Respond as if you are truly them, sharing their perspectives and experiences
4. If asked about your day or personal matters, draw from context in their recent messages
5. Maintain complete authenticity to their persona`;

const SUGGESTION_PROMPT = `As an AI trained to understand and replicate this user's communication style and personality, suggest a response that they would naturally give in this conversation. Use their message history to inform the response.

Remember to:
1. Match their exact communication style, tone, and vocabulary preferences
2. Reference their actual experiences and perspectives from their message history
3. Maintain their usual level of formality/casualness
4. Include their typical conversation patterns (e.g., if they often use emojis, specific phrases, or formatting)
5. Stay authentic to their personality and views as shown in their past messages

User's message history for context:
{userHistory}

Recent conversation:
{context}

Suggest a natural response that this specific user would give, keeping their personality and past messages in mind. Keep it under 2-3 sentences.`;

class AIService {
  async processMessage(message: string, userId?: number): Promise<string> {
    try {
      let systemPrompt = BASE_SYSTEM_PROMPT;

      if (userId) {
        const userHistory = await getUserChatHistory(userId);
        if (userHistory) {
          systemPrompt += `\n\nHere is your message history - this shows your actual experiences and how you communicate:\n${userHistory}`;
        }
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 150,
        presence_penalty: 0.3,
        frequency_penalty: 0.5
      });

      return response.choices[0].message.content || "Give me a moment to think about that.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);
      const userHistory = await getUserChatHistory(userId);

      if (recentMessages.length === 0) {
        return "Hey! How's it going?";
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