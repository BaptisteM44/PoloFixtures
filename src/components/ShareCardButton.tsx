"use client";

import { useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import html2canvas from "html2canvas-pro";

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

    // Reset 3D transforms before capture
    const el = cardRef.current;
    const originalStyle = el.style.cssText;
    el.style.transform = "none";

    // Force all images to load with crossOrigin before capture
    const images = el.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) { resolve(); return; }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );

    const canvas = await html2canvas(el, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: 2,
      imageTimeout: 8000,
    });

    el.style.cssText = originalStyle;

    // Watermark poloperator.com en bas de la carte
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const pad = 10 * 2; // scale 2
      const fontSize = 13 * 2;
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      // Halo blanc pour lisibilité sur fond sombre ou clair
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillText("poloperator.com", canvas.width - pad, canvas.height - pad);
      ctx.shadowBlur = 0;
    }

    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png")
    );
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
