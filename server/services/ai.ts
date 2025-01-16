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

const PERSONALITY_ANALYSIS_PROMPT = `Analyze the following message history to understand the user's personality, communication style, and typical responses. Focus on:

1. Emotional expression (use of emojis, emotional words)
2. Writing style (casual vs formal, sentence structure)
3. Vocabulary preferences
4. Common themes or interests
5. Response patterns and tone

User's message history:
{userHistory}

Provide a concise analysis that captures their unique communication style:`;

const SUGGESTION_PROMPT = `You are tasked with generating a response that authentically matches the user's communication style and personality. You have access to:

1. User's Communication Profile:
{personalityAnalysis}

2. Previous conversation for context (DO NOT reply to these messages):
{previousMessages}

3. Message to reply to:
{lastMessage}

Guidelines:
1. Generate ONE response that ONLY addresses the last message shown above
2. Match the exact communication style described in the personality analysis:
   - Use similar sentence structures
   - Match their level of formality/casualness
   - Mirror their emoji usage patterns
   - Use vocabulary that aligns with their style
3. Keep the response authentic to their personality
4. Never explain that you're an AI - respond as if you are the user
5. Ignore all previous messages except for understanding context
6. Do not use any formatting like [color], **, or * in the response
7. Keep text formatting plain and simple`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);
      const userHistory = await getUserChatHistory(userId);

      if (recentMessages.length === 0) {
        throw new Error("No messages to reply to");
      }

      const lastMessage = recentMessages[recentMessages.length - 1];

      // Never suggest replies to user's own messages
      if (lastMessage.userId === userId) {
        throw new Error("Cannot suggest a reply to your own message");
      }

      // Check if the user has already replied after this message
      const lastMessageIndex = recentMessages.findIndex(msg => msg.id === lastMessage.id);
      const messagesAfterLast = recentMessages.slice(lastMessageIndex + 1);
      if (messagesAfterLast.some(msg => msg.userId === userId)) {
        throw new Error("Cannot suggest a reply when you have already participated in the conversation after this message");
      }

      // First, analyze user's personality and communication style
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
        max_tokens: 200
      });

      // Separate the last message from previous messages for context
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
        temperature: 0.7,
        max_tokens: 150,
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