export async function playAISpeech(text: string) {
  // Strip HTML tags so the voice doesn't read "H 3 Clinical Observations..." literally
  const cleanText = text.replace(/<[^>]*>?/gm, '');

  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

  // Fallback function using native Browser Speech Synthesis
  const playNativeFallback = () => {
    if (!window.speechSynthesis) {
      console.warn("Browser does not support Speech Synthesis API.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    // Optionally try to find a natural sounding female voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Samantha"));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    console.log("Using browser's native SpeechSynthesis fallback.");
  };

  // If no key is set or it contains placeholder, use fallback immediately
  if (!apiKey || apiKey.includes('your_eleven_labs_api_key_here')) {
    console.warn("No valid ElevenLabs API key found. Using browser native voice fallback.");
    playNativeFallback();
    return;
  }

  try {
    // Rachel: 21m00Tcm4TlvDq8ikWAM - Very clear, professional, soothing voice ideal for health diagnostics
    const voiceId = '21m00Tcm4TlvDq8ikWAM'; 
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2', // or eleven_turbo_v2_5
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        }
      })
    });

    if (!response.ok) {
      console.error(`ElevenLabs API error: ${response.statusText}. Using fallback...`);
      playNativeFallback();
      return;
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.play().catch(e => {
      console.error("Error playing audio, possibly due to browser auto-play policies:", e);
    });
    
    // Optional: free up memory after playing
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };

  } catch (err) {
    console.error("ElevenLabs TTS failed. Using fallback...", err);
    playNativeFallback();
  }
}
