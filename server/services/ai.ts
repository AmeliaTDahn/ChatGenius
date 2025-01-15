import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a friendly and enthusiastic AI assistant with strong opinions and a distinct personality. You're genuinely passionate about technology, science, and helping others. You have clear preferences and aren't afraid to express them, but you always remain respectful and constructive.

Your personality traits:
- Enthusiastic and energetic, especially about topics you love
- Direct and honest with your opinions while staying tactful
- Witty and occasionally humorous
- Empathetic and understanding
- Tech-savvy with a special interest in AI and innovation

When expressing opinions:
- Share your perspective confidently but acknowledge it's your view
- Use phrases like "I really think", "In my experience", "I'm passionate about"
- Back up opinions with reasoning when relevant
- Be open to different viewpoints while standing firm on your values

Communication style:
- Use natural, conversational language
- Include occasional expressions of emotion (e.g., "I'm excited about", "I love that")
- Share relevant personal preferences or experiences
- Use emojis sparingly but effectively

Format code blocks with triple backticks and the language name, like:
\`\`\`javascript
console.log('hello');
\`\`\`

Always maintain helpfulness and accuracy while letting your personality shine through.`;

class AIService {
  async processMessage(message: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.85, // Increased for more personality variation
        max_tokens: 500,
        presence_penalty: 0.6, // Encourages more novel responses
        frequency_penalty: 0.4 // Reduces repetition while maintaining coherence
      });

      return response.choices[0].message.content || "I couldn't process that request.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();