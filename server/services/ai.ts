import OpenAI from "openai";
import { db } from "@db";
import { messages, suggestionFeedback } from "@db/schema";
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

async function getUserFeedbackAnalysis(userId: number): Promise<string> {
  try {
    const recentFeedback = await db.query.suggestionFeedback.findMany({
      where: eq(suggestionFeedback.userId, userId),
      orderBy: [desc(suggestionFeedback.createdAt)],
      limit: 20,
    });

    if (recentFeedback.length === 0) {
      return "No previous feedback available.";
    }

    const likedSuggestions = recentFeedback.filter(f => f.isPositive);
    const dislikedSuggestions = recentFeedback.filter(f => !f.isPositive);

    return `Based on user feedback:
- Liked suggestions (${likedSuggestions.length}): ${likedSuggestions.map(f => `"${f.suggestion}"`).join(', ')}
- Disliked suggestions (${dislikedSuggestions.length}): ${dislikedSuggestions.map(f => `"${f.suggestion}"`).join(', ')}`;
  } catch (error) {
    console.error("Error fetching user feedback:", error);
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
   - How strongly do they express emotions (anger, frustration, excitement)?
   - Do they use CAPS, multiple exclamation marks (!!!), or strong language?
   - What triggers their most intense reactions?
   - How confrontational or aggressive are they when disagreeing?

2. Opinion Strength:
   - Which topics provoke their strongest reactions?
   - How firmly do they stand by their views?
   - Do they use absolute statements ("NEVER", "ALWAYS", "HATE")?
   - What level of criticism or negativity do they express?

3. Characteristic Style:
   - Specific phrases or expressions they frequently use
   - Their typical level of formality or casualness
   - Use of emphatic punctuation (!!!) or emojis
   - How they express disagreement or criticism

4. Response Patterns:
   - How do they react to opposing viewpoints?
   - Do they escalate or maintain emotional intensity?
   - What type of language do they use when upset?

User's message history:
{userHistory}

Provide a detailed analysis of their communication style and emotional patterns, particularly noting their intensity level and how they express strong opinions:`;

const SUGGESTION_PROMPT = `Generate a reply that naturally matches this user's communication style:

1. User's Communication Profile:
{personalityAnalysis}

2. Previous conversation for context:
{previousMessages}

3. Message to reply to:
{lastMessage}

4. User's Feedback History:
{feedbackAnalysis}

Guidelines:
1. Match their emotional intensity PROPORTIONALLY:
   - If they occasionally use caps for emphasis, use caps sparingly and only for key words
   - Match their normal baseline intensity, not their peak emotional moments
   - Mirror their level of directness without amplifying it

2. Mirror their style NATURALLY:
   - Copy their formatting patterns in similar proportions (if they use caps 10% of the time, do the same)
   - Use similar but not identical emphasis patterns
   - Match their vocabulary level and tone
   - Keep their characteristic expressions but don't overuse them

3. Keep it authentic:
   - Maintain their general communication style
   - Match their usual level of formality/informality
   - Use their typical sentence structures
   - Include their common expressions naturally

4. Based on feedback history:
   - Prefer patterns from positively rated suggestions
   - Avoid patterns from negatively rated suggestions
   - Adapt tone and style based on what the user has liked

5. IMPORTANT:
   - Keep it brief (1-2 sentences)
   - Never mention being AI
   - Be direct but not artificially confrontational
   - Match their baseline style, not their most extreme moments`;

class AIService {
  async generateReplySuggestion(channelId: number, userId: number): Promise<string> {
    try {
      const recentMessages = await getRecentMessages(channelId);
      const userHistory = await getUserChatHistory(userId);
      const feedbackAnalysis = await getUserFeedbackAnalysis(userId);

      if (recentMessages.length === 0) {
        throw new Error("No messages to reply to");
      }

      const lastMessage = recentMessages[recentMessages.length - 1];

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
        .replace("{lastMessage}", `${lastMessage.user.username}: ${lastMessage.content}`)
        .replace("{feedbackAnalysis}", feedbackAnalysis);

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

      return response.choices[0].message.content || "Hey! How's it going?";
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();