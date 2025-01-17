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

    // If no direct emotion expression, analyze the dominant emotion in the message
    const words = text.toLowerCase().split(/\W+/);
    const emotionCounts = {
      positive: words.filter(word => positiveWords.includes(word)).length,
      negative: words.filter(word => negativeWords.includes(word)).length,
      angry: words.filter(word => angryWords.includes(word)).length,
      excited: words.filter(word => excitedWords.includes(word)).length,
      calm: words.filter(word => calmWords.includes(word)).length
    };

    // Find the dominant emotion
    const emotions = Object.entries(emotionCounts);
    const maxEmotion = emotions.reduce((max, current) => 
      current[1] > max[1] ? current : max, ['none', 0]
    );

    // Only adjust voice if we have a clear dominant emotion
    if (maxEmotion[1] > 0) {
      switch (maxEmotion[0]) {
        case 'positive':
          return {
            stability: 0.4,            // More dynamic for positive emotion
            similarity_boost: 0.8,     // Clear, energetic voice
            speaking_rate: 1.1,        // Slightly faster for excitement
            pitch: 1.05               // Slightly higher for positivity
          };
        case 'negative':
          return {
            stability: 0.7,            // More stable for negative emotion
            similarity_boost: 0.75,    // Balanced voice quality
            speaking_rate: 0.9,        // Slower for solemnity
            pitch: 0.95               // Slightly lower for sadness
          };
        case 'angry':
          return {
            stability: 0.25,           // Very dynamic for anger
            similarity_boost: 0.9,     // Strong emotional expression
            speaking_rate: 1.25,       // Faster for intensity
            pitch: 1.1                // Higher for emphasis
          };
        case 'excited':
          return {
            stability: 0.3,            // Very dynamic for excitement
            similarity_boost: 0.85,    // Clear emotional expression
            speaking_rate: 1.2,        // Faster for enthusiasm
            pitch: 1.1                // Higher for excitement
          };
        case 'calm':
          return {
            stability: 0.85,           // Very stable for calmness
            similarity_boost: 0.7,     // Gentle voice quality
            speaking_rate: 0.9,        // Slower for peacefulness
            pitch: 0.95               // Slightly lower for serenity
          };
      }
    }

    // Log the analysis for debugging
    console.log("Text emotion analysis:", {
      text,
      emotionCounts,
      dominantEmotion: maxEmotion[0],
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