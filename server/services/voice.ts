import { Voice, VoiceSettings } from "elevenlabs/api";

if (!process.env.ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY must be set");
}

class VoiceService {
  private apiKey: string;
  private baseUrl = "https://api.elevenlabs.io/v1";

  constructor() {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY must be set");
    }
    this.apiKey = process.env.ELEVENLABS_API_KEY;
  }

  async getVoices(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`ElevenLabs API error: ${error.detail || 'Unknown error'}`);
      }

      const data = await response.json();
      return data.voices;
    } catch (error) {
      console.error("Error fetching voices:", error);
      throw error;
    }
  }

  async convertTextToSpeech(text: string, voiceId: string = "21m00Tcm4TlvDq8ikWAM"): Promise<Buffer> {
    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`ElevenLabs API error: ${error.detail || 'Unknown error'}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error("Error converting text to speech:", error);
      throw error;
    }
  }
}

export const voiceService = new VoiceService();