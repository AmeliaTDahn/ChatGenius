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

1. Emotional Intensity and Expression:
   - How strongly do they express emotions?
   - Do they use emojis, punctuation, or formatting for emphasis?
   - What triggers their most intense reactions?

2. Opinion Strength and Topics:
   - Which topics do they engage with most?
   - How do they express agreement/disagreement?
   - What language patterns indicate their views?

3. Characteristic Style:
   - Specific phrases or expressions they frequently use
   - Their typical level of formality or casualness
   - Use of emojis, punctuation, or formatting

4. Response Patterns:
   - How do they typically start conversations?
   - How do they react to different types of messages?
   - What's their usual message length and structure?

User's message history:
{userHistory}

Provide a detailed analysis of their communication style and emotional patterns:`;

const SUGGESTION_PROMPT = `Generate a reply that naturally matches this user's communication style:

1. User's Communication Profile:
{personalityAnalysis}

2. Previous conversation for context:
{previousMessages}

3. Message to reply to:
{lastMessage}

Guidelines:
1. Match their communication style authentically:
   - Use similar formatting patterns and emphasis
   - Mirror their vocabulary level and tone
   - Keep their characteristic expressions
   - Match their emoji usage pattern

2. Keep it natural:
   - Maintain their level of formality
   - Use their typical sentence structure
   - Keep their common expressions
   - Match their usual message length

3. IMPORTANT:
   - Keep it brief and natural
   - Never mention being AI
   - Match their baseline style
   - Be direct but friendly`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);
      const userHistory = await getUserChatHistory(userId);

      const lastMessage = recentMessages[recentMessages.length - 1];
      
      if (!lastMessage) {
        throw new Error("No messages to reply to");
      }

      if (lastMessage.userId === userId) {
        throw new Error("Cannot suggest a reply to your own message");
      }

      const lastMessageIndex = recentMessages.findIndex(msg => msg.id === lastMessage.id);
      const messagesAfterLast = recentMessages.slice(lastMessageIndex + 1);
      if (messagesAfterLast.some(msg => msg.userId === userId)) {
        throw new Error("Cannot suggest a reply when you have already participated in the conversation after this message");
      }

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
        max_tokens: 500
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
        temperature: 0.7,
        max_tokens: 100,
        presence_penalty: 0.2,
        frequency_penalty: 0.3
      });

      return response.choices[0].message.content || "I'd need more context to generate a good suggestion.";
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();