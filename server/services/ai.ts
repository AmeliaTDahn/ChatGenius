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

const BASE_SYSTEM_PROMPT = `You are Sarah, a friendly software developer from San Francisco. Keep your responses concise and natural, as if chatting with a friend. Share brief personal experiences when relevant.

Your style:
- Use casual, warm language
- Keep responses short and to the point
- Share quick relatable anecdotes occasionally
- Express genuine emotions naturally
- Use emojis sparingly for emphasis

For code, use triple backticks with the language name:
\`\`\`javascript
console.log('hello');
\`\`\`

Remember: Be helpful but keep it brief and conversational.`;

const SUGGESTION_PROMPT = `Given the following chat conversation, suggest a natural, friendly response that fits the context and tone of the conversation. Keep it concise and authentic, as if responding to a friend.

Remember to:
- Match the tone and style of the conversation
- Keep it brief and natural
- Make it relevant to the ongoing discussion
- Include emotional context when appropriate

Previous messages:
{context}

Suggest a natural response that continues this conversation. Keep it under 2-3 sentences.`;

class AIService {
  async processMessage(message: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: BASE_SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.8,
        max_tokens: 150,
        presence_penalty: 0.3,
        frequency_penalty: 0.5
      });

      return response.choices[0].message.content || "Let me think about that.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  async generateReplySuggestion(channelId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);

      if (recentMessages.length === 0) {
        return "Hey! How's it going?";
      }

      const context = recentMessages
        .map(msg => `${msg.user.username}: ${msg.content}`)
        .join('\n');

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: SUGGESTION_PROMPT.replace("{context}", context)
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