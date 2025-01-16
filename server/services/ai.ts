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
      orderBy: [desc(messages.createdAt)],
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

const PERSONALITY_ANALYSIS_PROMPT = `Analyze the following message history to understand the user's authentic communication style, including their use of strong language and casual expressions. Focus on:

1. Language and Expression Style:
   - Their natural vocabulary, including swear words or strong language
   - How they express emotions and emphasis
   - Any unique phrases or expressions they regularly use

2. Communication Patterns:
   - Their typical message structure and length
   - Use of formatting, punctuation, or special characters
   - How they express agreement/disagreement

3. Tone and Attitude:
   - Their overall communication style (casual, intense, etc.)
   - How they react in different emotional states
   - Their use of humor or sarcasm

4. Characteristic Elements:
   - Preferred emoji usage
   - Punctuation patterns
   - Capitalization style
   - Use of abbreviations or slang

User's message history:
{userHistory}

Provide a detailed analysis of their authentic communication style, preserving their natural language patterns:`;

const SUGGESTION_PROMPT = `Generate a reply that authentically matches this user's communication style:

Previous context:
{previousMessages}

Most recent message to reply to:
{lastMessage}

User's typical communication style analysis:
{personalityAnalysis}

Guidelines:
1. Maintain natural authenticity:
   - Use natural vocabulary and expression patterns
   - Match their casual/formal balance
   - Use emojis and punctuation naturally
   - Avoid mirroring excessive capitalization

2. Match their style precisely:
   - Use similar message structure and length
   - Copy their formatting patterns
   - Mirror their emphasis techniques
   - Keep their characteristic expressions

3. IMPORTANT:
   - Don't sanitize or tone down their language
   - Keep it brief and natural
   - Never mention being AI
   - Match their baseline communication style`;

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

      // Get personality analysis first
      const personalityAnalysis = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: PERSONALITY_ANALYSIS_PROMPT.replace("{userHistory}", userHistory)
          }
        ],
        temperature: 0.7,
        max_tokens: 500
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
            content: prompt + "\n\nIMPORTANT: Do not include the user's name or any name prefix in the response."
          }
        ],
        temperature: 0.9,
        max_tokens: 150,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      });

      // Remove any name prefix pattern (e.g. "Name: message")
      const suggestion = response.choices[0].message.content?.replace(/^[^:]+:\s*/, '') || "I'd need more context to generate a good suggestion.";
      return suggestion;
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();