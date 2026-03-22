let audioContext: AudioContext|null = null;
let nextStartTime = 0;
let isPlayingInternal = false;

export const isAudioLive = () => isPlayingInternal;

export async function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    console.log('[ElevenLabs] AudioContext created.');
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
    console.log('[ElevenLabs] AudioContext resumed.');
  }
}

export function playAISpeech(text: string, onStart?: () => void): Promise<void> {
  return new Promise(async (resolve) => {
    isPlayingInternal = true;
    window.dispatchEvent(new CustomEvent('agnos-audio-start'));
    await initAudio();
    if (!audioContext) {
      console.error('[ElevenLabs] AudioContext failed to initialize.');
      resolve();
      return;
    }

    // Strip HTML tags so the voice doesn't read "H 3 Clinical Observations..." literally
    const cleanText = text.replace(/<[^>]*>?/gm, '');

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim();

    if (!apiKey || apiKey.includes('your_eleven_labs_api_key_here')) {
      console.error("No valid ElevenLabs API key found! Please update VITE_ELEVENLABS_API_KEY in your .env");
      resolve();
      return;
    }

    try {
      // Roger - Laid-Back, Casual, Resonant
      const voiceId = 'CwhRBWXzGAHq8TQ4Fs17'; 
      // Use turbo_v2_5 for lowest latency, and request pcm_24000
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/pcm',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_turbo_v2', // Stable model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ElevenLabs Error] Status: ${response.status} (${response.statusText})`);
        console.error(`[ElevenLabs Details] ${errorBody}`);
        
        if (response.status === 401) alert("Unauthorized: ElevenLabs API Key is invalid.");
        else if (response.status === 403) alert("Forbidden: Out of credits or restricted voice.");
        
        resolve();
        return;
      }

      // Reset nextStartTime if it's in the past
      if (nextStartTime < audioContext.currentTime) {
        nextStartTime = audioContext.currentTime + 0.05; 
      }

      const reader = response.body?.getReader();
      if (!reader) {
        resolve();
        return;
      }

      let leftover: Uint8Array | null = null;
      let isFirstChunk = true;

      // Create a global gain node for volume control if needed
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0; 
      gainNode.connect(audioContext.destination);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (isFirstChunk) resolve();
          break;
        }

        let bufferToProcess: Uint8Array;
        if (leftover) {
          bufferToProcess = new Uint8Array(leftover.length + value.length);
          bufferToProcess.set(leftover);
          bufferToProcess.set(value, leftover.length);
          leftover = null;
        } else {
          bufferToProcess = value;
        }

        // Must be even for 16-bit
        if (bufferToProcess.length % 2 !== 0) {
          leftover = bufferToProcess.slice(-1);
          bufferToProcess = bufferToProcess.slice(0, -1);
        }

        if (bufferToProcess.length === 0) continue;

        const int16Array = new Int16Array(bufferToProcess.buffer, bufferToProcess.byteOffset, bufferToProcess.byteLength / 2);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNode);
        source.start(nextStartTime);
        
        // Signal ChatPanel EXACTLY when the audio hits the WebAudio pipeline
        if (isFirstChunk) {
          onStart?.();
          isFirstChunk = false;
        }

        // Increment nextStartTime to cleanly queue the next chunk
        nextStartTime += audioBuffer.duration;
      }

      // Final Resolve for the entire voice sequence
      setTimeout(() => {
        isPlayingInternal = false;
        window.dispatchEvent(new CustomEvent('agnos-audio-end'));
        resolve();
      }, 500);

    } catch (err) {
      console.error("ElevenLabs TTS failed severely in the network fetch:", err);
      isPlayingInternal = false;
      window.dispatchEvent(new CustomEvent('agnos-audio-end'));
      resolve();
    }
  });
}

