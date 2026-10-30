export interface Participant {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  isHost: boolean;
  isSelf: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  audioLevel: number; // 0 to 100 for live VU visualizer
  connectionQuality: "excellent" | "good" | "poor";
  stream?: MediaStream;
}

export type MeetingViewMode = "grid" | "speaker" | "presentation" | "collab";

export type ActiveDrawerTab = "none" | "chat" | "participants" | "record" | "docs" | "settings";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderHandle: string;
  timestamp: string;
  text: string;
  isSystem?: boolean;
}

export interface MeetingRoomState {
  roomId: string;
  roomTitle: string;
  roomHandle: string; // e.g. jaime/boardroom
  isLocked: boolean;
  isRecording: boolean;
  recordingDurationSeconds: number;
  viewMode: MeetingViewMode;
  e2eeEnabled: boolean;
  e2eeFingerprint: string;
  lowBandwidthMode: boolean;
}
