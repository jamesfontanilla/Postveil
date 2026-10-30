/**
 * LiveKit-Compatible Real-Time Audio Meter & Active Speaker Detector
 * Based on @livekit/components-core createIsSpeakingObserver and AudioContext architecture.
 */

export interface AudioMeterSubscription {
  cleanup: () => void;
}

export function createLiveKitAudioMeter(
  stream: MediaStream,
  onUpdate: (volume: number, isSpeaking: boolean) => void,
  options: {
    speakingThreshold?: number; // RMS threshold (0.01 to 0.1)
    smoothingTimeConstant?: number;
    intervalMs?: number;
  } = {}
): AudioMeterSubscription {
  const speakingThreshold = options.speakingThreshold ?? 0.035;
  const intervalMs = options.intervalMs ?? 50;

  if (typeof window === "undefined" || !stream.getAudioTracks().length) {
    return { cleanup: () => {} };
  }

  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack || !audioTrack.enabled) {
    return { cleanup: () => {} };
  }

  // Use Web Audio API safely with webkit prefix fallback
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return { cleanup: () => {} };
  }

  let audioCtx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timerId: number | null = null;
  let isSpeakingState = false;

  try {
    audioCtx = new AudioContextClass();
    sourceNode = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = options.smoothingTimeConstant ?? 0.4;
    sourceNode.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    timerId = window.setInterval(() => {
      if (!analyser || !audioTrack.enabled) {
        if (isSpeakingState) {
          isSpeakingState = false;
          onUpdate(0, false);
        }
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Compute Root Mean Square (RMS) volume
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = dataArray[i] / 255;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      const volumeLevel = Math.min(100, Math.round(rms * 100));
      const nowSpeaking = rms > speakingThreshold;

      if (nowSpeaking !== isSpeakingState || volumeLevel > 0) {
        isSpeakingState = nowSpeaking;
        onUpdate(volumeLevel, isSpeakingState);
      }
    }, intervalMs);
  } catch (err) {
    console.warn("[LiveKitAudioMeter] Initialization notice:", err);
  }

  return {
    cleanup: () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
      try {
        sourceNode?.disconnect();
        analyser?.disconnect();
        if (audioCtx && audioCtx.state !== "closed") {
          void audioCtx.close();
        }
      } catch {
        // Safe disposal
      }
    },
  };
}
