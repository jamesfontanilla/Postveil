import { useEffect, useMemo, useState } from "react";
import { Check, History, KeyRound, LockKeyhole, Play, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { requireSupabase } from "../lib/supabase";
import { AI_FEATURES, AI_FEATURE_LABELS, localPrompt, type AiAuditEvent, type AiFeature, type AiSettings } from "../ai";

type ApiErrorPayload = { error?: string };

async function aiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = (await requireSupabase().auth.getSession()).data.session;
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(session?.access_token ? { authorization: "Bearer " + session.access_token } : {}), ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as ApiErrorPayload).error || "AI request failed");
  return payload as T;
}

function readableFeature(feature: AiFeature): string {
  return AI_FEATURE_LABELS[feature];
}

export default function AiWorkspace() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [audit, setAudit] = useState<AiAuditEvent[]>([]);
  const [feature, setFeature] = useState<AiFeature>("inbox_digest");
  const [query, setQuery] = useState("Show unanswered messages");
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [byomKey, setByomKey] = useState("");
  const [byomUrl, setByomUrl] = useState("https://api.groq.com/openai/v1/chat/completions");
  const [localEndpoint, setLocalEndpoint] = useState("http://127.0.0.1:11434/v1/chat/completions");

  const enabledFeatures = useMemo(() => settings?.feature_flags || {}, [settings]);

  async function reload() {
    try {
      const [nextSettings, nextAudit] = await Promise.all([aiFetch<AiSettings>("/api/ai/settings"), aiFetch<AiAuditEvent[]>("/api/ai/audit")]);
      setSettings(nextSettings);
      setAudit(nextAudit);
      setLocalEndpoint(nextSettings.local_endpoint || "http://127.0.0.1:11434/v1/chat/completions");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "AI settings are unavailable");
    }
  }

  useEffect(() => { void reload(); }, []);

  async function patchSettings(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const next = await aiFetch<AiSettings>("/api/ai/settings", { method: "PATCH", body: JSON.stringify(patch) });
      setSettings(next);
      setNotice("AI privacy settings saved");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save AI settings");
    } finally { setBusy(false); }
  }

  async function toggleFeature(nextFeature: AiFeature, checked: boolean) {
    const nextFlags = { ...(settings?.feature_flags || {}), [nextFeature]: checked };
    await patchSettings({ featureFlags: nextFlags });
  }

  async function runAi() {
    if (!settings || !confirmed) return;
    setBusy(true); setNotice(""); setResult(null);
    try {
      if (settings.provider === "local") {
        const response = await fetch(localEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: settings.model, temperature: 0.2, messages: [{ role: "system", content: localPrompt(feature, query) }, { role: "user", content: query }] }) });
        if (!response.ok) throw new Error("Local model returned " + response.status);
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        setResult(payload.choices?.[0]?.message?.content || "The local model returned no text.");
      } else {
        const payload = await aiFetch<{ result: unknown; promptInjectionDetected?: boolean }>("/api/ai", { method: "POST", body: JSON.stringify({ feature, query, provider: settings.provider, model: settings.model, providerUrl: settings.provider === "byom" ? byomUrl : undefined, apiKey: settings.provider === "byom" ? byomKey : undefined, actionConfirmed: true }) });
        setResult(payload.result);
        if (payload.promptInjectionDetected) setNotice("The message data contained suspicious instruction-like text; it was treated as untrusted content.");
      }
      setConfirmed(false);
      await reload();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "AI request failed"); }
    finally { setBusy(false); }
  }

  if (!settings) return <section className="ai-workspace"><div className="ai-empty"><Sparkles size={25} /><h1>AI & privacy</h1><p>{notice || "Loading your opt-in controls…"}</p></div></section>;

  return <section className="ai-workspace">
    <div className="ai-hero">
      <div><p className="eyebrow">POSTVEIL INTELLIGENCE</p><h1><Sparkles size={24} /> AI & privacy</h1><p>On-demand assistance for your mailbox, with every feature off until you choose it.</p></div>
      <label className="ai-master-toggle"><span>{settings.enabled ? "AI enabled" : "AI off"}</span><input type="checkbox" checked={settings.enabled} onChange={(event) => void patchSettings({ enabled: event.target.checked })} /><span className="toggle-track" /></label>
    </div>
    {notice && <div className="inline-error ai-notice">{notice}</div>}
    <div className="ai-grid">
      <div className="ai-main-column">
        <section className="setting-card ai-card"><div className="card-heading"><div><p className="eyebrow">ON-DEMAND ASSISTANT</p><h3>Ask Postveil</h3></div><Zap size={18} /></div><p className="field-help">AI reads only the mailbox context needed for this request. It cannot send, delete, label, or change mail.</p><div className="ai-runner"><label>Capability<select value={feature} onChange={(event) => setFeature(event.target.value as AiFeature)}>{AI_FEATURES.filter((item) => enabledFeatures[item]).map((item) => <option key={item} value={item}>{readableFeature(item)}</option>)}{!AI_FEATURES.some((item) => enabledFeatures[item]) && <option value="inbox_digest">Enable a feature below first</option>}</select></label><label>Request<textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask a question or describe the draft style" rows={4} /></label><label className="ai-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I confirm this is an on-demand request.</strong><small>No email action will be taken automatically.</small></span></label><button className="primary-button" onClick={() => void runAi()} disabled={busy || !settings.enabled || !enabledFeatures[feature] || !confirmed || !query.trim()}><Play size={14} /> {busy ? "Working…" : "Run AI"}</button></div>{result !== null && <div className="ai-result"><div className="ai-result-head"><strong>Result</strong><button className="text-button" onClick={() => setResult(null)}>Clear</button></div><pre>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</pre></div>}</section>
        <section className="setting-card ai-card"><div className="card-heading"><div><p className="eyebrow">FEATURE SWITCHES</p><h3>Choose what AI can do</h3></div><LockKeyhole size={18} /></div><p className="field-help">These switches are independent. New capabilities start disabled.</p><div className="ai-feature-grid">{AI_FEATURES.map((item) => <label className={`ai-feature ${enabledFeatures[item] ? "enabled" : ""}`} key={item}><input type="checkbox" checked={enabledFeatures[item] === true} onChange={(event) => void toggleFeature(item, event.target.checked)} /><span><strong>{readableFeature(item)}</strong><small>{item === "writing_style" ? "Uses sent samples only when requested." : "Runs only after you press Run AI."}</small></span></label>)}</div></section>
      </div>
      <aside className="ai-side-column">
        <section className="setting-card ai-card"><div className="card-heading"><div><p className="eyebrow">PROVIDER</p><h3>Keep control</h3></div><ShieldCheck size={18} /></div><div className="ai-provider-list"><label className={`ai-provider ${settings.provider === "groq" ? "selected" : ""}`}><input type="radio" name="ai-provider" checked={settings.provider === "groq"} onChange={() => void patchSettings({ provider: "groq", model: "openai/gpt-oss-120b" })} /><span><strong>Groq</strong><small>GPT-OSS 120B · server-side</small></span></label><label className={`ai-provider ${settings.provider === "byom" ? "selected" : ""}`}><input type="radio" name="ai-provider" checked={settings.provider === "byom"} onChange={() => void patchSettings({ provider: "byom" })} /><span><strong>Bring your own model</strong><small>Key stays in this browser session.</small></span></label><label className={`ai-provider ${settings.provider === "local" ? "selected" : ""}`}><input type="radio" name="ai-provider" checked={settings.provider === "local"} onChange={() => void patchSettings({ provider: "local", localEndpoint })} /><span><strong>Local model</strong><small>Requests stay on this device.</small></span></label></div>{settings.provider === "groq" && <small className="field-help">Model: <code>{settings.model}</code> · {settings.configured ? "configured" : "not configured"}</small>}{settings.provider === "byom" && <label>Provider URL<input value={byomUrl} onChange={(event) => setByomUrl(event.target.value)} placeholder="https://…/v1/chat/completions" /><small className="field-help">The key is used once and never saved by Postveil.</small><input type="password" value={byomKey} onChange={(event) => setByomKey(event.target.value)} placeholder="Session-only API key" autoComplete="off" /></label>}{settings.provider === "local" && <label>Local endpoint<input value={localEndpoint} onChange={(event) => setLocalEndpoint(event.target.value)} onBlur={() => void patchSettings({ localEndpoint })} /><small className="field-help">Only localhost and loopback endpoints are accepted.</small></label>}</section>
        <section className="setting-card ai-card"><div className="card-heading"><div><p className="eyebrow">DATA RETENTION</p><h3>Keep less</h3></div><KeyRound size={18} /></div><select value={settings.retention_mode} onChange={(event) => void patchSettings({ retentionMode: event.target.value })}><option value="none">No AI audit retention</option><option value="audit_only">Keep audit metadata only</option><option value="thirty_days">Keep audit metadata for 30 days</option></select><p className="field-help">Prompts and model output are never written to the audit table. Provider retention follows that provider’s terms.</p></section>
        <section className="setting-card ai-card"><div className="card-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h3>Recent AI activity</h3></div><History size={18} /></div>{audit.length ? <div className="ai-audit-list">{audit.slice(0, 8).map((item) => <div className="ai-audit-row" key={item.id}><span className={item.status === "completed" ? "audit-ok" : "audit-fail"}>{item.status === "completed" ? <Check size={13} /> : "!"}</span><div><strong>{readableFeature(item.feature)}</strong><small>{item.provider} · {new Date(item.created_at).toLocaleString()}</small></div></div>)}</div> : <p className="field-help">No AI requests recorded yet.</p>}</section>
      </aside>
    </div>
  </section>;
}

