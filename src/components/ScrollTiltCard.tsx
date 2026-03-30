"use client";

import { useRef, useEffect, useState, ComponentProps } from "react";
import { PokemonCard } from "./PokemonCard";

type Props = ComponentProps<typeof PokemonCard>;

/**
 * On mobile: animates a gentle 3D tilt based on the card's position in the viewport as the user scrolls.
 * On desktop: renders PokemonCard as-is (mouse hover handles the effect).
 */
export function ScrollTiltCard(props: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect touch device
    setIsMobile("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const el = wrapperRef.current;
    const card = cardRef.current;
    if (!el || !card) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;

      // Progress: 0 = card center at bottom of screen, 1 = card center at top
      const centerY = rect.top + rect.height / 2;
      // Normalize: -1 (below screen) → 0 (center of screen) → +1 (above screen)
      const progress = 1 - (centerY / vh) * 2 + 1; // range roughly -1..3 but clamped below
      // We want a gentle wave: most visible when card is in middle of screen
      // relative = 0 at center of viewport, ±1 at edges
      const relative = (centerY - vh / 2) / (vh / 2); // -1..1
      const clamped = Math.max(-1, Math.min(1, relative));

      // Tilt: rotateX based on vertical position, subtle rotateY as a slow wave
      const rotateX = clamped * 8; // tilts toward/away viewer as you scroll past
      const rotateY = Math.sin(clamped * Math.PI) * 4; // subtle side tilt at mid-scroll

      // Subtle float: card rises slightly when in center of viewport
      const translateY = (1 - Math.abs(clamped)) * -6; // -6px at center, 0px at edges

      // Reflection shimmer: shift based on scroll position
      const gx = 50 + clamped * 30;
      const gy = 50 - clamped * 30;

      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(${translateY}px)`;
      card.style.setProperty("--gx", `${gx}%`);
      card.style.setProperty("--gy", `${gy}%`);
      card.style.transition = "transform 0.15s ease-out";
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update(); // initial

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isMobile]);

  if (!isMobile) {
    return <PokemonCard {...props} />;
  }

  return (
    <div ref={wrapperRef} style={{ display: "inline-block" }}>
      <PokemonCard {...props} ref={cardRef} />
    </div>
  );
}
