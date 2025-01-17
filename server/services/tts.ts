
import { Voice } from "@elevenlabs/node";

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;

if (!ELEVEN_LABS_API_KEY) {
  throw new Error("ELEVEN_LABS_API_KEY must be set");
}

export async function generateSpeech(text: string): Promise<Buffer> {
  const voice = new Voice({
    apiKey: ELEVEN_LABS_API_KEY,
    voiceId: "21m00Tcm4TlvDq8ikWAM", // Default voice ID
  });

  const audioBuffer = await voice.textToSpeech(text);
  return audioBuffer;
}
