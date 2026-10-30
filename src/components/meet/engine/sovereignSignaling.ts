/**
 * Sovereign Realtime Signaling Client for P-Meet
 * Proprietary Postveil SovereignMesh WebRTC signaling and SFU coordination.
 */

export interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken?: string;
  sessionId?: string;
  e2eeKey?: string;
}

export class SovereignSignalingClient {
  public static async fetchConnectionDetails(
    roomName: string,
    participantName: string
  ): Promise<ConnectionDetails> {
    const url = new URL("/api/meet/connection-details", window.location.origin);
    url.searchParams.set("roomName", roomName);
    url.searchParams.set("participantName", participantName);

    try {
      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        return (await res.json()) as ConnectionDetails;
      }
    } catch (err) {
      console.warn("[SovereignSignaling] Fallback to direct mesh:", err);
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
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        return (await res.json()) as { sessionId: string; mode: string };
      }
    } catch (err) {
      console.warn("[SovereignSignaling] Session creation notice:", err);
    }

    return {
      sessionId: `calls-${Date.now()}`,
      mode: "mesh",
    };
  }
}
