/**
 * LiveKit & Cloudflare Calls Hybrid Signaling Client for P-Meet
 * Coordinates room connections, WebRTC tokens, and session states.
 */

export interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken?: string;
  sessionId?: string;
  e2eeKey?: string;
}

export class LiveKitSignalingClient {
  public static async fetchConnectionDetails(
    roomName: string,
    participantName: string
  ): Promise<ConnectionDetails> {
    const url = new URL("/api/meet/connection-details", window.location.origin);
    url.searchParams.set("roomName", roomName);
    url.searchParams.set("participantName", participantName);

    try {
      const res = await fetch(url.toString());
      if (res.ok) {
        return (await res.json()) as ConnectionDetails;
      }
    } catch (err) {
      console.warn("[LiveKitSignaling] Failed to fetch connection details, fallback to local:", err);
    }

    return {
      serverUrl: "wss://meet.postveil.me/rtc",
      roomName,
      participantName,
      participantToken: `pv-token-${Date.now()}`,
      e2eeKey: `pv-key-${Date.now()}`,
    };
  }

  public static async createCallsSession(): Promise<{ sessionId: string; mode: string }> {
    try {
      const res = await fetch("/api/meet/sessions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        return (await res.json()) as { sessionId: string; mode: string };
      }
    } catch (err) {
      console.warn("[LiveKitSignaling] Calls session creation notice:", err);
    }

    return {
      sessionId: `calls-${Date.now()}`,
      mode: "mesh",
    };
  }
}
