import { useEffect, useMemo, useRef, useState } from "react";
import { CAPABILITY_STATE_LABELS, PILLAR_REGISTRY } from "../../lib/pillars";
import { navigationForPillar, writeNavigation } from "../../lib/navigation";
import "./PlatformStyles.css";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useMemo(() => [
    { id: "mail", label: "Open P-Mail search", detail: "Mail search stays inside P-Mail", run: () => writeNavigation({ view: "mail", kind: "mail" }) },
    { id: "docs", label: "Open P-Docs", detail: "Local document editor", run: () => writeNavigation({ view: "docs", kind: "docs" }) },
    { id: "accounts", label: "Open settings", detail: "Account and security settings", run: () => writeNavigation({ view: "accounts", kind: "accounts" }) },
    ...PILLAR_REGISTRY.map((pillar) => ({ id: pillar.id, label: `Open ${pillar.name}`, detail: `${CAPABILITY_STATE_LABELS[pillar.state]} · ${pillar.summary}`, run: () => writeNavigation(navigationForPillar(pillar.id)) })),
  ], []);
  const filtered = commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === "Enter") {
        event.preventDefault();
        const command = filtered[activeIndex];
        if (command) { command.run(); onClose(); } else setError("No matching local command.");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, filtered, onClose]);
  useEffect(() => setActiveIndex(0), [query]);

  return (
    <div className="pv-command-palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pv-command-palette" role="dialog" aria-modal="true" aria-label="Postveil command palette">
        <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setError(""); }} placeholder="Search local suite commands" aria-label="Search commands" />
        {error && <div className="pv-command-error" role="alert">{error}</div>}
        {filtered.map((command, index) => (
          <button type="button" className="pv-command-item" key={command.id} aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => { command.run(); onClose(); }}>
            <span><strong>{command.label}</strong><br /><small>{command.detail}</small></span>
          </button>
        ))}
        {!filtered.length && <div className="pv-command-error">No local command matches “{query}”.</div>}
      </div>
    </div>
  );
}

export default CommandPalette;
