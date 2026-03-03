"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "bp-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"day" | "night">("night");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) as "day" | "night" | null;
    const nextTheme = stored ?? "night";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const toggle = () => {
    const next = theme === "night" ? "day" : "night";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
  };

  return (
    <button className="theme-toggle" onClick={toggle} type="button">
      {theme === "night" ? "Night" : "Day"}
    </button>
  );
}
