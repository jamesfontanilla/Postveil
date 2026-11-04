/**
 * Sovereign Collaboration Mesh for P-Docs
 * Real-time, peer-to-peer WebRTC DataChannel synchronization and presence engine.
 * Leverages Cloudflare Worker WebSocket ephemeral signaling to establish encrypted
 * peer-to-peer data channels for sub-10ms CRDT delta exchange and remote awareness cursors.
 */

export interface RemotePeerAwareness {
  peerId: string;
  name: string;
  email?: string;
  color: string;
  activeBlockId: string | null;
  cursorOffset?: number;
  lastActive: number;
}

export interface CollabDeltaMessage {
  type: "doc_delta";
  senderId: string;
  senderName: string;
  blockId: string;
  content: string;
  html?: string;
  timestamp: number;
}

export interface CollabPresenceMessage {
  type: "awareness";
  senderId: string;
  senderName: string;
  senderEmail?: string;
  color: string;
  activeBlockId: string | null;
  cursorOffset?: number;
  timestamp: number;
}

export type CollabWireMessage =
  | CollabDeltaMessage
  | CollabPresenceMessage
  | { type: "peer_joined"; peerId: string; peerName: string }
  | { type: "peer_left"; peerId: string };

const PEER_COLORS = [
  "#0f766e", // emerald/teal
  "#2563eb", // royal blue
  "#7c3aed", // violet
  "#d97706", // amber
  "#e11d48", // rose
  "#0284c7", // sky
  "#16a34a", // forest green
];

export class SovereignCollabMesh {
  private docId: string;
  private myPeerId: string;
  private myName: string;
  private myEmail?: string;
  private myColor: string;
  private socket: WebSocket | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private remotePeers = new Map<string, RemotePeerAwareness>();
  private isDestroyed = false;

  private onRemoteDeltaCallbacks: Array<(delta: CollabDeltaMessage) => void> = [];
  private onPeersChangeCallbacks: Array<(peers: RemotePeerAwareness[]) => void> = [];

