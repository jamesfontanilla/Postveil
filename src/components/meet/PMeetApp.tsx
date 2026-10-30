import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Share2,
  Users,
  MessageSquare,
  ShieldCheck,
  Disc,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Settings,
  Lock,
  Copy,
  Check,
  Sparkles,
  Wifi,
  Send,
  X,
  FileText,
  Volume2,
} from "lucide-react";
import { ParentSuiteRibbon } from "../platform/ribbon";
import { Participant, MeetingRoomState, ChatMessage, ActiveDrawerTab, MeetingViewMode } from "./meetTypes";
import "./MeetStyles.css";

interface PMeetAppProps {
  initialRoomHandle?: string;
  userEmail?: string;
  userName?: string;
  onBackToMail?: () => void;
  onSwitchToAccounts?: () => void;
  onSignOut?: () => void;
}

export const PMeetApp: React.FC<PMeetAppProps> = ({
  initialRoomHandle = "jaime/boardroom",
  userEmail = "jaime@postveil.me",
  userName = "Jaime",
  onBackToMail,
  onSwitchToAccounts,
  onSignOut,
}) => {
  // Room State
  const [room, setRoom] = useState<MeetingRoomState>({
    roomId: "pv-meet-sec-9812",
    roomTitle: "Sovereign Executive Boardroom",
    roomHandle: initialRoomHandle,
    isLocked: true,
    isRecording: false,
    recordingDurationSeconds: 0,
    viewMode: "grid",
    e2eeEnabled: true,
    e2eeFingerprint: "SHA256:7f8a9b2c3d4e5f6a",
    lowBandwidthMode: false,
  });

  // Local Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawerTab>("none");
  const [copiedLink, setCopiedLink] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "sys-1",
      senderId: "system",
      senderName: "Postveil Sovereign Engine",
      senderHandle: "p-meet",
      timestamp: "20:00",
      text: "🔒 Room locked with Ed25519 E2EE mesh. Direct P2P audio/video active.",
      isSystem: true,
    },
    {
      id: "msg-1",
      senderId: "alex-1",
      senderName: "Alex Vance",
      senderHandle: "alex.postveil.me",
      timestamp: "20:01",
      text: "The local-first OPFS benchmark results look extraordinary. Zero latency on Safari.",
    },
  ]);

  // Participants (Self + Sovereign Peers)
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: "self",
      name: userName,
      handle: userEmail,
      isHost: true,
      isSelf: true,
      isMuted: isMuted,
      isVideoOff: isVideoOff,
      isScreenSharing: isScreenSharing,
      isSpeaking: false,
      audioLevel: 0,
      connectionQuality: "excellent",
    },
    {
      id: "p-alex",
      name: "Alex Vance",
      handle: "alex.postveil.me",
      isHost: false,
      isSelf: false,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      isSpeaking: true,
      audioLevel: 75,
      connectionQuality: "excellent",
    },
    {
      id: "p-elena",
      name: "Elena Rostova",
      handle: "elena.postveil.me",
      isHost: false,
      isSelf: false,
      isMuted: true,
      isVideoOff: false,
      isScreenSharing: false,
      isSpeaking: false,
      audioLevel: 0,
      connectionQuality: "excellent",
    },
    {
      id: "p-david",
      name: "David Chen",
      handle: "david.postveil.me",
      isHost: false,
      isSelf: false,
      isMuted: false,
      isVideoOff: true,
      isScreenSharing: false,
      isSpeaking: false,
      audioLevel: 0,
      connectionQuality: "good",
    },
  ]);

  // Sync self state changes into participants array
  useEffect(() => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.isSelf
          ? {
              ...p,
              isMuted,
              isVideoOff,
              isScreenSharing,
            }
          : p
      )
    );
  }, [isMuted, isVideoOff, isScreenSharing]);

  // Recording Timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (room.isRecording) {
      timer = setInterval(() => {
        setRoom((curr) => ({
          ...curr,
          recordingDurationSeconds: curr.recordingDurationSeconds + 1,
        }));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [room.isRecording]);

  // Format seconds to mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCopyLink = useCallback(() => {
    navigator.clipboard?.writeText(`https://meet.postveil.me/${room.roomHandle}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [room.roomHandle]);

  const toggleRecording = () => {
    setRoom((curr) => ({
      ...curr,
      isRecording: !curr.isRecording,
      recordingDurationSeconds: !curr.isRecording ? 0 : curr.recordingDurationSeconds,
    }));
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: "self",
      senderName: userName,
      senderHandle: userEmail,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: chatInput.trim(),
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setChatInput("");
  };

  return (
    <div className="pv-meet-shell" data-testid="pmeet-app">
      {/* 1. Universal Parent Suite Ribbon */}
      <div className="pv-meet-ribbon-wrapper">
        <ParentSuiteRibbon
          currentPillarId="p-meet"
          userEmail={userEmail}
          userName={userName}
          onSwitchToMail={onBackToMail}
          onSwitchToAccounts={onSwitchToAccounts}
          onSignOut={onSignOut}
          centerContent={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#34d399", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                <ShieldCheck size={14} /> E2EE Verified Mesh
              </span>
            </div>
          }
        />
      </div>

      {/* 2. Secondary Context Ribbon */}
      <div className="pv-meet-sub-ribbon">
        <div className="pv-meet-sub-left">
          <button
            type="button"
            className="pv-meet-room-pill"
            onClick={handleCopyLink}
            title="Click to copy sovereign meeting link"
          >
            <Lock size={13} color="#34d399" />
            <span>meet.postveil.me/{room.roomHandle}</span>
            {copiedLink ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
          </button>
          {room.isRecording && (
            <div className="pv-meet-rec-badge" data-testid="rec-badge">
              <span className="pv-meet-rec-dot" />
              <span>REC {formatDuration(room.recordingDurationSeconds)} (Local OPFS)</span>
            </div>
          )}
        </div>

        <div className="pv-meet-sub-center">
          <div className="pv-meet-view-pills">
            <button
              type="button"
              className={`pv-meet-view-btn ${room.viewMode === "grid" ? "active" : ""}`}
              onClick={() => setRoom((curr) => ({ ...curr, viewMode: "grid" }))}
            >
              <LayoutGrid size={13} /> Grid
            </button>
            <button
              type="button"
              className={`pv-meet-view-btn ${room.viewMode === "speaker" ? "active" : ""}`}
              onClick={() => setRoom((curr) => ({ ...curr, viewMode: "speaker" }))}
            >
              <Users size={13} /> Speaker Focus
            </button>
          </div>
        </div>

        <div className="pv-meet-sub-right">
          <div className="pv-meet-e2ee-tag" title="Hardware Encrypted WebRTC">
            <Sparkles size={12} />
            <span>Insertable Streams 256-bit</span>
          </div>
        </div>
      </div>

      {/* 3. Main Stage Workspace */}
      <div className="pv-meet-workspace">
        <div className="pv-meet-stage">
          <div className={`pv-meet-grid count-${participants.length}`}>
            {participants.map((p) => {
              const initials = p.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase();

              return (
                <div
                  key={p.id}
                  className={`pv-meet-tile ${p.isSpeaking ? "speaking" : ""}`}
                  data-testid={`tile-${p.id}`}
                >
                  {/* Simulated Video Canvas */}
                  {!p.isVideoOff ? (
                    <div className="pv-meet-video-canvas" />
                  ) : null}

                  {/* Avatar Placeholder when video is off */}
                  {p.isVideoOff && (
                    <div className="pv-meet-avatar-placeholder">
                      <div className={`pv-meet-avatar-circle ${p.isSpeaking ? "speaking-wave" : ""}`}>
                        {initials}
                      </div>
                    </div>
                  )}

                  {/* Tile Bottom Overlays */}
                  <div className="pv-meet-tile-footer">
                    <div className="pv-meet-tile-nametag">
                      <span>{p.name} {p.isSelf ? "(You)" : ""}</span>
                      {p.isHost && <span style={{ color: "#34d399", fontSize: "10px" }}>• Host</span>}
                    </div>

                    <div className={`pv-meet-tile-mic-badge ${p.isMuted ? "muted" : ""}`}>
                      {p.isMuted ? <MicOff size={14} /> : <Volume2 size={14} color="#34d399" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating Control Bar (The Ergonomic Thumb Zone) */}
          <div className="pv-meet-controls-bar" role="toolbar" aria-label="Meeting controls">
            {/* Mic Toggle */}
            <button
              type="button"
              className={`pv-meet-ctrl-btn ${isMuted ? "off" : ""}`}
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? "Unmute microphone (Ctrl+D)" : "Mute microphone (Ctrl+D)"}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Video Toggle */}
            <button
              type="button"
              className={`pv-meet-ctrl-btn ${isVideoOff ? "off" : ""}`}
              onClick={() => setIsVideoOff(!isVideoOff)}
              title={isVideoOff ? "Start camera (Ctrl+E)" : "Stop camera (Ctrl+E)"}
              aria-label={isVideoOff ? "Start video" : "Stop video"}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>

            {/* Screen Share */}
            <button
              type="button"
              className={`pv-meet-ctrl-btn ${isScreenSharing ? "active-action" : ""}`}
              onClick={() => setIsScreenSharing(!isScreenSharing)}
              title="Share screen"
              aria-label="Share screen"
            >
              <Share2 size={20} />
            </button>

            {/* Local OPFS Recording */}
            <button
              type="button"
              className={`pv-meet-ctrl-btn ${room.isRecording ? "off" : ""}`}
              onClick={toggleRecording}
              title={room.isRecording ? "Stop Local Recording" : "Start Zero-Cloud Local OPFS Recording"}
              aria-label="Record call"
            >
              <Disc size={20} />
            </button>

            {/* Chat Drawer Toggle */}
            <button
              type="button"
              className={`pv-meet-ctrl-btn ${activeDrawer === "chat" ? "active-action" : ""}`}
              onClick={() => setActiveDrawer(activeDrawer === "chat" ? "none" : "chat")}
              title="Toggle meeting chat"
              aria-label="Chat"
            >
              <MessageSquare size={20} />
            </button>

            {/* Participants Drawer Toggle */}
            <button
              type="button"
              className={`pv-meet-ctrl-btn ${activeDrawer === "participants" ? "active-action" : ""}`}
              onClick={() => setActiveDrawer(activeDrawer === "participants" ? "none" : "participants")}
              title="Toggle participant list"
              aria-label="Participants"
            >
              <Users size={20} />
            </button>

            {/* End Call (Red Pill) */}
            <button
              type="button"
              className="pv-meet-ctrl-btn leave-btn"
              onClick={() => onBackToMail?.()}
              title="Leave sovereign call"
              aria-label="Leave call"
            >
              <PhoneOff size={22} />
            </button>
          </div>
        </div>

        {/* 4. Side Drawers (Chat & Participants) */}
        {activeDrawer === "chat" && (
          <aside className="pv-meet-drawer" data-testid="chat-drawer">
            <div className="pv-meet-drawer-header">
              <span>Encrypted In-Meeting Chat</span>
              <button
                type="button"
                className="pv-meet-drawer-close"
                onClick={() => setActiveDrawer("none")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="pv-meet-drawer-body">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="pv-meet-chat-msg">
                  <div className="pv-meet-chat-meta">
                    <span className="pv-meet-chat-sender">{msg.senderName}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div style={{ color: msg.isSystem ? "#34d399" : "#e2e8f0" }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="pv-meet-chat-input-box">
              <input
                type="text"
                className="pv-meet-chat-input"
                placeholder="Send secure message to room..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button
                type="submit"
                className="pv-meet-ctrl-btn"
                style={{ width: "38px", height: "38px", borderRadius: "8px" }}
              >
                <Send size={16} />
              </button>
            </form>
          </aside>
        )}

        {activeDrawer === "participants" && (
          <aside className="pv-meet-drawer" data-testid="participants-drawer">
            <div className="pv-meet-drawer-header">
              <span>Participants ({participants.length})</span>
              <button
                type="button"
                className="pv-meet-drawer-close"
                onClick={() => setActiveDrawer("none")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="pv-meet-drawer-body">
              {participants.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px",
                    backgroundColor: "var(--pv-meet-surface)",
                    borderRadius: "8px",
                    border: "1px solid var(--pv-meet-border)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                      {p.name} {p.isSelf ? "(You)" : ""}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--pv-meet-muted)" }}>
                      {p.handle}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {p.isMuted ? <MicOff size={15} color="#f87171" /> : <Mic size={15} color="#34d399" />}
                    <span title="Zero packet loss"><Wifi size={15} color="#34d399" /></span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default PMeetApp;
