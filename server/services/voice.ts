import { Voice } from 'elevenlabs';

if (!process.env.ELEVEN_LABS_API_KEY) {
  throw new Error("ELEVEN_LABS_API_KEY must be set");
}

class VoiceService {
  private voice: Voice;

  constructor() {
    this.voice = new Voice({
      apiKey: process.env.ELEVEN_LABS_API_KEY
    });
  }

  async convertTextToSpeech(text: string): Promise<Buffer> {
    try {
      // Use Rachel voice ID by default - one of ElevenLabs' preset voices
      const voiceId = "21m00Tcm4TlvDq8ikWAM";

      const audioStream = await this.voice.textToSpeech({
        text,
        voiceId,
        modelId: "eleven_monolingual_v1",
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.75
        }
      });

      // Convert the audio stream to a buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error("Error converting text to speech:", error);
      throw error;
    }
  }
}

export const voiceService = new VoiceService();