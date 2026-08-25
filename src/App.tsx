import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
  Inbox,
  LogOut,
  Mail,
  Menu,
  Paperclip,
  PenLine,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "./lib/supabase";

type Folder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "spam";

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  is_default: boolean;
  can_send: boolean;
};

type Message = {
  id: string;
  thread_id: string;
  mailbox_id: string | null;
  direction: "inbound" | "outbound";
  folder: Folder;
  status: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses?: string[];
  subject: string;
  snippet: string;
  text_body?: string;
  html_body?: string | null;
  is_read: boolean;
  is_starred: boolean;
  received_at?: string;
  sent_at?: string;
  created_at: string;
  attachments?: Array<{ id: string; filename: string; content_type: string; byte_size: number }>;
};

const folderMeta: Record<Folder, { label: string; icon: typeof Inbox }> = {
  inbox: { label: "Inbox", icon: Inbox },
  sent: { label: "Sent", icon: Send },
  drafts: { label: "Drafts", icon: PenLine },
  archive: { label: "Archive", icon: Archive },
  trash: { label: "Trash", icon: Trash2 },
  spam: { label: "Spam", icon: Mail },
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function displayName(address: string) {
  return address.split("@")[0] || address;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}), ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = requireSupabase();
      const result = mode === "signin"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) setNotice("Check your inbox to confirm the new account, then sign in here.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">PRIVATE MAIL / {new Date().getFullYear()}</p>
        <h1>Keep your address close.</h1>
        <p className="auth-copy">A focused mailbox for your custom domain. Sign in to open your messages across desktop and mobile.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label>
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice">{notice}</div>}
          <button className="primary-button" disabled={busy}>{busy ? "Opening…" : mode === "signin" ? "Open mailbox" : "Create account"}</button>
        </form>
        <button className="text-button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </section>
      <aside className="auth-aside">
        <div className="aside-note"><span className="status-dot" /> system ready</div>
        <p className="aside-quote">“The inbox is the room where your attention either gathers or scatters.”</p>
        <p className="aside-meta">Your messages stay private, organized, and addressed to the names you chose.</p>
      </aside>
    </main>
  );
}

function Compose({ mailboxes, onClose, onSent }: { mailboxes: Mailbox[]; onClose: () => void; onSent: () => void }) {
  const defaultMailbox = mailboxes.find((mailbox) => mailbox.is_default) || mailboxes[0];
  const [fromAddress, setFromAddress] = useState(defaultMailbox?.address || "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/send", { method: "POST", body: JSON.stringify({ fromAddress, to, cc, subject, text }) });
      onSent();
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The message could not be sent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="compose-overlay" role="presentation">
      <form className="compose-card" onSubmit={send}>
        <div className="compose-head"><div><p className="eyebrow">NEW MESSAGE</p><h2>Write a note</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close compose"><X size={18} /></button></div>
        <div className="compose-fields">
          <label>From<select value={fromAddress} onChange={(event) => setFromAddress(event.target.value)}>{mailboxes.filter((mailbox) => mailbox.can_send).map((mailbox) => <option key={mailbox.id} value={mailbox.address}>{mailbox.address}</option>)}</select></label>
          <label>To<input required value={to} onChange={(event) => setTo(event.target.value)} placeholder="recipient@example.com" /></label>
          <label>CC<input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Optional" /></label>
          <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What is this about?" /></label>
          <label className="message-input">Message<textarea required value={text} onChange={(event) => setText(event.target.value)} placeholder="Start writing…" rows={9} /></label>
        </div>
        {error && <div className="form-error compose-error">{error}</div>}
        <div className="compose-foot"><span className="compose-hint"><Paperclip size={15} /> Attachments coming next</span><button className="primary-button" disabled={busy}><Send size={15} /> {busy ? "Sending…" : "Send message"}</button></div>
      </form>
    </div>
  );
}

