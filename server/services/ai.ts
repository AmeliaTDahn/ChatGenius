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

async function getUserEmoticonStyle(userMessages: MessageWithContext[]): Promise<{
  usesEmojis: boolean;
  emojiFrequency: number;
}> {
  const totalMessages = userMessages.length;
  if (totalMessages === 0) return { usesEmojis: false, emojiFrequency: 0 };

  const messagesWithEmojis = userMessages.filter(msg =>
    /[\p{Emoji_Presentation}\u{FE0F}\u{FE0E}]/gu.test(msg.content)
  ).length;

  const emojiFrequency = messagesWithEmojis / totalMessages;
  return {
    usesEmojis: emojiFrequency > 0.1, // Consider user an emoji user if >10% of messages have emojis
    emojiFrequency
  };
}

async function isMessageDirectedAtUser(message: string, username: string, otherUsernames: string[]): Promise<boolean> {
  // Convert usernames to lowercase for case-insensitive matching
  const lowerMessage = message.toLowerCase();
  const lowerUsername = username.toLowerCase();

  // Check for direct @mentions
  if (lowerMessage.includes(`@${lowerUsername}`)) {
    return true;
  }

  // Check if message starts with the username
  if (lowerMessage.startsWith(lowerUsername)) {
    return true;
  }

  // Check if message is directed at another user
  for (const otherUser of otherUsernames) {
    if (lowerMessage.includes(`@${otherUser.toLowerCase()}`)) {
      return false;
    }
    if (lowerMessage.startsWith(otherUser.toLowerCase())) {
      return false;
    }
  }

  // Check for question directed at specific user
  const questionPattern = /^(?:hey|hi|hello|excuse me|um|uh)?\s*,?\s*([a-zA-Z0-9_]+)\s*[,.]?\s*(?:can|could|would|will|do|does|what|when|where|why|how|is|are)/i;
  const match = message.match(questionPattern);
  if (match && match[1]) {
    const mentionedUser = match[1].toLowerCase();
    if (mentionedUser === lowerUsername) {
      return true;
    }
    if (otherUsernames.some(name => mentionedUser === name.toLowerCase())) {
      return false;
    }
  }

  // If no specific direction is found, consider it a general message
  return true;
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

  async generateConversationSummary(channelId: number): Promise<string> {
    try {
      // Get channel messages and global context from active conversations
      const channelMessages = await getChannelMessages(channelId);
      const messageHistory = formatMessageHistory(channelMessages);

      const systemPrompt = `You are a concise conversation summarizer. Analyze this conversation and provide a brief, focused summary.

Conversation to summarize:
${messageHistory}

Guidelines:
1. Provide ONLY 2-4 sentences total
2. Focus on the most important topics and decisions
3. Include key conclusions or action items if any exist
4. Use clear, direct language
5. Omit timestamps unless absolutely crucial
6. Avoid detailed explanations or background information
7. Skip participant names unless critical to understanding
8. Focus on outcomes rather than process`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 150 // Reduced from 500 to encourage brevity
      });

      return response.choices[0].message.content || "No significant points to summarize.";
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

      // Get recent messages and channel participants
      const recentMessages = await db.query.messages.findMany({
        where: eq(messages.channelId, channelId),
        orderBy: [desc(messages.createdAt)],
        limit: 10, // Increased limit for better context
        with: {
          user: {
            columns: {
              id: true,
              username: true
            }
          }
        }
      });

      if (recentMessages.length === 0) {
        throw new Error("No messages found in channel");
      }

      const lastMessage = recentMessages[0];
      if (lastMessage.userId === userId) {
        throw new Error("Cannot suggest a reply to your own message");
      }

      // Get current user's username
      const [currentUser] = await db
        .select({
          username: users.username
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!currentUser) {
        throw new Error("Current user not found");
      }

      // Get unique usernames of other participants in the conversation
      const otherUsernames = [...new Set(
        recentMessages
          .map(msg => msg.user?.username)
          .filter(username => username && username !== currentUser.username)
      )];

      // Check if the last message is directed at the current user
      const isDirectedAtUser = await isMessageDirectedAtUser(
        lastMessage.content,
        currentUser.username,
        otherUsernames
      );

      if (!isDirectedAtUser) {
        throw new Error("Message appears to be directed at another user");
      }

      // Analyze user's emoji usage
      const { usesEmojis, emojiFrequency } = await getUserEmoticonStyle(userHistory);

      // Format recent conversation context with clear speaker identification
      const conversationContext = recentMessages
        .reverse()
        .map(msg => `${msg.user?.username || 'Unknown'}: ${msg.content}`)
        .join('\n');

      // Format history for context
      const messageHistory = formatMessageHistory(userHistory);

      const emojiGuideline = usesEmojis
        ? `Use emojis sparingly (about ${Math.round(emojiFrequency * 100)}% of the time) to match their style`
        : "Do not use any emojis in the response as the user doesn't use them";

      const prompt = `You are helping craft a reply in a group conversation with multiple participants. Generate a natural response directed at ${lastMessage.user?.username || 'the last speaker'} based on the recent conversation and the user's communication style.

Recent conversation context (most recent last):
${conversationContext}

Previous communication style context:
${messageHistory}

Previous successful responses they liked:
${acceptedSuggestions.join('\n')}

You are generating a reply to this specific message:
${lastMessage.user?.username || 'User'}: ${lastMessage.content}

Channel participants: ${[currentUser.username, ...otherUsernames].join(', ')}

Guidelines:
1. Make sure the reply is directed at ${lastMessage.user?.username || 'the speaker'} and relevant to their last message
2. Match their communication style (casual/formal, length, etc.)
3. ${emojiGuideline}
4. Keep responses concise and natural
5. Don't mention being AI or analyzing their style
6. Focus on being helpful while maintaining their preferred tone
7. Ensure the response continues the current conversation thread
8. Don't start with their username - write as if in an ongoing conversation
9. Consider the group conversation context - make sure the response is appropriate for the ongoing discussion
${rejectedSuggestions.length > 0 ? `10. Avoid patterns similar to these rejected responses:\n${rejectedSuggestions.join('\n')}` : ''}`;

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