let audioContext: AudioContext | null = null;
let nextStartTime = 0;

export function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

export function playAISpeech(text: string): Promise<void> {
  return new Promise(async (resolve) => {
    initAudio();
    if (!audioContext) {
      resolve();
      return;
    }

    // Strip HTML tags so the voice doesn't read "H 3 Clinical Observations..." literally
    const cleanText = text.replace(/<[^>]*>?/gm, '');

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

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
          model_id: 'eleven_turbo_v2_5',
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
        resolve();
        return;
      }

      // Reset nextStartTime if it's in the past (e.g. previous sentence finished)
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

        // If length is odd, keep the last byte for the next chunk
        if (bufferToProcess.length % 2 !== 0) {
          leftover = bufferToProcess.slice(-1);
          bufferToProcess = bufferToProcess.slice(0, -1);
        }

        if (bufferToProcess.length === 0) continue;

        // Convert Uint8Array to Int16Array (16-bit PCM)
        const int16Array = new Int16Array(bufferToProcess.buffer, bufferToProcess.byteOffset, bufferToProcess.byteLength / 2);
        
        // Convert Int16 to Float32 [-1.0, 1.0] for Web Audio API
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(nextStartTime);
        
        // Signal ChatPanel EXACTLY when the audio hits the WebAudio pipeline
        if (isFirstChunk) {
          resolve();
          isFirstChunk = false;
        }

        // Increment nextStartTime to cleanly queue the next chunk
        nextStartTime += audioBuffer.duration;
      }

    } catch (err) {
      console.error("ElevenLabs TTS failed severely in the network fetch:", err);
      resolve();
    }
  });
}

