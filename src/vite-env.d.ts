/// <reference types="vite/client" />

interface TurnstileWidgetOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

interface Window {
  turnstile?: {
    render: (container: HTMLElement, options: TurnstileWidgetOptions) => string;
    reset: (widgetId?: string) => void;
    remove?: (widgetId?: string) => void;
  };
}
