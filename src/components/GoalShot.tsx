"use client";

/**
 * But de bike polo à côté de « Salut {prénom} » : au clic, le maillet arme,
 * frappe la balle qui file au fond du filet. Une seule fois par clic (2,3 s),
 * un clic pendant l'animation ne la relance pas. Keyframes dans globals.css
 * (.goalfx), coupées si prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export function GoalShot() {
  const t = useTranslations("home");
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const shoot = () => {
    if (playing) return;
    setPlaying(true);
    timer.current = window.setTimeout(() => setPlaying(false), 2350);
  };

  return (
    <button type="button" className="goalbtn" onClick={shoot} aria-label={t("bento_shoot")} title={t("bento_shoot")}>
      <svg className={`goalfx${playing ? " play" : ""}`} viewBox="0 0 132 64" aria-hidden="true">
        <line x1="2" y1="61" x2="130" y2="61" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
        <g className="net">
          <path d="M100 20 L126 22 L130 60 L100 60 Z" fill="var(--surface)" stroke="var(--text)" strokeWidth="1" />
          <path d="M106 20.5 L109 60 M112 21 L116 60 M118 21.5 L123 60 M100 30 L127 30 M100 40 L128 40 M100 50 L129 50" stroke="var(--text-muted)" strokeWidth="1" fill="none" />
        </g>
        <path d="M100 61 V18 H104" stroke="var(--text)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M104 18 L126 20.5 L130 61" stroke="var(--text)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <ellipse className="shadow" cx="44" cy="60" rx="5" ry="1.4" fill="var(--text)" opacity=".25" />
        <g className="ball">
          <circle cx="44" cy="55" r="5" fill="var(--orange)" stroke="var(--border)" strokeWidth="2" />
          <path d="M41 53.5 Q44 55.5 47 53.5" stroke="var(--border)" strokeWidth="1" fill="none" />
        </g>
        <g className="mallet">
          <line x1="30" y1="4" x2="30" y2="48" stroke="var(--text)" strokeWidth="2.6" strokeLinecap="round" />
          <line x1="30" y1="4" x2="30" y2="15" stroke="var(--text)" strokeWidth="5.5" strokeLinecap="round" />
          <rect x="20" y="47" width="20" height="10" rx="2.5" fill="var(--teal)" stroke="var(--border)" strokeWidth="2" />
          <line x1="24" y1="47.5" x2="24" y2="56.5" stroke="var(--border)" strokeWidth="1" />
          <line x1="36" y1="47.5" x2="36" y2="56.5" stroke="var(--border)" strokeWidth="1" />
        </g>
      </svg>
    </button>
  );
}
