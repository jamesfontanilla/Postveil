import { useState } from "react";
import { CommandPalette } from "./CommandPalette";
import SuiteNav from "./SuiteNav";
import { CAPABILITY_STATE_LABELS, PILLAR_REGISTRY, type PillarId } from "../../lib/pillars";
import { navigationForPillar, writeNavigation } from "../../lib/navigation";
import "./PlatformStyles.css";

export default function SuiteDashboard() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = (id: PillarId) => writeNavigation(navigationForPillar(id));
  return (
    <div className="pv-platform-shell">
      <SuiteNav current={{ view: "suite", kind: "suite" }} onOpenPalette={() => setPaletteOpen(true)} />
      <main className="pv-suite-content">
        <div className="pv-suite-heading">
          <div>
            <h1>Postveil Suite</h1>
            <p>One authenticated shell for the 20 pillars. Each card states what is available today and what still needs setup; no demo records are created.</p>
          </div>
          <button type="button" className="pv-platform-button" onClick={() => setPaletteOpen(true)}>Open command palette</button>
        </div>
        <section className="pv-pillar-grid" aria-label="Postveil pillars">
          {PILLAR_REGISTRY.map((pillar) => (
            <article className="pv-pillar-card" key={pillar.id}>
              <div className="pv-pillar-card-top">
                <img src={pillar.icon.path} alt={pillar.icon.alt} />
                <h2>{pillar.name}</h2>
                <span className={`pv-capability-badge ${pillar.state}`}>{CAPABILITY_STATE_LABELS[pillar.state]}</span>
              </div>
              <p>{pillar.summary}</p>
              {pillar.dependencyNote && <p>{pillar.dependencyNote}</p>}
              <div className="pv-pillar-card-actions">
                <button type="button" className="pv-platform-button" onClick={() => navigate(pillar.id)}>Open {pillar.name}</button>
              </div>
            </article>
          ))}
        </section>
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

