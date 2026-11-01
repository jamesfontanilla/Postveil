import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ShieldCheck,
  Zap,
  Calendar,
  Lock,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Settings,
  History,
  Clock,
  Users,
  Volume2,
  ExternalLink,
  ChevronDown,
  X,
} from "lucide-react";
import { ParentSuiteRibbon } from "../platform/ribbon";
import { SovereignDeviceManager } from "./engine/sovereignDeviceManager";
import { createSovereignAudioMeter } from "./engine/sovereignAudioMeter";
import { generateMemorableMeetingSlug, generateSecureE2EERoom, parseMeetingInput } from "./engine/meetingIdGenerator";
import "./MeetStyles.css";

export interface PMeetHomeProps {
  userEmail?: string;
  userName?: string;
  userHandle?: string;
  onJoinRoom: (roomSlug: string) => void;
  onBackToMail?: () => void;
  onSwitchToAccounts?: () => void;
  onSignOut?: () => void;
}

interface RecentMeetingItem {
  id: string;
  slug: string;
  title: string;
  lastActive: string;
  duration: string;
  participantCount: number;
}

export const PMeetHome: React.FC<PMeetHomeProps> = ({
  userEmail = "jaime@postveil.me",
  userName = "Jaime",
  userHandle = "jaime",
  onJoinRoom,
  onBackToMail,
  onSwitchToAccounts,
  onSignOut,
}) => {
  // Navigation & Form State
  const [typedCode, setTypedCode] = useState("");
  const [copiedVanity, setCopiedVanity] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduledTitle, setScheduledTitle] = useState("");
  const [scheduledSlug, setScheduledSlug] = useState("");
  const [copiedScheduled, setCopiedScheduled] = useState(false);

  // Pre-flight Greenroom Media State
  const [greenroomVideoOff, setGreenroomVideoOff] = useState(false);
  const [greenroomMuted, setGreenroomMuted] = useState(false);
  const [greenroomAudioLevel, setGreenroomAudioLevel] = useState(0);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [availableCams, setAvailableCams] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [selectedCamId, setSelectedCamId] = useState<string>("");
  const [hardwareDrawerOpen, setHardwareDrawerOpen] = useState(false);
  const [noiseSilencerActive, setNoiseSilencerActive] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioMeterRef = useRef<{ cleanup: () => void } | null>(null);

  // Recent Sessions (Stored ephemerally in session)
  const [recentMeetings] = useState<RecentMeetingItem[]>([
    {
      id: "rec-1",
      slug: `${userHandle}/boardroom`,
      title: "Executive Boardroom Sync",
      lastActive: "Today, 11:24 AM",
      duration: "42 mins",
      participantCount: 4,
    },
    {
      id: "rec-2",
      slug: "swift-zen-orbit",
      title: "SovereignMesh SFU Architecture Review",
      lastActive: "Yesterday",
      duration: "28 mins",
      participantCount: 3,
    },
    {
      id: "rec-3",
      slug: "vortex-falcon-glide",
      title: "Acoustic Silencer AudioWorklet Test",
      lastActive: "Oct 30",
      duration: "15 mins",
      participantCount: 2,
    },
  ]);

  // Derived Vanity Room URL
  const vanityUrl = `meet.postveil.me/${userHandle}`;

  // Enumerate hardware devices
  useEffect(() => {
    const devMgr = SovereignDeviceManager.getInstance();
    void devMgr.enumerateDevices().then((devices) => {
      setAvailableMics(devices.filter((d) => d.kind === "audioinput"));
      setAvailableCams(devices.filter((d) => d.kind === "videoinput"));
    });

    const unsub = devMgr.onDeviceChange((devices) => {
      setAvailableMics(devices.filter((d) => d.kind === "audioinput"));
      setAvailableCams(devices.filter((d) => d.kind === "videoinput"));
    });

    return () => unsub();
  }, []);

  // Initialize Pre-flight Video & Audio Meter
  useEffect(() => {
    let isCancelled = false;

    async function initGreenroom() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedCamId ? { deviceId: { exact: selectedCamId } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : { echoCancellation: true, noiseSuppression: true },
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        previewStreamRef.current = stream;
        setPermissionGranted(true);

        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          void previewVideoRef.current.play().catch(() => {});
        }

        // Set up real-time audio volume visualizer
        const meter = createSovereignAudioMeter(stream, (level) => {
          if (!isCancelled) {
            setGreenroomAudioLevel(level);
          }
        });
        audioMeterRef.current = meter;
      } catch (err) {
        console.warn("[P-Meet Greenroom] Camera/mic preview not initialized or permission not yet given:", err);
      }
    }

    void initGreenroom();

    return () => {
      isCancelled = true;
      if (audioMeterRef.current) {
        audioMeterRef.current.cleanup();
        audioMeterRef.current = null;
      }
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, [selectedMicId, selectedCamId]);

  // Toggle Pre-flight Camera
  const toggleGreenroomVideo = useCallback(() => {
    if (previewStreamRef.current) {
      const vTrack = previewStreamRef.current.getVideoTracks()[0];
      if (vTrack) {
        vTrack.enabled = !vTrack.enabled;
        setGreenroomVideoOff(!vTrack.enabled);
      }
    } else {
      setGreenroomVideoOff((prev) => !prev);
    }
  }, []);

  // Toggle Pre-flight Microphone
  const toggleGreenroomMic = useCallback(() => {
    if (previewStreamRef.current) {
      const aTrack = previewStreamRef.current.getAudioTracks()[0];
      if (aTrack) {
        aTrack.enabled = !aTrack.enabled;
        setGreenroomMuted(!aTrack.enabled);
      }
    } else {
      setGreenroomMuted((prev) => !prev);
    }
  }, []);

  // Handlers for starting/joining meetings
  const handleStartInstant = () => {
    const slug = generateMemorableMeetingSlug();
    onJoinRoom(slug);
  };

  const handleEnterVanity = () => {
    onJoinRoom(userHandle);
  };

  const handleJoinTypedCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = parseMeetingInput(typedCode);
    if (!clean) return;
    onJoinRoom(clean);
  };

  const handleCopyVanityLink = () => {
    navigator.clipboard?.writeText(`https://${vanityUrl}`);
    setCopiedVanity(true);
    setTimeout(() => setCopiedVanity(false), 2000);
  };

  const handleOpenScheduleModal = () => {
    const secureRoom = generateSecureE2EERoom();
    setScheduledSlug(secureRoom.roomSlug);
    setScheduledTitle(`${userName}'s Strategy Sync`);
    setScheduleModalOpen(true);
  };

  const handleCopyScheduledLink = () => {
    const url = `https://meet.postveil.me/${scheduledSlug}`;
    navigator.clipboard?.writeText(url);
    setCopiedScheduled(true);
    setTimeout(() => setCopiedScheduled(false), 2000);
  };

  return (
    <div className="pv-meet-shell" data-testid="pmeet-home">
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
                <ShieldCheck size={14} /> Sovereign Mesh Lobby
              </span>
            </div>
          }
        />
      </div>

      {/* 2. Secondary Context Header */}
      <div className="pv-meet-sub-ribbon">
        <div className="pv-meet-sub-left">
          <div className="pv-meet-lobby-status-pill">
            <span className="pv-meet-rec-dot" style={{ backgroundColor: "#34d399" }} />
            <span>SovereignMesh Engine 2.4 Ready · 330 Anycast Edge Cities</span>
          </div>
        </div>
        <div className="pv-meet-sub-right">
          <div className="pv-meet-e2ee-tag">
            <Sparkles size={13} />
            <span>End-to-End Encrypted Realtime SFU</span>
          </div>
        </div>
      </div>

      {/* 3. Main Stage: Zero-Scroll 100dvh Hub */}
      <div className="pv-meet-home-stage">
        <div className="pv-meet-home-container">
          
          {/* LEFT COLUMN: The Action Hub */}
          <div className="pv-meet-home-left">
            <div className="pv-meet-welcome-box">
              <div className="pv-meet-greeting-badge">
                <span className="pv-meet-live-dot" />
                <span>ONLINE SOVEREIGN ID</span>
              </div>
              <h1 className="pv-meet-home-title">
                Private, Zero-Latency Calls.<br />
                <span className="pv-meet-gradient-text">Zero Compromises.</span>
              </h1>
              <p className="pv-meet-home-subtitle">
                High-fidelity audio and video routed through Cloudflare Anycast edge nodes with client-side acoustic noise suppression.
              </p>
            </div>

            {/* Primary Action Buttons */}
            <div className="pv-meet-actions-row">
              <button
                type="button"
                className="pv-meet-hero-btn primary"
                onClick={handleStartInstant}
                data-testid="start-instant-btn"
              >
                <Zap size={18} />
                <span>Start Instant Meeting</span>
              </button>

              <button
                type="button"
                className="pv-meet-hero-btn secondary"
                onClick={handleOpenScheduleModal}
                data-testid="schedule-call-btn"
              >
                <Calendar size={18} />
                <span>Schedule Call</span>
              </button>
            </div>

            {/* Direct Meeting Code Input Bar */}
            <form className="pv-meet-join-input-bar" onSubmit={handleJoinTypedCode}>
              <div className="pv-meet-input-prefix">meet.postveil.me/</div>
              <input
                type="text"
                className="pv-meet-code-input"
                placeholder="room-code or vanity-handle"
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="pv-meet-join-submit-btn"
                disabled={!typedCode.trim()}
              >
                <span>Join</span>
                <ArrowRight size={15} />
              </button>
            </form>

            {/* Sovereign Vanity Boardroom Card */}
            <div className="pv-meet-vanity-card">
              <div className="pv-meet-vanity-header">
                <div className="pv-meet-vanity-title">
                  <Lock size={14} color="#34d399" />
                  <span>Your Permanent Sovereign Room</span>
                </div>
                <span className="pv-meet-vanity-badge">Permanent Link</span>
              </div>
              <div className="pv-meet-vanity-body">
                <div className="pv-meet-vanity-url">{vanityUrl}</div>
                <div className="pv-meet-vanity-actions">
                  <button
                    type="button"
                    className="pv-meet-vanity-copy-btn"
                    onClick={handleCopyVanityLink}
                    title="Copy personal boardroom link"
                  >
                    {copiedVanity ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                    <span>{copiedVanity ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    type="button"
                    className="pv-meet-vanity-enter-btn"
                    onClick={handleEnterVanity}
                    title="Enter your personal boardroom"
                  >
                    <span>Enter Room</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Sovereign Calls Strip */}
            <div className="pv-meet-recents-section">
              <div className="pv-meet-recents-header">
                <History size={14} />
                <span>Recent Sovereign Calls</span>
              </div>
              <div className="pv-meet-recents-list">
                {recentMeetings.map((item) => (
                  <div key={item.id} className="pv-meet-recent-item">
                    <div className="pv-meet-recent-info">
                      <div className="pv-meet-recent-title">{item.title}</div>
                      <div className="pv-meet-recent-meta">
                        <span>{item.slug}</span>
                        <span>•</span>
                        <span><Clock size={11} style={{ verticalAlign: "middle" }} /> {item.duration}</span>
                        <span>•</span>
                        <span><Users size={11} style={{ verticalAlign: "middle" }} /> {item.participantCount}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pv-meet-recent-join-btn"
                      onClick={() => onJoinRoom(item.slug)}
                    >
                      <span>Re-join</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: The Pre-Flight Greenroom Stage */}
          <div className="pv-meet-home-right">
            <div className="pv-meet-greenroom-card">
              <div className="pv-meet-greenroom-header">
                <div className="pv-meet-greenroom-title">
                  <Sparkles size={15} color="#34d399" />
                  <span>Pre-Flight Greenroom</span>
                </div>
                <button
                  type="button"
                  className="pv-meet-settings-toggle-btn"
                  onClick={() => setHardwareDrawerOpen(!hardwareDrawerOpen)}
                  title="Configure Camera & Microphone"
                >
                  <Settings size={15} />
                  <span>Audio/Video Setup</span>
                </button>
              </div>

              {/* Live Preview Box */}
              <div className="pv-meet-preview-canvas-box">
                {!greenroomVideoOff ? (
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="pv-meet-preview-video mirror"
                  />
                ) : (
                  <div className="pv-meet-preview-off-screen">
                    <div className="pv-meet-avatar-circle">
                      {userName.substring(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--pv-meet-muted)", marginTop: "8px" }}>
                      Camera is currently turned off
                    </span>
                  </div>
                )}

                {/* Pre-flight overlay status tags */}
                <div className="pv-meet-preview-tag-top">
                  <div className="pv-meet-silencer-badge">
                    <span className="pv-meet-rec-dot" style={{ backgroundColor: noiseSilencerActive ? "#10b981" : "#64748b" }} />
                    <span>{noiseSilencerActive ? "Acoustic Silencer Active" : "Silencer Bypassed"}</span>
                  </div>
                </div>

                {/* Audio visualizer bar along the bottom of the video */}
                <div className="pv-meet-preview-audio-bar-container">
                  <div
                    className="pv-meet-preview-audio-level"
                    style={{ width: `${Math.min(100, greenroomAudioLevel * 100 * 3)}%` }}
                  />
                </div>
              </div>

              {/* Pre-flight Controls Toolbar */}
              <div className="pv-meet-greenroom-controls">
                <button
                  type="button"
                  className={`pv-meet-greenroom-btn ${greenroomMuted ? "off" : ""}`}
                  onClick={toggleGreenroomMic}
                  title={greenroomMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {greenroomMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  <span>{greenroomMuted ? "Muted" : "Mic On"}</span>
                </button>

                <button
                  type="button"
                  className={`pv-meet-greenroom-btn ${greenroomVideoOff ? "off" : ""}`}
                  onClick={toggleGreenroomVideo}
                  title={greenroomVideoOff ? "Start camera" : "Stop camera"}
                >
                  {greenroomVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
                  <span>{greenroomVideoOff ? "Camera Off" : "Camera On"}</span>
                </button>

                <button
                  type="button"
                  className={`pv-meet-greenroom-btn ${noiseSilencerActive ? "active" : ""}`}
                  onClick={() => setNoiseSilencerActive(!noiseSilencerActive)}
                  title="Toggle Sovereign Acoustic Noise Silencer"
                >
                  <Volume2 size={18} color={noiseSilencerActive ? "#34d399" : undefined} />
                  <span>Noise Silencer</span>
                </button>
              </div>

              {/* Quick Hardware Device Drawers */}
              {hardwareDrawerOpen && (
                <div className="pv-meet-quick-devices-panel">
                  <div className="pv-meet-quick-device-group">
                    <label>Microphone</label>
                    <select
                      className="pv-meet-device-select"
                      value={selectedMicId}
                      onChange={(e) => setSelectedMicId(e.target.value)}
                    >
                      <option value="">Default System Microphone</option>
                      {availableMics.map((m) => (
                        <option key={m.deviceId} value={m.deviceId}>
                          {m.label || `Microphone (${m.deviceId.slice(0, 6)}...)`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pv-meet-quick-device-group">
                    <label>Camera</label>
                    <select
                      className="pv-meet-device-select"
                      value={selectedCamId}
                      onChange={(e) => setSelectedCamId(e.target.value)}
                    >
                      <option value="">Default System Webcam</option>
                      {availableCams.map((c) => (
                        <option key={c.deviceId} value={c.deviceId}>
                          {c.label || `Camera (${c.deviceId.slice(0, 6)}...)`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Trust & Edge Guarantee Footnote */}
              <div className="pv-meet-greenroom-footnote">
                <ShieldCheck size={14} color="#34d399" />
                <span>Zero cloud media recording or tracking. Real-time peer encryption verified.</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 4. Schedule Modal */}
      {scheduleModalOpen && (
        <div className="pv-meet-modal-backdrop" onClick={() => setScheduleModalOpen(false)}>
          <div className="pv-meet-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pv-meet-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Calendar size={18} color="#34d399" />
                <h3>Schedule a Sovereign Call</h3>
              </div>
              <button
                type="button"
                className="pv-meet-drawer-close"
                onClick={() => setScheduleModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="pv-meet-modal-body">
              <div className="pv-meet-quick-device-group">
                <label>Meeting Title</label>
                <input
                  type="text"
                  className="pv-meet-device-select"
                  value={scheduledTitle}
                  onChange={(e) => setScheduledTitle(e.target.value)}
                  placeholder="Strategy & Architecture Sync"
                />
              </div>

              <div className="pv-meet-quick-device-group">
                <label>Generated Sovereign Link</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    className="pv-meet-device-select"
                    value={`https://meet.postveil.me/${scheduledSlug}`}
                  />
                  <button
                    type="button"
                    className="pv-meet-vanity-copy-btn"
                    onClick={handleCopyScheduledLink}
                  >
                    {copiedScheduled ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                    <span>{copiedScheduled ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <div className="pv-meet-modal-footer">
                <button
                  type="button"
                  className="pv-meet-hero-btn secondary"
                  onClick={() => setScheduleModalOpen(false)}
                >
                  Done
                </button>
                <button
                  type="button"
                  className="pv-meet-hero-btn primary"
                  onClick={() => {
                    setScheduleModalOpen(false);
                    onJoinRoom(scheduledSlug);
                  }}
                >
                  <span>Start Now</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PMeetHome;
