import { getPillarDefinition, isPillarId, type PillarId } from "./pillars.ts";

export type AppView = "mail" | "calendar" | "docs" | "accounts" | "suite" | "pillar" | "not-found";

export interface NavigationTarget {
  view: AppView;
  kind?: AppView;
  pillarId?: PillarId;
  unknownId?: string;
}

export type AppViewTarget = NavigationTarget;

type NavigationLocation = Partial<Pick<Location, "pathname" | "search" | "hostname">> | URL;

function target(view: AppView, pillarId?: PillarId, unknownId?: string): NavigationTarget {
  return { view, kind: view, ...(pillarId ? { pillarId } : {}), ...(unknownId ? { unknownId } : {}) };
}

export function readNavigationLocation(location: NavigationLocation): NavigationTarget {
  const pathname = location.pathname || "/";
  const hostname = location.hostname || "";
  const params = new URLSearchParams(location.search || "");

  if (hostname.startsWith("accounts.")) return target("accounts");
  if (hostname.startsWith("docs.")) return target("docs");
  if (hostname.startsWith("deck.")) return target("pillar", "p-deck");

  if (pathname === "/" || pathname === "") {
    const legacyView = params.get("view");
    if (legacyView === "accounts") return target("accounts");
    if (legacyView === "docs") return target("docs");
    if (legacyView === "calendar") return target("calendar");
    return target("mail");
  }
  if (pathname === "/accounts" || pathname.startsWith("/accounts/")) return target("accounts");
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return target("docs");
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) return target("calendar");
  if (pathname === "/suite" || pathname === "/suite/") return target("suite");

  const suiteMatch = pathname.match(/^\/suite\/([^/]+)\/?$/);
  if (suiteMatch) {
    let id: string;
    try {
      id = decodeURIComponent(suiteMatch[1]);
    } catch {
      return target("not-found", undefined, suiteMatch[1]);
    }
    return isPillarId(id) ? target("pillar", id) : target("not-found", undefined, id);
  }

  return target("not-found");
}

export function normalizeNavigationTarget(input: NavigationTarget): AppViewTarget {
  if (input.view === "pillar" && input.pillarId) {
    switch (input.pillarId) {
      case "p-mail":
        return target("mail");
      case "p-calendar":
        return target("calendar");
      case "p-docs":
        return target("docs");
      case "p-pass":
        return target("accounts");
      default:
        return getPillarDefinition(input.pillarId) ? target("pillar", input.pillarId) : target("not-found", undefined, input.pillarId);
    }
  }
  if (input.view === "suite") return target("suite");
  if (input.view === "mail" || input.view === "calendar" || input.view === "docs" || input.view === "accounts") {
    return target(input.view);
  }
  return target("not-found", undefined, input.unknownId);
}

function canonicalPath(input: NavigationTarget): string {
  const normalized = normalizeNavigationTarget(input);
  switch (normalized.view) {
    case "mail":
      return "/";
    case "calendar":
      return "/calendar";
    case "docs":
      return "/docs";
    case "accounts":
      return "/accounts";
    case "suite":
      return "/suite";
    case "pillar":
      return `/suite/${normalized.pillarId}`;
    case "not-found":
      return normalized.unknownId ? `/suite/${encodeURIComponent(normalized.unknownId)}` : "/not-found";
  }
}

export function writeNavigation(targetValue: NavigationTarget, mode: "push" | "replace" = "push"): string {
  const path = canonicalPath(targetValue);
  if (typeof window !== "undefined") {
    const method = mode === "replace" ? "replaceState" : "pushState";
    window.history[method]({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  return path;
}

export function subscribeToNavigation(listener: (next: NavigationTarget) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handlePopState = () => listener(readNavigationLocation(window.location));
  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}

export function navigationForPillar(id: PillarId): NavigationTarget {
  return target("pillar", id);
}
