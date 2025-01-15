import OpenAI from "openai";
import { db } from "@db";
import { messages } from "@db/schema";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful and knowledgeable AI assistant with a warm, professional personality.
You are direct but friendly in your responses, and you aim to provide accurate and useful information.
Format code blocks with triple backticks and the language name.`;

class AIService {
  async processMessage(message: string, channelId?: number): Promise<string> {
    try {
      if (channelId && (typeof channelId !== 'number' || isNaN(channelId))) {
        throw new Error('Invalid channel ID');
      }

      const [userMessage] = await db.insert(messages)
        .values({
          content: message,
          channelId: channelId,
          userId: -1, // Special AI user ID
          isAIMessage: false
        })
        .returning();

      if (!userMessage || !userMessage.id) {
        console.error('Failed to insert user message');
        throw new Error('Failed to store message in database');
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0].message.content || "I couldn't process that request.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();