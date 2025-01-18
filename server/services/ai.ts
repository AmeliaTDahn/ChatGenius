import OpenAI from "openai";
import { db } from "@db";
import { messages, suggestionFeedback, channelMembers, friends, directMessageChannels } from "@db/schema";
import { eq, desc, and, or, inArray, not } from "drizzle-orm";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getUserMessages(userId: number, limit: number = 100): Promise<Array<{ content: string; username: string; }>> {
  try {
    // Get channels where user is still a member
    const userChannels = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, userId));

    const channelIds = userChannels.map(uc => uc.channelId);

    // Get active DM channels for the user
    const userDMs = await db.query.directMessageChannels.findMany({
      where: or(
        eq(directMessageChannels.user1Id, userId),
        eq(directMessageChannels.user2Id, userId)
      )
    });

    const dmChannelIds = userDMs.map(dm => dm.channelId);

    // Get messages from all active channels, DMs, and AI conversations
    const allMessages = await db.query.messages.findMany({
      where: or(
        inArray(messages.channelId, [...channelIds, ...dmChannelIds]),
        eq(messages.channelId, -1) // Include AI channel messages
      ),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit,
      with: {
        user: {
          columns: {
            username: true
          }
        }
      }
    });

    return allMessages.map(msg => ({
      content: msg.content,
      username: msg.user?.username || 'AI Assistant'
    }));
  } catch (error) {
    console.error("Error fetching messages:", error);
    return [];
  }
}

async function getChannelMessages(channelId: number, limit: number = 100): Promise<Array<{ content: string; username: string; }>> {
  try {
    const channelMessages = await db.query.messages.findMany({
      where: eq(messages.channelId, channelId),
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      limit,
      with: {
        user: {
          columns: {
            username: true
          }
        }
      }
    });

    return channelMessages.map(msg => ({
      content: msg.content,
      username: msg.user?.username || 'AI Assistant'
    }));
  } catch (error) {
    console.error("Error fetching channel messages:", error);
    return [];
  }
}

async function getPastSuggestionFeedback(userId: number): Promise<{
  acceptedSuggestions: string[];
  rejectedSuggestions: string[];
}> {
  try {
    const feedback = await db.query.suggestionFeedback.findMany({
      where: eq(suggestionFeedback.userId, userId),
      orderBy: [desc(suggestionFeedback.createdAt)],
      limit: 20
    });

    return {
      acceptedSuggestions: feedback
        .filter(f => f.wasAccepted)
        .map(f => f.suggestedContent),
      rejectedSuggestions: feedback
        .filter(f => !f.wasAccepted)
        .map(f => f.suggestedContent)
    };
  } catch (error) {
    console.error("Error fetching suggestion feedback:", error);
    return { acceptedSuggestions: [], rejectedSuggestions: [] };
  }
}

class AIService {
  // Helper method to format message history for context
  private formatMessageHistory(messages: Array<{ content: string; username: string; }>): string {
    return messages
      .map(msg => `${msg.username}: ${msg.content}`)
      .join('\n');
  }

  async processMessage(content: string, userId: number): Promise<string> {
    try {
      const channelMessages = await getUserMessages(userId);
      const messageHistory = this.formatMessageHistory(channelMessages);
      const { acceptedSuggestions } = await getPastSuggestionFeedback(userId);

      // Different system prompts based on whether the message appears to be a question about past messages
      const isQueryAboutHistory = content.toLowerCase().includes('what') ||
                                content.toLowerCase().includes('when') ||
                                content.toLowerCase().includes('who') ||
                                content.toLowerCase().includes('how') ||
                                content.toLowerCase().includes('why') ||
                                content.toLowerCase().includes('?');

      let systemPrompt = isQueryAboutHistory
        ? `You are a helpful AI assistant with access to all conversations in the system. Be concise and direct.

Your context:
${messageHistory}

Current query: ${content}

Guidelines:
- Keep responses under 2-3 sentences unless more detail is explicitly requested
- Only mention timestamps if specifically asked about timing
- Be direct and to the point
- Focus on answering the specific question asked
- Include usernames when referring to specific messages
- Use your understanding of all conversations to provide accurate context-aware responses
- If referencing a conversation, specify which chat/channel it's from`
        : `You are a helpful AI assistant. Be concise and match the user's communication style.

Conversation history for context:
${messageHistory}

Previous successful responses they liked:
${acceptedSuggestions.join('\n')}

Guidelines:
1. Keep responses short and direct (2-3 sentences max)
2. Match their communication style
3. Focus only on the current topic
4. Be helpful while being concise`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: content
          }
        ],
        temperature: 0.7,
        max_tokens: 100 
      });

      return response.choices[0].message.content || "I understand. Could you tell me more?";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  async generateConversationSummary(channelId: number): Promise<string> {
    try {
      // Get messages from both the specific channel and active conversations
      const channelMessages = await getChannelMessages(channelId);
      const allMessages = await getUserMessages(-1); // -1 to get all messages from active channels
      const channelHistory = this.formatMessageHistory(channelMessages);
      const globalHistory = this.formatMessageHistory(allMessages);

      const systemPrompt = `You are a conversation summarizer with access to both channel-specific and global conversations. Analyze the conversation and provide a concise summary of the key points and outcomes.

Channel Conversation:
${channelHistory}

Global Context:
${globalHistory}

Guidelines:
1. Focus on the main topics and decisions made
2. Keep the summary brief (2-3 sentences)
3. Highlight any action items or conclusions
4. Use neutral language
5. Reference relevant information from other conversations when appropriate
6. Don't include timestamps unless crucial to understanding`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          }
        ],
        temperature: 0.5,
        max_tokens: 150
      });

      return response.choices[0].message.content || "No significant discussion points to summarize.";
    } catch (error) {
      console.error("Error generating conversation summary:", error);
      throw error;
    }
  }

  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const userHistory = await getUserMessages(userId);
      const { acceptedSuggestions, rejectedSuggestions } = await getPastSuggestionFeedback(userId);

      if (!userHistory) {
        throw new Error("No message history found for user");
      }

      // Get last message in channel to reply to
      const [messageToReply] = await db.query.messages.findMany({
        where: eq(messages.channelId, channelId),
        orderBy: [desc(messages.createdAt)],
        limit: 1
      });

      if (!messageToReply) {
        throw new Error("No message found to reply to");
      }

      if (messageToReply.userId === userId) {
        throw new Error("Cannot suggest a reply to your own message");
      }

      // Format history for context
      const messageHistory = this.formatMessageHistory(userHistory);

      const prompt = `You are having a conversation with a user. Analyze their communication style from their message history and respond in a similar tone and style.

User's message history for context:
${messageHistory}

Previous successful responses they liked:
${acceptedSuggestions.join('\n')}

Current message to respond to:
${messageToReply.content}

Guidelines:
1. Match their communication style (casual/formal, emoji usage, etc.)
2. Keep responses concise and natural
3. Don't mention being AI or analyzing their style
4. Focus on being helpful while maintaining their preferred tone
5. Follow patterns from previously successful responses`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 150
      });

      return response.choices[0].message.content || "I understand. Could you tell me more?";
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      throw error;
    }
  }

  async recordSuggestionFeedback(
    userId: number,
    channelId: number,
    content: string,
    wasAccepted: boolean
  ): Promise<void> {
    try {
      await db.update(suggestionFeedback)
        .set({ wasAccepted })
        .where(and(
          eq(suggestionFeedback.userId, userId),
          eq(suggestionFeedback.channelId, channelId),
          eq(suggestionFeedback.suggestedContent, content)
        ));
    } catch (error) {
      console.error("Error recording suggestion feedback:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();