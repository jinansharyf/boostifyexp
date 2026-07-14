import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Share, Download } from "lucide-react";
import { useSystemSettings } from "@/components/site/system-settings-provider";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "pwa-install-dismissed";
const INSTALLED_KEY = "pwa-install-installed";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  const touchPoints = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && touchPoints > 1);
}

function isSafariLike() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  if ((window.navigator as unknown as Record<string, unknown>).standalone === true) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function PwaInstallPrompt() {
  const settings = useSystemSettings();
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (localStorage.getItem(INSTALLED_KEY)) return;

    const ios = isIOS();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as unknown as BeforeInstallPromptEvent;
      setIosMode(false);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onAppInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "true");
      setVisible(false);
    };
    window.addEventListener("appinstalled", onAppInstalled);

    // On iOS, show custom instruction after a short delay if no native prompt fired
    const timer = setTimeout(() => {
      if (!deferredRef.current && ios) {
        setIosMode(true);
        setVisible(true);
      }
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = deferredRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "true");
    }
    deferredRef.current = null;
    setVisible(false);
  }, []);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
  }, []);

  if (!visible) return null;

  const logoUrl = settings.logo_url || "/__l5e/assets-v1/8a7ec683-440e-4754-9047-33cb3e6257df/boostify-logo.png";
  const appName = settings.site_name || "Boostify";
  const needsSafari = iosMode && !isSafariLike();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="mx-auto flex max-w-lg flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xl">
        <div className="flex items-start gap-4">
          <img
            src={logoUrl}
            alt={appName}
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
          <div className="flex-1">
            <h3 className="font-semibold leading-tight">
              {iosMode ? `Add ${appName} to your Home Screen` : `Install ${appName}`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {iosMode
                ? needsSafari
                  ? "Open this page in Safari, tap Share, then choose Add to Home Screen."
                  : "Tap Share in Safari, then choose Add to Home Screen for quick access."
                : "Get a faster, app-like experience with one tap."}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Not now
          </Button>
          {iosMode ? (
            <Button size="sm" onClick={handleDismiss} className="gap-1.5">
              <Share className="h-3.5 w-3.5" />
              Got it
            </Button>
          ) : (
            <Button size="sm" onClick={handleInstall} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
