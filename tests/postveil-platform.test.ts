import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNavigationTarget, readNavigationLocation } from "../src/lib/navigation.ts";
import { PILLAR_REGISTRY, type PillarId } from "../src/lib/pillars.ts";

test("registry contains exactly the 20 canonical pillars and excludes P-CAD", () => {
  assert.equal(PILLAR_REGISTRY.length, 20);
  assert.equal(new Set(PILLAR_REGISTRY.map((pillar) => pillar.id)).size, 20);
  assert.equal(PILLAR_REGISTRY.some((pillar) => pillar.id === ("p-cad" as PillarId)), false);
  for (const pillar of PILLAR_REGISTRY) {
    assert.equal(pillar.requiresAuth, true);
    assert.equal(pillar.icon.path, `/brand/pillars/${pillar.id}.svg`);
  }
});

test("navigation recognizes canonical, legacy, host aliases, and suite routes", () => {
  assert.equal(readNavigationLocation({ pathname: "/", search: "", hostname: "postveil.me" }).view, "mail");
  assert.equal(readNavigationLocation({ pathname: "/", search: "?view=accounts", hostname: "postveil.me" }).view, "accounts");
  assert.equal(readNavigationLocation({ pathname: "/docs", search: "", hostname: "postveil.me" }).view, "docs");
  assert.equal(readNavigationLocation({ pathname: "/anything", search: "", hostname: "docs.postveil.me" }).view, "docs");
  assert.equal(readNavigationLocation({ pathname: "/suite", search: "", hostname: "postveil.me" }).view, "suite");
  assert.deepEqual(readNavigationLocation({ pathname: "/suite/p-meet", search: "", hostname: "postveil.me" }), { view: "pillar", kind: "pillar", pillarId: "p-meet" });
  assert.equal(readNavigationLocation({ pathname: "/suite/not-a-pillar", search: "", hostname: "postveil.me" }).view, "not-found");
});

test("remaining pillars resolve to explicit bounded routes", () => {
  const boundaryIds: PillarId[] = ["p-meet", "p-chat", "p-deck", "p-studio", "p-books", "p-sites", "p-automate", "p-sign"];
  for (const id of boundaryIds) {
    const definition = PILLAR_REGISTRY.find((pillar) => pillar.id === id);
    assert.ok(definition);
    assert.ok(definition.state === "setup-required" || definition.state === "roadmap");
    assert.equal(readNavigationLocation({ pathname: definition.route, search: "", hostname: "postveil.me" }).pillarId, id);
  }
  assert.equal(readNavigationLocation({ pathname: "/suite/p-pass", search: "", hostname: "postveil.me" }).pillarId, "p-pass");
  assert.equal(normalizeNavigationTarget({ view: "pillar", kind: "pillar", pillarId: "p-pass" }).view, "accounts");
  assert.equal(readNavigationLocation({ pathname: "/suite/%", search: "", hostname: "postveil.me" }).view, "not-found");
});
