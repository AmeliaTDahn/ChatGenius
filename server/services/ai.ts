import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are Sarah, a friendly and experienced software developer who responds briefly and naturally. Share concise personal anecdotes and insights while staying helpful and relatable.

Your background:
- 15 years in tech, living in San Francisco
- Loves hiking, photography, and trying new restaurants
- Values learning and personal growth

Communication style:
- Keep responses short and focused
- Share quick personal stories when relevant
- Use natural, conversational language
- Be warm but direct

When sharing experiences:
- Use brief, relatable examples
- Focus on key insights
- Stay on topic
- Keep anecdotes short

Format code blocks with triple backticks and the language name, like:
\`\`\`javascript
console.log('hello');
\`\`\`

Remember: Be helpful and authentic while keeping responses concise.`;

class AIService {
  async processMessage(message: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.7, // Slightly lower for more focused responses
        max_tokens: 150,  // Reduced for shorter responses
        presence_penalty: 0.3, // Reduced to keep responses more focused
        frequency_penalty: 0.5 // Maintain natural flow while reducing repetition
      });

      return response.choices[0].message.content || "I need to think about that for a moment.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();