"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
};

// Card photo zone ratio: 340 wide × 200 tall → 17:10
const CROP_W = 320;
const CROP_H = Math.round(CROP_W * (200 / 340)); // ≈ 188
const OUTPUT_W = 680;
const OUTPUT_H = Math.round(OUTPUT_W * (200 / 340));

export function ImageCropModal({ file, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  /** Effective image dimensions after rotation */
  const effectiveDims = useCallback(
    (img: HTMLImageElement, rot: number) => {
      const swapped = rot === 90 || rot === 270;
      return {
        w: swapped ? img.naturalHeight : img.naturalWidth,
        h: swapped ? img.naturalWidth : img.naturalHeight,
      };
    },
    []
  );

  const minScale = useCallback(
    (img: HTMLImageElement, rot: number) => {
      const { w, h } = effectiveDims(img, rot);
      return Math.max(CROP_W / w, CROP_H / h);
    },
    [effectiveDims]
  );

  const clampOffset = useCallback(
    (ox: number, oy: number, s: number, img: HTMLImageElement, rot: number) => {
      const { w, h } = effectiveDims(img, rot);
      const iw = w * s;
      const ih = h * s;
      const maxX = Math.max(0, (iw - CROP_W) / 2);
      const maxY = Math.max(0, (ih - CROP_H) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    [effectiveDims]
  );

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const initScale = minScale(img, 0);
      setScale(initScale);
      setOffset({ x: 0, y: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file, minScale]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CROP_W, CROP_H);
    ctx.save();
    ctx.translate(CROP_W / 2 + offset.x, CROP_H / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);

    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();

    // Guide lines
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = (CROP_W / 3) * i;
      const y = (CROP_H / 3) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CROP_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CROP_W, y); ctx.stroke();
    }
    // Border
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CROP_W - 2, CROP_H - 2);
  }, [scale, offset, rotation]);

  // Rotate 90° CW
  const rotate = () => {
    const img = imgRef.current;
    if (!img) return;
    const nextRot = (rotation + 90) % 360;
    const ms = minScale(img, nextRot);
    const nextScale = Math.max(ms, scale);
    const clamped = clampOffset(0, 0, nextScale, img, nextRot);
    setRotation(nextRot);
    setScale(nextScale);
    setOffset(clamped);
  };

  // Mouse
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag.current || !imgRef.current) return;
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, scale, imgRef.current, rotation));
    },
    [scale, rotation, clampOffset]
  );
  const onMouseUp = () => { drag.current = null; };

  // Wheel zoom
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const img = imgRef.current;
      if (!img) return;
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      const ms = minScale(img, rotation);
      const next = Math.max(ms, Math.min(scale * delta, ms * 8));
      setScale(next);
      setOffset((o) => clampOffset(o.x, o.y, next, img, rotation));
    },
    [scale, rotation, minScale, clampOffset]
  );

  // Touch
  const getTouchDist = (e: React.TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      drag.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    } else if (e.touches.length === 2) {
      drag.current = null;
      pinch.current = { dist: getTouchDist(e), scale };
    }
  };
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const img = imgRef.current;
      if (!img) return;
      if (e.touches.length === 1 && drag.current) {
        const dx = e.touches[0].clientX - drag.current.startX;
        const dy = e.touches[0].clientY - drag.current.startY;
        setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, scale, img, rotation));
      } else if (e.touches.length === 2 && pinch.current) {
        const dist = getTouchDist(e);
        const ms = minScale(img, rotation);
        const next = Math.max(ms, Math.min(pinch.current.scale * (dist / pinch.current.dist), ms * 8));
        setScale(next);
        setOffset((o) => clampOffset(o.x, o.y, next, img, rotation));
      }
    },
    [scale, rotation, minScale, clampOffset]
  );
  const onTouchEnd = () => { drag.current = null; pinch.current = null; };

  // Export
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    const out = document.createElement("canvas");
    out.width = OUTPUT_W;
    out.height = OUTPUT_H;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    const ratio = OUTPUT_W / CROP_W;
    ctx.save();
    ctx.translate(OUTPUT_W / 2 + offset.x * ratio, OUTPUT_H / 2 + offset.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    const iw = img.naturalWidth * scale * ratio;
    const ih = img.naturalHeight * scale * ratio;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();

    out.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/webp", 0.9);
  };

  const sliderVal = (() => {
    const img = imgRef.current;
    if (!img) return 0;
    const ms = minScale(img, rotation);
    const maxS = ms * 8;
    return Math.round(((scale - ms) / (maxS - ms)) * 100);
  })();

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg-panel)", borderRadius: 16,
          padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          maxWidth: 380, width: "100%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 15 }}>
          Recadrer la photo
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Glisse pour déplacer · pinch ou molette pour zoomer
        </p>

        {/* Canvas preview */}
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#111" }}>
          <canvas
            ref={canvasRef}
            width={CROP_W}
            height={CROP_H}
            style={{ display: "block", cursor: "grab", touchAction: "none", userSelect: "none", maxWidth: "100%" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Zoom slider */}
        <input
          type="range"
          min={0}
          max={100}
          value={sliderVal}
          onChange={(e) => {
            const img = imgRef.current;
            if (!img) return;
            const ms = minScale(img, rotation);
            const maxS = ms * 8;
            const next = ms + (Number(e.target.value) / 100) * (maxS - ms);
            setScale(next);
            setOffset((o) => clampOffset(o.x, o.y, next, img, rotation));
          }}
          style={{ width: "100%" }}
        />

        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button type="button" className="ghost" style={{ flex: 1 }} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="ghost" style={{ padding: "8px 16px" }} onClick={rotate} title="Pivoter 90°">
            ↻ 90°
          </button>
          <button type="button" className="primary" style={{ flex: 1 }} onClick={handleConfirm}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
