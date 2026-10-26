export const RECORD_MAX_MS = 15 * 60 * 1000; export const RECORD_MAX_BYTES = 1024 * 1024 * 1024;
export function chooseRecordMimeType(): string { if (typeof MediaRecorder === "undefined") return ""; return ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || ""; }
export function stopAllTracks(streams: Array<MediaStream | null | undefined>): void { streams.forEach((stream) => stream?.getTracks().forEach((track) => track.stop())); }
