/**
 * Sovereign Media Device Manager for P-Meet
 * Proprietary Postveil SovereignMesh hardware abstraction layer.
 * Provides resilient enumeration, progressive device fallback, and live hot-plugging.
 */

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId?: string;
}

export interface AcquireStreamResult {
  stream: MediaStream;
  hasVideo: boolean;
  hasAudio: boolean;
  error?: string;
}

export class SovereignDeviceManager {
  private static instance: SovereignDeviceManager;
  private deviceListeners: Set<(devices: MediaDeviceInfo[]) => void> = new Set();
  private cachedDevices: MediaDeviceInfo[] = [];

  private constructor() {
    if (typeof window !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
      void this.enumerateDevices();
    }
  }

  public static getInstance(): SovereignDeviceManager {
    if (!SovereignDeviceManager.instance) {
      SovereignDeviceManager.instance = new SovereignDeviceManager();
    }
    return SovereignDeviceManager.instance;
  }

  private handleDeviceChange = async () => {
    const devices = await this.enumerateDevices();
    this.deviceListeners.forEach((listener) => listener(devices));
  };

  public async enumerateDevices(kind?: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cachedDevices = devices;
      if (kind) {
        return devices.filter((d) => d.kind === kind);
      }
      return devices;
    } catch (err) {
      console.warn("[SovereignDeviceManager] enumerateDevices notice:", err);
      return this.cachedDevices;
    }
  }

  public onDeviceChange(callback: (devices: MediaDeviceInfo[]) => void): () => void {
    this.deviceListeners.add(callback);
    return () => {
      this.deviceListeners.delete(callback);
    };
  }

  /**
   * Resilient acquisition of audio/video stream with progressive degradation.
   * If combined video+audio fails, attempts audio-only, then video-only.
   */
  public async acquireMediaStream(options: {
    videoDeviceId?: string;
    audioDeviceId?: string;
    videoEnabled?: boolean;
    audioEnabled?: boolean;
  } = {}): Promise<AcquireStreamResult> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is not supported on this browser.");
    }

    const wantVideo = options.videoEnabled !== false;
    const wantAudio = options.audioEnabled !== false;

    const videoConstraints: MediaTrackConstraints | boolean = wantVideo
      ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
          ...(options.videoDeviceId ? { deviceId: { ideal: options.videoDeviceId } } : {}),
        }
      : false;

    const audioConstraints: MediaTrackConstraints | boolean = wantAudio
      ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(options.audioDeviceId ? { deviceId: { ideal: options.audioDeviceId } } : {}),
        }
      : false;

    // 1. Try preferred combined stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });
      return {
        stream,
        hasVideo: stream.getVideoTracks().length > 0,
        hasAudio: stream.getAudioTracks().length > 0,
      };
    } catch (bothErr) {
      console.warn("[SovereignDeviceManager] Combined acquisition notice, checking progressive fallback:", bothErr);

      // 2. Fallback to audio-only if video failed
      if (wantAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
          });
          return {
            stream: audioStream,
            hasVideo: false,
            hasAudio: true,
            error: bothErr instanceof Error ? bothErr.message : "Video unavailable, using audio only",
          };
        } catch (audioErr) {
          console.warn("[SovereignDeviceManager] Audio fallback notice:", audioErr);
        }
      }

      // 3. Fallback to video-only if audio failed
      if (wantVideo) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
          });
          return {
            stream: videoStream,
            hasVideo: true,
            hasAudio: false,
            error: bothErr instanceof Error ? bothErr.message : "Audio unavailable, using video only",
          };
        } catch (videoErr) {
          console.warn("[SovereignDeviceManager] Video fallback notice:", videoErr);
        }
      }

      throw bothErr;
    }
  }

  /**
   * Switches an existing stream track to a new physical hardware device seamlessly.
   */
  public async switchDeviceTrack(
    stream: MediaStream,
    kind: "audio" | "video",
    newDeviceId: string
  ): Promise<MediaStreamTrack> {
    const isVideo = kind === "video";
    const constraints: MediaStreamConstraints = isVideo
      ? { video: { deviceId: { exact: newDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { audio: { deviceId: { exact: newDeviceId }, echoCancellation: true, noiseSuppression: true } };

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = isVideo ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];

    const oldTracks = isVideo ? stream.getVideoTracks() : stream.getAudioTracks();
    oldTracks.forEach((t) => {
      stream.removeTrack(t);
      t.stop();
    });

    stream.addTrack(newTrack);
    return newTrack;
  }
}
