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
      stability: 0.35, // Reduced for more dynamic expression
      similarity_boost: 0.85,
      speaking_rate: 1.25, // Increased for more energetic delivery
      pitch: 1.2 // Increased for brighter tone
    },
    intensityMultipliers: {
      low: 0.9,
      medium: 1.1,
      high: 1.3
    }
  },
  excited: {
    emotion: 'excited',
    baseline: {
      stability: 0.25, // Reduced further for very dynamic expression
      similarity_boost: 0.9,
      speaking_rate: 1.4, // Increased for enthusiastic delivery
      pitch: 1.3 // Higher pitch for excitement
    },
    intensityMultipliers: {
      low: 0.95,
      medium: 1.15,
      high: 1.35
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
    const intensifiers = [
      'very', 'really', 'so', 'extremely', 'incredibly', 'absolutely',
      'totally', 'completely', 'super', 'definitely', 'absolutely'
    ];
    const exclamationCount = (text.match(/!/g) || []).length;
    const intensifierCount = intensifiers.reduce((count, word) => 
      count + (text.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0
    );
    const capsWordCount = (text.match(/\b[A-Z]{2,}\b/g) || []).length;
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;

    const totalIntensity = intensifierCount + exclamationCount + capsWordCount + emojiCount;

    if (totalIntensity >= 3) return 'high';
    if (totalIntensity >= 1) return 'medium';
    return 'low';
  }

  private analyzeTextEmotion(text: string): VoiceEmotionSettings {
    // Enhanced positive emotion detection with stronger weights for happy/excited keywords
    const positiveWords = [
      'happy', 'great', 'awesome', 'wonderful', 'love', 'excellent', 'good', 'best',
      'thanks', 'thank', 'pleased', 'excited', 'joy', 'amazing', 'perfect', 'fantastic',
      'delighted', 'thrilled', 'cheerful', 'glad', 'blessed', 'grateful', 'celebration',
      'excited', 'yay', 'woohoo', 'congratulations', 'congrats', '😊', '😃', '😄', '🎉'
    ];
    const excitedWords = [
      'wow', 'omg', 'amazing', 'incredible', 'awesome', 'fantastic', 'unbelievable',
      'cant wait', "can't wait", 'pumped', 'stoked', 'psyched', 'thrilled', 'excellent',
      'outstanding', 'phenomenal', '🎉', '🎊', '🥳', '🤩'
    ];
    const negativeWords = [
      'sad', 'bad', 'terrible', 'awful', 'hate', 'worst', 'sorry', 'unfortunately',
      'disappointed', 'upset', 'regret', 'worried', 'concerned'
    ];
    const angryWords = [
      'angry', 'mad', 'furious', 'outraged', 'annoyed', 'irritated', 'frustrated',
      'rage', 'hate'
    ];

    // Get emotional intensity
    const intensity = this.detectEmotionalIntensity(text);

    // Check explicit happiness/excitement indicators first
    const hasHappyKeyword = /(happy|excited|joy|delighted|glad)\b/i.test(text);
    if (hasHappyKeyword) {
      const profile = VOICE_TONE_PROFILES.happy;
      const multiplier = profile.intensityMultipliers[intensity];

      return {
        stability: 0.3, // Lower stability for more dynamic expression
        similarity_boost: 0.85,
        speaking_rate: 1.3 * multiplier, // Faster for happiness
        pitch: 1.25 * multiplier // Higher pitch for positive emotions
      };
    }

    // Enhanced emotional patterns with emphasis on positive emotions
    const emotionPatterns = [
      { 
        regex: /(?:i (?:am|feel)|i'm|feeling|this is|that's|thats) (?:so |really |very |extremely )?(happy|excited|joyful|thrilled|ecstatic|delighted|glad)/i,
        emotion: 'happy'
      },
      { 
        regex: /(?:i (?:am|feel)|i'm|feeling|this is|that's|thats) (?:so |really |very |extremely )?(excited|thrilled|pumped|stoked|psyched)/i,
        emotion: 'excited'
      },
      { 
        regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(sad|depressed|down|upset|heartbroken)/i,
        emotion: 'sad'
      },
      { 
        regex: /(?:i (?:am|feel)|i'm|feeling) (?:so |really |very |extremely )?(angry|furious|mad|outraged|livid)/i,
        emotion: 'angry'
      }
    ];

    // Check for direct emotional expressions
    for (const pattern of emotionPatterns) {
      if (pattern.regex.test(text)) {
        const profile = VOICE_TONE_PROFILES[pattern.emotion];
        const multiplier = profile.intensityMultipliers[intensity];

        // Apply emotional momentum with stronger effect for positive emotions
        if (this.lastEmotionalContext === pattern.emotion) {
          this.emotionalMomentum = Math.min(
            this.emotionalMomentum + (pattern.emotion === 'happy' || pattern.emotion === 'excited' ? 0.2 : 0.15),
            0.4
          );
        } else {
          this.emotionalMomentum = 0;
        }

        this.lastEmotionalContext = pattern.emotion;

        return {
          stability: profile.baseline.stability * (1 - this.emotionalMomentum),
          similarity_boost: profile.baseline.similarity_boost,
          speaking_rate: profile.baseline.speaking_rate! * (multiplier + this.emotionalMomentum),
          pitch: profile.baseline.pitch! * (multiplier + this.emotionalMomentum * 0.6)
        };
      }
    }

    // Word-based analysis with increased positive bias
    const words = text.toLowerCase().split(/\W+/);
    const emotionCounts = {
      positive: words.filter(word => positiveWords.includes(word)).length * 1.5, // Increased weight for positive words
      excited: words.filter(word => excitedWords.includes(word)).length * 1.5,  // Increased weight for excited words
      negative: words.filter(word => negativeWords.includes(word)).length * 0.8, // Reduced weight for negative words
      angry: words.filter(word => angryWords.includes(word)).length * 0.8 // Reduced weight for angry words
    };

    // Check for happy emojis with increased weight
    const happyEmojiCount = (text.match(/[😀😃😄😊🙂😉😌😍🥰😘🤗]/g) || []).length;
    emotionCounts.positive += happyEmojiCount * 2.0; // Increased weight for happy emojis

    const dominantEmotion = Object.entries(emotionCounts).reduce((max, [emotion, count]) => 
      count > max.count ? { emotion, count } : max,
      { emotion: 'neutral', count: 0 }
    );

    let profile: VoiceToneProfile;
    switch (dominantEmotion.emotion) {
      case 'positive':
      case 'excited':
        // Use excited profile for stronger positive emotions
        profile = emotionCounts.excited > emotionCounts.positive 
          ? VOICE_TONE_PROFILES.excited 
          : VOICE_TONE_PROFILES.happy;
        break;
      case 'negative':
        profile = VOICE_TONE_PROFILES.sad;
        break;
      case 'angry':
        profile = VOICE_TONE_PROFILES.angry;
        break;
      default:
        // Default to slightly positive neutral settings
        return {
          stability: 0.65,
          similarity_boost: 0.75,
          speaking_rate: 1.1,
          pitch: 1.05
        };
    }

    const multiplier = profile.intensityMultipliers[intensity];

    // Update emotional context with stronger momentum for positive emotions
    if (this.lastEmotionalContext === profile.emotion) {
      const momentumIncrease = (profile.emotion === 'happy' || profile.emotion === 'excited') ? 0.2 : 0.15;
      this.emotionalMomentum = Math.min(this.emotionalMomentum + momentumIncrease, 0.4);
    } else {
      this.emotionalMomentum = 0;
    }

    this.lastEmotionalContext = profile.emotion;

    return {
      stability: profile.baseline.stability * (1 - this.emotionalMomentum),
      similarity_boost: profile.baseline.similarity_boost,
      speaking_rate: profile.baseline.speaking_rate! * (multiplier + this.emotionalMomentum),
      pitch: profile.baseline.pitch! * (multiplier + this.emotionalMomentum * 0.6)
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