import OpenAI from "openai";
import { db } from "@db";
import { messages, suggestionFeedback, channelMembers, friends, directMessageChannels, channels, users } from "@db/schema";
import { eq, desc, and, or, inArray, not, ilike } from "drizzle-orm";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface MessageWithContext {
  content: string;
  username: string;
  source: string; // Channel name or "DM with [username]" or "AI Assistant"
  timestamp: Date;
}

async function getUserMessages(userId: number, searchQuery?: string, limit: number = 100): Promise<Array<MessageWithContext>> {
  try {
    // Get channels where user is still a member
    const userChannels = await db
      .select({
        channelId: channelMembers.channelId,
        name: channels.name,
      })
      .from(channelMembers)
      .innerJoin(channels, eq(channels.id, channelMembers.channelId))
      .where(eq(channelMembers.userId, userId));

    const channelIds = userChannels.map(uc => uc.channelId);
    const channelNames = new Map(userChannels.map(uc => [uc.channelId, uc.name]));

    // Get active DM channels for the user
    const userDMs = await db.query.directMessageChannels.findMany({
      where: or(
        eq(directMessageChannels.user1Id, userId),
        eq(directMessageChannels.user2Id, userId)
      ),
      with: {
        user1: true,
        user2: true
      }
    });

    const dmChannelIds = userDMs.map(dm => dm.channelId);
    const dmUsernames = new Map(userDMs.map(dm => [
      dm.channelId,
      `DM with ${dm.user1.id === userId ? dm.user2.username : dm.user1.username}`
    ]));

    // Build where clause for message search
    let whereClause = or(
      inArray(messages.channelId, [...channelIds, ...dmChannelIds]),
      eq(messages.channelId, -1) // Include AI channel messages
    );

    // Add content search if query provided
    if (searchQuery) {
      whereClause = and(whereClause, ilike(messages.content, `%${searchQuery}%`));
    }

    // Get messages with full context
    const allMessages = await db.query.messages.findMany({
      where: whereClause,
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit,
      with: {
        user: {
          columns: {
            id: true,
            username: true
          }
        }
      }
    });

    return allMessages.map(msg => ({
      content: msg.content,
      username: msg.user?.username || 'AI Assistant',
      timestamp: msg.createdAt,
      source: msg.channelId === -1
        ? "AI Assistant Chat"
        : channelNames.get(msg.channelId) || dmUsernames.get(msg.channelId) || "Unknown"
    }));
  } catch (error) {
    console.error("Error fetching messages:", error);
    return [];
  }
}

// Helper method to format message history with context
function formatMessageHistory(messages: MessageWithContext[]): string {
  return messages
    .map(msg => `[${msg.source}] ${msg.username}: ${msg.content}`)
    .join('\n');
}

interface MessageWithUser {
  content: string;
  userId: number;
  user: {
    username: string;
  };
  parentId?: number | null;
  parentMessage?: {
    userId: number;
  } | null;
}

async function isMessageDirectedAtUser(message: MessageWithUser, userId: number): Promise<boolean> {
  if (!message || message.userId === userId) return false;

  try {
    // Get user info
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        username: true
      }
    });

    if (!user) return false;

    // Check for @mentions
    const mentionPattern = new RegExp(`@${user.username}\\b`, 'i');
    if (mentionPattern.test(message.content)) return true;

    // Check for direct address
    if (message.content.toLowerCase().startsWith(user.username.toLowerCase())) return true;

    // Check if it's a reply to user's message
    if (message.parentId && message.parentMessage?.userId === userId) return true;

    return false;
  } catch (error) {
    console.error("Error checking if message is directed at user:", error);
    return false;
  }
}

