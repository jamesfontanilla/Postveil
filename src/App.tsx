import {
  ChangeEvent,
  createContext,
  DragEvent,
  FormEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Archive,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Building2,
  Bookmark,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Columns,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flag,
  Folder,
  FolderInput,
  FolderPlus,
  Forward,
  Globe2,
  HardDrive,
  HelpCircle,
  History,
  Inbox,
  Info,
  Keyboard,
  LayoutGrid,
  ListTodo,
  LogOut,
  Maximize2,
  Mail,
  MailOpen,
  Menu,
  Minimize2,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pencil,
  PenLine,
  Pin,
  Plus,
  Printer,
  RefreshCcw,
  Reply,
  ReplyAll,
  RotateCcw,
  Search,
  Send,
  Settings,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  Undo2,
  UploadCloud,
  Upload,
  Users,
  X,
} from "lucide-react";
import { requireSupabase, supabase, type JsonRecord, type Session } from "./lib/auth";
import { sanitizeEmailHtml } from "./lib/email-html";
import { qrImageSource } from "./lib/qr";
import RichEmailBody from "./components/RichEmailBody";
import BrandMark from "./components/BrandMark";
import PublicHome from "./components/auth/PublicHome";
import PasswordResetScreen from "./components/auth/PasswordResetScreen";
import AuthScreen from "./components/auth/AuthScreen";
import { MfaSetupRequiredScreen, MfaChallengeScreen } from "./components/auth/MfaScreens";
import OnboardingWizard from "./components/auth/OnboardingWizard";
import { apiFetch, apiUpload, publicApiFetch, recordExplicitSignIn, ApiError } from "./lib/api";
import {
  markdownToHtml,
  zonedLocalToIso,
  displayName,
  initials,
  avatarGradient,
  formatDate,
  messageStatusLabel,
  workStateLabel,
  displayWorkNote,
  workDueLabel,
  formatBytes,
} from "./lib/format";
import { AppDialogProvider, useAppDialog } from "./context/AppDialogContext";
import Compose from "./components/modals/ComposeModal";
import SettingsPanel from "./components/modals/SettingsModal";
import TrustLensModal from "./components/modals/TrustLensModal";
import KeyboardShortcutsModal from "./components/modals/KeyboardShortcutsModal";
import DiagnosticsModal from "./components/modals/DiagnosticsModal";
import WhatsNewModal from "./components/modals/WhatsNewModal";
import Workspace from "./components/workspace/WorkspaceView";
import SenderAvatar from "./components/SenderAvatar";

import {
  type SystemFolder,
  type ViewKey,
  TURNSTILE_SITE_KEY,
  type Message,
  type Contact,
  type Mailbox,
  type CustomFolder,
  type Label,
  type SavedSearch,
  type SearchHistoryItem,
  type SearchSuggestion,
  type MailPage,
  type SenderPolicy,
  type RetentionPolicy,
  type ScreeningEvent,
  type TrustData,
  type Signature,
  type LinkInspection,
  type ComposeLibraryItem,
  type RuleConditionType,
  type RuleCondition,
  type Rule,
  type RuleLabMatch,
  type RuleLabResult,
  type AutoReply,
  type AppSettings,
  type AdminMailbox,
  type AdminMember,
  type AdminOrganization,
  type AdminActivity,
  type AdminGroupMember,
  type AdminGroup,
  type AdminOverview,
  type DeliveryOpsView,
  type Task,
  type WorkItem,
  type WorkSummary,
  type CalendarEvent,
  type ComposeSeed,
  type MfaFactor,
  type RecoveryMethod,
  type Passkey,
  type OnboardingState,
  type JsonSettings,
  starterComposeLibrary,
} from "./types/mail";



const folderNames: Record<SystemFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  trash: "Trash",
  spam: "Spam",
  quarantine: "Quarantine",
};
const folderIcons: Record<SystemFolder, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: PenLine,
  archive: Archive,
  trash: Trash2,
  spam: ShieldAlert,
  quarantine: ShieldAlert,
};

function storedBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}
function contactFor(address: string, contacts: Contact[]) {
  return contacts.find((contact) => contact.email.toLowerCase() === address.toLowerCase());
}
function senderForMessage(message: Message, contacts: Contact[], mailboxes: Mailbox[]) {
  const address = message.direction === "inbound" ? message.from_address : message.to_addresses?.[0] || message.from_address;
  const contact = contactFor(address, contacts);
  const mailbox = mailboxes.find((item) => item.address.toLowerCase() === message.from_address.toLowerCase());
  const name = message.direction === "inbound"
    ? contact?.display_name?.trim() || message.from_name?.trim() || displayName(address)
    : contact?.display_name?.trim() || mailbox?.display_name?.trim() || displayName(address);
  return { name, email: address, avatarUrl: contact?.avatar_url || null };
}
function detailIdentityForMessage(message: Message, contacts: Contact[], mailboxes: Mailbox[]) {
  if (message.direction === "inbound") return senderForMessage(message, contacts, mailboxes);
  const mailbox = mailboxes.find((item) => item.address.toLowerCase() === message.from_address.toLowerCase());
  return {
    name: message.from_name?.trim() || mailbox?.display_name?.trim() || displayName(message.from_address),
    email: message.from_address,
    avatarUrl: null,
  };
}


