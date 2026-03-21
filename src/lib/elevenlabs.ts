export async function playAISpeech(text: string) {
  // Strip HTML tags so the voice doesn't read "H 3 Clinical Observations..." literally
  const cleanText = text.replace(/<[^>]*>?/gm, '');

  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

  if (!apiKey || apiKey.includes('your_eleven_labs_api_key_here')) {
    console.error("No valid ElevenLabs API key found! Please update VITE_ELEVENLABS_API_KEY in your .env");
    return;
  }

  try {
    // Roger - Laid-Back, Casual, Resonant
    const voiceId = 'CwhRBWXzGAHq8TQ4Fs17'; 
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
      console.error(`ElevenLabs API error: ${response.statusText}`);
      const body = await response.text();
      console.error(body);
      return;
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.play().catch(e => {
      console.error("Error playing audio, possibly due to browser auto-play policies:", e);
    });
    
    // Free up memory after playing
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };

  } catch (err) {
    console.error("ElevenLabs TTS failed severely in the network fetch:", err);
  }
}
