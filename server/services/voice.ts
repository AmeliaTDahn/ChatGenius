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

interface VoiceToneProfile {
  emotion: string;
  baseline: VoiceEmotionSettings;
  intensityMultipliers: {
    low: number;
    medium: number;
    high: number;
  };
}

const VOICE_TONE_PROFILES: Record<string, VoiceToneProfile> = {
  happy: {
    emotion: 'happy',
    baseline: {
      stability: 0.45,
      similarity_boost: 0.8,
      speaking_rate: 1.2,
      pitch: 1.15
    },
    intensityMultipliers: {
      low: 0.8,
      medium: 1.0,
      high: 1.2
    }
  },
  excited: {
    emotion: 'excited',
    baseline: {
      stability: 0.3,
      similarity_boost: 0.9,
      speaking_rate: 1.35,
      pitch: 1.25
    },
    intensityMultipliers: {
      low: 0.85,
      medium: 1.0,
      high: 1.15
    }
  },
  sad: {
    emotion: 'sad',
    baseline: {
      stability: 0.85,
      similarity_boost: 0.7,
      speaking_rate: 0.9,
      pitch: 0.9
    },
    intensityMultipliers: {
      low: 0.9,
      medium: 1.0,
      high: 1.1
    }
  },
  angry: {
    emotion: 'angry',
    baseline: {
      stability: 0.2,
      similarity_boost: 0.95,
      speaking_rate: 1.3,
      pitch: 1.15
    },
    intensityMultipliers: {
      low: 0.9,
      medium: 1.0,
      high: 1.2
    }
  }
};

class VoiceService {
  private apiKey: string;
  private baseUrl = "https://api.elevenlabs.io/v1";
  private lastEmotionalContext: string | null = null;
  private emotionalMomentum: number = 0;

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

  private detectEmotionalIntensity(text: string): 'low' | 'medium' | 'high' {
    // Count intensity indicators
    const intensifiers = ['very', 'really', 'so', 'extremely', 'incredibly', 'absolutely'];
    const exclamationCount = (text.match(/!/g) || []).length;
    const intensifierCount = intensifiers.reduce((count, word) => 
      count + (text.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0
    );
    const capsWordCount = (text.match(/\b[A-Z]{2,}\b/g) || []).length;

    const totalIntensity = intensifierCount + exclamationCount + capsWordCount;

    if (totalIntensity >= 3) return 'high';
    if (totalIntensity >= 1) return 'medium';
    return 'low';
  }

  private analyzeTextEmotion(text: string): VoiceEmotionSettings {
    // Enhanced sentiment analysis with comprehensive emotion patterns
    const positiveWords = ['happy', 'great', 'awesome', 'wonderful', 'love', 'excellent', 'good', 'best', 'thanks', 'thank', 'pleased', 'excited', 'joy', 'amazing', 'perfect', 'fantastic'];
    const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'sorry', 'unfortunately', 'disappointed', 'upset', 'regret', 'worried', 'concerned'];
    const angryWords = ['angry', 'mad', 'furious', 'outraged', 'annoyed', 'irritated', 'frustrated', 'rage', 'hate'];
    const excitedWords = ['wow', 'omg', 'amazing', 'incredible', 'awesome', 'fantastic', 'unbelievable'];

    // Get emotional intensity
    const intensity = this.detectEmotionalIntensity(text);

    // Direct emotional expressions with intensity patterns
    const emotionPatterns = [
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(happy|excited|joyful|thrilled|ecstatic)/i, emotion: 'happy' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(sad|depressed|down|upset|heartbroken)/i, emotion: 'sad' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(angry|furious|mad|outraged|livid)/i, emotion: 'angry' },
      { regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(excited|thrilled|pumped|stoked)/i, emotion: 'excited' }
    ];

    // Check for direct emotional expressions first
    for (const pattern of emotionPatterns) {
      if (pattern.regex.test(text)) {
        const profile = VOICE_TONE_PROFILES[pattern.emotion];
        const multiplier = profile.intensityMultipliers[intensity];

        // Apply emotional momentum
        if (this.lastEmotionalContext === pattern.emotion) {
          this.emotionalMomentum = Math.min(this.emotionalMomentum + 0.1, 0.3);
        } else {
          this.emotionalMomentum = 0;
        }

        this.lastEmotionalContext = pattern.emotion;

        return {
          stability: profile.baseline.stability * (1 - this.emotionalMomentum),
          similarity_boost: profile.baseline.similarity_boost,
          speaking_rate: profile.baseline.speaking_rate! * (multiplier + this.emotionalMomentum),
          pitch: profile.baseline.pitch! * (multiplier + this.emotionalMomentum * 0.5)
        };
      }
    }

    // Word-based analysis
    const words = text.toLowerCase().split(/\W+/);
    const emotionCounts = {
      positive: words.filter(word => positiveWords.includes(word)).length,
      negative: words.filter(word => negativeWords.includes(word)).length,
      angry: words.filter(word => angryWords.includes(word)).length,
      excited: words.filter(word => excitedWords.includes(word)).length
    };

    const dominantEmotion = Object.entries(emotionCounts).reduce((max, [emotion, count]) => 
      count > max.count ? { emotion, count } : max,
      { emotion: 'neutral', count: 0 }
    );

    let profile: VoiceToneProfile;
    switch (dominantEmotion.emotion) {
      case 'positive':
        profile = VOICE_TONE_PROFILES.happy;
        break;
      case 'negative':
        profile = VOICE_TONE_PROFILES.sad;
        break;
      case 'angry':
        profile = VOICE_TONE_PROFILES.angry;
        break;
      case 'excited':
        profile = VOICE_TONE_PROFILES.excited;
        break;
      default:
        // Return neutral settings
        return {
          stability: 0.75,
          similarity_boost: 0.75,
          speaking_rate: 1.0,
          pitch: 1.0
        };
    }

    const multiplier = profile.intensityMultipliers[intensity];

    // Update emotional context
    if (this.lastEmotionalContext === profile.emotion) {
      this.emotionalMomentum = Math.min(this.emotionalMomentum + 0.1, 0.3);
    } else {
      this.emotionalMomentum = 0;
    }

    this.lastEmotionalContext = profile.emotion;

    return {
      stability: profile.baseline.stability * (1 - this.emotionalMomentum),
      similarity_boost: profile.baseline.similarity_boost,
      speaking_rate: profile.baseline.speaking_rate! * (multiplier + this.emotionalMomentum),
      pitch: profile.baseline.pitch! * (multiplier + this.emotionalMomentum * 0.5)
    };
  }

  async convertTextToSpeech(text: string, voiceId?: string): Promise<Buffer> {
    try {
      const finalVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM";
      console.log("Using voice ID:", finalVoiceId);

      // Analyze text for emotion-based settings
      const emotionSettings = this.analyzeTextEmotion(text);
      console.log("Emotion settings:", emotionSettings);

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