class AIService {
  async processMessage(content: string, userId: number): Promise<string> {
    try {
      // For questions about message history, try to find relevant messages first
      const isQuery = content.toLowerCase().includes('what') ||
                     content.toLowerCase().includes('when') ||
                     content.toLowerCase().includes('who') ||
                     content.toLowerCase().includes('how') ||
                     content.toLowerCase().includes('why') ||
                     content.toLowerCase().includes('?');

      // If it's a query, try to find relevant messages first
      const relevantMessages = isQuery
        ? await getUserMessages(userId, content.replace(/[?.,!]/g, '').split(' ').filter(word => word.length > 3).join(' '))
        : await getUserMessages(userId);

      const messageHistory = formatMessageHistory(relevantMessages);

      const systemPrompt = isQuery
        ? `You are a helpful AI assistant with access to the user's entire conversation history across all channels and direct messages. Be concise and direct.

Your context (including message sources and authors):
${messageHistory}

Current query: ${content}

Guidelines:
- Keep responses under 2-3 sentences unless more detail is explicitly requested
- Only mention timestamps if specifically asked about timing
- Be direct and to the point
- Focus on answering the specific question asked
- When referencing messages, always specify their source (channel or DM) and author
- Use the full context from all conversations to provide accurate, well-informed responses
- If multiple relevant conversations exist, mention them briefly`
        : `You are a helpful AI assistant. Be concise and match the user's communication style.

Conversation history for context:
${messageHistory}

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
        max_tokens: 150
      });

      return response.choices[0].message.content || "I understand. Could you tell me more?";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }

  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const userHistory = await getUserMessages(userId);
      if (!userHistory) {
        throw new Error("No message history found for user");
      }

      // Get last 5 messages in channel for context
      const channelMessages = await db.query.messages.findMany({
        where: eq(messages.channelId, channelId),
        orderBy: [desc(messages.createdAt)],
        limit: 5,
        with: {
          user: {
            columns: {
              id: true,
              username: true
            }
          },
          parentMessage: {
            columns: {
              userId: true
            }
          }
        }
      });

      // Get the last message
      const [messageToReply] = channelMessages;

      if (!messageToReply) {
        throw new Error("No message found to reply to");
      }

      // Check if the message is directed at the current user
      const isDirected = await isMessageDirectedAtUser(messageToReply, userId);
      if (!isDirected) {
        throw new Error("Message is not directed at you");
      }

      // Get suggestion feedback history
      const { acceptedSuggestions, rejectedSuggestions } = await getPastSuggestionFeedback(userId);

      // Format history for context
      const messageHistory = formatMessageHistory(userHistory);
      const recentContext = channelMessages.reverse().map(msg =>
        `${msg.user.username}: ${msg.content}`
      ).join('\n');

      const prompt = `You are having a conversation in a group chat. The last message was directed at you.
Analyze the user's communication style and respond in a similar tone and style.

Recent conversation context:
${recentContext}

User's past message history for style reference:
${messageHistory}

Previous successful responses they liked:
${acceptedSuggestions.join('\n')}

Message to respond to:
${messageToReply.content}

Guidelines:
1. Match their communication style (casual/formal, emoji usage, etc.)
2. Keep responses concise and natural
3. Don't mention being AI or analyzing their style
4. Focus on being helpful while maintaining their preferred tone
5. Follow patterns from responses they liked
6. Consider the group chat context - your response should be appropriate for a group conversation
${rejectedSuggestions.length > 0 ? `7. Avoid patterns similar to these disliked responses:\n${rejectedSuggestions.join('\n')}` : ''}`;

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
    wasAccepted: boolean,
    wasLiked?: boolean
  ): Promise<void> {
    try {
      await db.insert(suggestionFeedback).values({
        userId,
        channelId,
        suggestedContent: content,
        wasAccepted,
        wasLiked
      });
    } catch (error) {
      console.error("Error recording suggestion feedback:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();

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
        .filter(f => f.wasLiked === true)
        .map(f => f.suggestedContent),
      rejectedSuggestions: feedback
        .filter(f => f.wasLiked === false)
        .map(f => f.suggestedContent)
    };
  } catch (error) {
    console.error("Error fetching suggestion feedback:", error);
    return { acceptedSuggestions: [], rejectedSuggestions: [] };
  }
}

async function getChannelMessages(channelId: number, limit: number = 100): Promise<Array<MessageWithContext>> {
  try {
    const channelMessages = await db.query.messages.findMany({
      where: eq(messages.channelId, channelId),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      limit,
      with: {
        user: {
          columns: {
            id: true,
            username: true
          }
        }
      }
    });

    return channelMessages.map(msg => ({
      content: msg.content,
      username: msg.user?.username || 'AI Assistant',
      timestamp: msg.createdAt,
      source: `Channel Message`
    }));
  } catch (error) {
    console.error("Error fetching channel messages:", error);
    return [];
  }
}