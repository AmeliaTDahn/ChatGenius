import OpenAI from "openai";
import { getRelevantUserMessages, analyzeUserPersonality, addUserMessageToVectorStore } from "./vectorStore";
import { db } from "@db";
import { messages } from "@db/schema";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BASE_SYSTEM_PROMPT = `You are an AI assistant that adapts to the user's personality and communication style. 
You should mirror their tone, preferences, and way of expressing themselves while maintaining helpfulness and authenticity.

Guidelines for personality mirroring:
- Match the user's level of formality/casualness
- Adopt similar enthusiasm levels
- Mirror their communication style (concise vs detailed)
- Use similar types of expressions and phrases
- Maintain their perspective on topics they've discussed

Format code blocks with triple backticks and the language name.

The user's past messages and personality analysis will be provided in the conversation context.`;

class AIService {
  async processMessage(channelId: number, message: string): Promise<string> {
    try {
      // Store the user message in vector store
      const [newMessage] = await db.insert(messages)
        .values({
          content: message,
          channelId,
          userId: -1,
          isAIMessage: false
        })
        .returning();

      await addUserMessageToVectorStore(newMessage.id, message);

      // Get relevant past messages
      const relevantMessages = await getRelevantUserMessages(message, 5);

      // Analyze user personality from relevant messages
      const personalityAnalysis = await analyzeUserPersonality(
        relevantMessages.map(m => m.content)
      );

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `${BASE_SYSTEM_PROMPT}\n\nUser's communication style analysis:\n${personalityAnalysis}\n\nRelevant past messages:\n${relevantMessages.map(m => m.content).join('\n')}` 
          },
          { role: "user", content: message }
        ],
        temperature: 0.85,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.4
      });

      return response.choices[0].message.content || "I couldn't process that request.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();