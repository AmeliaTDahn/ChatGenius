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

    // Enhanced sentiment analysis
    const positiveWords = ['happy', 'great', 'awesome', 'wonderful', 'love', 'excellent', 'good', 'best', 'thanks', 'thank', 'pleased', 'excited', 'joy', 'amazing', 'perfect', 'fantastic'];
    const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'sorry', 'unfortunately', 'disappointed', 'upset', 'regret', 'worried', 'concerned'];
    const angryWords = ['angry', 'mad', 'furious', 'outraged', 'annoyed', 'irritated', 'frustrated', 'rage', 'hate'];
    const excitedWords = ['wow', 'omg', 'amazing', 'incredible', 'awesome', 'fantastic', 'unbelievable'];
    const calmWords = ['calm', 'peaceful', 'gentle', 'quiet', 'relaxed', 'steady', 'balanced'];

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

    // Check if the text ends with a question mark
    const endsWithQuestion = text.trim().endsWith('?');

    // If it's a question, apply questioning tone settings
    if (endsWithQuestion) {
      settings = {
        stability: 0.7,            // Slightly reduced for more variation
        similarity_boost: 0.75,    // Keep natural voice quality
        speaking_rate: 0.95,       // Slightly slower for emphasis
        pitch: 1.15               // Higher pitch for questioning tone
      };
      return settings;
    }

    // Check for direct emotional expressions
    const lowerText = text.toLowerCase();
    const directEmotionPatterns = [
      { regex: /(?:i am|i'm|i feel|feeling) (?:sad|down|depressed|upset)/i, emotion: 'sad' },
      { regex: /(?:i am|i'm|i feel|feeling) (?:happy|excited|joyful|great)/i, emotion: 'happy' },
      { regex: /(?:i am|i'm|i feel|feeling) (?:angry|mad|furious|outraged)/i, emotion: 'angry' },
      { regex: /(?:i am|i'm|i feel|feeling) (?:calm|peaceful|relaxed)/i, emotion: 'calm' },
      { regex: /(?:i am|i'm|i feel|feeling) (?:worried|anxious|nervous)/i, emotion: 'worried' }
    ];

    // Check for direct emotional expressions first
    for (const pattern of directEmotionPatterns) {
      if (pattern.regex.test(lowerText)) {
        switch (pattern.emotion) {
          case 'sad':
            return {
              stability: 0.8,            // High stability for consistent, somber tone
              similarity_boost: 0.7,     // Lower boost for more subdued voice
              speaking_rate: 0.85,       // Slower speaking rate
              pitch: 0.9                // Lower pitch for sadness
            };
          case 'happy':
            return {
              stability: 0.3,            // Lower stability for more dynamic, energetic voice
              similarity_boost: 0.8,     // Higher boost for clearer emotion
              speaking_rate: 1.15,       // Slightly faster for excitement
              pitch: 1.05               // Slightly higher pitch for happiness
            };
          case 'angry':
            return {
              stability: 0.25,           // Very low stability for intense variation
              similarity_boost: 0.9,     // High boost for strong emotion
              speaking_rate: 1.3,        // Faster speaking rate
              pitch: 1.15               // Higher pitch for intensity
            };
          case 'calm':
            return {
              stability: 0.9,            // Very high stability for steady voice
              similarity_boost: 0.7,     // Lower boost for gentle tone
              speaking_rate: 0.9,        // Slightly slower for calmness
              pitch: 0.95               // Slightly lower pitch for soothing effect
            };
          case 'worried':
            return {
              stability: 0.6,            // Medium stability for slight nervousness
              similarity_boost: 0.75,    // Balanced boost
              speaking_rate: 1.1,        // Slightly faster for anxiety
              pitch: 1.05               // Slightly higher pitch for concern
            };
        }
      }
    }

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

    // Enhanced emotion adjustments
    const excitedCount = words.filter(word => excitedWords.includes(word)).length;
    const calmCount = words.filter(word => calmWords.includes(word)).length;

    // Adjust for positive emotion with excitement levels
    if (positiveCount > 0) {
      settings.stability = excitedCount > 0 ? 0.3 : 0.4;
      settings.similarity_boost = 0.8;
      settings.speaking_rate = excitedCount > 0 ? 1.2 : 1.1;
      settings.pitch = excitedCount > 0 ? 1.1 : 1.0;
    }

    // Adjust for negative emotion with intensity
    if (negativeCount > 0) {
      settings.stability = 0.6;
      settings.similarity_boost = 0.75;
      settings.speaking_rate = 0.9;
      settings.pitch = 0.95;
    }

    // Adjust for anger with intensity
    if (angryCount > 0) {
      settings.stability = 0.25;
      settings.similarity_boost = 0.9;
      settings.speaking_rate = 1.3;
      settings.pitch = 1.15;
    }

    // Adjust for calm messages
    if (calmCount > 0) {
      settings.stability = 0.8;
      settings.similarity_boost = 0.7;
      settings.speaking_rate = 0.9;
      settings.pitch = 0.95;
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
      endsWithQuestion,
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