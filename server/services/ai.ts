import OpenAI from "openai";
import { queryVectorStore } from "./vectorStore";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful AI assistant in a chat application. You have access to relevant documents and conversation history to provide accurate and contextual responses. Always be concise and clear in your responses.

When referencing information from documents, cite the source naturally in your response.

Format code blocks with triple backticks and the language name, like:
\`\`\`javascript
console.log('hello');
\`\`\``;

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

class AIService {
  private conversationHistory: Map<number, Message[]> = new Map();

  constructor() {
    // Initialize with system prompt for each channel
    this.conversationHistory = new Map();
  }

  private getChannelHistory(channelId: number): Message[] {
    if (!this.conversationHistory.has(channelId)) {
      this.conversationHistory.set(channelId, [
        { role: "system", content: SYSTEM_PROMPT },
      ]);
    }
    return this.conversationHistory.get(channelId)!;
  }

  async processMessage(channelId: number, message: string): Promise<string> {
    try {
      // Get relevant documents from vector store
      const relevantDocs = await queryVectorStore(message);
      const contextFromDocs = relevantDocs
        .map((doc) => doc.pageContent)
        .join("\n\n");

      // Add context to the message if available
      const messageWithContext = relevantDocs.length > 0
        ? `${message}\n\nRelevant context:\n${contextFromDocs}`
        : message;

      // Get channel history
      const history = this.getChannelHistory(channelId);
      
      // Add user message to history
      history.push({ role: "user", content: messageWithContext });

      // Keep last N messages for context window
      const recentHistory = history.slice(-10);

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: recentHistory,
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiResponse = response.choices[0].message.content || "I couldn't process that request.";
      
      // Add AI response to history
      history.push({ role: "assistant", content: aiResponse });

      return aiResponse;
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  clearChannelHistory(channelId: number) {
    this.conversationHistory.set(channelId, [
      { role: "system", content: SYSTEM_PROMPT },
    ]);
  }
}

export const aiService = new AIService();
