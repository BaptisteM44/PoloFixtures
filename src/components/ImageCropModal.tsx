"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
};

const SIZE = 300; // canvas display size (square crop)
const OUTPUT_SIZE = 600; // output resolution

export function ImageCropModal({ file, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // pan + zoom state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // drag state (mouse + touch)
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  // pinch state
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const clampOffset = useCallback(
    (ox: number, oy: number, s: number, img: HTMLImageElement) => {
      const iw = img.naturalWidth * s;
      const ih = img.naturalHeight * s;
      const maxX = Math.max(0, (iw - SIZE) / 2);
      const maxY = Math.max(0, (ih - SIZE) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      };
    },
    []
  );

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Initial scale: fit the shortest side to SIZE
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      const initScale = SIZE / minSide;
      setScale(initScale);
      setOffset({ x: 0, y: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file]);

  // Draw on canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);
    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    const drawX = (SIZE - iw) / 2 + offset.x;
    const drawY = (SIZE - ih) / 2 + offset.y;
    ctx.drawImage(img, drawX, drawY, iw, ih);

    // Overlay: darken outside circle
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Circle border
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [scale, offset]);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag.current || !imgRef.current) return;
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, scale, imgRef.current));
    },
    [scale, clampOffset]
  );
  const onMouseUp = () => { drag.current = null; };

  // Wheel zoom
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const img = imgRef.current;
      if (!img) return;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const minScale = SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      const next = Math.max(minScale, Math.min(scale * delta, minScale * 8));
      const clamped = clampOffset(offset.x, offset.y, next, img);
      setScale(next);
      setOffset(clamped);
    },
    [scale, offset, clampOffset]
  );

  // Touch events
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
        setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, scale, img));
      } else if (e.touches.length === 2 && pinch.current) {
        const dist = getTouchDist(e);
        const minScale = SIZE / Math.min(img.naturalWidth, img.naturalHeight);
        const next = Math.max(minScale, Math.min(pinch.current.scale * (dist / pinch.current.dist), minScale * 8));
        const clamped = clampOffset(offset.x, offset.y, next, img);
        setScale(next);
        setOffset(clamped);
      }
    },
    [scale, offset, clampOffset]
  );

  const onTouchEnd = () => { drag.current = null; pinch.current = null; };

  // Export cropped circle as square PNG
  const handleConfirm = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / SIZE;
    const iw = img.naturalWidth * scale * ratio;
    const ih = img.naturalHeight * scale * ratio;
    const drawX = (OUTPUT_SIZE - iw) / 2 + offset.x * ratio;
    const drawY = (OUTPUT_SIZE - ih) / 2 + offset.y * ratio;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, iw, ih);

    out.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/webp", 0.9);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg-panel)", borderRadius: 16,
          padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          maxWidth: 360, width: "100%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ margin: 0, fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 15 }}>
          Recadrer la photo
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Glisse pour déplacer · pinch ou molette pour zoomer
        </p>

        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          style={{ borderRadius: "50%", cursor: "grab", touchAction: "none", userSelect: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Zoom slider */}
        <input
          type="range"
          min={0}
          max={100}
          value={(() => {
            const img = imgRef.current;
            if (!img) return 0;
            const minS = SIZE / Math.min(img.naturalWidth, img.naturalHeight);
            const maxS = minS * 8;
            return Math.round(((scale - minS) / (maxS - minS)) * 100);
          })()}
          onChange={(e) => {
            const img = imgRef.current;
            if (!img) return;
            const minS = SIZE / Math.min(img.naturalWidth, img.naturalHeight);
            const maxS = minS * 8;
            const next = minS + (Number(e.target.value) / 100) * (maxS - minS);
            const clamped = clampOffset(offset.x, offset.y, next, img);
            setScale(next);
            setOffset(clamped);
          }}
          style={{ width: "100%" }}
        />

        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button type="button" className="ghost" style={{ flex: 1 }} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="primary" style={{ flex: 1 }} onClick={handleConfirm}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
