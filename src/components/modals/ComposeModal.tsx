import { useState, useEffect, useRef, useMemo, useCallback, type FormEvent } from "react";
import {
  AlertTriangle,
  Clock3,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useAppDialog } from "../../context/AppDialogContext";
import type {
  Contact,
  Mailbox,
  Signature,
  ComposeSeed,
  ComposeLibraryItem,
  Message,
} from "../../types/mail";
import { starterComposeLibrary } from "../../types/mail";
import { apiFetch, apiUpload, ApiError } from "../../lib/api";
import { markdownToHtml, zonedLocalToIso, formatBytes } from "../../lib/format";
import { sanitizeEmailHtml } from "../../lib/email-html";

export default function Compose({
  mailboxes,
  signatures,
  contacts,
  undoSeconds,
  seed,
  onClose,
  onSent,
}: {
  mailboxes: Mailbox[];
  signatures: Signature[];
  contacts: Contact[];
  undoSeconds: 0 | 10 | 20 | 30;
  seed?: ComposeSeed;
  onClose: () => void;
  onSent: () => void;
}) {
  const { prompt } = useAppDialog();
  const defaultMailbox = mailboxes.find((mailbox) => mailbox.is_default) || mailboxes[0];
  const [fromAddress, setFromAddress] = useState(defaultMailbox?.address || "");
  const [sendMode, setSendMode] = useState<"send_as" | "send_on_behalf">("send_as");
  const [to, setTo] = useState(seed?.to || "");
  const [cc, setCc] = useState(seed?.cc || "");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(seed?.subject || "");
  const [text, setText] = useState(seed?.text || "");
  const [html, setHtml] = useState("");
  const [composeMode, setComposeMode] = useState<"plain" | "html" | "markdown">("plain");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [draftId, setDraftId] = useState(seed?.draftId || "");
  const [attachments, setAttachments] = useState<
    Array<{
      filename: string;
      object_key: string;
      byte_size: number;
      content_type?: string;
      detected_content_type?: string;
      safety_status?: string;
      safety_reasons?: string[];
    }>
  >([]);
  const [signatureId, setSignatureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(seed?.cc));
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<ComposeLibraryItem[]>(starterComposeLibrary);
  const [libraryKind, setLibraryKind] = useState<ComposeLibraryItem["kind"]>("template");
  const [activeRecipientField, setActiveRecipientField] = useState<"to" | "cc" | "bcc" | null>(null);
  const [contactGroup, setContactGroup] = useState("");
  const [openTrackingEnabled, setOpenTrackingEnabled] = useState(false);
  const [clickTrackingEnabled, setClickTrackingEnabled] = useState(false);
  const [readReceipt, setReadReceipt] = useState(false);
  const [deliveryReceipt, setDeliveryReceipt] = useState(false);
  const [requestConfirmation, setRequestConfirmation] = useState(false);
  const [mailMerge, setMailMerge] = useState(false);
  const [replyTracking, setReplyTracking] = useState(false);
  const [followUpTracking, setFollowUpTracking] = useState(false);
  const [confidentialMode, setConfidentialMode] = useState(false);
  const [expiresHours, setExpiresHours] = useState("48");
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [confidentialPassword, setConfidentialPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [linkPreviewEnabled, setLinkPreviewEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<Array<{ code: string; title: string; detail: string }>>([]);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedMailbox = mailboxes.find((mailbox) => mailbox.address === fromAddress);
  const availableSignatures = signatures.filter((signature) => !signature.mailbox_id || signature.mailbox_id === selectedMailbox?.id);

  const groups = useMemo(() => {
    const byCompany = new Map<string, Contact[]>();
    contacts.forEach((contact) => {
      const key = contact.company?.trim() || "All contacts";
      byCompany.set(key, [...(byCompany.get(key) || []), contact]);
    });
    return [...byCompany.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [contacts]);

  const recipientList = (value: string) =>
    value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const externalRecipients = [...recipientList(to), ...recipientList(cc), ...recipientList(bcc)].filter(
    (address) =>
      address.includes("@") &&
      address.split("@").pop()?.toLowerCase() !== fromAddress.split("@").pop()?.toLowerCase(),
  );

  const localWarnings = [
    !subject.trim() ? { code: "missing_subject", title: "Subject is empty", detail: "Add a subject so the message is easier to find later." } : null,
    externalRecipients.length ? { code: "external_recipients", title: "External recipients", detail: `${externalRecipients.length} recipient${externalRecipients.length === 1 ? " is" : "s are"} outside your sender domain.` } : null,
    attachments.length ? { code: "attachment_check", title: "Attachment added", detail: "Double-check that the files are intended for every recipient." } : null,
    cc.trim() && bcc.trim() ? { code: "cc_bcc_check", title: "Cc and Bcc are both used", detail: "Bcc recipients remain hidden from the other recipients." } : null,
  ].filter(Boolean) as Array<{ code: string; title: string; detail: string }>;

  const detectedLinks = [
    ...new Set(
      (`${text} ${html}`.match(/https?:\/\/[^\s<]+/gi) || []).map((link) => link.replace(/[),.;]+$/, "")),
    ),
  ];

  const previewHtml = composeMode === "html" ? html : composeMode === "markdown" ? markdownToHtml(text) : "";

  useEffect(() => {
    void apiFetch<ComposeLibraryItem[]>("/api/compose-library")
      .then((rows) => {
        if (rows.length) setLibrary([...rows, ...starterComposeLibrary]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedMailbox?.is_shared) {
      setSendMode("send_as");
      return;
    }
    if (sendMode === "send_as" && selectedMailbox.can_send_as) return;
    if (sendMode === "send_on_behalf" && selectedMailbox.can_send_on_behalf) return;
    setSendMode(selectedMailbox.can_send_as ? "send_as" : "send_on_behalf");
  }, [selectedMailbox?.id, selectedMailbox?.is_shared, selectedMailbox?.can_send_as, selectedMailbox?.can_send_on_behalf, sendMode]);

  const saveDraft = useCallback(async () => {
    if (!fromAddress || (!to.trim() && !subject.trim() && !text.trim() && !html.trim())) return;
    setSaving(true);
    try {
      const saved = await apiFetch<Message>("/api/drafts", {
        method: "POST",
        body: JSON.stringify({
          id: draftId || undefined,
          fromAddress,
          to,
          cc,
          bcc,
          subject,
          text: text || html.replace(/<[^>]+>/g, " "),
          html: composeMode === "plain" ? null : composeMode === "markdown" ? markdownToHtml(text) : html,
          composeMode,
          timezone: timeZone,
          composeMetadata: {
            composeMode,
            timezone: timeZone,
            recurrence,
            confidentialMode,
            expiresHours: Number(expiresHours),
            passwordProtected,
            passwordHint,
            mailMerge,
            contactGroup,
            replyTracking,
            followUpTracking,
          },
        }),
      });
      if (saved?.id) setDraftId(saved.id);
      setLastSavedAt(new Date());
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Draft could not be saved");
    } finally {
      setSaving(false);
    }
  }, [bcc, cc, composeMode, contactGroup, confidentialMode, draftId, expiresHours, followUpTracking, fromAddress, html, mailMerge, passwordHint, passwordProtected, recurrence, replyTracking, subject, text, timeZone, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void saveDraft(), 3000);
    return () => window.clearTimeout(timer);
  }, [saveDraft]);

  function chooseSignature(id: string) {
    setSignatureId(id);
    const signature = availableSignatures.find((item) => item.id === id);
    if (!signature) return;
    if (signature.text_body && !text.includes(signature.text_body))
      setText((current) => `${current}${current ? "\n\n" : ""}${signature.text_body}`);
    if (signature.html_body && !html.includes(signature.html_body))
      setHtml((current) => `${current}${current ? "<br /><br />" : ""}${signature.html_body || ""}`);
  }

  function applyLibraryItem(item: ComposeLibraryItem) {
    if (item.subject) setSubject(item.subject);
    setText(item.text_body || "");
    setHtml(item.html_body || "");
    setComposeMode(item.html_body ? "html" : "plain");
    setShowLibrary(false);
  }

  async function saveLibraryItem() {
    const name = await prompt({
      title: "Save compose item",
      message: "Give this reusable item a short name.",
      defaultValue: subject.trim() || "New template",
      placeholder: "Item name",
    });
    if (!name?.trim()) return;
    const item = {
      id: crypto.randomUUID(),
      kind: libraryKind,
      name: name.trim(),
      subject,
      text_body: text,
      html_body: composeMode === "html" ? html : composeMode === "markdown" ? markdownToHtml(text) : null,
      metadata: { savedFrom: "composer" },
    };
    try {
      const saved = await apiFetch<ComposeLibraryItem>("/api/compose-library", {
        method: "POST",
        body: JSON.stringify(item),
      });
      setLibrary((current) => [saved, ...current]);
    } catch {
      setLibrary((current) => [item, ...current]);
    }
    setShowLibrary(true);
  }

  function insertVariable(variable: string) {
    const value = `{{${variable}}}`;
    if (composeMode === "html") setHtml((current) => `${current}${current ? "\n" : ""}${value}`);
    else setText((current) => `${current}${current ? "\n" : ""}${value}`);
  }

  function selectGroup(value: string) {
    setContactGroup(value);
    const members = groups.find(([name]) => name === value)?.[1] || [];
    if (members.length) {
      setTo(members.map((member) => member.email).join(", "));
      setMailMerge(true);
    }
  }

  function setRecipient(field: "to" | "cc" | "bcc", value: string) {
    if (field === "to") setTo(value);
    else if (field === "cc") setCc(value);
    else setBcc(value);
  }

  function recipientValue(field: "to" | "cc" | "bcc") {
    return field === "to" ? to : field === "cc" ? cc : bcc;
  }

  function addContact(field: "to" | "cc" | "bcc", contact: Contact) {
    const current = recipientValue(field).trim();
    setRecipient(field, `${current ? `${current}, ` : ""}${contact.email}`);
    setActiveRecipientField(null);
  }

  function draftStatus() {
    if (saving) return "Saving draft…";
    if (uploading) return `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…`;
    if (lastSavedAt) return `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    if (draftId) return "Draft saved";
    return "Draft saves automatically";
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading((current) => current + files.length);
    setError("");
    for (const file of files) {
      try {
        const item = await apiUpload<(typeof attachments)[number]>("/api/attachments", file, { fromAddress });
        setAttachments((current) => [...current, item]);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed");
      } finally {
        setUploading((current) => Math.max(0, current - 1));
      }
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!selectedMailbox?.can_send) throw new Error("Select an available sender mailbox before sending.");
      if (confidentialMode && passwordProtected && confidentialPassword.length < 10)
        throw new Error("Use a confidential message password of at least 10 characters.");
      if (recurrence !== "none" && !scheduledAt)
        throw new Error("Choose a first send time before enabling recurring delivery.");
      const delay = Number(delayMinutes || 0);
      const effectiveScheduledAt = scheduledAt
        ? zonedLocalToIso(scheduledAt, timeZone)
        : delay > 0
        ? new Date(Date.now() + delay * 60_000).toISOString()
        : null;
      const sendText = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      await apiFetch("/api/send", {
        method: "POST",
        body: JSON.stringify({
          fromAddress,
          sendMode,
          to,
          cc,
          bcc,
          subject,
          text: sendText,
          html: composeMode === "plain" ? null : composeMode === "markdown" ? markdownToHtml(text) : html,
          scheduledAt: effectiveScheduledAt,
          timezone: timeZone,
          undoSendSeconds: undoSeconds,
          idempotencyKey: idempotencyKeyRef.current,
          warningsAcknowledged: warnings.map((warning) => warning.code),
          threadId: seed?.threadId,
          inReplyTo: seed?.inReplyTo,
          references: seed?.references,
          attachments,
          openTrackingEnabled,
          clickTrackingEnabled,
          composeMetadata: {
            composeMode,
            timezone: timeZone,
            recurrence,
            readReceipt,
            deliveryReceipt,
            requestConfirmation,
            mailMerge,
            contactGroup,
            replyTracking,
            followUpTracking,
            confidentialMode,
            expiresHours: Number(expiresHours),
            passwordProtected,
            confidentialPassword: passwordProtected ? confidentialPassword : undefined,
            passwordHint,
            linkPreviewEnabled,
            delayedMinutes: delay,
          },
        }),
      });
      onSent();
      onClose();
    } catch (sendError) {
      if (sendError instanceof ApiError && Array.isArray(sendError.payload.warnings))
        setWarnings(sendError.payload.warnings as Array<{ code: string; title: string; detail: string }>);
      else setError(sendError instanceof Error ? sendError.message : "The message could not be sent");
    } finally {
      setBusy(false);
    }
  }

  if (isMinimized)
    return (
      <div className="compose-minimized" role="dialog" aria-label="Minimized draft">
        <button type="button" className="compose-minimized-main" onClick={() => setIsMinimized(false)}>
          <span className="compose-minimized-dot" />
          <span>
            <strong>{subject.trim() || "New message"}</strong>
            <small>{draftStatus()}</small>
          </span>
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close draft" title="Close draft">
          <X size={16} />
        </button>
      </div>
    );

  const inputFor = (field: "to" | "cc" | "bcc", label: string, placeholder: string) => {
    const value = recipientValue(field);
    const suggestions = contacts
      .filter((contact) => {
        const needle = value.split(/[,;]\s*/).pop()?.trim().toLowerCase() || "";
        return needle && (contact.email.includes(needle) || contact.display_name.toLowerCase().includes(needle));
      })
      .slice(0, 5);
    return (
      <label className="compose-recipient-field">
        {label}
        <input
          name={field}
          value={value}
          onFocus={() => setActiveRecipientField(field)}
          onChange={(event) => {
            setRecipient(field, event.target.value);
            setActiveRecipientField(field);
          }}
          placeholder={placeholder}
          autoComplete="off"
          list="postveil-recipient-list"
        />
        {activeRecipientField === field && suggestions.length > 0 && (
          <span className="recipient-suggestions" role="listbox">
            {suggestions.map((contact) => (
              <button
                type="button"
                key={contact.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addContact(field, contact)}
              >
                <strong>{contact.display_name}</strong>
                <small>
                  {contact.email}
                  {contact.company ? ` · ${contact.company}` : ""}
                </small>
              </button>
            ))}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="compose-overlay" role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <form className={`compose-card compose-studio${isExpanded ? " compose-card-expanded" : ""}`} onSubmit={send}>
        <div className="compose-head">
          <div>
            <p className="eyebrow">{seed?.to ? "REPLY / FORWARD" : "COMPOSE STUDIO"}</p>
            <h2 id="compose-title">{seed?.to ? "Continue the thread" : "New message"}</h2>
            <span className="compose-subtitle">
              Build a message with reusable content, delivery controls, and recipient safety checks.
            </span>
          </div>
          <div className="compose-head-actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize draft"
              title="Minimize draft"
            >
              <Minimize2 size={16} />
            </button>
            <button
              type="button"
              className="icon-button compose-expand-button"
              onClick={() => setIsExpanded((current) => !current)}
              aria-label={isExpanded ? "Restore compose size" : "Expand compose"}
              title={isExpanded ? "Restore compose size" : "Expand compose"}
            >
              <Maximize2 size={16} />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close draft" title="Close draft">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="compose-body-scroll">
          <div className="compose-fields">
            <div className="compose-recipient-row">
              <label className="compose-field-inline">
                From
                <select value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} name="from">
                  {mailboxes
                    .filter((mailbox) => mailbox.can_send)
                    .map((mailbox) => (
                      <option key={mailbox.id} value={mailbox.address}>
                        {mailbox.display_name ? `${mailbox.display_name} · ${mailbox.address}` : mailbox.address}
                      </option>
                    ))}
                </select>
              </label>
              {selectedMailbox?.is_shared && (
                <label className="compose-field-inline">
                  Send mode
                  <select
                    value={sendMode}
                    onChange={(event) => setSendMode(event.target.value as "send_as" | "send_on_behalf")}
                  >
                    {selectedMailbox.can_send_as && <option value="send_as">Send as</option>}
                    {selectedMailbox.can_send_on_behalf && <option value="send_on_behalf">Send on behalf</option>}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="compose-recipient-toggle"
                onClick={() => setShowCcBcc((current) => !current)}
                aria-expanded={showCcBcc}
              >
                {showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
              </button>
            </div>
            <div className="compose-address-grid">
              {inputFor("to", "To", "Name or email…")}
              {showCcBcc && inputFor("cc", "Cc", "Optional…")}
              {showCcBcc && inputFor("bcc", "Bcc", "Optional…")}
            </div>
            <datalist id="postveil-recipient-list">
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.email}>
                  {contact.display_name}
                </option>
              ))}
            </datalist>
            {groups.length > 0 && (
              <div className="compose-group-row">
                <span>Contact group</span>
                <select value={contactGroup} onChange={(event) => selectGroup(event.target.value)}>
                  <option value="">Choose a group…</option>
                  {groups.map(([name, members]) => (
                    <option key={name} value={name}>
                      {name} · {members.length}
                    </option>
                  ))}
                </select>
                <label className="checkbox-row">
                  <input type="checkbox" checked={mailMerge} onChange={(event) => setMailMerge(event.target.checked)} />{" "}
                  Personalize each recipient
                </label>
              </div>
            )}
            <label>
              Subject
              <input
                name="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="What is this about?"
              />
            </label>
            <div className="compose-editor-head">
              <span>Message</span>
              <div className="compose-mode-tabs" role="tablist" aria-label="Compose format">
                {(["plain", "html", "markdown"] as const).map((mode) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={composeMode === mode}
                    className={composeMode === mode ? "is-active" : ""}
                    key={mode}
                    onClick={() => setComposeMode(mode)}
                  >
                    {mode === "plain" ? "Plain text" : mode === "html" ? "HTML" : "Markdown"}
                  </button>
                ))}
              </div>
            </div>
            {composeMode === "html" && (
              <div className="compose-rich-toolbar">
                <button type="button" onClick={() => setHtml((current) => `${current}<strong>Bold text</strong>`)}>
                  Bold
                </button>
                <button type="button" onClick={() => setHtml((current) => `${current}<a href="https://example.com">Link</a>`)}>
                  Link
                </button>
                <button type="button" onClick={() => setHtml((current) => `${current}<ul><li>List item</li></ul>`)}>
                  List
                </button>
              </div>
            )}
            <textarea
              className="compose-body-editor"
              required={!html.trim()}
              name="message"
              value={composeMode === "html" ? html : text}
              onChange={(event) => (composeMode === "html" ? setHtml(event.target.value) : setText(event.target.value))}
              placeholder={
                composeMode === "html"
                  ? "Write HTML…"
                  : composeMode === "markdown"
                  ? "Write with Markdown…"
                  : "Start writing…"
              }
              rows={isExpanded ? 12 : 8}
            />
            {composeMode !== "plain" && (
              <div className="compose-preview">
                <div className="compose-preview-label">Live preview</div>
                <div
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(previewHtml || "<p>Preview appears here.</p>"),
                  }}
                />
              </div>
            )}
            <div className="compose-variable-row">
              <span>Insert variable</span>
              {["first_name", "company", "email"].map((variable) => (
                <button type="button" key={variable} onClick={() => insertVariable(variable)}>
                  {`{{${variable}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="compose-option-row compose-studio-options">
            <button
              type="button"
              className="compose-option-button"
              onClick={() => setShowLibrary((current) => !current)}
              aria-expanded={showLibrary}
            >
              Templates & snippets
            </button>
            {showLibrary && (
              <div className="compose-library">
                <div className="compose-library-head">
                  <select
                    value={libraryKind}
                    onChange={(event) => setLibraryKind(event.target.value as ComposeLibraryItem["kind"])}
                  >
                    <option value="template">Templates</option>
                    <option value="canned">Canned replies</option>
                    <option value="snippet">Snippets</option>
                  </select>
                  <button type="button" onClick={() => void saveLibraryItem()}>
                    Save current
                  </button>
                </div>
                {library
                  .filter((item) => item.kind === libraryKind)
                  .map((item) => (
                    <button type="button" key={item.id} onClick={() => applyLibraryItem(item)}>
                      <strong>{item.name}</strong>
                      <small>{item.subject || item.text_body.slice(0, 70)}</small>
                    </button>
                  ))}
              </div>
            )}
            {availableSignatures.length > 0 && (
              <label className="compose-signature-select">
                <Tag size={14} aria-hidden="true" />
                <select
                  value={signatureId}
                  onChange={(event) => chooseSignature(event.target.value)}
                  aria-label="Add signature"
                >
                  <option value="">Signature</option>
                  {availableSignatures.map((signature) => (
                    <option key={signature.id} value={signature.id}>
                      {signature.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="schedule-field">
              <Clock3 size={14} aria-hidden="true" />
              <span>{scheduledAt ? "Scheduled" : "Deliver"}</span>
              <select
                value={delayMinutes}
                onChange={(event) => setDelayMinutes(event.target.value)}
                aria-label="Delayed delivery"
              >
                <option value="0">Now</option>
                <option value="5">In 5 min</option>
                <option value="15">In 15 min</option>
                <option value="30">In 30 min</option>
                <option value="60">In 1 hour</option>
              </select>
            </label>
            <label className="schedule-field">
              <span>Send at</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                aria-label="Schedule send"
              />
            </label>
            <label className="schedule-field">
              <span>Zone</span>
              <select
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                aria-label="Scheduling time zone"
              >
                <option>{timeZone}</option>
                <option>UTC</option>
                <option>Asia/Manila</option>
                <option>America/New_York</option>
                <option>Europe/London</option>
                <option>Australia/Sydney</option>
              </select>
            </label>
            <button
              type="button"
              className={`compose-option-button${showMoreOptions ? " is-active" : ""}`}
              onClick={() => setShowMoreOptions((current) => !current)}
              aria-expanded={showMoreOptions}
            >
              Delivery & privacy
            </button>
          </div>
          {showMoreOptions && (
            <div className="compose-advanced-panel">
              <div className="compose-advanced-grid">
                <label>
                  Recurring
                  <select
                    value={recurrence}
                    onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}
                  >
                    <option value="none">One time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>
                  Follow-up tracking
                  <select
                    value={followUpTracking ? "on" : "off"}
                    onChange={(event) => setFollowUpTracking(event.target.value === "on")}
                  >
                    <option value="off">Off</option>
                    <option value="on">Track reply follow-up</option>
                  </select>
                </label>
              </div>
              <div className="compose-check-grid">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={openTrackingEnabled}
                    onChange={(event) => setOpenTrackingEnabled(event.target.checked)}
                  />{" "}
                  Track opens
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={clickTrackingEnabled}
                    onChange={(event) => setClickTrackingEnabled(event.target.checked)}
                  />{" "}
                  Track clicks
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={deliveryReceipt}
                    onChange={(event) => setDeliveryReceipt(event.target.checked)}
                  />{" "}
                  Delivery receipt
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={readReceipt}
                    onChange={(event) => setReadReceipt(event.target.checked)}
                  />{" "}
                  Read receipt
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={requestConfirmation}
                    onChange={(event) => setRequestConfirmation(event.target.checked)}
                  />{" "}
                  Request confirmation
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={replyTracking}
                    onChange={(event) => setReplyTracking(event.target.checked)}
                  />{" "}
                  Track replies
                </label>
              </div>
              <div className="confidential-panel">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={confidentialMode}
                    onChange={(event) => setConfidentialMode(event.target.checked)}
                  />{" "}
                  Confidential message mode
                </label>
                {confidentialMode && (
                  <div className="confidential-controls">
                    <label>
                      Expires after
                      <select value={expiresHours} onChange={(event) => setExpiresHours(event.target.value)}>
                        <option value="1">1 hour</option>
                        <option value="24">24 hours</option>
                        <option value="48">48 hours</option>
                        <option value="168">7 days</option>
                      </select>
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={passwordProtected}
                        onChange={(event) => setPasswordProtected(event.target.checked)}
                      />{" "}
                      Password-protect external message
                    </label>
                    {passwordProtected && (
                      <>
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={10}
                          value={confidentialPassword}
                          onChange={(event) => setConfidentialPassword(event.target.value)}
                          placeholder="Message password (10+ characters)"
                          aria-label="Confidential message password"
                        />
                        <input
                          value={passwordHint}
                          onChange={(event) => setPasswordHint(event.target.value)}
                          placeholder="Password hint (never the password)"
                        />
                        <small className="compose-help-text">
                          The password is used once to protect this message and is never saved in your draft.
                        </small>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div
            className="attachment-dropzone"
            role="group"
            aria-label="Attachment drop zone"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void uploadFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <UploadCloud size={18} aria-hidden="true" />
            <div>
              <strong>{isDragging ? "Drop files to attach" : "Add attachments"}</strong>
              <span>Drag files here or choose from your device · 15 MB each</span>
            </div>
            <label className="file-button">
              <Paperclip size={15} /> Attach files
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(event) => {
                  void uploadFiles(Array.from(event.target.files || []));
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {(localWarnings.length > 0 || warnings.length > 0) && (
            <div className="compose-warning" role="alert">
              <div className="compose-warning-head">
                <AlertTriangle size={15} />
                <strong>Review before sending</strong>
              </div>
              {[
                ...localWarnings,
                ...warnings.filter((warning) => !localWarnings.some((local) => local.code === warning.code)),
              ].map((warning) => (
                <p key={warning.code}>
                  <strong>{warning.title}.</strong> {warning.detail}
                </p>
              ))}
              <small>These checks stay inside Postveil; your browser’s native alert is not used.</small>
            </div>
          )}
          {detectedLinks.length > 0 && linkPreviewEnabled && (
            <div className="compose-link-previews">
              <div className="compose-preview-label">Link preview · {detectedLinks.length}</div>
              {detectedLinks.slice(0, 3).map((link) => (
                <a href={link} target="_blank" rel="noreferrer" key={link}>
                  <strong>{new URL(link).hostname}</strong>
                  <span>{link}</span>
                </a>
              ))}
            </div>
          )}
          <div className="attachment-strip" aria-live="polite">
            {attachments.map((attachment) => (
              <span className="attachment-chip" key={attachment.object_key}>
                <Paperclip size={13} aria-hidden="true" />
                <span className="attachment-chip-copy">
                  <strong>{attachment.filename}</strong>
                  <small>{formatBytes(attachment.byte_size)}</small>
                </span>
                <button
                  type="button"
                  className="attachment-remove"
                  onClick={() =>
                    setAttachments((current) => current.filter((item) => item.object_key !== attachment.object_key))
                  }
                  aria-label={`Remove ${attachment.filename}`}
                  title={`Remove ${attachment.filename}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          {error && <div className="form-error compose-error">{error}</div>}
        </div>
        <div className="compose-foot">
          <span className="compose-hint" aria-live="polite">
            <span className={`save-dot${saving ? " is-saving" : ""}`} />
            {draftStatus()}
          </span>
          <div className="compose-foot-actions">
            <button type="button" className="secondary-button compose-discard-btn" onClick={onClose} title="Discard draft">
              <Trash2 size={14} /> Discard
            </button>
            <button className="primary-button" disabled={busy || uploading > 0}>
              <Send size={15} /> {busy ? "Sending…" : scheduledAt || delayMinutes !== "0" ? "Schedule send" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
