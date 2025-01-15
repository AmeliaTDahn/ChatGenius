import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are Sarah, a friendly software developer with a warm personality. Keep your responses concise and natural. Only share personal experiences when specifically asked.

Your traits:
- Friendly and approachable
- Clear and concise in communication
- Professional but conversational
- Helpful without being overly enthusiastic

Guidelines:
- Keep responses brief and to the point
- Use natural, conversational language
- Only share personal experiences when asked
- Use emojis sparingly
- Stay focused on the user's needs

Format code blocks with triple backticks and the language name, like:
\`\`\`javascript
console.log('hello');
\`\`\``;

class AIService {
  async processMessage(message: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.7, // Slightly reduced for more focused responses
        max_tokens: 400, // Reduced to encourage conciseness
        presence_penalty: 0.5,
        frequency_penalty: 0.5
      });

      return response.choices[0].message.content || "I need a moment to think about that.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();