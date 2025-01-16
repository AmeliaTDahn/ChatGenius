import OpenAI from "openai";
import { db } from "@db";
import { messages, aiConversations, aiMessages } from "@db/schema";
import { eq, desc, and } from "drizzle-orm";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getUserChatHistory(userId: number): Promise<string> {
  try {
    // Get messages from both regular channels and DMs
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

async function getOrCreateAIConversation(userId: number): Promise<number> {
  try {
    // Get the most recent conversation or create a new one
    const [existingConversation] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.lastMessageAt))
      .limit(1);

    if (existingConversation) {
      return existingConversation.id;
    }

    // Create new conversation if none exists
    const [newConversation] = await db
      .insert(aiConversations)
      .values({
        userId,
      })
      .returning();

    return newConversation.id;
  } catch (error) {
    console.error("Error managing AI conversation:", error);
    throw error;
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
      let conversationId: number | null = null;

      if (userId) {
        // Get user's communication style from regular chat history
        const userHistory = await getUserChatHistory(userId);
        if (userHistory) {
          systemPrompt += `\n\nBelow is the user's message history. Mirror their communication style:\n${userHistory}`;
        }

        // Get or create an AI conversation for this user
        conversationId = await getOrCreateAIConversation(userId);

        // Save the user's message
        await db.insert(aiMessages).values({
          conversationId,
          content: message,
          isFromAI: false,
        });
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

      const aiResponse = response.choices[0].message.content || "I need to think about that for a moment.";

      // Save the AI's response if we have a conversation
      if (conversationId) {
        await db.insert(aiMessages).values({
          conversationId,
          content: aiResponse,
          isFromAI: true,
        });

        // Update the conversation's last message timestamp
        await db
          .update(aiConversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(aiConversations.id, conversationId));
      }

      return aiResponse;
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();