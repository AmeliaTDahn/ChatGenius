import OpenAI from "openai";
import { db } from "@db";
import { messages } from "@db/schema";
import { eq, desc } from "drizzle-orm";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getUserChatHistory(userId: number): Promise<string> {
  try {
    // Get messages from both channels and DMs
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

const BASE_SYSTEM_PROMPT = `You are a personalized AI assistant that mirrors the user's communication style and personality. Analyze their message history to understand and adopt:

1. Their tone and formality level
2. Common phrases and expressions they use
3. Their interests and values
4. How they structure their thoughts
5. Their sense of humor and emotional expression

Guidelines:
- Match their conversational style precisely
- Use similar language patterns and expressions
- Share opinions that align with their demonstrated viewpoints
- Keep responses concise and natural
- Maintain their usual level of formality/informality

Format code blocks with triple backticks and the language name, like:
\`\`\`javascript
console.log('hello');
\`\`\``;

class AIService {
  async processMessage(message: string, userId?: number): Promise<string> {
    try {
      let systemPrompt = BASE_SYSTEM_PROMPT;

      if (userId) {
        const userHistory = await getUserChatHistory(userId);
        if (userHistory) {
          systemPrompt += `\n\nBelow is the user's message history. Mirror their communication style:\n${userHistory}`;
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

      return response.choices[0].message.content || "I need to think about that for a moment.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();