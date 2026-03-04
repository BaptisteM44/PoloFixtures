import { useEffect, useRef } from "react";

/**
 * Empêche l'écran de s'éteindre tant que `active` est true.
 * Réactif : si l'onglet revient au premier plan, relance le lock.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }
    if (typeof window === "undefined" || !("wakeLock" in navigator)) return;

    const request = async () => {
      try {
        lockRef.current = await (navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      } catch {
        // Navigateur ne supporte pas ou permission refusée
      }
    };

    request();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
