import { TextToSpeech } from 'elevenlabs';

if (!process.env.ELEVEN_LABS_API_KEY) {
  throw new Error("ELEVEN_LABS_API_KEY must be set");
}

class VoiceService {
  private tts: TextToSpeech;

  constructor() {
    if (!process.env.ELEVEN_LABS_API_KEY) {
      throw new Error("ELEVEN_LABS_API_KEY must be set");
    }
    this.tts = new TextToSpeech(process.env.ELEVEN_LABS_API_KEY);
  }

  async convertTextToSpeech(text: string): Promise<Buffer> {
    try {
      // Use Rachel voice ID by default - one of ElevenLabs' preset voices
      const voiceId = "21m00Tcm4TlvDq8ikWAM";

      const audioBuffer = await this.tts.convert(text, {
        voice_id: voiceId,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      });

      return Buffer.from(audioBuffer);
    } catch (error) {
      console.error("Error converting text to speech:", error);
      throw error;
    }
  }
}

export const voiceService = new VoiceService();