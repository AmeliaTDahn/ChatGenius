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
    // Enhanced sentiment analysis with more specific emotion words
    const positiveWords = ['happy', 'great', 'awesome', 'wonderful', 'love', 'excellent', 'good', 'best', 'thanks', 'thank', 'pleased', 'excited', 'joy', 'amazing', 'perfect', 'fantastic'];
    const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'sorry', 'unfortunately', 'disappointed', 'upset', 'regret', 'worried', 'concerned'];
    const angryWords = ['angry', 'mad', 'furious', 'outraged', 'annoyed', 'irritated', 'frustrated', 'rage', 'hate'];
    const excitedWords = ['wow', 'omg', 'amazing', 'incredible', 'awesome', 'fantastic', 'unbelievable'];
    const calmWords = ['calm', 'peaceful', 'gentle', 'quiet', 'relaxed', 'steady', 'balanced'];

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

    // Direct emotional expressions with intensity patterns
    const directEmotionPatterns = [
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(sad|depressed|down|upset|heartbroken)/i, emotion: 'sad', intensity: 'high' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:a (?:bit|little) )?(sad|down|upset)/i, emotion: 'sad', intensity: 'low' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(happy|excited|joyful|thrilled|ecstatic)/i, emotion: 'happy', intensity: 'high' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:a (?:bit|little) )?(happy|cheerful|good)/i, emotion: 'happy', intensity: 'low' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(angry|furious|mad|outraged|livid)/i, emotion: 'angry', intensity: 'high' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:a (?:bit|little) )?(angry|annoyed|irritated)/i, emotion: 'angry', intensity: 'low' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(calm|peaceful|relaxed|serene)/i, emotion: 'calm', intensity: 'high' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:a (?:bit|little) )?(calm|relaxed)/i, emotion: 'calm', intensity: 'low' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(worried|anxious|nervous|scared|terrified)/i, emotion: 'worried', intensity: 'high' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:a (?:bit|little) )?(worried|concerned|uneasy)/i, emotion: 'worried', intensity: 'low' }
    ];

    // Check for direct emotional expressions first
    for (const pattern of directEmotionPatterns) {
      if (pattern.regex.test(text)) {
        switch (pattern.emotion) {
          case 'sad':
            return {
              stability: pattern.intensity === 'high' ? 0.9 : 0.8,            // Higher stability for deeper sadness
              similarity_boost: pattern.intensity === 'high' ? 0.65 : 0.7,    // Lower boost for more subdued voice
              speaking_rate: pattern.intensity === 'high' ? 0.8 : 0.9,        // Slower for deeper sadness
              pitch: pattern.intensity === 'high' ? 0.85 : 0.9                // Lower pitch for sadness
            };
          case 'happy':
            return {
              stability: pattern.intensity === 'high' ? 0.2 : 0.3,            // Lower stability for more dynamic voice
              similarity_boost: pattern.intensity === 'high' ? 0.85 : 0.8,    // Higher boost for clearer emotion
              speaking_rate: pattern.intensity === 'high' ? 1.2 : 1.1,        // Faster for more excitement
              pitch: pattern.intensity === 'high' ? 1.1 : 1.05                // Higher pitch for happiness
            };
          case 'angry':
            return {
              stability: pattern.intensity === 'high' ? 0.15 : 0.25,          // Very low stability for intense anger
              similarity_boost: pattern.intensity === 'high' ? 0.95 : 0.9,    // High boost for strong emotion
              speaking_rate: pattern.intensity === 'high' ? 1.4 : 1.3,        // Much faster for intense anger
              pitch: pattern.intensity === 'high' ? 1.2 : 1.15                // Higher pitch for intensity
            };
          case 'calm':
            return {
              stability: pattern.intensity === 'high' ? 0.95 : 0.9,           // Very high stability for deep calm
              similarity_boost: pattern.intensity === 'high' ? 0.65 : 0.7,    // Lower boost for gentler tone
              speaking_rate: pattern.intensity === 'high' ? 0.85 : 0.9,       // Slower for deeper calm
              pitch: pattern.intensity === 'high' ? 0.9 : 0.95                // Lower pitch for soothing effect
            };
          case 'worried':
            return {
              stability: pattern.intensity === 'high' ? 0.5 : 0.6,            // Lower stability for anxiety
              similarity_boost: pattern.intensity === 'high' ? 0.8 : 0.75,    // Higher boost for urgency
              speaking_rate: pattern.intensity === 'high' ? 1.15 : 1.1,       // Faster for anxiety
              pitch: pattern.intensity === 'high' ? 1.1 : 1.05                // Higher pitch for worry
            };
        }
      }
    }

    // Log the analysis for debugging
    console.log("Text emotion analysis:", {
      text,
      directEmotionMatch: directEmotionPatterns.find(p => p.regex.test(text)),
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