import { useEffect } from "react";
import { Grid2X2, Search } from "lucide-react";
import { writeNavigation, type AppViewTarget } from "../../lib/navigation";

export interface SuiteNavProps {
  current?: AppViewTarget;
  onOpenPalette?: () => void;
}

export default function SuiteNav({ current, onOpenPalette }: SuiteNavProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenPalette?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenPalette]);
  return (
    <header className="pv-suite-nav">
      <a className="pv-suite-nav-brand" href="/suite" onClick={(event) => { event.preventDefault(); writeNavigation({ view: "suite", kind: "suite" }); }}>
        <Grid2X2 size={19} aria-hidden="true" /> Postveil Suite
      </a>
      <nav className="pv-suite-nav-links" aria-label="Suite navigation">
        <a className="pv-suite-nav-link" href="/" aria-current={current?.view === "mail" ? "page" : undefined}>P-Mail</a>
        <a className="pv-suite-nav-link" href="/calendar" aria-current={current?.view === "calendar" ? "page" : undefined}>P-Calendar</a>
        <a className="pv-suite-nav-link" href="/docs" aria-current={current?.view === "docs" ? "page" : undefined}>P-Docs</a>
        <a className="pv-suite-nav-link" href="/accounts" aria-current={current?.view === "accounts" ? "page" : undefined}>Accounts</a>
        <button type="button" className="pv-suite-nav-link" onClick={onOpenPalette} aria-label="Open command palette"><Search size={15} aria-hidden="true" /> Search</button>
      </nav>
    </header>
  );
}
