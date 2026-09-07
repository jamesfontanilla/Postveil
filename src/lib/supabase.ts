export type JsonRecord = Record<string, unknown>;

export type PostveilUser = {
  id: string;
  email?: string;
  user_metadata?: JsonRecord;
  app_metadata?: JsonRecord;
  aud?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
};

export type Session = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  aal?: "aal1" | "aal2";
  token_type?: string;
  user: PostveilUser;
};

type AuthError = { message: string; status?: number; name?: string };
type AuthResponse<T> = { data: T; error: AuthError | null };
type AuthListener = (event: string, session: Session | null) => void;
type MfaFactorResponse = { all: any[]; totp: any[]; phone: any[]; setupRequired?: boolean; challengeRequired?: boolean; administrator?: boolean };
type RealtimeChannel = {
  on: (event: string, filter: JsonRecord, callback: () => void) => RealtimeChannel;
  subscribe: (callback?: (status: string) => void) => RealtimeChannel;
  unsubscribe: () => void;
};

const SESSION_KEY = "postveil.d1.session";
let currentSession: Session | null = readSession();
const listeners = new Set<AuthListener>();

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as Session : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  currentSession = session;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private browsing or storage quotas should not prevent the app from loading.
  }
}

function authError(message: string, status?: number): AuthError {
  return { message, status, name: "PostveilAuthError" };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<AuthResponse<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(currentSession?.access_token ? { authorization: `Bearer ${currentSession.access_token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    const payloadError = payload.error;
    const errorMessage = payloadError && typeof payloadError === "object" && "message" in payloadError
      ? String((payloadError as JsonRecord).message)
      : String(payloadError ?? payload.message ?? `Request failed (${response.status})`);
    if (!response.ok) return { data: {} as T, error: authError(errorMessage, response.status) };
    // Worker auth endpoints use the same { data, error } envelope as the
    // Supabase client. Unwrap it before the auth methods read session/user.
    const data = Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
    return { data: data as T, error: null };
  } catch (error) {
    return { data: {} as T, error: authError(error instanceof Error ? error.message : "Network request failed") };
  }
}

function emit(event: string, session: Session | null) {
  listeners.forEach((listener) => listener(event, session));
}

function unsupported<T>(message: string): Promise<AuthResponse<T>> {
  return Promise.resolve({ data: {} as T, error: authError(message, 501) });
}

const auth = {
  async getSession(): Promise<AuthResponse<{ session: Session | null }>> {
    const currentUrl = new URL(window.location.href);
    const oauthCode = currentUrl.searchParams.get("oauth_code");
    const oauthError = currentUrl.searchParams.get("oauth_error");
    // The callback must win over any cached session. Otherwise an expired token
    // in localStorage can cause a successful OAuth handoff to be ignored.
    if (oauthCode) {
      const result = await request<{ user: PostveilUser; session: Session }>(`/api/auth/google/complete?code=${encodeURIComponent(oauthCode)}`);
      currentUrl.searchParams.delete("oauth_code");
      currentUrl.searchParams.delete("oauth_error");
      window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      if (!result.error) {
        writeSession(result.data.session);
        emit("SIGNED_IN", result.data.session);
      } else {
        writeSession(null);
      }
      return result;
    }
    if (oauthError) {
      currentUrl.searchParams.delete("oauth_error");
      window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      return { data: { session: null }, error: authError("Google sign-in could not be completed", 400) };
    }
    if (!currentSession) {
      return { data: { session: null }, error: null };
    }
    const result = await request<{ session: Session | null }>("/api/auth/session");
    if (result.error) {
      writeSession(null);
      return { data: { session: null }, error: null };
    }
    writeSession(result.data.session);
    return result;
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: JsonRecord }): Promise<AuthResponse<{ user: PostveilUser | null; session: Session | null }>> {
    const result = await request<{ user: PostveilUser; session: Session | null }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, data: options?.data ?? {}, captchaToken: options?.captchaToken ?? null }) });
    if (!result.error) {
      writeSession(result.data.session);
      emit("SIGNED_IN", result.data.session);
    }
    return result;
  },
  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<AuthResponse<{ user: PostveilUser | null; session: Session | null }>> {
    const result = await request<{ user: PostveilUser; session: Session | null }>("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
    if (!result.error) {
      writeSession(result.data.session);
      emit("SIGNED_IN", result.data.session);
    }
    return result;
  },
  async signOut(options?: { scope?: "global" | "others" | "local" }): Promise<AuthResponse<{}>> {
    const result = await request<{}>("/api/auth/signout", { method: "POST", body: JSON.stringify({ scope: options?.scope ?? "local" }) });
    if (options?.scope !== "others") {
      writeSession(null);
      emit("SIGNED_OUT", null);
    }
    return result;
  },
  async resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<AuthResponse<{}>> {
    return request<{}>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email, redirectTo: options?.redirectTo }) });
  },
  async updateUser(attributes: { password?: string; data?: JsonRecord }): Promise<AuthResponse<{ user: PostveilUser | null }>> {
    const result = await request<{ user: PostveilUser }>("/api/auth/user", { method: "PUT", body: JSON.stringify(attributes) });
    if (!result.error && result.data.user && currentSession) writeSession({ ...currentSession, user: result.data.user });
    return result;
  },
  async refreshSession(): Promise<AuthResponse<{ session: Session | null; user: PostveilUser | null }>> {
    const result = await this.getSession();
    return { data: { session: result.data.session, user: result.data.session?.user ?? null }, error: result.error };
  },
  getAuthenticatorAssuranceLevel: async (): Promise<AuthResponse<{ currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2"; setupRequired?: boolean; challengeRequired?: boolean; administrator?: boolean }>> => {
    const result = await request<MfaFactorResponse & { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2"; setupRequired?: boolean; challengeRequired?: boolean; administrator?: boolean }>("/api/auth/mfa/status");
    return result;
  },
  onAuthStateChange(listener: AuthListener) {
    listeners.add(listener);
    listener("INITIAL_SESSION", currentSession);
    return { data: { subscription: { unsubscribe: () => { listeners.delete(listener); } } } };
  },
  mfa: {
    listFactors: async (): Promise<AuthResponse<MfaFactorResponse>> => {
      const result = await request<MfaFactorResponse & { factors?: any[] }>("/api/auth/mfa/status");
      if (result.error) return result;
      const factors = result.data.factors || [];
      return { data: { ...result.data, all: factors, totp: factors.filter((factor) => factor.factor_type === "totp"), phone: [] }, error: null };
    },
    challenge: (params?: JsonRecord) => request<{ id: string }>("/api/auth/mfa/challenge", { method: "POST", body: JSON.stringify({ factorId: params?.factorId }) }),
    verify: (params?: JsonRecord) => request<{ session: Session | null; aal: "aal2" }>("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ factorId: params?.factorId, challengeId: params?.challengeId, code: params?.code }) }),
    enroll: (params?: JsonRecord) => request<{ id: string; type: string; totp: { qr_code: string; secret: string; uri: string } }>("/api/auth/mfa/enroll", { method: "POST", body: JSON.stringify({ factorType: params?.factorType, friendlyName: params?.friendlyName }) }),
    unenroll: (params?: JsonRecord) => request<{}>(`/api/auth/mfa/factors/${encodeURIComponent(String(params?.factorId || ""))}`, { method: "DELETE" }),
    getAuthenticatorAssuranceLevel: async (): Promise<AuthResponse<{ currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2"; setupRequired?: boolean; challengeRequired?: boolean; administrator?: boolean }>> => {
      const result = await request<MfaFactorResponse & { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2"; setupRequired?: boolean; challengeRequired?: boolean; administrator?: boolean }>("/api/auth/mfa/status");
      return result;
    },
  },
  passkey: {
    list: (): Promise<AuthResponse<any[]>> => Promise.resolve({ data: [], error: null }),
    update: (_params?: JsonRecord) => unsupported<{}>("Passkeys are not available in the D1-only adapter yet."),
    delete: (_params?: JsonRecord) => unsupported<{}>("Passkeys are not available in the D1-only adapter yet."),
  },
  registerPasskey: (_params?: JsonRecord) => unsupported<{}>("Passkeys are not available in the D1-only adapter yet."),
};

export const supabase = {
  auth,
  channel: (_name: string): RealtimeChannel => {
    const channel: RealtimeChannel = {
      on: (_event, _filter, _callback) => channel,
      subscribe: (callback) => { callback?.("CLOSED"); return channel; },
      unsubscribe: () => undefined,
    };
    return channel;
  },
  removeChannel: (_channel: unknown) => undefined,
};

export async function initializeSupabase() {
  return supabase;
}

export function requireSupabase() {
  return supabase;
}