function MailboxApp({ session }: { session: Session }) {
  const { confirm, prompt } = useAppDialog();
  const imagePreferenceKey = `postveil.load_remote_images:${session.user.id}`;
  const [view, setView] = useState<"mail" | "calendar" | "tasks">("mail");
  const [folder, setFolder] = useState<ViewKey>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [senderPolicies, setSenderPolicies] = useState<SenderPolicy[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    theme: "light",
    density: "comfortable",
    focused_inbox_enabled: true,
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workSummary, setWorkSummary] = useState<WorkSummary>({ reply_later: 0, waiting_on: 0, i_owe: 0, overdue: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [inlineImageUrls, setInlineImageUrls] = useState<Record<string, string>>({});
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequestRef = useRef(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    | "appearance"
    | "security"
    | "organize"
    | "contacts"
    | "spam"
    | "automation"
    | "mailboxes"
    | "integrations"
    | "administration"
  >("appearance");
  const [mobileNav, setMobileNav] = useState(false);
  const [loadRemoteImages, setLoadRemoteImages] = useState(() => storedBooleanPreference(imagePreferenceKey, false));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveState, setLiveState] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const [showAllThreadMessages, setShowAllThreadMessages] = useState(false);
  const [threadOrder, setThreadOrder] = useState<"newest" | "oldest">("newest");
  const [showMessageDetails, setShowMessageDetails] = useState(false);
  const [trustLensOpen, setTrustLensOpen] = useState(false);
  const [trustLensBusy, setTrustLensBusy] = useState(false);
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [moreSubmenu, setMoreSubmenu] = useState<"security" | "view" | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [messageReactions, setMessageReactions] = useState<Record<string, string>>({});
  const [trashBusy, setTrashBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllResults, setSelectAllResults] = useState(false);
  const [bulkAction, setBulkAction] = useState("archive");
  const [bulkFolder, setBulkFolder] = useState("archive");
  const [bulkLabelId, setBulkLabelId] = useState("");
  const [bulkPriority, setBulkPriority] = useState("1");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkUndo, setBulkUndo] = useState<{ requestId: string; label: string } | null>(null);
  const [draggedMessageId, setDraggedMessageId] = useState<string | null>(null);
  const [savedSearchFormOpen, setSavedSearchFormOpen] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [savedSearchBusy, setSavedSearchBusy] = useState(false);
  const [activeSavedSearchId, setActiveSavedSearchId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);
  const [ribbonTab, setRibbonTab] = useState<"home" | "view" | "file" | "help">("home");
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [whatsNewModalOpen, setWhatsNewModalOpen] = useState(false);
  const [readingPanePosition, setReadingPanePosition] = useState<"right" | "bottom" | "off">("right");
  const [folderPaneCollapsed, setFolderPaneCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth <= 1024);
  const [inboxUnreadCount, setInboxUnreadCount] = useState<number>(0);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [normalizedQuery, setNormalizedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [resultTotal, setResultTotal] = useState<number | null>(null);
  const previousMessageIds = useRef<Set<string>>(new Set());
  const recordedSearchRef = useRef("");
  const mailListRequestRef = useRef(0);
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest(".mail-ribbon-dropdown-wrapper")) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);
  const loadMeta = useCallback(async () => {
    try {
      const [addresses, contactRows, customFolders, labelRows, signatureRows, ruleRows, policyRows, preference, savedRows, historyRows] =
        await Promise.all([
          apiFetch<Mailbox[]>("/api/mailboxes"),
          apiFetch<Contact[]>("/api/contacts"),
          apiFetch<CustomFolder[]>("/api/folders"),
          apiFetch<Label[]>("/api/labels"),
          apiFetch<Signature[]>("/api/signatures"),
          apiFetch<Rule[]>("/api/rules"),
          apiFetch<SenderPolicy[]>("/api/sender-policies").catch(() => []),
          apiFetch<AppSettings>("/api/settings"),
          apiFetch<SavedSearch[]>("/api/saved-searches?counts=true").catch(() => []),
          apiFetch<SearchHistoryItem[]>("/api/search/history").catch(() => []),
        ]);
      setMailboxes(addresses);
      setContacts(contactRows);
      setFolders(customFolders);
      setLabels(labelRows);
      setSignatures(signatureRows);
      setRules(ruleRows);
      setSenderPolicies(policyRows);
      setSettings(preference);
      setSavedSearches(savedRows);
      setSearchHistory(historyRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Mailbox settings unavailable",
      );
    }
  }, []);
  const updateSettings = async (patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch {
      // ignore
    }
  };
  const loadMessages = useCallback(
    async (target: ViewKey = folder, showLoading = true, pageNumber = 1, append = false) => {
      const requestId = mailListRequestRef.current + 1;
      mailListRequestRef.current = requestId;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          folder: target,
          page: String(pageNumber),
          page_size: "80",
          filter,
          sort,
        });
        if (query.trim()) params.set("q", query.trim());
        params.set("meta", "true");
        const payload = await apiFetch<MailPage | Message[]>(`/api/mail?${params.toString()}`);
        if (requestId !== mailListRequestRef.current) return;
        const nextPage = Array.isArray(payload) ? { items: payload, total: null, page: pageNumber, hasMore: payload.length >= 80, normalizedQuery: "" } : payload;
        setMessages((current) => (append ? [...current, ...nextPage.items] : nextPage.items));
        setPage(nextPage.page);
        setHasMore(nextPage.hasMore);
        setResultTotal(nextPage.total);
        setNormalizedQuery(nextPage.normalizedQuery || "");
        if (pageNumber === 1 && !append && nextPage.normalizedQuery && recordedSearchRef.current !== nextPage.normalizedQuery) {
          recordedSearchRef.current = nextPage.normalizedQuery;
          void apiFetch<SearchHistoryItem>("/api/search/history", { method: "POST", body: JSON.stringify({ query: query.trim() }) })
            .then((item) => setSearchHistory((current) => [item, ...current.filter((entry) => entry.normalized_query !== item.normalized_query)].slice(0, 20)))
            .catch(() => undefined);
        }
        if (pageNumber === 1 && !append) void apiFetch<SavedSearch[]>("/api/saved-searches?counts=true").then(setSavedSearches).catch(() => undefined);
      } catch (loadError) {
        if (requestId !== mailListRequestRef.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Mailbox unavailable",
        );
      } finally {
        if (requestId === mailListRequestRef.current) setLoading(false);
      }
    },
    [filter, folder, query, sort],
  );
  useEffect(() => {
    if (!bulkUndo) return;
    const timer = window.setTimeout(() => setBulkUndo(null), 30_000);
    return () => window.clearTimeout(timer);
  }, [bulkUndo]);
  const loadWorkspace = useCallback(async () => {
    try {
      const [taskRows, eventRows, workRows, summary] = await Promise.all([
        apiFetch<Task[]>("/api/tasks"),
        apiFetch<CalendarEvent[]>("/api/calendar"),
        apiFetch<WorkItem[]>("/api/work"),
        apiFetch<WorkSummary>("/api/work/summary"),
      ]);
      setTasks(taskRows);
      setEvents(eventRows);
      setWorkItems(workRows);
      setWorkSummary(summary);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Workspace unavailable",
      );
    }
  }, []);
  function clearListSelection() {
    setSelectedIds(new Set());
    setSelectAllResults(false);
  }
  function openMailFolder(target: ViewKey) {
    detailRequestRef.current += 1;
    mailListRequestRef.current += 1;
    setView("mail");
    setFolder(target);
    setActiveSavedSearchId(null);
    setSelected(null);
    setSelectedId(null);
    setThreadMessages([]);
    setMessages([]);
    setPage(1);
    setHasMore(false);
    setResultTotal(null);
    setNormalizedQuery("");
    setLoading(true);
    setDetailLoading(false);
    setRibbonTab("home");
    clearListSelection();
    setMobileNav(false);
  }
  function closeSelectedMessage() {
    detailRequestRef.current += 1;
    setSelected(null);
    setSelectedId(null);
    setThreadMessages([]);
    setInlineImageUrls({});
    setDetailLoading(false);
    setTrustLensOpen(false);
    setTrustData(null);
    setShowMoreActions(false);
    setMoreSubmenu(null);
  }
  function updateRemoteImagePreference(value: boolean) {
    setLoadRemoteImages(value);
    try {
      window.localStorage.setItem(imagePreferenceKey, String(value));
    } catch {
      // The preference still applies for this session when storage is unavailable.
    }
  }
  function toggleMessageSelection(id: string) {
    if (selectAllResults) {
      setSelectedIds(new Set(messages.map((message) => message.id).filter((messageId) => messageId !== id)));
      setSelectAllResults(false);
      return;
    }
    setSelectAllResults(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectCurrentPage() {
    setSelectedIds(new Set(messages.map((message) => message.id)));
    setSelectAllResults(false);
  }
  async function createSavedSearch() {
    const queryText = query.trim();
    const name = savedSearchName.trim();
    if (!name) { setError("Enter a name for the saved search"); return; }
    if (!queryText) { setError("Enter a search query before saving it"); return; }
    setSavedSearchBusy(true);
    setError("");
    try {
      const saved = await apiFetch<SavedSearch>("/api/saved-searches", { method: "POST", body: JSON.stringify({ name, query: queryText }) });
      setSavedSearches((current) => [...current, saved].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)));
      setSavedSearchName("");
      setSavedSearchFormOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved search could not be created");
    } finally {
      setSavedSearchBusy(false);
    }
  }
  async function renameSavedSearch(saved: SavedSearch) {
    const name = (await prompt({
      title: "Rename saved search",
      message: "Choose a short name that will help you find this search later.",
      defaultValue: saved.name,
      placeholder: "Search name",
      confirmLabel: "Save name",
    }))?.trim();
    if (!name || name === saved.name) return;
    try {
      const updated = await apiFetch<SavedSearch>(`/api/saved-searches/${saved.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setSavedSearches((current) => current.map((item) => item.id === saved.id ? { ...item, ...updated } : item));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved search could not be renamed");
    }
  }
  async function deleteSavedSearch(saved: SavedSearch) {
    if (!(await confirm({
      title: "Delete this saved search?",
      message: `Delete saved search “${saved.name}”? Your messages will not be changed.`,
      confirmLabel: "Delete search",
      danger: true,
    }))) return;
    try {
      await apiFetch(`/api/saved-searches/${saved.id}`, { method: "DELETE" });
      setSavedSearches((current) => current.filter((item) => item.id !== saved.id));
      if (activeSavedSearchId === saved.id) {
        setActiveSavedSearchId(null);
        setQuery("");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved search could not be deleted");
    }
  }
  async function reorderSavedSearch(saved: SavedSearch, direction: -1 | 1) {
    const ordered = [...savedSearches].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
    const index = ordered.findIndex((item) => item.id === saved.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    setSavedSearches(ordered.map((item, itemIndex) => ({ ...item, sort_order: itemIndex })));
    try {
      await apiFetch("/api/saved-searches/reorder", { method: "POST", body: JSON.stringify({ ids: ordered.map((item) => item.id) }) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Saved searches could not be reordered");
    }
  }
  function openSavedSearch(saved: SavedSearch) {
    openMailFolder("inbox");
    setQuery(saved.query);
    setActiveSavedSearchId(saved.id);
  }
  function applySearchSuggestion(suggestion: SearchSuggestion) {
    setQuery(suggestion.value);
    setActiveSavedSearchId(null);
    clearListSelection();
    setSearchFocused(false);
  }
  async function clearSearchHistory() {
    try {
      await apiFetch("/api/search/history", { method: "DELETE" });
      setSearchHistory([]);
      setSearchSuggestions([]);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Search history could not be cleared");
    }
  }
  async function downloadSearchResults(format: "csv" | "json" = "csv") {
    try {
      const currentSession = (await requireSupabase().auth.getSession()).data.session;
      const params = new URLSearchParams({ folder, filter, sort, format });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/mail/export?${params.toString()}`, { headers: currentSession?.access_token ? { authorization: `Bearer ${currentSession.access_token}` } : {} });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload.error || `Export failed (${response.status})`));
      }
      const blob = await response.blob();
      const download = document.createElement("a");
      download.href = URL.createObjectURL(blob);
      download.download = `postveil-search-${new Date().toISOString().slice(0, 10)}.${format}`;
      download.click();
      URL.revokeObjectURL(download.href);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Search results could not be exported");
    }
  }
  async function undoBulkAction() {
    if (!bulkUndo) return;
    const requestId = bulkUndo.requestId;
    try {
      await apiFetch("/api/mail/bulk/undo", { method: "POST", body: JSON.stringify({ requestId }) });
      setBulkUndo(null);
      setBulkNotice("Bulk change undone");
      await loadMessages(folder, false);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Undo is no longer available");
    }
  }
  async function runBulkAction(nextAction = bulkAction) {
    const allResults = selectAllResults;
    const visibleSelection = allResults ? messages.map((message) => message.id) : [...selectedIds];
    if (!visibleSelection.length && !allResults) { setError("Select at least one message"); return; }
    const countLabel = allResults ? `${resultTotal ?? "all"} matching messages` : `${visibleSelection.length} message${visibleSelection.length === 1 ? "" : "s"}`;
    if (nextAction === "trash" && !(await confirm({
      title: "Move messages to Trash?",
      message: `Move ${countLabel} to Trash? You can restore them later.`,
      confirmLabel: "Move to Trash",
      danger: true,
    }))) return;
    setBulkBusy(true);
    setError("");
    setBulkNotice("");
    const action: JsonSettings = { type: nextAction };
    if (nextAction === "move") {
      if (bulkFolder.startsWith("custom:")) {
        action.folder = "custom";
        action.customFolderId = bulkFolder.slice(7);
      } else {
        action.folder = bulkFolder;
      }
    }
    if (nextAction === "label") {
      if (!bulkLabelId) { setError("Choose a label first"); setBulkBusy(false); return; }
      action.labelId = bulkLabelId;
    }
    if (nextAction === "priority") action.priority = Number(bulkPriority);
    if (nextAction === "reminder") {
      const reminder = new Date();
      reminder.setDate(reminder.getDate() + 1);
      reminder.setHours(9, 0, 0, 0);
      action.reminderAt = reminder.toISOString();
      action.reminderNote = "Follow up on this message";
    }
    const idempotencyKey = crypto.randomUUID();
    try {
      const payload = await apiFetch<{ requestId: string; changedIds: string[]; exported?: JsonSettings[]; failures: Array<{ id: string; error: string }>; undoable: boolean; truncated?: boolean }>("/api/mail/bulk", {
        method: "POST",
        body: JSON.stringify({ messageIds: allResults ? [] : visibleSelection, scope: allResults ? "all_results" : "selected", query: query.trim(), folder, action, idempotencyKey }),
      });
      const movedOut = ["archive", "move", "trash", "spam", "restore", "snooze"].includes(nextAction);
      const selectedSet = new Set(payload.changedIds);
      setMessages((current) => movedOut ? current.filter((message) => !selectedSet.has(message.id)) : current.map((message) => {
        if (!selectedSet.has(message.id)) return message;
        if (nextAction === "mark_read" || nextAction === "mark_unread") return { ...message, is_read: nextAction === "mark_read" };
        if (nextAction === "star" || nextAction === "unstar") return { ...message, is_starred: nextAction === "star" };
        if (nextAction === "pin" || nextAction === "unpin") return { ...message, is_pinned: nextAction === "pin" };
        if (nextAction === "flag" || nextAction === "unflag") return { ...message, is_flagged: nextAction === "flag" };
        return message;
      }));
      clearListSelection();
      await loadMessages(folder, false);
      if (nextAction === "export" && payload.exported?.length) {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(new Blob([JSON.stringify(payload.exported, null, 2)], { type: "application/json" }));
        download.download = `postveil-export-${new Date().toISOString().slice(0, 10)}.json`;
        download.click();
        URL.revokeObjectURL(download.href);
      }
      if (payload.failures.length) setError(`${payload.changedIds.length} changed; ${payload.failures.length} failed. ${payload.failures[0].error}`);
      else setBulkNotice(`${payload.changedIds.length || (nextAction === "export" ? visibleSelection.length : 0)} message${payload.changedIds.length === 1 ? "" : "s"} updated${payload.truncated ? " (first 500 matching messages)" : ""}`);
      if (payload.undoable && payload.changedIds.length) setBulkUndo({ requestId: payload.requestId, label: "Undo change" });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }
  useEffect(() => {
    void loadMeta();
    void loadWorkspace();
  }, [loadMeta, loadWorkspace]);
  useEffect(() => {
    if (
      settings.desktop_notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    )
      void Notification.requestPermission();
  }, [settings.desktop_notifications]);
  useEffect(() => {
    const nextIds = new Set(messages.map((message) => message.id));
    const previousIds = previousMessageIds.current;
    if (
      previousIds.size > 0 &&
      folder === "inbox" &&
      settings.desktop_notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      messages
        .filter((message) => !previousIds.has(message.id) && !message.is_read)
        .slice(0, 3)
        .forEach(
          (message) =>
            new Notification(message.subject || "New message", {
              body: `${message.from_address}: ${message.snippet || "Open Postveil to read it."}`,
            }),
        );
    }
    previousMessageIds.current = nextIds;
  }, [folder, messages, settings.desktop_notifications]);
  useEffect(() => {
    if (view !== "mail") return;
    void loadMessages(folder, true);
    const interval = window.setInterval(
      () => void loadMessages(folder, false),
      15000,
    );
    let channel:
      | ReturnType<NonNullable<typeof supabase>["channel"]>
      | undefined;
    if (supabase) {
      setLiveState("connecting");
      channel = supabase
        .channel(`messages-${folder}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `owner_id=eq.${session.user.id}` },
          () => void loadMessages(folder, false),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setLiveState("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLiveState("reconnecting");
          else if (status === "CLOSED") setLiveState("offline");
        });
    } else {
      setLiveState("offline");
    }
    return () => {
      window.clearInterval(interval);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [folder, view, loadMessages]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (view === "mail") void loadMessages(folder, false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, filter, sort, folder, view, loadMessages]);
  useEffect(() => {
    if (!searchFocused) return;
    const timer = window.setTimeout(() => {
      void apiFetch<SearchSuggestion[]>(`/api/search/suggestions?q=${encodeURIComponent(query)}`)
        .then(setSearchSuggestions)
        .catch(() => setSearchSuggestions([]));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, searchFocused]);
  useEffect(() => {
    if (folder === "inbox" && filter === "all" && !query.trim()) {
      setInboxUnreadCount(messages.filter((m) => !m.is_read).length);
    }
  }, [folder, filter, query, messages]);
  async function openMessage(message: Message) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setView("mail");
    setMobileNav(false);
    if (["inbox", "sent", "drafts", "archive", "trash", "spam", "quarantine"].includes(message.folder)) setFolder(message.folder as ViewKey);
    setSelectedId(message.id);
    setSelected(message);
    setInlineImageUrls({});
    setDetailLoading(true);
    setError("");
    setShowAllThreadMessages(false);
    setShowMessageDetails(false);
    setThreadMessages([]);
    setTrustLensOpen(false);
    setTrustData(null);
    setShowMoreActions(false);
    setMoreSubmenu(null);
    try {
      const detail = await apiFetch<Message>(`/api/mail/${message.id}`);
      if (detailRequestRef.current !== requestId) return;
      setSelected(detail);
      const inlineAttachments = (detail.attachments || []).filter((attachment) => attachment.content_id);
      if (inlineAttachments.length) {
        const inlineResults = await Promise.all(inlineAttachments.map(async (attachment) => {
          try {
            const result = await apiFetch<{ url: string }>(`/api/attachments/${attachment.id}?json=true`);
            return [String(attachment.content_id).trim().replace(/^<|>$/g, "").toLowerCase(), result.url] as const;
          } catch {
            return null;
          }
        }));
        if (detailRequestRef.current !== requestId) return;
        setInlineImageUrls(Object.fromEntries(inlineResults.filter((item): item is readonly [string, string] => Boolean(item && item[0] && item[1]))));
      }
      const thread = await apiFetch<Message[]>(`/api/threads/${message.thread_id}`);
      if (detailRequestRef.current !== requestId) return;
      setThreadMessages(thread);
      if (!message.is_read) {
        await apiFetch(`/api/mail/${message.id}`, {
          method: "POST",
          body: JSON.stringify({ isRead: true }),
        });
        if (detailRequestRef.current !== requestId) return;
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, is_read: true } : item,
          ),
        );
      }
    } catch (openError) {
      if (detailRequestRef.current !== requestId) return;
      setError(
        openError instanceof Error ? openError.message : "Message unavailable",
      );
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }
  async function toggleTrustLens() {
    if (!selected) return;
    if (trustLensOpen) { setTrustLensOpen(false); return; }
    setTrustLensOpen(true);
    if (trustData) return;
    setTrustLensBusy(true);
    try { setTrustData(await apiFetch<TrustData>(`/api/mail/${selected.id}/trust`)); }
    catch (trustError) { setError(trustError instanceof Error ? trustError.message : "Trust details unavailable"); }
    finally { setTrustLensBusy(false); }
  }

  async function openRawSource() {
    if (!selected) return;
    try {
      const current = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch(`/api/mail/${selected.id}/source`, { headers: current?.access_token ? { authorization: `Bearer ${current.access_token}` } : {} });
      if (!response.ok) throw new Error(`Raw source unavailable (${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (sourceError) { setError(sourceError instanceof Error ? sourceError.message : "Raw source unavailable"); }
  }
  function openInNewWindow(msg: Message) {
    const popup = window.open("", "postveil-email", "noopener,noreferrer,width=920,height=760");
    if (!popup) return;
    const bodyContent = msg.html_body || `<pre style="font-family:inherit;white-space:pre-wrap;">${(msg.text_body || msg.snippet || "No content").replace(/[&<>]/g, (c: string) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as Record<string, string>)[c] || c))}</pre>`;
    popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${(msg.subject || "Email").replace(/[&<>"']/g, "")} · Postveil</title><style>body{margin:0;background:#f4f6f2;color:#17221f;font:15px/1.6 system-ui,-apple-system,sans-serif}.email{box-sizing:border-box;width:min(860px,100%);margin:0 auto;padding:40px 28px;background:#fff;min-height:100vh;overflow-wrap:anywhere}.email img{max-width:100%;height:auto}.email table{max-width:100%}a{color:#1f6b57}h1{font-size:20px;margin-top:0}</style></head><body><main class="email" aria-label="Email message"><h1>${(msg.subject || "(no subject)").replace(/[&<>"']/g, "")}</h1><div style="font-size:13px;color:#616161;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #edebe9;">From: ${msg.from_address}<br>Date: ${new Date(msg.received_at || msg.sent_at || msg.created_at).toLocaleString()}</div>${bodyContent}</main></body></html>`);
    popup.document.close();
  }
  async function submitSpamFeedback(feedback: "spam" | "not_spam") {
    if (!selected) return;
    try {
      await apiFetch(`/api/mail/${selected.id}/feedback`, { method: "POST", body: JSON.stringify({ feedback }) });
      setSelected(null);
      setSelectedId(null);
      setThreadMessages([]);
      setTrustData(null);
      await loadMessages(folder, false);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "Feedback could not be saved");
    }
  }
  async function mutateMessage(body: JsonSettings) {
    if (!selected) return;
    try {
      await apiFetch(`/api/mail/${selected.id}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadMessages(folder, false);
      if (body.workState !== undefined || body.followUpAt !== undefined || body.workNote !== undefined) void loadWorkspace();
      if (typeof body.folder === "string" || typeof body.snoozedUntil === "string") {
        setSelected(null);
        setSelectedId(null);
        setThreadMessages([]);
        return;
      }
      const detail = await apiFetch<Message>(`/api/mail/${selected.id}`);
      setSelected(detail);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Action failed",
      );
    }
  }
  function clearMessageSelection() {
    detailRequestRef.current += 1;
    setSelected(null);
    setSelectedId(null);
    setThreadMessages([]);
    setDetailLoading(false);
    setTrustLensOpen(false);
    setTrustData(null);
    setShowMoreActions(false);
    setMoreSubmenu(null);
  }
  async function restoreSelected() {
    if (!selected || selected.folder !== "trash") return;
    setTrashBusy(true);
    setError("");
    try {
      await apiFetch(`/api/mail/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "restore" }),
      });
      clearMessageSelection();
      await loadMessages(folder, false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Restore failed");
    } finally {
      setTrashBusy(false);
    }
  }
  async function permanentlyDeleteSelected() {
    if (!selected || selected.folder !== "trash") return;
    if (!(await confirm({
      title: "Delete this message permanently?",
      message: "This message and its attachments cannot be recovered after permanent deletion.",
      confirmLabel: "Delete permanently",
      danger: true,
    }))) return;
    setTrashBusy(true);
    setError("");
    try {
      await apiFetch(`/api/mail/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "permanent_delete" }),
      });
      clearMessageSelection();
      await loadMessages(folder, false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Permanent delete failed");
    } finally {
      setTrashBusy(false);
    }
  }
  async function emptyTrash() {
    if (!(await confirm({
      title: "Empty Trash permanently?",
      message: "Messages and attachments in Trash cannot be recovered after this action.",
      confirmLabel: "Empty Trash",
      danger: true,
    }))) return;
    setTrashBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ ok: boolean; deleted: number; storageCleanupFailed?: number }>("/api/trash/empty", {
        method: "POST",
      });
      clearMessageSelection();
      await loadMessages("trash", false);
      if (result.storageCleanupFailed) {
        setError(`Trash emptied, but ${result.storageCleanupFailed} stored file${result.storageCleanupFailed === 1 ? "" : "s"} could not be removed.`);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Trash could not be emptied");
    } finally {
      setTrashBusy(false);
    }
  }
  async function assignLabel(labelId: string) {
    if (!selected) return;
    try {
      await apiFetch("/api/labels/assign", {
        method: "POST",
        body: JSON.stringify({ messageId: selected.id, labelId }),
      });
      setError("");
    } catch (labelError) {
      setError(
        labelError instanceof Error
          ? labelError.message
          : "Label assignment failed",
      );
    }
  }
  async function openAttachment(id: string) {
    try {
      const result = await apiFetch<{ url: string }>(
        `/api/attachments/${id}?json=true`,
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (attachmentError) {
      setError(
        attachmentError instanceof Error
          ? attachmentError.message
          : "Attachment unavailable",
      );
    }
  }
  async function previewAttachment(id: string) {
    try {
      const result = await apiFetch<{ url: string }>(`/api/attachments/${id}/preview`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Preview unavailable");
    }
  }
  async function loadExternalEmailImage(source: string) {
    const current = (await requireSupabase().auth.getSession()).data.session;
    const response = await fetch(`/api/email-image-proxy?url=${encodeURIComponent(source)}`, {
      headers: current?.access_token ? { authorization: `Bearer ${current.access_token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(typeof payload.error === "string" ? payload.error : "Image could not be loaded privately");
    }
    const blob = await response.blob();
    if (!blob.type.toLowerCase().startsWith("image/")) throw new Error("The remote content was not an image");
    return URL.createObjectURL(blob);
  }
  async function inspectEmailLink(source: string): Promise<LinkInspection> {
    return apiFetch<LinkInspection>(`/api/link-inspection?url=${encodeURIComponent(source)}`);
  }
  async function downloadAllAttachments(messageId: string) {
    try {
      const session = (await requireSupabase().auth.getSession()).data.session;
      const response = await fetch(`/api/messages/${messageId}/attachments/download`, { headers: session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {} });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Attachment download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "attachments.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Attachment download failed");
    }
  }
  async function cancelSelectedSend() {
    if (!selected || !["queued", "scheduled"].includes(selected.status)) return;
    try {
      await apiFetch(`/api/outbox/${selected.id}/cancel`, { method: "POST" });
      await loadMessages(folder, false);
      await openMessage({ ...selected, status: "draft", folder: "drafts", cancelled_at: new Date().toISOString() });
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Send could not be cancelled");
    }
  }
  async function mutateThread(patch: JsonSettings) {
    if (!selected?.thread_id) return;
    try {
      await apiFetch(`/api/threads/${selected.thread_id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await loadMessages(folder, false);
      const detail = await apiFetch<Message>(`/api/mail/${selected.id}`);
      setSelected(detail);
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : "Conversation action failed");
    }
  }
  async function reportSelectedMessage(reportType: "spam" | "phishing") {
    if (!selected) return;
    try {
      await apiFetch("/api/mail/report", { method: "POST", body: JSON.stringify({ messageId: selected.id, reportType }) });
      setBulkNotice(reportType === "phishing" ? "Reported as phishing and moved to Quarantine" : "Reported as spam");
      clearMessageSelection();
      await loadMessages(folder, false);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Report could not be submitted");
    }
  }
  async function blockSelectedSender(matchType: "address" | "domain") {
    if (!selected) return;
    const value = matchType === "domain" ? selected.from_address.split("@")[1] : selected.from_address;
    if (!value) return;
    try {
      await apiFetch("/api/sender-blocks", { method: "POST", body: JSON.stringify({ matchType, matchValue: value }) });
      await reportSelectedMessage("spam");
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : "Sender could not be blocked");
    }
  }

  async function moveDraggedMessage(target: ViewKey, messageId: string) {
    if (["focused", "other", "important", "snoozed", "muted"].includes(target)) return;
    try {
      const body = target.startsWith("custom:") ? { folder: "custom", customFolderId: target.slice(7) } : { folder: target };
      await apiFetch(`/api/mail/${messageId}`, { method: "POST", body: JSON.stringify(body) });
      setBulkNotice("Message moved");
      await loadMessages(folder, false);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Message could not be moved");
    } finally {
      setDraggedMessageId(null);
    }
  }
  function openCompose(seed?: ComposeSeed) {
    setComposeSeed(seed);
    setComposeOpen(true);
  }
  const activeSavedSearch = activeSavedSearchId ? savedSearches.find((item) => item.id === activeSavedSearchId) : undefined;
  const currentLabel = activeSavedSearch
    ? activeSavedSearch.name
    : folder === "focused"
      ? "Focused"
      : folder === "other"
        ? "Other"
        : folder === "important"
          ? "Important"
          : folder === "snoozed"
            ? "Snoozed"
            : folder === "muted"
              ? "Muted conversations"
        : folder.startsWith("custom:")
          ? folders.find((item) => item.id === folder.slice(7))?.name ||
            "Folder"
          : folderNames[folder as SystemFolder];
  const CurrentIcon = activeSavedSearch
    ? Bookmark
    : folder === "focused" || folder === "other" || folder === "important" || folder === "snoozed" || folder === "muted" || folder.startsWith("custom:")
      ? Mail
      : folderIcons[folder as SystemFolder];
  const unread = messages.filter((message) => !message.is_read).length;
  const selectedReplySeed = selected
    ? {
        to:
          selected.direction === "inbound"
            ? selected.from_address
            : selected.to_addresses?.[0],
        subject: selected.subject.startsWith("Re:")
          ? selected.subject
          : `Re: ${selected.subject}`,
        text: `\n\n— Original message —\n${selected.text_body || selected.snippet}`,
        threadId: selected.thread_id,
        inReplyTo: selected.message_id_header || undefined,
        references: [selected.references_header, selected.message_id_header]
          .filter(Boolean)
          .join(" "),
      }
    : undefined;
  const selectedReplyAllSeed = selected
    ? {
        ...selectedReplySeed,
        to:
          selected.direction === "inbound"
            ? selected.from_address
            : selected.to_addresses.join(", "),
        cc: [
          ...(selected.cc_addresses || []),
          ...(selected.direction === "inbound" ? selected.to_addresses : []),
        ]
          .filter(
            (address) =>
              address.toLowerCase() !==
              (session.user.email || "").toLowerCase(),
          )
          .join(", "),
      }
    : undefined;
  const detailIdentity = selected
    ? detailIdentityForMessage(selected, contacts, mailboxes)
    : null;
  const selectedContact = detailIdentity ? contactFor(detailIdentity.email, contacts) : undefined;
  const orderedThreadMessages = useMemo(() => [...threadMessages].sort((left, right) => {
    const leftTime = Date.parse(left.received_at || left.sent_at || left.created_at || "") || 0;
    const rightTime = Date.parse(right.received_at || right.sent_at || right.created_at || "") || 0;
    return threadOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
  }), [threadMessages, threadOrder]);
  const hasMailSelection = selectedIds.size > 0 || selectAllResults;
  const customFolderDepth = (folderId: string): number => {
    let depth = 0;
    let parentId = folders.find((item) => item.id === folderId)?.parent_id || null;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId) && depth < 8) {
      visited.add(parentId);
      depth += 1;
      parentId = folders.find((item) => item.id === parentId)?.parent_id || null;
    }
    return depth;
  };
  function folderDropProps(target: ViewKey) {
    return {
      onDragOver: (event: DragEvent<HTMLButtonElement>) => event.preventDefault(),
      onDrop: (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const messageId = event.dataTransfer.getData("text/postveil-message");
        if (messageId) void moveDraggedMessage(target, messageId);
      },
    };
  }
  function handleRibbonTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, current: "home" | "view" | "file" | "help") {
    const tabs = ["home", "view", "file", "help"] as const;
    const index = tabs.indexOf(current);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    setRibbonTab(next);
    window.requestAnimationFrame(() => document.getElementById(`mail-ribbon-tab-${next}`)?.focus());
  }
  return (
    <div
      className={`outlook-viewport theme-${settings.theme || "light"} density-${settings.density || "comfortable"}`}
    >
      <header className="outlook-global-header" data-purpose="outlook-global-header">
        <div className="outlook-header-left">
          <button
            className="outlook-header-btn waffle-btn"
            title="App Launcher"
            onClick={() => setView(view === "mail" ? "calendar" : "mail")}
            aria-label="App Launcher"
          >
            <LayoutGrid size={18} />
          </button>
          <div className="outlook-header-brand">
            <BrandMark small />
            <span className="outlook-brand-name">Postveil</span>
          </div>
        </div>

        <div className="outlook-header-center">
          <div className="outlook-search-bar">
            <Search size={15} className="outlook-search-icon" />
            <input
              value={query}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchFocused(false);
                  setSearchHelpOpen(false);
                }
                if (event.key === "Enter") setSearchFocused(false);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveSavedSearchId(null);
                clearListSelection();
              }}
              placeholder="Search messages, people, or files"
              aria-label="Search"
            />
            {query ? (
              <button
                className="outlook-search-clear"
                onClick={() => {
                  setQuery("");
                  clearListSelection();
                }}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
            {searchFocused && searchSuggestions.length > 0 && (
              <div className="search-suggestions" role="listbox" aria-label="Search suggestions">
                <div className="search-suggestion-head"><span>Suggestions</span>{searchHistory.length > 0 && <button className="text-button" onClick={() => void clearSearchHistory()}>Clear history</button>}</div>
                {searchSuggestions.map((suggestion, index) => (
                  <button className="search-suggestion" key={`${suggestion.kind}-${suggestion.value}-${index}`} onClick={() => applySearchSuggestion(suggestion)} role="option">
                    <span className={`search-suggestion-kind kind-${suggestion.kind}`}>{suggestion.kind === "recent" ? <History size={13} /> : suggestion.kind === "saved" ? <Bookmark size={13} /> : suggestion.kind === "label" ? <Tag size={13} /> : <Search size={13} />}</span>
                    <span className="search-suggestion-copy"><strong>{suggestion.label}</strong>{suggestion.detail && <small>{suggestion.detail}</small>}</span>
                  </button>
                ))}
              </div>
            )}
            {searchHelpOpen && (
              <div className="search-help" aria-label="Search syntax documentation">
                <div className="search-help-head"><div><p className="eyebrow">SEARCH SYNTAX</p><strong>Find exactly what you need</strong></div><button className="icon-button" onClick={() => setSearchHelpOpen(false)} aria-label="Close search help"><X size={15} /></button></div>
                <div className="search-help-grid">
                  <code>from:alex@example.com</code><span>Sender</span><code>to:team@example.com</code><span>Recipient</span>
                  <code>subject:"launch plan"</code><span>Subject phrase</span><code>filename:invoice</code><span>Attachment name</span>
                  <code>type:pdf</code><span>File type</span><code>label:Projects</code><span>Label</span>
                  <code>in:sent domain:example.com</code><span>Folder or domain</span><code>auth:pass</code><span>Authentication</span>
                  <code>is:unread has:attachment</code><span>State and attachments</span><code>has:calendar has:work</code><span>Events and follow-ups</span>
                  <code>spam:&gt;70% links:&gt;0</code><span>Risk and links</span><code>after:7d larger:5MB</code><span>Date and size</span>
                  <code>work:reply_later project:launch</code><span>Work and project</span><code>without attachments this week</code><span>Natural language</span>
                </div>
                <small>Prefix any filter with <code>-</code> to exclude it. Use quotes for phrases. Export includes up to 5,000 matching results.</small>
              </div>
            )}
          </div>
        </div>

        <div className="outlook-header-right">
          <button
            className="outlook-header-btn"
            onClick={() => void loadMessages()}
            title="Refresh messages"
            aria-label="Refresh messages"
          >
            <RefreshCcw size={16} />
          </button>
          <button
            className="outlook-header-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
          >
            <Settings2 size={16} />
          </button>
          <button
            className="outlook-header-btn"
            onClick={() => {
              setRibbonTab("help");
            }}
            title="Help & syntax guide"
            aria-label="Help"
          >
            <HelpCircle size={16} />
          </button>
          <div
            className="outlook-user-avatar"
            onClick={() => setSettingsOpen(true)}
            title={session.user.email || "Account profile"}
            role="button"
            tabIndex={0}
          >
            {(session.user.email || "J").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      {/* OUTLOOK TOP RIBBON TOOLBAR */}
      <div className="mail-ribbon" aria-label="Mail ribbon">
        <div className="mail-ribbon-tabs" role="tablist" aria-label="Mail ribbon tabs">
          {(["file", "home", "view", "help"] as const).map((tabName) => (
            <button
              key={tabName}
              id={`mail-ribbon-tab-${tabName}`}
              className={`mail-ribbon-tab ${ribbonTab === tabName ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={ribbonTab === tabName}
              aria-controls={`mail-ribbon-panel-${tabName}`}
              tabIndex={ribbonTab === tabName ? 0 : -1}
              onClick={() => setRibbonTab(tabName)}
              onKeyDown={(event) => handleRibbonTabKeyDown(event, tabName)}
            >
              {tabName === "home" ? "Home" : tabName === "view" ? "View" : tabName === "file" ? "File" : "Help"}
            </button>
          ))}
          {hasMailSelection && (
            <span className="mail-ribbon-context-label">
              Selection tools · {selectAllResults ? `${resultTotal ?? "all"} matching` : `${selectedIds.size} selected`}
            </span>
          )}
        </div>

        {ribbonTab === "home" && (
          <div className="mail-ribbon-toolbar" id="mail-ribbon-panel-home" role="tabpanel" aria-labelledby="mail-ribbon-tab-home">
            {/* New Mail Split Button */}
            <div className="mail-ribbon-split-btn">
              <button
                className="mail-ribbon-command primary"
                onClick={() => openCompose()}
                title="New mail (c)"
              >
                <PenLine size={15} />
                <span>New mail</span>
              </button>
              <div className="mail-ribbon-dropdown-wrapper">
                <button
                  className="mail-ribbon-split-arrow"
                  onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "new-menu" ? null : "new-menu"); }}
                  title="New item options"
                  aria-label="New item options"
                >
                  <ChevronDown size={11} />
                </button>
                {activeDropdown === "new-menu" && (
                  <div className="mail-ribbon-dropdown-menu">
                    <button className="mail-ribbon-menu-item" onClick={() => { setActiveDropdown(null); openCompose(); }}>
                      <Mail size={14} color="#1f6b57" />
                      <span>Email message</span>
                    </button>
                    <button className="mail-ribbon-menu-item" onClick={() => { setActiveDropdown(null); setView("calendar"); }}>
                      <CalendarDays size={14} color="#1f6b57" />
                      <span>Calendar event</span>
                    </button>
                    <button className="mail-ribbon-menu-item" onClick={() => { setActiveDropdown(null); setView("tasks"); }}>
                      <ListTodo size={14} color="#1f6b57" />
                      <span>To Do task</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mail-ribbon-separator" />

            {/* Delete & Triage Group */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("trash");
                else if (selected) void mutateMessage({ folder: "trash" });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Delete message (# / Del)"
            >
              <Trash2 size={16} color="#ef4444" />
              <span>Delete</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("archive");
                else if (selected) void mutateMessage({ folder: "archive" });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Archive message (e)"
            >
              <Archive size={16} color="#1f6b57" />
              <span>Archive</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("spam");
                else if (selected) void mutateMessage({ folder: "spam" });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Report junk / phishing"
            >
              <ShieldAlert size={16} color="#f59e0b" />
              <span>Report</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (!selected && !hasMailSelection) return;
                const senderEmail = selected?.from_address;
                if (senderEmail) {
                  void runBulkAction("archive");
                  setBulkNotice(`Swept all recent emails from ${senderEmail}`);
                } else {
                  void runBulkAction("archive");
                }
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Sweep: Automatically clean up messages from this sender"
            >
              <Sparkles size={16} color="#1f6b57" />
              <span>Sweep</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Move & Categorize Group */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "move-menu" ? null : "move-menu"); }}
                disabled={(!hasMailSelection && !selected) || bulkBusy}
                title="Move to folder"
              >
                <FolderInput size={16} color="#1f6b57" />
                <span>Move to</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "move-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  {(["inbox", "archive", "spam", "trash"] as SystemFolder[]).map((f) => (
                    <button
                      key={f}
                      className="mail-ribbon-menu-item"
                      onClick={() => {
                        setActiveDropdown(null);
                        if (hasMailSelection) {
                          setBulkAction("move");
                          setBulkFolder(f);
                          void runBulkAction();
                        } else if (selected) {
                          void mutateMessage({ folder: f });
                        }
                      }}
                    >
                      <Folder size={14} />
                      <span>{folderNames[f]}</span>
                    </button>
                  ))}
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      className="mail-ribbon-menu-item"
                      onClick={() => {
                        setActiveDropdown(null);
                        if (hasMailSelection) {
                          setBulkAction("move");
                          setBulkFolder(`custom:${f.id}`);
                          void runBulkAction();
                        }
                      }}
                    >
                      <FolderPlus size={14} />
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "categorize-menu" ? null : "categorize-menu"); }}
                disabled={(!hasMailSelection && !selected) || bulkBusy}
                title="Categorize message"
              >
                <Tag size={16} color="#1f6b57" />
                <span>Categorize</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "categorize-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  {labels.length > 0 ? (
                    labels.map((lbl) => (
                      <button
                        key={lbl.id}
                        className="mail-ribbon-menu-item"
                        onClick={() => {
                          setActiveDropdown(null);
                          if (hasMailSelection) {
                            setBulkAction("label");
                            setBulkLabelId(lbl.id);
                            void runBulkAction();
                          }
                        }}
                      >
                        <Tag size={13} color={lbl.color || "#1f6b57"} />
                        <span>{lbl.name}</span>
                      </button>
                    ))
                  ) : (
                    <span className="mail-ribbon-menu-empty">No categories yet (create in Settings)</span>
                  )}
                </div>
              )}
            </div>

            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "snooze-menu" ? null : "snooze-menu"); }}
                disabled={(!hasMailSelection && !selected) || bulkBusy}
                title="Snooze email"
              >
                <Clock3 size={16} color="#6366f1" />
                <span>Snooze</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "snooze-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button
                    className="mail-ribbon-menu-item"
                    onClick={() => {
                      setActiveDropdown(null);
                      const later = new Date();
                      later.setHours(18, 0, 0, 0);
                      if (hasMailSelection) void runBulkAction("snooze");
                      else if (selected) void mutateMessage({ snoozedUntil: later.toISOString() });
                    }}
                  >
                    <Clock3 size={14} />
                    <span>Later today (6:00 PM)</span>
                  </button>
                  <button
                    className="mail-ribbon-menu-item"
                    onClick={() => {
                      setActiveDropdown(null);
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      tomorrow.setHours(9, 0, 0, 0);
                      if (hasMailSelection) void runBulkAction("snooze");
                      else if (selected) void mutateMessage({ snoozedUntil: tomorrow.toISOString() });
                    }}
                  >
                    <Clock3 size={14} />
                    <span>Tomorrow morning (9:00 AM)</span>
                  </button>
                  <button
                    className="mail-ribbon-menu-item"
                    onClick={() => {
                      setActiveDropdown(null);
                      const nextWeek = new Date();
                      nextWeek.setDate(nextWeek.getDate() + 7);
                      nextWeek.setHours(9, 0, 0, 0);
                      if (hasMailSelection) void runBulkAction("snooze");
                      else if (selected) void mutateMessage({ snoozedUntil: nextWeek.toISOString() });
                    }}
                  >
                    <Clock3 size={14} />
                    <span>Next week (Monday 9:00 AM)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("mark_unread");
                else if (selected) void mutateMessage({ isRead: !selected.is_read });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title={selected?.is_read ? "Mark as unread (u)" : "Mark as read (u)"}
            >
              <MailOpen size={16} color="#1f6b57" />
              <span>{selected?.is_read ? "Unread" : "Read"}</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (hasMailSelection) void runBulkAction("flag");
                else if (selected) void mutateMessage({ isStarred: !selected.is_starred });
              }}
              disabled={(!hasMailSelection && !selected) || bulkBusy}
              title="Flag or star message (s)"
            >
              <Flag size={16} color={selected?.is_starred ? "#ef4444" : "#6b7280"} />
              <span>{selected?.is_starred ? "Flagged" : "Flag"}</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (selected) void mutateMessage({ isPinned: !selected.is_pinned });
              }}
              disabled={!selected || bulkBusy}
              title="Pin message to top"
            >
              <Pin size={16} color={selected?.is_pinned ? "#1f6b57" : "#6b7280"} />
              <span>{selected?.is_pinned ? "Pinned" : "Pin"}</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Respond Group */}
            <button
              className="mail-ribbon-command"
              onClick={() => selectedReplySeed && openCompose(selectedReplySeed)}
              disabled={!selected}
              title="Reply to sender (r)"
            >
              <Reply size={16} color="#1f6b57" />
              <span>Reply</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => selectedReplyAllSeed && openCompose(selectedReplyAllSeed)}
              disabled={!selected}
              title="Reply to all recipients (a)"
            >
              <ReplyAll size={16} color="#1f6b57" />
              <span>Reply all</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if (!selected) return;
                openCompose({
                  to: selected.to_addresses?.[0],
                  subject: selected.subject.startsWith("Fwd:") ? selected.subject : `Fwd: ${selected.subject}`,
                  text: `\n\n— Forwarded message —\nFrom: ${selected.from_name ? `${selected.from_name} <${selected.from_address}>` : selected.from_address}\nSubject: ${selected.subject}\n\n${selected.text_body || selected.snippet}`,
                });
              }}
              disabled={!selected}
              title="Forward message (f)"
            >
              <Forward size={16} color="#1f6b57" />
              <span>Forward</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Utilities */}
            <button
              className="mail-ribbon-command"
              onClick={() => void undoBulkAction()}
              disabled={!bulkUndo || bulkBusy}
              title={bulkUndo ? `Undo ${bulkUndo.label}` : "Nothing to undo"}
            >
              <Undo2 size={16} color="#6b7280" />
              <span>Undo</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => window.print()}
              title="Print message (Ctrl+P)"
            >
              <Printer size={16} color="#4b5563" />
              <span>Print</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => void loadMessages()}
              title="Sync mailbox"
            >
              <RefreshCcw size={16} color="#1f6b57" />
              <span>Sync</span>
            </button>
          </div>
        )}

        {ribbonTab === "view" && (
          <div className="mail-ribbon-toolbar mail-ribbon-view-panel" id="mail-ribbon-panel-view" role="tabpanel" aria-labelledby="mail-ribbon-tab-view">
            {/* View settings */}
            <button
              className="mail-ribbon-command"
              onClick={() => setSettingsOpen(true)}
              title="Open view settings"
            >
              <Settings2 size={16} color="#1f6b57" />
              <span>View settings</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                clearListSelection();
                setQuery("");
                setFilter("all");
                setSort("newest");
                setReadingPanePosition("right");
                setFolderPaneCollapsed(false);
                void updateSettings({ density: "comfortable" });
                void loadMessages();
              }}
              title="Reset view to default"
            >
              <RotateCcw size={16} color="#6b7280" />
              <span>Reset view</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Layout Group */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "reading-pane-menu" ? null : "reading-pane-menu"); }}
                title="Configure reading pane layout"
              >
                <Columns size={16} color="#1f6b57" />
                <span>Reading pane: {readingPanePosition === "right" ? "Right" : readingPanePosition === "bottom" ? "Bottom" : "Off"}</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "reading-pane-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button
                    className={`mail-ribbon-menu-item ${readingPanePosition === "right" ? "is-selected" : ""}`}
                    onClick={() => { setReadingPanePosition("right"); setActiveDropdown(null); }}
                  >
                    <PanelRight size={14} />
                    <span>Show on the right</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${readingPanePosition === "bottom" ? "is-selected" : ""}`}
                    onClick={() => { setReadingPanePosition("bottom"); setActiveDropdown(null); }}
                  >
                    <Columns size={14} />
                    <span>Show at the bottom</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${readingPanePosition === "off" ? "is-selected" : ""}`}
                    onClick={() => { setReadingPanePosition("off"); setActiveDropdown(null); }}
                  >
                    <Eye size={14} />
                    <span>Hide (list only)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              className={`mail-ribbon-command ${folderPaneCollapsed ? "is-active" : ""}`}
              onClick={() => setFolderPaneCollapsed(!folderPaneCollapsed)}
              title={folderPaneCollapsed ? "Expand folder pane" : "Collapse folder pane"}
            >
              <PanelLeft size={16} color="#1f6b57" />
              <span>Folder pane</span>
            </button>

            <button
              className={`mail-ribbon-command ${filter === "all" ? "" : "is-active"}`}
              onClick={() => setFilter(filter === "all" ? "unread" : "all")}
              title="Toggle Focused vs Unread mailbox view"
            >
              <Inbox size={16} color="#1f6b57" />
              <span>Focused inbox</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Density Group */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "density-menu" ? null : "density-menu"); }}
                title="Message list display density"
              >
                <LayoutGrid size={16} color="#1f6b57" />
                <span>Density: {settings.density || "comfortable"}</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "density-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button
                    className={`mail-ribbon-menu-item ${settings.density === "comfortable" ? "is-selected" : ""}`}
                    onClick={() => { void updateSettings({ density: "comfortable" }); setActiveDropdown(null); }}
                  >
                    <span>Comfortable</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${settings.density === "compact" ? "is-selected" : ""}`}
                    onClick={() => { void updateSettings({ density: "compact" }); setActiveDropdown(null); }}
                  >
                    <span>Compact</span>
                  </button>
                  <button
                    className={`mail-ribbon-menu-item ${settings.density === "spacious" ? "is-selected" : ""}`}
                    onClick={() => { void updateSettings({ density: "spacious" }); setActiveDropdown(null); }}
                  >
                    <span>Spacious</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sort */}
            <div className="mail-ribbon-dropdown-wrapper">
              <button
                className="mail-ribbon-command"
                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === "sort-menu" ? null : "sort-menu"); }}
                title="Sort messages"
              >
                <ArrowUpDown size={16} color="#1f6b57" />
                <span>{sort === "newest" ? "Newest on top" : "Oldest on top"}</span>
                <ChevronDown size={11} />
              </button>
              {activeDropdown === "sort-menu" && (
                <div className="mail-ribbon-dropdown-menu">
                  <button className="mail-ribbon-menu-item" onClick={() => { setSort("newest"); setActiveDropdown(null); }}>
                    <span>Newest on top</span>
                  </button>
                  <button className="mail-ribbon-menu-item" onClick={() => { setSort("oldest"); setActiveDropdown(null); }}>
                    <span>Oldest on top</span>
                  </button>
                </div>
              )}
            </div>

            {/* Filter */}
            <div className="mail-ribbon-group" aria-label="Filter messages">
              <span className="mail-ribbon-group-label">Show</span>
              {([
                { value: "all", label: "All" },
                { value: "unread", label: "Unread" },
                { value: "starred", label: "Flagged" },
                { value: "attachments", label: "Files" },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`mail-ribbon-command mail-ribbon-filter ${filter === item.value ? "is-active" : ""}`}
                  onClick={() => { clearListSelection(); setFilter(item.value); }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mail-ribbon-separator" />

            {/* Dark mode */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                const nextTheme = settings.theme === "dark" ? "light" : "dark";
                void updateSettings({ theme: nextTheme });
              }}
              title="Toggle Light / Dark mode"
            >
              {settings.theme === "dark" ? <Sun size={16} color="#f59e0b" /> : <Moon size={16} color="#1f6b57" />}
              <span>{settings.theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>
        )}

        {ribbonTab === "file" && (
          <div className="mail-ribbon-toolbar mail-ribbon-file-panel" id="mail-ribbon-panel-file" role="tabpanel" aria-labelledby="mail-ribbon-tab-file">
            {/* Account info card */}
            <div className="mail-ribbon-account-card">
              <div className="mail-ribbon-account-avatar">
                {(session.user.email || "P").slice(0, 1).toUpperCase()}
              </div>
              <div className="mail-ribbon-account-details">
                <strong>{session.user.email}</strong>
                <span>Postveil Sovereign Edge · AWS SES (ap-southeast-1)</span>
              </div>
            </div>

            <div className="mail-ribbon-separator" />

            {/* Account & Administration Commands */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setSettingsInitialTab("appearance");
                setSettingsOpen(true);
              }}
              title="Open mailbox settings"
            >
              <Settings2 size={16} color="#1f6b57" />
              <span>Account settings</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setSettingsInitialTab("mailboxes");
                setSettingsOpen(true);
              }}
              title="Manage custom domains and DNS"
            >
              <Globe2 size={16} color="#1f6b57" />
              <span>Custom domains</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setSettingsInitialTab("automation");
                setSettingsOpen(true);
              }}
              title="Inbox rules and automated filters"
            >
              <SlidersHorizontal size={16} color="#1f6b57" />
              <span>Rules & alerts</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => setDiagnosticsModalOpen(true)}
              title="Inspect storage & edge metrics"
            >
              <HardDrive size={16} color="#1f6b57" />
              <span>Storage & quota</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => void runBulkAction("export")}
              disabled={!hasMailSelection || bulkBusy}
              title="Export selected messages as JSON"
            >
              <Download size={16} color="#1f6b57" />
              <span>Export mail</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => window.print()}
              title="Print view or messages"
            >
              <Printer size={16} color="#4b5563" />
              <span>Print</span>
            </button>
            <button
              className="mail-ribbon-command danger"
              onClick={() => void requireSupabase().auth.signOut()}
              title="Sign out of Postveil"
            >
              <LogOut size={16} color="#ef4444" />
              <span>Sign out</span>
            </button>
          </div>
        )}

        {ribbonTab === "help" && (
          <div className="mail-ribbon-toolbar mail-ribbon-help-panel" id="mail-ribbon-panel-help" role="tabpanel" aria-labelledby="mail-ribbon-tab-help">
            {/* Help & Learning */}
            <button
              className="mail-ribbon-command"
              onClick={() => {
                setRibbonTab("home");
                setSearchFocused(true);
                setSearchHelpOpen(true);
              }}
              title="Open search syntax and help guide"
            >
              <HelpCircle size={16} color="#1f6b57" />
              <span>Help guide</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => setShortcutsModalOpen(true)}
              title="Keyboard shortcuts cheat sheet"
            >
              <Keyboard size={16} color="#1f6b57" />
              <span>Keyboard shortcuts</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Diagnostics & Health */}
            <button
              className="mail-ribbon-command"
              onClick={() => setDiagnosticsModalOpen(true)}
              title="View live connection diagnostics"
            >
              <Activity size={16} color="#1f6b57" />
              <span>System diagnostics</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                if ("serviceWorker" in navigator) {
                  void navigator.serviceWorker.getRegistrations().then((regs) => {
                    for (const r of regs) void r.update();
                  });
                }
                window.location.reload();
              }}
              title="Check for updates and reload latest assets"
            >
              <RefreshCcw size={16} color="#1f6b57" />
              <span>Check for updates</span>
            </button>

            <div className="mail-ribbon-separator" />

            {/* Product & Feedback */}
            <button
              className="mail-ribbon-command"
              onClick={() => setWhatsNewModalOpen(true)}
              title="See what's new in Postveil"
            >
              <Sparkles size={16} color="#1f6b57" />
              <span>What's new</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => {
                window.open("https://github.com/jamesfontanilla/Postveil/issues", "_blank");
              }}
              title="Submit feedback or report an issue"
            >
              <Send size={16} color="#1f6b57" />
              <span>Feedback</span>
            </button>
            <button
              className="mail-ribbon-command"
              onClick={() => setDiagnosticsModalOpen(true)}
              title="About Postveil sovereign mail client"
            >
              <Info size={16} color="#1f6b57" />
              <span>About Postveil</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. MAIN WORKSPACE WITH APP RAIL + APP SHELL */}
      <div className="outlook-main-container">
        {/* NARROW 48px APP RAIL */}
        <nav className="outlook-app-rail" aria-label="App Navigation" data-purpose="app-rail">
          <button
            className={`outlook-rail-btn ${view === "mail" ? "active" : ""}`}
            onClick={() => setView("mail")}
            title="Mail"
          >
            <Mail size={18} />
          </button>
          <button
            className={`outlook-rail-btn ${view === "calendar" ? "active" : ""}`}
            onClick={() => setView("calendar")}
            title="Calendar"
          >
            <CalendarDays size={18} />
          </button>
          <button
            className={`outlook-rail-btn ${view === "tasks" ? "active" : ""}`}
            onClick={() => setView("tasks")}
            title="To Do"
          >
            <ListTodo size={18} />
            {workSummary.total > 0 && <span className="outlook-rail-badge">{workSummary.total}</span>}
          </button>
          <button
            className="outlook-rail-btn"
            onClick={() => {
              setView("mail");
              setFilter("attachments");
            }}
            title="P-Drive / Files"
          >
            <HardDrive size={18} />
          </button>

          <div className="outlook-rail-divider" />

          <button
            className="outlook-rail-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings2 size={18} />
          </button>
        </nav>

        {/* Existing app-shell begins here */}
        <main
          className={`app-shell${selected ? " mobile-message-open" : ""}`}
        >
      <header className="mobile-topbar">
        <button
          className="icon-button"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label="Open navigation"
          aria-expanded={mobileNav}
          aria-controls="mailbox-navigation"
        >
          <Menu size={20} />
        </button>
        <div className="mini-brand">
          <span>P</span> Postveil
        </div>
        <div className="mobile-topbar-actions">
          <button
            className={`icon-button ${mobileSearchOpen ? "is-active" : ""}`}
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            aria-label="Search mail"
            title="Search mail"
          >
            <Search size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => void loadMessages()}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCcw size={17} />
          </button>
          <button
            className="icon-button mobile-compose-btn"
            onClick={() => openCompose()}
            aria-label="New message"
            title="New message"
          >
            <PenLine size={18} />
          </button>
        </div>
      </header>
      {mobileSearchOpen && (
        <div className="mobile-search-strip">
          <Search size={15} color="#6b7280" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail..."
            aria-label="Search mail query"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className="icon-button mobile-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="icon-button mobile-search-close"
              onClick={() => setMobileSearchOpen(false)}
              aria-label="Close search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {mobileNav && <button className="mobile-nav-backdrop" type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <aside id="mailbox-navigation" className={`sidebar ${mobileNav ? "mobile-visible" : ""} ${folderPaneCollapsed && !mobileNav ? "folder-pane-collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="brand-lockup">
            <BrandMark small />
            <div>
              <strong>Postveil</strong>
              <span>private mail</span>
            </div>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="compose-button"
          onClick={() => {
            openCompose();
            setMobileNav(false);
          }}
        >
          <PenLine size={17} /> Compose
        </button>
        <nav className="folder-nav" aria-label="Mailbox folders">
          <button
            className={`folder-link ${view === "mail" && folder === "inbox" ? "active" : ""}`}
            {...folderDropProps("inbox")}
            onClick={() => openMailFolder("inbox")}
          >
            <Inbox size={17} />
            <span>Inbox</span>
            {inboxUnreadCount > 0 && <em>{inboxUnreadCount}</em>}
          </button>
          <button
            className={`folder-link ${view === "mail" && folder === "focused" ? "active" : ""}`}
            {...folderDropProps("focused")}
            onClick={() => openMailFolder("focused")}
          >
            <Eye size={17} />
            <span>Focused</span>
          </button>
          <button
            className={`folder-link ${view === "mail" && folder === "other" ? "active" : ""}`}
            {...folderDropProps("other")}
            onClick={() => openMailFolder("other")}
          >
            <Mail size={17} />
            <span>Other</span>
          </button>
          {(
            ["sent", "drafts", "archive", "trash", "spam", "quarantine"] as SystemFolder[]
          ).map((item) => {
            const Icon = folderIcons[item];
            return (
              <button
                key={item}
                className={`folder-link ${view === "mail" && folder === item ? "active" : ""}`}
                {...folderDropProps(item)}
                onClick={() => openMailFolder(item)}
              >
                <Icon size={17} />
                <span>{folderNames[item]}</span>
              </button>
            );
          })}
          {folders.map((customFolder) => (
            <button
              key={customFolder.id}
              className={`folder-link ${view === "mail" && folder === `custom:${customFolder.id}` ? "active" : ""}`}
              style={{ paddingLeft: `${16 + customFolderDepth(customFolder.id) * 18}px` }}
              {...folderDropProps(`custom:${customFolder.id}`)}
              onClick={() => openMailFolder(`custom:${customFolder.id}`)}
            >
              <Tag size={17} color={customFolder.color} />
              <span>{customFolder.name}</span>
            </button>
          ))}
          {(["important", "snoozed", "muted"] as const).map((item) => (
            <button
              key={item}
              className={`folder-link ${view === "mail" && folder === item ? "active" : ""}`}
              {...folderDropProps(item)}
              onClick={() => openMailFolder(item)}
            >
              {item === "important" ? <Flag size={17} /> : item === "snoozed" ? <Clock3 size={17} /> : <Bell size={17} />}
              <span>{item === "important" ? "Important" : item === "snoozed" ? "Snoozed" : "Muted"}</span>
            </button>
          ))}
        </nav>
        <section className="saved-searches" aria-label="Saved searches">
          <div className="saved-search-head">
            <span className="eyebrow">SAVED SEARCHES</span>
            <button
              className="icon-button compact-icon"
              onClick={() => setSavedSearchFormOpen((current) => !current)}
              aria-label="Create saved search"
              title="Create saved search from the current query"
            >
              <Plus size={15} />
            </button>
          </div>
          {savedSearchFormOpen && (
            <div className="saved-search-form">
              <input
                value={savedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
                placeholder="Search name"
                aria-label="Saved search name"
                maxLength={80}
              />
              <small>{query.trim() ? `Saves: ${query.trim()}` : "Type a query first"}</small>
              <button className="primary-button" onClick={() => void createSavedSearch()} disabled={savedSearchBusy || !query.trim()}>
                {savedSearchBusy ? "Saving…" : "Save search"}
              </button>
            </div>
          )}
          <div className="saved-search-list">
            {savedSearches.map((saved) => (
              <div className={`saved-search-row ${activeSavedSearchId === saved.id ? "active" : ""}`} key={saved.id}>
                <button className="saved-search-link" onClick={() => openSavedSearch(saved)} title={saved.query}>
                  <Bookmark size={15} color={saved.color} />
                  <span>{saved.name}</span>
                  <em>{saved.result_count ?? "—"}</em>
                </button>
                <div className="saved-search-controls">
                  <button className="icon-button compact-icon" onClick={() => void reorderSavedSearch(saved, -1)} aria-label={`Move ${saved.name} up`} title="Move up"><ArrowUp size={12} /></button>
                  <button className="icon-button compact-icon" onClick={() => void reorderSavedSearch(saved, 1)} aria-label={`Move ${saved.name} down`} title="Move down"><ArrowDown size={12} /></button>
                  <button className="icon-button compact-icon" onClick={() => void renameSavedSearch(saved)} aria-label={`Rename ${saved.name}`} title="Rename"><Pencil size={12} /></button>
                  <button className="icon-button compact-icon danger-icon" onClick={() => void deleteSavedSearch(saved)} aria-label={`Delete ${saved.name}`} title="Delete"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            {savedSearches.length === 0 && !savedSearchFormOpen && <small className="saved-search-empty">Save a query here for one-click access.</small>}
          </div>
        </section>
        <div className="sidebar-divider" />
        <nav className="folder-nav secondary-nav">
          <button
            className={
              view === "calendar" ? "active folder-link" : "folder-link"
            }
            onClick={() => setView("calendar")}
          >
            <CalendarDays size={17} />
            <span>Calendar</span>
          </button>
          <button
            className={view === "tasks" ? "active folder-link" : "folder-link"}
            onClick={() => setView("tasks")}
          >
            <Briefcase size={17} />
            <span>Work</span>
            {workSummary.total > 0 && <em className="nav-count">{workSummary.total}</em>}
            {workSummary.overdue > 0 && <em className="nav-overdue">{workSummary.overdue} due</em>}
          </button>
          <button
            className="folder-link"
            onClick={() => {
              setSettingsOpen(true);
              setMobileNav(false);
            }}
          >
            <Settings size={17} />
            <span>Settings</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="account-chip">
          <div className="avatar">
            {(session.user.email || "J").slice(0, 1).toUpperCase()}
          </div>
          <div className="account-text">
            <strong>{displayName(session.user.email || "James")}</strong>
            <span>{session.user.email}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => void requireSupabase().auth.signOut()}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {view === "mail" ? (
        <div className={`mail-workspace ${selected ? "is-reading-message" : ""}`}>
          <div className="mail-columns">
          <section className="message-column">
            <div className="column-head">
              <div>
                <p className="eyebrow">INBOX VIEW</p>
                <h1>
                  <CurrentIcon size={22} /> {currentLabel}
                </h1>
              </div>
              <div className="head-actions">
                {folder === "trash" && (
                  <button
                    className="secondary-button trash-empty-button"
                    onClick={() => void emptyTrash()}
                    disabled={trashBusy || messages.length === 0}
                    title="Permanently delete every message in Trash"
                  >
                    <Trash2 size={14} /> Empty trash
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={() => void loadMessages()}
                  aria-label="Refresh messages"
                >
                  <RefreshCcw size={17} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Settings"
                >
                  <Settings2 size={17} />
                </button>
              </div>
            </div>
            <div className="message-list-toolbar" aria-label="Message list filters">
              <div className="search-filter-row" aria-label="Quick search filters">
                {[{ value: "all", label: "All mail" }, { value: "unread", label: "Unread" }, { value: "starred", label: "Starred" }, { value: "attachments", label: "Attachments" }].map((item) => (
                  <button key={item.value} type="button" className={`search-chip ${filter === item.value ? "active" : ""}`} onClick={() => { clearListSelection(); setFilter(item.value); }} aria-pressed={filter === item.value}>{item.label}</button>
                ))}
                {query.trim() && normalizedQuery && <span className="search-status-copy">Query: {query.trim()} ({resultTotal ?? 0})</span>}
              </div>
              <div className="message-list-sort-actions">
                <select
                  value={sort}
                  onChange={(event) => {
                    clearListSelection();
                    setSort(event.target.value);
                  }}
                  aria-label="Sort messages"
                  className="message-list-sort-select"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <button className="icon-button compact-icon" onClick={() => void downloadSearchResults("csv")} aria-label="Export search results" title="Export CSV"><Download size={15} /></button>
              </div>
            </div>
             <div className={`sync-status sync-${liveState}`} role="status" aria-live="polite">
              <span className="sync-dot" />
              {liveState === "live" ? "Live updates" : liveState === "connecting" ? "Connecting to live updates…" : liveState === "reconnecting" ? "Reconnecting…" : "Polling for updates"}
            </div>
            {error && <div className="inline-error">{error}</div>}
            {!loading && messages.length > 0 && (
              <div className="selection-bar" aria-label="Message selection controls">
                <label>
                  <input
                    type="checkbox"
                    checked={selectAllResults || messages.every((message) => selectedIds.has(message.id))}
                    onChange={(event) => event.target.checked ? selectCurrentPage() : clearListSelection()}
                    aria-label="Select all messages on this page"
                  />
                  <span>Select page</span>
                </label>
                <span className="selection-count">{resultTotal ?? messages.length} result{(resultTotal ?? messages.length) === 1 ? "" : "s"}</span>
                {selectedIds.size > 0 && !selectAllResults && <button className="text-button" onClick={clearListSelection}>Clear</button>}
                {query.trim() && !selectAllResults && selectedIds.size === messages.length && resultTotal !== null && resultTotal > messages.length && (
                  <button className="text-button selection-all-button" onClick={() => setSelectAllResults(true)}>Select all {resultTotal} results</button>
                )}
                {selectAllResults && <span className="selection-all-label">All matching results selected</span>}
              </div>
            )}
            {bulkNotice && (
              <div className="inline-notice" role="status" aria-live="polite">
                <span>{bulkNotice}</span>
                {bulkUndo && <button className="text-button" onClick={() => void undoBulkAction()}>{bulkUndo.label}</button>}
              </div>
            )}
            <div className="message-list">
              {loading ? (
                <div className="list-empty">
                  <div className="pulse-dot" />
                  <p>Gathering your mail…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="list-empty">
                  <div className="empty-glyph">
                    <Mail size={22} />
                  </div>
                  <h3>
                    {folder === "trash"
                      ? "Trash is empty"
                      : currentLabel === "Inbox"
                      ? "A quiet inbox"
                      : `No mail in ${currentLabel.toLowerCase()}`}
                  </h3>
                  <p>
                    {folder === "trash"
                      ? "Deleted messages stay here until you restore or permanently remove them."
                      : "New messages and saved rules will appear here."}
                  </p>
                  {folder !== "trash" && (
                    <button className="text-button" onClick={() => openCompose()}>
                      Write the first message
                    </button>
                  )}
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-row ${selectedId === message.id ? "selected" : ""} ${selectedIds.has(message.id) ? "bulk-selected" : ""} ${message.is_read ? "read" : "unread"} ${draggedMessageId === message.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/postveil-message", message.id);
                      setDraggedMessageId(message.id);
                    }}
                    onDragEnd={() => setDraggedMessageId(null)}
                    onClick={() => void openMessage(message)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openMessage(message);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <input
                      className="message-select-checkbox"
                      type="checkbox"
                      checked={selectedIds.has(message.id) || selectAllResults}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleMessageSelection(message.id)}
                      aria-label={`Select ${message.subject || "message"}`}
                    />
                    {(() => {
                      const sender = senderForMessage(message, contacts, mailboxes);
                      return <SenderAvatar name={sender.name} email={sender.email} avatarUrl={sender.avatarUrl} />;
                    })()}
                    <div className="row-copy">
                      <div className="row-top">
                        <strong>
                          {message.direction === "inbound"
                            ? senderForMessage(message, contacts, mailboxes).name
                            : `To ${senderForMessage(message, contacts, mailboxes).name}`}
                        </strong>
                        <time>
                          {formatDate(
                            message.received_at ||
                              message.sent_at ||
                              message.created_at,
                          )}
                        </time>
                      </div>
                      <div className="row-address">
                        {senderForMessage(message, contacts, mailboxes).email}
                      </div>
                      <div className="row-subject">
                        {message.subject || "(no subject)"}
                        {message.status !== "received" && (
                          <span className={`message-status message-status-${message.status}`}>
                            {messageStatusLabel(message)}
                          </span>
                        )}
                        {message.has_attachment && <Paperclip size={13} />}
                        {message.is_pinned && (
                          <Pin size={13} fill="currentColor" />
                        )}
                        {message.is_important && <Flag size={13} fill="currentColor" />}
                        {message.is_muted && <span className="message-state-pill">Muted</span>}
                        {message.reminder_at && <Bell size={13} />}
                      </div>
                      <p>{message.snippet || "No preview available."}</p>
                    </div>
                    {message.spam_score && message.spam_score >= 0.35 ? (
                      <span className="score-badge">
                        {Math.round(message.spam_score * 100)}%
                      </span>
                    ) : null}
                    {message.is_starred && (
                      <Star
                        className="row-star"
                        size={15}
                        fill="currentColor"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
            {!loading && hasMore && (
              <button className="load-more-button" onClick={() => void loadMessages(folder, false, page + 1, true)} disabled={bulkBusy}>
                Load more{resultTotal !== null ? ` · ${Math.max(resultTotal - messages.length, 0)} remaining` : ""}
              </button>
            )}
          </section>
          <section
            className={`reading-pane ${readingPanePosition === "bottom" ? "reading-pane-bottom" : readingPanePosition === "off" ? "reading-pane-hidden" : ""}`}
            tabIndex={0}
            aria-label="Reading pane"
          >
            {!selected ? (
              <div className="reading-empty">
                <div className="empty-glyph large">
                  <Mail size={30} />
                </div>
                <p>Select a message to read it here.</p>
                <span>Your inbox, without the noise.</span>
              </div>
            ) : (
              <article key={selected.id} className={`message-detail ${detailLoading ? "is-detail-loading" : ""}`} aria-busy={detailLoading}>
                <div className="detail-head">
                  <div>
                    <button className="mobile-detail-back" type="button" onClick={closeSelectedMessage}>
                      <ArrowLeft size={15} aria-hidden="true" /> Back to messages
                    </button>
                    <h2>{selected.subject || "(no subject)"}</h2>
                    <div className="detail-meta">
                      {selected.spam_score !== undefined && selected.spam_score >= 0.35 && (
                        <span>Spam risk {Math.round(selected.spam_score * 100)}%</span>
                      )}
                      {selected.is_important && <span className="detail-status-accent">Important</span>}
                      {selected.is_muted && <span>Muted</span>}
                      {selected.legal_hold && <span className="detail-status-accent">Legal hold</span>}
                      {labels.map((label) => (
                        <button
                          key={label.id}
                          className="label-chip"
                          onClick={() => void assignLabel(label.id)}
                          style={{ borderColor: label.color, color: label.color }}
                        >
                          <Tag size={12} /> {label.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="outlook-subject-actions">
                    <button
                      className="icon-button"
                      title={selected.is_pinned ? "Unpin message" : "Pin message"}
                      onClick={() => void mutateMessage({ isPinned: !selected.is_pinned })}
                      aria-label={selected.is_pinned ? "Unpin message" : "Pin message"}
                    >
                      <Pin size={16} fill={selected.is_pinned ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="icon-button"
                      title="Print message"
                      onClick={() => window.print()}
                      aria-label="Print message"
                    >
                      <Printer size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Open in new window"
                      onClick={() => openInNewWindow(selected)}
                      aria-label="Open in new window"
                    >
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </div>

                {detailLoading && (
                  <div className="detail-loading" role="status" aria-live="polite">
                    <span className="detail-loading-dot" /> Updating message…
                  </div>
                )}

                {selected.folder === "trash" && (
                  <div className="trash-notice" role="status">
                    <Trash2 size={15} />
                    <span>This message is in Trash. Restore it to its previous folder or delete it permanently.</span>
                  </div>
                )}

                <div className="outlook-banners-group">
                  {selected.direction === "inbound" && selected.from_address && !mailboxes.some((mb) => selected.from_address.toLowerCase().endsWith(mb.address.toLowerCase().split("@")[1] || "")) && (
                    <div className="outlook-banner outlook-banner-external">
                      <div className="outlook-banner-content">
                        <AlertTriangle size={15} color="#f7630c" />
                        <span><strong>CAUTION:</strong> This email originated from outside your organization. Do not click links or open attachments unless you recognize the sender.</span>
                      </div>
                    </div>
                  )}
                  {selected.unsubscribe_url && /^(https?:\/\/|mailto:)/i.test(selected.unsubscribe_url) && (
                    <div className="outlook-banner outlook-banner-privacy">
                      <div className="outlook-banner-content">
                        <span>Getting too much email? You can unsubscribe from this sender.</span>
                      </div>
                      <a className="outlook-banner-btn" href={selected.unsubscribe_url} target="_blank" rel="noreferrer noopener">
                        Unsubscribe
                      </a>
                    </div>
                  )}
                </div>

                <div className="sender-line">
                  {detailIdentity && <SenderAvatar name={detailIdentity.name} email={detailIdentity.email} avatarUrl={detailIdentity.avatarUrl} large />}
                  <div className="sender-copy">
                    <div className="sender-title-row">
                      <strong>{detailIdentity?.name || selected.from_address}</strong>
                      <button
                        type="button"
                        className="sender-trust-badge"
                        onClick={() => void toggleTrustLens()}
                        title="Trust & Privacy: Inspect sender verification (SPF, DKIM, DMARC) and tracker protection"
                        aria-label="Inspect Trust and Privacy details"
                      >
                        <ShieldCheck size={13} className="trust-badge-icon" />
                        <span>Trust &amp; Privacy</span>
                      </button>
                    </div>
                    <div className="recipient-row">
                      <span>To: {selected.to_addresses?.join(", ") || "you"}</span>
                      <button
                        className="details-chevron-btn"
                        onClick={() => setShowMessageDetails((current) => !current)}
                        title={showMessageDetails ? "Hide full message details" : "View full message details"}
                        aria-expanded={showMessageDetails}
                      >
                        <ChevronDown size={13} className={showMessageDetails ? "rotated" : ""} />
                      </button>
                    </div>
                    {showMessageDetails && (
                      <dl className="sender-details">
                        <div><dt>From</dt><dd>{detailIdentity?.email || selected.from_address || "Not available"}</dd></div>
                        <div><dt>To</dt><dd>{selected.to_addresses?.join(", ") || "Not available"}</dd></div>
                        {selected.cc_addresses && selected.cc_addresses.length > 0 && <div><dt>CC</dt><dd>{selected.cc_addresses.join(", ")}</dd></div>}
                        {selected.bcc_addresses && selected.bcc_addresses.length > 0 && <div><dt>BCC</dt><dd>{selected.bcc_addresses.join(", ")}</dd></div>}
                        {selected.reply_to && <div><dt>Reply-To</dt><dd>{selected.reply_to}</dd></div>}
                        <div><dt>Date</dt><dd>{new Date(selected.received_at || selected.sent_at || selected.created_at).toLocaleString()}</dd></div>
                        <div><dt>Message ID</dt><dd>{selected.message_id_header || "Not available"}</dd></div>
                      </dl>
                    )}
                  </div>
                  <time className="sender-time" dateTime={selected.received_at || selected.sent_at || selected.created_at}>
                    {formatDate(selected.received_at || selected.sent_at || selected.created_at)}
                  </time>
                  <div className="message-header-actions" aria-label="Quick message actions" style={{ position: "relative" }}>
                    <button
                      className="message-header-action"
                      onClick={() => setShowReactions((prev) => !prev)}
                      aria-label="React"
                      title="React to message"
                    >
                      <Smile size={16} />
                    </button>
                    {showReactions && (
                      <div className="outlook-reaction-flyout">
                        {["👍", "❤️", "👏", "😂", "😮", "🎉"].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setMessageReactions((prev) => ({ ...prev, [selected.id]: emoji }));
                              setShowReactions(false);
                            }}
                            title={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="message-header-action" onClick={() => openCompose(selectedReplySeed)} aria-label="Reply" title="Reply">
                      <Reply size={16} />
                    </button>
                    <button className="message-header-action" onClick={() => openCompose(selectedReplyAllSeed)} aria-label="Reply all" title="Reply all">
                      <Users size={16} />
                    </button>
                    <button className="message-header-action" onClick={() => openCompose(selectedReplySeed ? { ...selectedReplySeed, subject: selectedReplySeed.subject.startsWith("Fwd:") ? selectedReplySeed.subject : `Fwd: ${selectedReplySeed.subject}`, to: selected.from_address, cc: "" } : undefined)} aria-label="Forward" title="Forward">
                      <Forward size={16} />
                    </button>
                    <button
                      className="message-header-action"
                      onClick={() => {
                        setShowMoreActions((current) => !current);
                        setMoreSubmenu(null);
                      }}
                      aria-expanded={showMoreActions}
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {showMoreActions && (
                      <>
                        <div
                          className="fluent-menu-backdrop"
                          onClick={() => {
                            setShowMoreActions(false);
                            setMoreSubmenu(null);
                          }}
                        />
                        <div className="fluent-menu" role="menu">
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ isRead: !selected.is_read }); }}
                          >
                            <Eye size={15} /> <span>{selected.is_read ? "Mark unread" : "Mark as read"}</span>
                          </button>
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ isFlagged: !selected.is_flagged }); }}
                          >
                            <Flag size={15} fill={selected.is_flagged ? "currentColor" : "none"} /> <span>{selected.is_flagged ? "Unflag" : "Flag"}</span>
                          </button>
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ isPinned: !selected.is_pinned }); }}
                          >
                            <Pin size={15} fill={selected.is_pinned ? "currentColor" : "none"} /> <span>{selected.is_pinned ? "Unpin" : "Pin"}</span>
                          </button>
                          {selected.folder !== "trash" && (
                            <>
                              <button
                                role="menuitem"
                                className="fluent-menu-item"
                                onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void mutateMessage({ folder: "archive" }); }}
                              >
                                <Archive size={15} /> <span>Archive</span>
                              </button>
                              <button
                                role="menuitem"
                                className="fluent-menu-item danger"
                                onClick={() => {
                                  setShowMoreActions(false);
                                  setMoreSubmenu(null);
                                  void (async () => {
                                    if (await confirm({ title: "Move message to Trash?", message: "You can restore this message later.", confirmLabel: "Move to Trash", danger: true })) {
                                      void mutateMessage({ folder: "trash" });
                                    }
                                  })();
                                }}
                              >
                                <Trash2 size={15} /> <span>Delete</span>
                              </button>
                            </>
                          )}
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); window.print(); }}
                          >
                            <Printer size={15} /> <span>Print</span>
                          </button>

                          <div className="fluent-menu-divider" />

                          {/* Security options flyout submenu */}
                          <div
                            className="fluent-submenu-wrap"
                            onMouseEnter={() => setMoreSubmenu("security")}
                            onMouseLeave={() => setMoreSubmenu((curr) => (curr === "security" ? null : curr))}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className={`fluent-menu-item fluent-submenu-trigger${moreSubmenu === "security" ? " active" : ""}`}
                              onClick={() => setMoreSubmenu((curr) => (curr === "security" ? null : "security"))}
                              aria-expanded={moreSubmenu === "security"}
                            >
                              <span className="fluent-menu-item-content">
                                <ShieldAlert size={15} /> <span>Security options</span>
                              </span>
                              <ChevronRight size={14} className="chevron-right" />
                            </button>
                            {moreSubmenu === "security" && (
                              <div className="fluent-submenu" role="menu">
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void blockSelectedSender("address"); }}
                                >
                                  <ShieldAlert size={15} /> <span>Block sender</span>
                                </button>
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void blockSelectedSender("domain"); }}
                                >
                                  <ShieldAlert size={15} /> <span>Block domain</span>
                                </button>
                                <div className="fluent-menu-divider" />
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void submitSpamFeedback(selected.folder === "spam" ? "not_spam" : "spam"); }}
                                >
                                  <ShieldAlert size={15} /> <span>{selected.folder === "spam" ? "Not junk" : "Report junk"}</span>
                                </button>
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void reportSelectedMessage("phishing"); }}
                                >
                                  <AlertTriangle size={15} /> <span>Report phishing</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* View flyout submenu */}
                          <div
                            className="fluent-submenu-wrap"
                            onMouseEnter={() => setMoreSubmenu("view")}
                            onMouseLeave={() => setMoreSubmenu((curr) => (curr === "view" ? null : curr))}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className={`fluent-menu-item fluent-submenu-trigger${moreSubmenu === "view" ? " active" : ""}`}
                              onClick={() => setMoreSubmenu((curr) => (curr === "view" ? null : "view"))}
                              aria-expanded={moreSubmenu === "view"}
                            >
                              <span className="fluent-menu-item-content">
                                <FileText size={15} /> <span>View</span>
                              </span>
                              <ChevronRight size={14} className="chevron-right" />
                            </button>
                            {moreSubmenu === "view" && (
                              <div className="fluent-submenu" role="menu">
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); void openRawSource(); }}
                                >
                                  <Download size={15} /> <span>View raw source</span>
                                </button>
                                <button
                                  role="menuitem"
                                  className="fluent-menu-item"
                                  onClick={() => { setShowMoreActions(false); setMoreSubmenu(null); openInNewWindow(selected); }}
                                >
                                  <ExternalLink size={15} /> <span>Open in new window</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="fluent-menu-divider" />

                          {/* Conversation actions */}
                          <button
                            role="menuitem"
                            className="fluent-menu-item"
                            onClick={() => {
                              setShowMoreActions(false);
                              setMoreSubmenu(null);
                              void mutateThread({ isIgnored: !selected.is_ignored, isMuted: !selected.is_muted });
                            }}
                          >
                            <Bell size={15} /> <span>{selected.is_ignored ? "Stop ignoring conversation" : "Ignore conversation"}</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {messageReactions[selected.id] && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f3f2f1", border: "1px solid #edebe9", borderRadius: 12, padding: "2px 8px", fontSize: 13, marginTop: 4, alignSelf: "flex-start" }}>
                    <span>{messageReactions[selected.id]}</span>
                    <span style={{ fontSize: 11, color: "#616161" }}>1</span>
                  </div>
                )}

                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="outlook-attachment-well">
                    <div className="outlook-attachment-head">
                      <span>Attachments ({selected.attachments.length})</span>
                      {selected.attachments.length > 1 && (
                        <button className="outlook-download-all-btn" onClick={() => void downloadAllAttachments(selected.id)}>
                          <Download size={13} /> Download all
                        </button>
                      )}
                    </div>
                    <div className="outlook-attachment-grid">
                      {selected.attachments.map((attachment) => {
                        const ext = attachment.filename.split(".").pop()?.toUpperCase() || "FILE";
                        const badgeColor = ext === "PDF" ? "#d83b01" : ["DOC", "DOCX"].includes(ext) ? "#0078d4" : ["XLS", "XLSX", "CSV"].includes(ext) ? "#107c41" : ["PNG", "JPG", "JPEG", "GIF"].includes(ext) ? "#5c2d91" : "#605e5c";
                        return (
                          <div className="outlook-attachment-card" key={attachment.id}>
                            <div className="outlook-file-badge" style={{ background: badgeColor }}>
                              {ext.slice(0, 4)}
                            </div>
                            <div className="outlook-attachment-meta">
                              <strong title={attachment.filename}>{attachment.filename}</strong>
                              <small>{formatBytes(attachment.byte_size)}</small>
                            </div>
                            <div className="outlook-card-actions">
                              {attachment.preview_state === "ready" && (
                                <button title="Preview attachment" onClick={() => void previewAttachment(attachment.id)}>
                                  <Eye size={14} />
                                </button>
                              )}
                              <button title="Download attachment" onClick={() => void openAttachment(attachment.id)}>
                                <Download size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="body-copy body-copy-rich">
                  <RichEmailBody
                    htmlBody={selected.html_body}
                    textBody={selected.text_body}
                    fallback={selected.snippet}
                    inlineImageUrls={inlineImageUrls}
                    loadRemoteImages={loadRemoteImages}
                    loadExternalImage={loadExternalEmailImage}
                    inspectLink={inspectEmailLink}
                  />
                </div>

                {threadMessages.length > 1 && (
                  <div className="conversation-section">
                    <div className="conversation-head">
                      <span>{threadMessages.length} messages in this conversation</span>
                    </div>
                    {!showAllThreadMessages && (
                      <button
                        className="thread-expand"
                        onClick={() => setShowAllThreadMessages(true)}
                      >
                        <ChevronDown size={15} /> Show {threadMessages.length - 1} earlier messages
                      </button>
                    )}
                    <div className="thread-stack">
                      {(showAllThreadMessages ? orderedThreadMessages : [selected]).map((threadMessage) => (
                        <button
                          key={threadMessage.id}
                          className={threadMessage.id === selected.id ? "active" : ""}
                          onClick={() => void openMessage(threadMessage)}
                        >
                          <span>{senderForMessage(threadMessage, contacts, mailboxes).name}</span>
                          <strong>{threadMessage.snippet || threadMessage.subject || "No preview available."}</strong>
                          <small>
                            {formatDate(threadMessage.received_at || threadMessage.sent_at || threadMessage.created_at)}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="outlook-quick-reply-dock">
                  {selected.direction === "outbound" && ["queued", "scheduled"].includes(selected.status) && !selected.cancelled_at ? (
                    <button className="secondary-button danger-button" onClick={() => void cancelSelectedSend()}>
                      <Undo2 size={15} /> Cancel send
                    </button>
                  ) : selected.folder === "trash" ? (
                    <div className="outlook-quick-reply-buttons">
                      <button
                        className="outlook-quick-reply-btn primary"
                        onClick={() => void restoreSelected()}
                        disabled={trashBusy}
                      >
                        <Undo2 size={15} /> Restore
                      </button>
                      <button
                        className="outlook-quick-reply-btn"
                        onClick={() => void permanentlyDeleteSelected()}
                        disabled={trashBusy}
                      >
                        <Trash2 size={15} /> Delete forever
                      </button>
                    </div>
                  ) : (
                    <div className="outlook-quick-reply-buttons">
                      <button className="outlook-quick-reply-btn primary" onClick={() => openCompose(selectedReplySeed)}>
                        <Reply size={15} /> Reply
                      </button>
                      <button className="outlook-quick-reply-btn" onClick={() => openCompose(selectedReplyAllSeed)}>
                        <Users size={15} /> Reply all
                      </button>
                      <button className="outlook-quick-reply-btn" onClick={() => openCompose(selectedReplySeed ? { ...selectedReplySeed, subject: selectedReplySeed.subject.startsWith("Fwd:") ? selectedReplySeed.subject : `Fwd: ${selectedReplySeed.subject}`, to: selected.from_address, cc: "" } : undefined)}>
                        <Forward size={15} /> Forward
                      </button>
                    </div>
                  )}
                </div>

                <TrustLensModal
                  open={trustLensOpen}
                  onClose={() => setTrustLensOpen(false)}
                  trustData={trustData}
                  busy={trustLensBusy}
                />

              </article>
            )}
          </section>
          </div>
        </div>
      ) : (
        <Workspace
          mode={view}
          tasks={tasks}
          events={events}
          workItems={workItems}
          workSummary={workSummary}
          onOpenMessage={(message) => void openMessage(message)}
          onRefresh={() => {
            void loadWorkspace();
          }}
        />
      )}
      {composeOpen && (
        <Compose
          mailboxes={mailboxes}
          signatures={signatures}
          contacts={contacts}
          undoSeconds={settings.send_undo_seconds ?? 0}
          seed={composeSeed}
          onClose={() => {
            setComposeOpen(false);
            setComposeSeed(undefined);
          }}
          onSent={() => {
            void loadMessages("sent");
          }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          session={session}
          settings={settings}
          folders={folders}
          labels={labels}
          mailboxes={mailboxes}
          rules={rules}
          senderPolicies={senderPolicies}
          initialTab={settingsInitialTab}
          onClose={() => setSettingsOpen(false)}
          onOpenMessage={(message) => void openMessage(message)}
          loadRemoteImages={loadRemoteImages}
          onLoadRemoteImagesChange={updateRemoteImagePreference}
          onChanged={() => {
            void loadMeta();
          }}
        />
      )}

      <KeyboardShortcutsModal open={shortcutsModalOpen} onClose={() => setShortcutsModalOpen(false)} />

      <DiagnosticsModal open={diagnosticsModalOpen} onClose={() => setDiagnosticsModalOpen(false)} userEmail={session.user.email} />

      <WhatsNewModal open={whatsNewModalOpen} onClose={() => setWhatsNewModalOpen(false)} />
        </main>
      </div>
    </div>
  );
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [showPublicHome, setShowPublicHome] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [emailVerificationNotice, setEmailVerificationNotice] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    const initialize = async () => {
      const currentUrl = new URL(window.location.href);
      const oauthAttempt = currentUrl.searchParams.has("oauth_code") || currentUrl.searchParams.has("oauth_error");
      if (oauthAttempt) {
        // OAuth callbacks must never fall through to the marketing page. Keep
        // the user in the sign-in surface while the one-time handoff resolves.
        setAuthMode("signin");
        setShowPublicHome(false);
      }
      const verificationToken = currentUrl.searchParams.get("verify_email");
      if (verificationToken) {
        try {
          const result = await publicApiFetch<{ message?: string }>(`/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`);
          setEmailVerificationNotice(result.message || "Email address verified. You can now sign in.");
        } catch (verificationError) {
          setEmailVerificationNotice(verificationError instanceof Error ? verificationError.message : "This verification link is invalid or expired");
        }
        currentUrl.searchParams.delete("verify_email");
        window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
        setAuthMode("signin");
        setShowPublicHome(false);
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) setShowPublicHome(false);
      if (oauthAttempt && (sessionError || !data.session)) {
        setAuthMode("signin");
        setEmailVerificationNotice("Google sign-in could not be completed. Please try again.");
        setShowPublicHome(false);
      }
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const token = currentUrl.searchParams.get("recovery");
      setRecoveryToken(token);
      setRecovering(Boolean(token) || hashParams.get("type") === "recovery");
      setReady(true);
    };
    void initialize();
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
        if (event === "SIGNED_IN") setShowPublicHome(false);
        if (event === "SIGNED_OUT") {
          setRecovering(false);
          setMfaRequired(false);
          setMfaSetupRequired(false);
          setShowPublicHome(true);
        }
        setSession(nextSession);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || recovering || !supabase) {
      setMfaRequired(false);
      setMfaSetupRequired(false);
      return;
    }
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (active && !error) {
        setMfaRequired(data.currentLevel === "aal1" && data.nextLevel === "aal2");
        setMfaSetupRequired(data.setupRequired === true);
      }
    });
    return () => { active = false; };
  }, [session, recovering]);
  useEffect(() => {
    if (!session) {
      setOnboardingChecked(false);
      setOnboardingRequired(false);
      return;
    }
    let active = true;
    setOnboardingChecked(false);
    void Promise.all([
      apiFetch<JsonRecord>("/api/settings"),
      apiFetch<Mailbox[]>("/api/mailboxes"),
    ]).then(([settings, mailboxes]) => {
      if (!active) return;
      const state = settings.onboarding_state && typeof settings.onboarding_state === "object" ? settings.onboarding_state as OnboardingState : null;
      // A completed flag alone is not enough: an account without a mailbox
      // must always return to the domain onboarding wizard. This also repairs
      // sessions created before the first mailbox is provisioned.
      setOnboardingRequired(state?.completed !== true || mailboxes.length === 0);
    }).catch(() => {
      // Fail closed for a signed-in account: if readiness cannot be checked,
      // keep the user in onboarding instead of exposing an unusable mailbox.
      if (active) setOnboardingRequired(true);
    }).finally(() => {
      if (active) setOnboardingChecked(true);
    });
    return () => { active = false; };
  }, [session]);
  if (!ready)
    return (
      <div className="loading-screen">
        <BrandMark />
        <p>Loading Postveil…</p>
      </div>
    );
  if (recovering) return <PasswordResetScreen token={recoveryToken} onComplete={() => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("recovery");
    window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    setRecoveryToken(null);
    setRecovering(false);
    setShowPublicHome(false);
    setAuthMode("signin");
  }} />;
  if (!session) return showPublicHome
    ? <PublicHome onSignIn={() => { setAuthMode("signin"); setShowPublicHome(false); }} onSignUp={() => { setAuthMode("signup"); setShowPublicHome(false); }} />
    : <AuthScreen initialMode={authMode} initialNotice={emailVerificationNotice} onBack={() => setShowPublicHome(true)} />;
  if (mfaSetupRequired) return <MfaSetupRequiredScreen onVerified={() => { setMfaSetupRequired(false); setMfaRequired(false); }} />;
  if (mfaRequired) return <MfaChallengeScreen onVerified={() => setMfaRequired(false)} />;
  if (!onboardingChecked) return <div className="loading-screen"><BrandMark /><p>Preparing your private desk…</p></div>;
  if (onboardingRequired) return <OnboardingWizard session={session} onComplete={() => setOnboardingRequired(false)} />;
  return <MailboxApp session={session} />;
}

export default function App() {
  return (
    <AppDialogProvider>
      <AppContent />
    </AppDialogProvider>
  );
}
