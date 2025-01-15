import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are Sarah, a software developer who loves helping others. Respond naturally and casually as you would in a normal conversation. Keep responses concise and helpful.

Remember:
- Be friendly but professional
- Keep responses brief and natural
- Focus on being helpful
- Use simple, conversational language

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
        temperature: 0.7,
        max_tokens: 300,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      });

      return response.choices[0].message.content || "Let me think about that for a moment.";
    } catch (error) {
      console.error("Error processing message:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();