/**
 * Sovereign Noise Suppressor
 * Proprietary Postveil SovereignMesh client-side acoustic purification engine.
 * Connects directly to Web Audio API AudioWorklet to clean microphone input without cloud compute.
 */

export class SovereignNoiseSuppressor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private cleanedStream: MediaStream | null = null;

  public async apply(rawStream: MediaStream): Promise<MediaStream> {
    if (typeof window === "undefined" || !window.AudioContext) {
      return rawStream;
    }

    const audioTracks = rawStream.getAudioTracks();
    if (audioTracks.length === 0) {
      return rawStream;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx({ latencyHint: "interactive" });
      
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Load Sovereign Noise Processor AudioWorklet
      try {
        await this.audioContext.audioWorklet.addModule("/sovereignNoiseProcessor.js");
      } catch (modErr) {
        console.warn("[SovereignNoiseSuppressor] AudioWorklet addModule fallback:", modErr);
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(rawStream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      try {
        this.workletNode = new AudioWorkletNode(this.audioContext, "sovereign-noise-processor");
        this.sourceNode.connect(this.workletNode);
        this.workletNode.connect(this.destinationNode);
      } catch {
        // Fallback to highpass & lowpass spectral filtering if AudioWorklet unavailable
        const biquadHigh = this.audioContext.createBiquadFilter();
        biquadHigh.type = "highpass";
        biquadHigh.frequency.setValueAtTime(80, this.audioContext.currentTime);

        const biquadLow = this.audioContext.createBiquadFilter();
        biquadLow.type = "lowpass";
        biquadLow.frequency.setValueAtTime(7500, this.audioContext.currentTime);

        this.sourceNode.connect(biquadHigh);
        biquadHigh.connect(biquadLow);
        biquadLow.connect(this.destinationNode);
      }

      const processedTrack = this.destinationNode.stream.getAudioTracks()[0];
      const videoTracks = rawStream.getVideoTracks();

      this.cleanedStream = new MediaStream([processedTrack, ...videoTracks]);
      return this.cleanedStream;
    } catch (err) {
      console.warn("[SovereignNoiseSuppressor] Acoustic filtering notice:", err);
      return rawStream;
    }
  }

  public cleanup(): void {
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.workletNode) {
        this.workletNode.disconnect();
        this.workletNode = null;
      }
      if (this.destinationNode) {
        this.destinationNode.disconnect();
        this.destinationNode = null;
      }
      if (this.audioContext && this.audioContext.state !== "closed") {
        void this.audioContext.close();
        this.audioContext = null;
      }
    } catch (e) {
      console.warn("[SovereignNoiseSuppressor] Cleanup error:", e);
    }
  }
}