function MailboxApp({ session }: { session: Session }) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inboxPollIntervalMs = 5000;

  const visibleMessages = useMemo(() => messages.filter((message) => {
    const needle = query.trim().toLowerCase();
    return !needle || [message.subject, message.from_address, message.snippet].some((value) => value?.toLowerCase().includes(needle));
  }), [messages, query]);

  async function loadMessages(targetFolder = folder, showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [mail, addresses] = await Promise.all([apiFetch<Message[]>(`/api/mail?folder=${targetFolder}`), apiFetch<Mailbox[]>("/api/mailboxes")]);
      setMessages(mail);
      setMailboxes(addresses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Mailbox unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function openMessage(message: Message) {
    setSelectedId(message.id);
    try {
      const detail = await apiFetch<Message>(`/api/mail/${message.id}`);
      setSelected(detail);
      if (!message.is_read) {
        await apiFetch(`/api/mail/${message.id}`, { method: "POST", body: JSON.stringify({ isRead: true }) });
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, is_read: true } : item));
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Message unavailable");
    }
  }

  useEffect(() => {
    void loadMessages(folder, true);
    const interval = window.setInterval(() => { void loadMessages(folder, false); }, inboxPollIntervalMs);
    return () => window.clearInterval(interval);
  }, [folder]);

  async function signOut() { await requireSupabase().auth.signOut(); }

  const currentFolder = folderMeta[folder];
  const CurrentIcon = currentFolder.icon;

  return (
    <main className="app-shell">
      <header className="mobile-topbar"><button className="icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={19} /></button><div className="mini-brand"><span>P</span> Parcel</div><button className="icon-button" onClick={() => void loadMessages()} aria-label="Refresh"><RefreshCcw size={17} /></button></header>
      <aside className={`sidebar ${mobileNav ? "mobile-visible" : ""}`}>
        <div className="sidebar-top"><div className="brand-lockup"><div className="brand-mark small">P</div><div><strong>Parcel</strong><span>private mail</span></div></div><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <button className="compose-button" onClick={() => { setComposeOpen(true); setMobileNav(false); }}><PenLine size={17} /> Compose</button>
        <nav className="folder-nav" aria-label="Mailbox folders">
          {(Object.keys(folderMeta) as Folder[]).map((item) => { const meta = folderMeta[item]; const Icon = meta.icon; const unread = item === "inbox" ? messages.filter((message) => !message.is_read).length : 0; return <button key={item} className={`folder-link ${folder === item ? "active" : ""}`} onClick={() => { setFolder(item); setSelected(null); setSelectedId(null); setMobileNav(false); }}><Icon size={17} /><span>{meta.label}</span>{unread > 0 && <em>{unread}</em>}</button>; })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="account-chip"><div className="avatar">{(session.user.email || "J").slice(0, 1).toUpperCase()}</div><div className="account-text"><strong>{displayName(session.user.email || "James")}</strong><span>{session.user.email}</span></div><button className="icon-button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={16} /></button></div>
      </aside>

      <section className="message-column">
        <div className="column-head"><div><p className="eyebrow">YOUR DESK</p><h1><CurrentIcon size={22} /> {currentFolder.label}</h1></div><div className="head-actions"><button className="icon-button" onClick={() => void loadMessages()} aria-label="Refresh messages"><RefreshCcw size={17} /></button><button className="icon-button" aria-label="Settings"><Settings2 size={17} /></button></div></div>
        <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this folder" /></div>
        {error && <div className="inline-error">{error}</div>}
        <div className="message-list">
          {loading ? <div className="list-empty"><div className="pulse-dot" /><p>Gathering your mail…</p></div> : visibleMessages.length === 0 ? <div className="list-empty"><div className="empty-glyph"><Mail size={22} /></div><h3>{folder === "inbox" ? "A quiet inbox" : `No mail in ${currentFolder.label.toLowerCase()}`}</h3><p>{folder === "inbox" ? "New messages sent to your custom address will land here." : "This space is clear for now."}</p>{folder === "inbox" && <button className="text-button" onClick={() => setComposeOpen(true)}>Write the first message</button>}</div> : visibleMessages.map((message) => <button key={message.id} className={`message-row ${selectedId === message.id ? "selected" : ""} ${message.is_read ? "read" : "unread"}`} onClick={() => void openMessage(message)}><div className="row-avatar">{displayName(message.direction === "inbound" ? message.from_address : (message.to_addresses?.[0] || "sent")).slice(0, 1).toUpperCase()}</div><div className="row-copy"><div className="row-top"><strong>{message.direction === "inbound" ? message.from_address : `To ${message.to_addresses?.[0] || "recipient"}`}</strong><time>{formatDate(message.received_at || message.sent_at || message.created_at)}</time></div><div className="row-subject">{message.subject || "(no subject)"}</div><p>{message.snippet || "No preview available."}</p></div>{message.is_starred && <Star className="row-star" size={15} fill="currentColor" />}</button>)}
        </div>
      </section>

      <section className="reading-pane">
        {!selected ? <div className="reading-empty"><div className="empty-glyph large"><Mail size={30} /></div><p>Select a message to read it here.</p><span>Your inbox, without the noise.</span></div> : <article className="message-detail"><div className="detail-head"><div><p className="eyebrow">{selected.direction === "inbound" ? "RECEIVED" : "SENT"} / {formatDate(selected.received_at || selected.sent_at || selected.created_at)}</p><h2>{selected.subject || "(no subject)"}</h2></div><div className="head-actions"><button className="icon-button" aria-label="Archive"><Archive size={17} /></button><button className="icon-button" aria-label="Delete"><Trash2 size={17} /></button></div></div><div className="sender-line"><div className="avatar large-avatar">{displayName(selected.from_address).slice(0, 1).toUpperCase()}</div><div><strong>{selected.from_address}</strong><span>to {selected.to_addresses?.join(", ")}</span></div></div><div className="body-copy">{selected.text_body || selected.snippet || "No message body."}</div>{selected.attachments && selected.attachments.length > 0 && <div className="attachments"><p className="eyebrow">ATTACHMENTS</p>{selected.attachments.map((attachment) => <a key={attachment.id} href={`/api/attachments/${attachment.id}`}><Paperclip size={14} /> {attachment.filename}</a>)}</div>}<div className="detail-actions"><button className="secondary-button" onClick={() => { setComposeOpen(true); }}><PenLine size={15} /> Reply</button><button className="secondary-button"><ChevronDown size={15} /> More</button></div></article>}
      </section>
      {composeOpen && <Compose mailboxes={mailboxes} onClose={() => setComposeOpen(false)} onSent={() => void loadMessages("sent")} />}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="loading-screen"><div className="brand-mark">P</div><p>Loading Parcel…</p></div>;
  if (!supabase) return <div className="loading-screen"><div className="brand-mark">P</div><h2>Supabase is not configured</h2><p>Add the public project URL and key to the deployment environment.</p></div>;
  return session ? <MailboxApp session={session} /> : <AuthScreen />;
}
