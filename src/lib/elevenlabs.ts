
let isPlayingInternal = false;

export const isAudioLive = () => isPlayingInternal;

/**
 * High-quality free browser-based TTS using Web Speech API
 */
export async function initAudio() {
  // Web Speech API usually doesn't require explicit context initialization, 
  // but we'll ensure the synthesis is ready and cancelled of any stale speech.
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function playAISpeech(text: string, onStart?: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      console.error("Web Speech API not supported in this browser.");
      resolve();
      return;
    }

    // IMMEDIATELY stop any current speech to prevent queuing/doubling
    window.speechSynthesis.cancel();
    isPlayingInternal = false;

    // Strip HTML tags
    const cleanText = text.replace(/<[^>]*>?/gm, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Attempt to pick a high-quality "English" voice
    const voices = window.speechSynthesis.getVoices();
    // Prefer Google/Microsoft "Natural" or "Online" voices if available
    const preferredVoice = voices.find(v => 
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Online')) && 
      v.lang.startsWith('en')
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      isPlayingInternal = true;
      window.dispatchEvent(new CustomEvent('agnos-audio-start'));
      onStart?.();
    };

    utterance.onend = () => {
      isPlayingInternal = false;
      window.dispatchEvent(new CustomEvent('agnos-audio-end'));
      resolve();
    };

    utterance.onerror = (event) => {
      console.error("SpeechSynthesis Error:", event);
      isPlayingInternal = false;
      window.dispatchEvent(new CustomEvent('agnos-audio-end'));
      resolve();
    };

    // Note: Chrome sometimes needs getVoices() to be called first to populate the list
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        const updatedVoices = window.speechSynthesis.getVoices();
        const fallbackPreferredVoice = updatedVoices.find(v => 
          (v.name.includes('Google') || v.name.includes('Natural')) && v.lang.startsWith('en')
        );
        if (fallbackPreferredVoice) utterance.voice = fallbackPreferredVoice;
        window.speechSynthesis.speak(utterance);
      };
    } else {
      window.speechSynthesis.speak(utterance);
    }
  });
}
