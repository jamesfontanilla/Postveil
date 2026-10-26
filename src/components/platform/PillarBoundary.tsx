import { CAPABILITY_STATE_LABELS, getPillarDefinition, type PillarId } from "../../lib/pillars";
import { navigationForPillar, writeNavigation } from "../../lib/navigation";
import "./PlatformStyles.css";

type BoundaryGuidance = {
  prerequisite: string;
  alternative: string;
  alternativePillar?: PillarId;
};

const BOUNDARY_GUIDANCE: Partial<Record<PillarId, BoundaryGuidance>> = {
  "p-meet": {
    prerequisite: "Prerequisite: an approved signaling service, TURN path, room authorization, and WebRTC review.",
    alternative: "Use P-Mail threads for asynchronous coordination or P-Calendar for private events.",
    alternativePillar: "p-mail",
  },
  "p-chat": {
    prerequisite: "Prerequisite: an authenticated message-history, realtime transport, and presence service.",
    alternative: "Use P-Mail threads for conversation; they are not P-Chat channels.",
    alternativePillar: "p-mail",
  },
  "p-deck": {
    prerequisite: "Prerequisite: a reviewed slide model, editor, presenter view, and presentation import/export path.",
    alternative: "Use P-Docs for structured documents and local open-format export.",
    alternativePillar: "p-docs",
  },
  "p-studio": {
    prerequisite: "Prerequisite: a reviewed layer model, image pipeline, and export implementation.",
    alternative: "Use the bounded P-Draw canvas for local primitive illustrations.",
    alternativePillar: "p-draw",
  },
  "p-books": {
    prerequisite: "Prerequisite: an approved ledger, invoice, tax, reconciliation, and payment boundary.",
    alternative: "Use P-Docs for non-financial notes; no accounting records are created here.",
    alternativePillar: "p-docs",
  },
  "p-sites": {
    prerequisite: "Prerequisite: a public-content route, ownership controls, publication flow, and cache invalidation.",
    alternative: "Use P-Docs for private local documents; this screen does not publish a page.",
    alternativePillar: "p-docs",
  },
  "p-automate": {
    prerequisite: "Prerequisite: an approved cross-pillar event schema, workflow editor, durable runner, and webhook controls.",
    alternative: "Use existing P-Mail rules for mail-only actions; they are not cross-pillar automation.",
    alternativePillar: "p-mail",
  },
  "p-pass": {
    prerequisite: "Prerequisite: a reviewed password-vault and credential service. Account MFA is a separate feature.",
    alternative: "Use the account's existing TOTP MFA screens for second-factor protection; no vault or passkey record is created here.",
    alternativePillar: "p-pass",
  },
  "p-sign": {
    prerequisite: "Prerequisite: a real signing key lifecycle, verification, revocation, and audit flow.",
    alternative: "Use P-Docs document hash preview and unverified legacy metadata; signing remains disabled.",
    alternativePillar: "p-docs",
  },
};

export default function PillarBoundary({ pillarId, unknownId }: { pillarId?: string; unknownId?: string }) {
  const pillar = pillarId ? getPillarDefinition(pillarId) : undefined;
  const guidance = pillar ? BOUNDARY_GUIDANCE[pillar.id] : undefined;
  const title = pillar ? `${pillar.name} is not available here` : "Pillar not found";
  return (
    <div className="pv-platform-shell">
      <main className="pv-boundary" aria-labelledby="pillar-boundary-title">
        <h1 id="pillar-boundary-title">{title}</h1>
        {pillar ? (
          <>
            <p><strong>{CAPABILITY_STATE_LABELS[pillar.state]}.</strong> {pillar.summary}</p>
            <section className="pv-boundary-section" aria-labelledby="pillar-prerequisite-title">
              <h2 id="pillar-prerequisite-title">What is required</h2>
              <p>{guidance?.prerequisite || pillar.dependencyNote || "A reviewed implementation is required before this pillar can be enabled."}</p>
            </section>
            <section className="pv-boundary-section" aria-labelledby="pillar-alternative-title">
              <h2 id="pillar-alternative-title">Safe alternative</h2>
              <p>{guidance?.alternative || "Return to the Suite to use an available bounded pillar."}</p>
              {guidance?.alternativePillar && guidance.alternativePillar !== pillar.id && (
                <button type="button" className="pv-platform-button" onClick={() => writeNavigation(navigationForPillar(guidance.alternativePillar!))}>
                  Open {getPillarDefinition(guidance.alternativePillar)?.name || "available alternative"}
                </button>
              )}
            </section>
          </>
        ) : <p>The requested route “{unknownId || "unknown"}” is not a canonical Postveil pillar. No application data was loaded.</p>}
        <div className="pv-pillar-card-actions">
          <button type="button" className="pv-platform-button" onClick={() => writeNavigation({ view: "suite", kind: "suite" })}>Back to Suite</button>
          <button type="button" className="pv-platform-button" onClick={() => writeNavigation({ view: "mail", kind: "mail" })}>Open P-Mail</button>
        </div>
      </main>
    </div>
  );
}
