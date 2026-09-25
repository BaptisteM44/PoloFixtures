"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { domToCanvas } from "modern-screenshot";

// Le bucket R2 public (et l'ancien Supabase) n'envoie pas d'en-têtes CORS :
// ces images sont relues via /_next/image, même origine, où ces domaines sont
// déjà autorisés (remotePatterns).
const PROXIED_HOSTS = /(\.r2\.dev|\.r2\.cloudflarestorage\.com|\.supabase\.co)$/;

async function fetchViaProxy(url: string): Promise<string | false> {
  let parsed: URL;
  try { parsed = new URL(url, window.location.href); } catch { return false; }
  if (!PROXIED_HOSTS.test(parsed.hostname)) return false;
  const res = await fetch(`/_next/image?url=${encodeURIComponent(parsed.href)}&w=1080&q=90`);
  if (!res.ok) return false;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(blob);
  });
}

/**
 * Rend la carte telle que le navigateur l'affiche (SVG foreignObject), puis
 * ajoute le filigrane. Exporté pour pouvoir être testé hors du bouton.
 */
export async function captureCardBlob(el: HTMLElement): Promise<Blob | null> {
  // Le tilt (souris / scroll mobile) est posé en style inline sur la racine.
  const originalTransform = el.style.transform;
  el.style.transform = "none";
  let canvas: HTMLCanvasElement;
  try {
    canvas = await domToCanvas(el, {
      scale: 2,
      backgroundColor: null,
      fetchFn: fetchViaProxy,
      timeout: 15000,
    });
  } finally {
    el.style.transform = originalTransform;
  }

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const pad = 10 * 2;
    ctx.font = `600 ${13 * 2}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText("poloperator.com", canvas.width - pad, canvas.height - pad);
    ctx.shadowBlur = 0;
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

type Props = {
  /** Ref to the card DOM element to capture */
  cardRef: React.RefObject<HTMLDivElement | null>;
  playerName: string;
};

export function ShareCardButton({ cardRef, playerName }: Props) {
  const t = useTranslations("player");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    return captureCardBlob(cardRef.current);
  }, [cardRef]);

  const handleShare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await capture();
      if (!blob) {
        setError(t("share_card_error"));
        return;
      }

      const fileName = `${playerName.replace(/\s+/g, "-")}-polo-card.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      // Try native share (mobile → Instagram, WhatsApp, etc.)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: t("share_card_title"),
          files: [file],
        });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      // User cancelled share sheet — not an error
      if ((err as Error).name !== "AbortError") {
        console.error("Share failed:", err);
        setError(t("share_card_error"));
      }
    } finally {
      setLoading(false);
    }
  }, [capture, playerName, t]);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <button
        onClick={handleShare}
        disabled={loading}
        className="btn btn--outline"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        {loading ? "..." : t("share_card")}
      </button>
      {error && <span style={{ fontSize: 11, color: "var(--danger, #e53)", marginTop: 2 }}>{error}</span>}
    </div>
  );
}