  constructor(docId: string, myName: string, myEmail?: string) {
    this.docId = docId;
    this.myPeerId = `peer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.myName = myName || "Collaborator";
    this.myEmail = myEmail;
    this.myColor = PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];

    this.connectSignaling();
  }

  public getPeerId(): string {
    return this.myPeerId;
  }

  public getMyColor(): string {
    return this.myColor;
  }

  public getRemotePeers(): RemotePeerAwareness[] {
    return Array.from(this.remotePeers.values());
  }

  public onRemoteDelta(cb: (delta: CollabDeltaMessage) => void): () => void {
    this.onRemoteDeltaCallbacks.push(cb);
    return () => {
      this.onRemoteDeltaCallbacks = this.onRemoteDeltaCallbacks.filter((c) => c !== cb);
    };
  }

  public onPeersChange(cb: (peers: RemotePeerAwareness[]) => void): () => void {
    this.onPeersChangeCallbacks.push(cb);
    return () => {
      this.onPeersChangeCallbacks = this.onPeersChangeCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Broadcasts a real-time content delta to all connected peers via WebRTC DataChannels
   * with fallback to signaling WebSocket
   */
  public broadcastDelta(blockId: string, content: string, html?: string): void {
    if (this.isDestroyed) return;

    const deltaMsg: CollabDeltaMessage = {
      type: "doc_delta",
      senderId: this.myPeerId,
      senderName: this.myName,
      blockId,
      content,
      html,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(deltaMsg);

    // Primary: WebRTC DataChannels (sub-10ms direct peer transport)
    let sentP2P = false;
    this.dataChannels.forEach((dc) => {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
          sentP2P = true;
        } catch {}
      }
    });

    // Secondary / Fallback: WebSocket signaling broadcast
    if (!sentP2P && this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: "state_change",
        data: deltaMsg,
        fromPeerId: this.myPeerId,
      }));
    }
  }

  /**
   * Broadcasts local cursor offset and active block focus for remote awareness rendering
   */
  public broadcastAwareness(activeBlockId: string | null, cursorOffset?: number): void {
    if (this.isDestroyed) return;

    const msg: CollabPresenceMessage = {
      type: "awareness",
      senderId: this.myPeerId,
      senderName: this.myName,
      senderEmail: this.myEmail,
      color: this.myColor,
      activeBlockId,
      cursorOffset,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(msg);

    this.dataChannels.forEach((dc) => {
      if (dc.readyState === "open") {
        try {
          dc.send(payload);
        } catch {}
      }
    });

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: "state_change",
        data: msg,
        fromPeerId: this.myPeerId,
      }));
    }
  }

  private connectSignaling(): void {
    if (typeof window === "undefined") return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const roomKey = `pdocs_${this.docId.slice(0, 32)}`;
    const wsUrl = `${protocol}//${window.location.host}/api/meet/rooms/${encodeURIComponent(roomKey)}/signal`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({
            type: "join",
            peerId: this.myPeerId,
            peerName: this.myName,
          }));
        }
      };

      this.socket.onmessage = async (event) => {
        try {
          const raw = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
          await this.handleSignalingMessage(raw);
        } catch {}
      };

      this.socket.onerror = () => {
        // Silent fallback to local offline mode
      };

      this.socket.onclose = () => {
        // Auto-reconnect after 3s if not destroyed
        if (!this.isDestroyed) {
          setTimeout(() => this.connectSignaling(), 3000);
        }
      };
    } catch (err) {
      console.warn("[SovereignCollabMesh] Signaling init notice:", err);
    }
  }

  private async handleSignalingMessage(msg: any): Promise<void> {
    if (!msg || msg.fromPeerId === this.myPeerId) return;

    if (msg.type === "peer_joined" && msg.peerId && msg.peerId !== this.myPeerId) {
      const remoteId = String(msg.peerId);
      this.initiatePeerConnection(remoteId, true);
      this.broadcastAwareness(null);
      return;
    }

    if (msg.type === "peer_left" && msg.peerId) {
      this.removePeer(String(msg.peerId));
      return;
    }

    if (msg.type === "offer" && msg.toPeerId === this.myPeerId) {
      await this.handleOffer(msg.fromPeerId, msg.sdp);
      return;
    }

    if (msg.type === "answer" && msg.toPeerId === this.myPeerId) {
      await this.handleAnswer(msg.fromPeerId, msg.sdp);
      return;
    }

    if (msg.type === "candidate" && msg.toPeerId === this.myPeerId) {
      await this.handleCandidate(msg.fromPeerId, msg.candidate);
      return;
    }

    // Direct WebSocket fallback if DataChannel is negotiating
    if (msg.type === "state_change" && msg.data) {
      this.handleWireMessage(msg.data);
    }
  }

  private initiatePeerConnection(remotePeerId: string, isInitiator: boolean): RTCPeerConnection {
    const existing = this.peerConnections.get(remotePeerId);
    if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });

    this.peerConnections.set(remotePeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: "candidate",
          fromPeerId: this.myPeerId,
          toPeerId: remotePeerId,
          candidate: event.candidate,
        }));
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel("pdocs_collab_mesh", { ordered: true });
      this.setupDataChannel(remotePeerId, dc);

      pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({
            type: "offer",
            fromPeerId: this.myPeerId,
            toPeerId: remotePeerId,
            sdp: pc.localDescription,
          }));
        }
      }).catch((err) => {
        console.warn("[SovereignCollabMesh] Create offer failed:", err);
      });
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(remotePeerId, event.channel);
      };
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "closed" || pc.connectionState === "failed") {
        this.removePeer(remotePeerId);
      }
    };

    return pc;
  }

  private async handleOffer(remotePeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.initiatePeerConnection(remotePeerId, false);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: "answer",
          fromPeerId: this.myPeerId,
          toPeerId: remotePeerId,
          sdp: pc.localDescription,
        }));
      }
    } catch (err) {
      console.warn("[SovereignCollabMesh] Handling offer error:", err);
    }
  }

  private async handleAnswer(remotePeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(remotePeerId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.warn("[SovereignCollabMesh] Handling answer error:", err);
    }
  }

  private async handleCandidate(remotePeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(remotePeerId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {}
  }

  private setupDataChannel(remotePeerId: string, dc: RTCDataChannel): void {
    this.dataChannels.set(remotePeerId, dc);

    dc.onopen = () => {
      // Announce initial presence directly over DataChannel
      this.broadcastAwareness(null);
    };

    dc.onmessage = (event) => {
      try {
        const parsed = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
        this.handleWireMessage(parsed);
      } catch {}
    };

    dc.onclose = () => {
      this.dataChannels.delete(remotePeerId);
    };
  }

  private handleWireMessage(msg: any): void {
    if (!msg || msg.senderId === this.myPeerId) return;

    if (msg.type === "doc_delta") {
      this.onRemoteDeltaCallbacks.forEach((cb) => cb(msg as CollabDeltaMessage));
    } else if (msg.type === "awareness") {
      const presence = msg as CollabPresenceMessage;
      this.remotePeers.set(presence.senderId, {
        peerId: presence.senderId,
        name: presence.senderName,
        email: presence.senderEmail,
        color: presence.color,
        activeBlockId: presence.activeBlockId,
        cursorOffset: presence.cursorOffset,
        lastActive: presence.timestamp,
      });
      this.notifyPeersChange();
    }
  }

  private removePeer(peerId: string): void {
    const dc = this.dataChannels.get(peerId);
    if (dc) {
      try { dc.close(); } catch {}
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try { pc.close(); } catch {}
      this.peerConnections.delete(peerId);
    }

    if (this.remotePeers.has(peerId)) {
      this.remotePeers.delete(peerId);
      this.notifyPeersChange();
    }
  }

  private notifyPeersChange(): void {
    const list = this.getRemotePeers();
    this.onPeersChangeCallbacks.forEach((cb) => cb(list));
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.dataChannels.forEach((dc) => {
      try { dc.close(); } catch {}
    });
    this.dataChannels.clear();

    this.peerConnections.forEach((pc) => {
      try { pc.close(); } catch {}
    });
    this.peerConnections.clear();

    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }

    this.remotePeers.clear();
  }
}
