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
    // Enhanced sentiment analysis with comprehensive emotion patterns
    const positiveWords = ['happy', 'great', 'awesome', 'wonderful', 'love', 'excellent', 'good', 'best', 'thanks', 'thank', 'pleased', 'excited', 'joy', 'amazing', 'perfect', 'fantastic'];
    const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'sorry', 'unfortunately', 'disappointed', 'upset', 'regret', 'worried', 'concerned'];
    const angryWords = ['angry', 'mad', 'furious', 'outraged', 'annoyed', 'irritated', 'frustrated', 'rage', 'hate'];
    const excitedWords = ['wow', 'omg', 'amazing', 'incredible', 'awesome', 'fantastic', 'unbelievable'];
    const calmWords = ['calm', 'peaceful', 'gentle', 'quiet', 'relaxed', 'steady', 'balanced'];

    let settings: VoiceEmotionSettings = {
      stability: 0.75,
      similarity_boost: 0.75,
      speaking_rate: 1.0
    };

    const endsWithQuestion = text.trim().endsWith('?');
    if (endsWithQuestion) {
      settings = {
        stability: 0.7,
        similarity_boost: 0.75,
        speaking_rate: 0.95,
        pitch: 1.15
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

    for (const pattern of directEmotionPatterns) {
      if (pattern.regex.test(text)) {
        switch (pattern.emotion) {
          case 'sad':
            return {
              stability: pattern.intensity === 'high' ? 0.9 : 0.8,
              similarity_boost: pattern.intensity === 'high' ? 0.65 : 0.7,
              speaking_rate: pattern.intensity === 'high' ? 0.8 : 0.9,
              pitch: pattern.intensity === 'high' ? 0.85 : 0.9
            };
          case 'happy':
            return {
              stability: pattern.intensity === 'high' ? 0.2 : 0.3,
              similarity_boost: pattern.intensity === 'high' ? 0.85 : 0.8,
              speaking_rate: pattern.intensity === 'high' ? 1.2 : 1.1,
              pitch: pattern.intensity === 'high' ? 1.1 : 1.05
            };
          case 'angry':
            return {
              stability: pattern.intensity === 'high' ? 0.15 : 0.25,
              similarity_boost: pattern.intensity === 'high' ? 0.95 : 0.9,
              speaking_rate: pattern.intensity === 'high' ? 1.4 : 1.3,
              pitch: pattern.intensity === 'high' ? 1.2 : 1.15
            };
          case 'calm':
            return {
              stability: pattern.intensity === 'high' ? 0.95 : 0.9,
              similarity_boost: pattern.intensity === 'high' ? 0.65 : 0.7,
              speaking_rate: pattern.intensity === 'high' ? 0.85 : 0.9,
              pitch: pattern.intensity === 'high' ? 0.9 : 0.95
            };
          case 'worried':
            return {
              stability: pattern.intensity === 'high' ? 0.5 : 0.6,
              similarity_boost: pattern.intensity === 'high' ? 0.8 : 0.75,
              speaking_rate: pattern.intensity === 'high' ? 1.15 : 1.1,
              pitch: pattern.intensity === 'high' ? 1.1 : 1.05
            };
        }
      }
    }

    // If no direct emotion matches, analyze word patterns
    const words = text.toLowerCase().split(/\W+/);
    const emotionCounts = {
      positive: words.filter(word => positiveWords.includes(word)).length,
      negative: words.filter(word => negativeWords.includes(word)).length,
      angry: words.filter(word => angryWords.includes(word)).length,
      excited: words.filter(word => excitedWords.includes(word)).length,
      calm: words.filter(word => calmWords.includes(word)).length
    };

    // Find dominant emotion
    const emotions = Object.entries(emotionCounts);
    const maxEmotion = emotions.reduce((max, current) => 
      current[1] > max[1] ? current : max, ['none', 0]
    );

    // Apply settings based on dominant emotion
    if (maxEmotion[1] > 0) {
      switch (maxEmotion[0]) {
        case 'positive':
          settings = {
            stability: 0.3,
            similarity_boost: 0.8,
            speaking_rate: 1.15,
            pitch: 1.1
          };
          break;
        case 'negative':
          settings = {
            stability: 0.75,
            similarity_boost: 0.7,
            speaking_rate: 0.9,
            pitch: 0.95
          };
          break;
        case 'angry':
          settings = {
            stability: 0.2,
            similarity_boost: 0.9,
            speaking_rate: 1.3,
            pitch: 1.15
          };
          break;
        case 'excited':
          settings = {
            stability: 0.25,
            similarity_boost: 0.85,
            speaking_rate: 1.25,
            pitch: 1.1
          };
          break;
        case 'calm':
          settings = {
            stability: 0.85,
            similarity_boost: 0.7,
            speaking_rate: 0.9,
            pitch: 0.95
          };
          break;
      }
    }

    return settings;
  }

  async convertTextToSpeech(text: string, voiceId?: string): Promise<Buffer> {
    try {
      const finalVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM";
      console.log("Using voice ID:", finalVoiceId);

      // Analyze text for emotion-based settings
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