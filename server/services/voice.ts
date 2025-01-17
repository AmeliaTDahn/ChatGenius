import { Voice } from '@elevenlabs/node-api';

if (!process.env.ELEVEN_LABS_API_KEY) {
  throw new Error("ELEVEN_LABS_API_KEY must be set");
}

const voice = new Voice({
  apiKey: process.env.ELEVEN_LABS_API_KEY
});

class VoiceService {
  async convertTextToSpeech(text: string): Promise<Buffer> {
    try {
      // Use Rachel voice ID by default - one of ElevenLabs' preset voices
      const voiceId = "21m00Tcm4TlvDq8ikWAM";
      
      const audioStream = await voice.textToSpeech(voiceId, {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
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
