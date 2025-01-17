import { Voice, VoiceSettings } from "elevenlabs/api";

if (!process.env.ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY must be set");
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url: string;
  category: string;
}

interface VoiceEmotionSettings {
  stability: number;
  similarity_boost: number;
  speaking_rate?: number;
  pitch?: number;
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

  async getAvailableVoices(): Promise<ElevenLabsVoice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
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

  private analyzeTextEmotion(text: string): VoiceEmotionSettings {
    // Count emotional indicators
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    const uppercaseRatio = text.split('').filter(char => char === char.toUpperCase()).length / text.length;

    // Basic sentiment analysis
    const positiveWords = ['happy', 'great', 'awesome', 'wonderful', 'love', 'excellent', 'good', 'best', 'thanks', 'thank', 'pleased'];
    const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'sorry', 'unfortunately', 'disappointed'];
    const angryWords = ['angry', 'mad', 'furious', 'outraged', 'annoyed', 'irritated'];

    const words = text.toLowerCase().split(/\W+/);
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;
    const angryCount = words.filter(word => angryWords.includes(word)).length;

    // Default settings for neutral tone - more natural speaking parameters
    let settings: VoiceEmotionSettings = {
      stability: 0.75,       // Increased for more consistent, natural speech
      similarity_boost: 0.75, // Balanced for natural voice reproduction
      speaking_rate: 1.0     // Normal speaking rate
    };

    // Only adjust voice if we detect clear emotional content
    const hasEmotionalContent = positiveCount > 0 || negativeCount > 0 || angryCount > 0 || 
                               (exclamationCount > 1) || (uppercaseRatio > 0.4);

    if (!hasEmotionalContent) {
      // Return natural settings for neutral messages
      return settings;
    }

    // Adjust for excitement/emphasis (exclamation marks and uppercase)
    if (exclamationCount > 1 || uppercaseRatio > 0.4) {
      settings.stability = 0.3;
      settings.similarity_boost = 0.85;
      settings.speaking_rate = 1.2;
    }

    // Adjust for questions
    if (questionCount > 0) {
      settings.stability = 0.4;
      settings.similarity_boost = 0.8;
      settings.pitch = 1.1;
    }

    // Adjust for positive emotion
    if (positiveCount > 0) {
      settings.stability = 0.35;
      settings.similarity_boost = 0.8;
      settings.speaking_rate = 1.1;
    }

    // Adjust for negative emotion
    if (negativeCount > 0) {
      settings.stability = 0.6;
      settings.similarity_boost = 0.7;
      settings.speaking_rate = 0.9;
    }

    // Adjust for anger
    if (angryCount > 0) {
      settings.stability = 0.25;
      settings.similarity_boost = 0.9;
      settings.speaking_rate = 1.3;
    }

    // Log the analysis for debugging
    console.log("Text emotion analysis:", {
      text,
      exclamationCount,
      questionCount,
      uppercaseRatio,
      positiveCount,
      negativeCount,
      angryCount,
      hasEmotionalContent,
      settings
    });

    return settings;
  }

  async convertTextToSpeech(text: string, voiceId: string | undefined): Promise<Buffer> {
    try {
      // Use provided voice ID or Rachel voice as default
      const finalVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM";
      console.log("Using voice ID:", finalVoiceId);

      // Analyze text and get emotion-based settings
      const emotionSettings = this.analyzeTextEmotion(text);

      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${finalVoiceId}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: emotionSettings
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