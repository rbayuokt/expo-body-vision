import type * as ExpoSpeech from 'expo-speech';

export interface VoiceOptions {
  /** BCP-47 tag, e.g. `en-US`, `id-ID`. Defaults to the device language. */
  language?: string;
  /** 1 is normal. Default 0.95. */
  rate?: number;
  pitch?: number;
  /** A voice identifier from `Speech.getAvailableVoicesAsync()`. */
  voice?: string;
}

export interface Speaker {
  speak(text: string): void;
  stop(): void;
}

let expoSpeech: typeof ExpoSpeech | null | undefined;

// expo-speech is an optional peer: Expo's Metro config allows optional requires, so this
// bundles without it and returns null at runtime.
function loadExpoSpeech(): typeof ExpoSpeech | null {
  if (expoSpeech === undefined) {
    try {
      expoSpeech = require('expo-speech') as typeof ExpoSpeech;
    } catch {
      expoSpeech = null;
    }
  }
  return expoSpeech;
}

/** Whether built-in voice guidance can work, i.e. expo-speech is installed. */
export function isSpeechAvailable(): boolean {
  return loadExpoSpeech() !== null;
}

let warned = false;

/**
 * Text-to-speech backed by expo-speech, or null when it isn't installed. Each call cuts off
 * whatever is still being said, so prompts never queue up behind each other.
 */
export function createSpeaker(options: VoiceOptions = {}): Speaker | null {
  const speech = loadExpoSpeech();
  if (!speech) {
    if (!warned) {
      warned = true;
      console.warn(
        '[expo-body-vision] Voice guidance needs expo-speech: npx expo install expo-speech'
      );
    }
    return null;
  }
  return {
    speak(text) {
      speech.stop();
      speech.speak(text, {
        language: options.language,
        rate: options.rate ?? 0.95,
        pitch: options.pitch,
        voice: options.voice,
      });
    },
    stop() {
      speech.stop();
    },
  };
}
