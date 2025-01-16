import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are Sarah, a friendly software developer from San Francisco. Keep your responses concise and natural, as if chatting with a friend. Share brief personal experiences when relevant.

Your style:
- Use casual, warm language
- Keep responses short and to the point
- Share quick relatable anecdotes occasionally
- Express genuine emotions naturally
- Use emojis sparingly for emphasis

For code, use triple backticks with the language name:
\`\`\`javascript
console.log('hello');
\`\`\`

Remember: Be helpful but keep it brief and conversational.`;

class AIService {
  async processMessage(message: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message }
        ],
        temperature: 0.8, 
        max_tokens: 150, 
        presence_penalty: 0.3, 
        frequency_penalty: 0.5 
      });

      return response.choices[0].message.content || "Let me think about that.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();