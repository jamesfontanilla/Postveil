import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";
import type { AppDialogOptions, AppPromptOptions } from "../types/mail";

type AppDialogRequest =
  | {
      kind: "confirm";
      title: string;
      message: ReactNode;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
    }
  | {
      kind: "prompt";
      title: string;
      message: ReactNode;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      defaultValue: string;
      placeholder: string;
      inputType: "text" | "number" | "password" | "email";
    };

type AppDialogResult = boolean | string | null;

type AppDialogContextValue = {
  confirm: (options: AppDialogOptions) => Promise<boolean>;
  prompt: (options: AppPromptOptions) => Promise<string | null>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("The Postveil dialog system is unavailable");
  return context;
}

function AppDialog({
  dialog,
  onResolve,
}: {
  dialog: AppDialogRequest | null;
  onResolve: (value: AppDialogResult) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!dialog) return;
    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setValue(dialog.kind === "prompt" ? dialog.defaultValue : "");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        "input:not([disabled]), button:not([disabled])",
      );
      firstFocusable?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousActiveRef.current && document.contains(previousActiveRef.current)) previousActiveRef.current.focus();
    };
  }, [dialog]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onResolve(dialog.kind === "prompt" ? null : false);
      return;
    }
    if (dialog.kind === "prompt" && event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      onResolve(value);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "input:not([disabled]), button:not([disabled])",
      ) ?? [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!dialog) return null;
  const darkThemeActive = typeof document !== "undefined" && Boolean(document.querySelector(".theme-dark"));
  return (
    <div className={`app-dialog-backdrop${darkThemeActive ? " theme-dark-dialog" : ""}`} role="presentation">
      <section
        ref={dialogRef}
        className={`app-dialog${dialog.danger ? " app-dialog-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="postveil-dialog-title"
        aria-describedby="postveil-dialog-message"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="app-dialog-icon" aria-hidden="true">
          <AlertTriangle size={21} />
        </div>
        <div className="app-dialog-copy">
          <p className="app-dialog-kicker">{dialog.danger ? "CONFIRM ACTION" : "CHECK THIS FIRST"}</p>
          <h2 id="postveil-dialog-title">{dialog.title}</h2>
          <div id="postveil-dialog-message">{dialog.message}</div>
          {dialog.kind === "prompt" && (
            <input
              className="app-dialog-input"
              type={dialog.inputType}
              value={value}
              placeholder={dialog.placeholder}
              onChange={(event) => setValue(event.target.value)}
              aria-label={typeof dialog.title === "string" ? dialog.title : "Input"}
            />
          )}
        </div>
        <div className="app-dialog-actions">
          <button className="secondary-button" type="button" onClick={() => onResolve(dialog.kind === "prompt" ? null : false)}>
            {dialog.cancelLabel}
          </button>
          <button
            className={dialog.danger ? "app-dialog-danger-button" : "primary-button"}
            type="button"
            onClick={() => onResolve(dialog.kind === "prompt" ? value : true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AppDialogRequest | null>(null);
  const resolverRef = useRef<((value: AppDialogResult) => void) | null>(null);

  const resolveDialog = useCallback((value: AppDialogResult) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(value);
  }, []);

  const confirm = useCallback(
    (options: AppDialogOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = (value) => resolve(value === true);
        setDialog({
          kind: "confirm",
          title: options.title || "Are you sure?",
          message: options.message,
          confirmLabel: options.confirmLabel || "Continue",
          cancelLabel: options.cancelLabel || "Cancel",
          danger: options.danger ?? false,
        });
      }),
    [],
  );

  const prompt = useCallback(
    (options: AppPromptOptions) =>
      new Promise<string | null>((resolve) => {
        resolverRef.current?.(null);
        resolverRef.current = (value) => resolve(typeof value === "string" ? value : null);
        setDialog({
          kind: "prompt",
          title: options.title || "Enter a value",
          message: options.message,
          confirmLabel: options.confirmLabel || "Save",
          cancelLabel: options.cancelLabel || "Cancel",
          danger: options.danger ?? false,
          defaultValue: options.defaultValue || "",
          placeholder: options.placeholder || "",
          inputType: options.inputType || "text",
        });
      }),
    [],
  );

  useEffect(
    () => () => {
      resolverRef.current?.(null);
      resolverRef.current = null;
    },
    [],
  );

  const contextValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);
  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      <AppDialog dialog={dialog} onResolve={resolveDialog} />
    </AppDialogContext.Provider>
  );
}
