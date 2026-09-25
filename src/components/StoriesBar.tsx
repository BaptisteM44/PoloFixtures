"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { StoryGroup, StoryItem } from "@/lib/stories";

const STORY_DURATION_MS = 6000;
const SEEN_KEY = "stories_seen";
const CAPTION_MAX = 200;

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function writeSeen(seen: Set<string>) {
  // On ne garde que les 500 dernières (les stories expirent de toute façon).
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500))); } catch { /* navigation privée */ }
}

function useTimeAgo() {
  const locale = useLocale();
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" }), [locale]);
  return (iso: string) => {
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 60) return rtf.format(-Math.max(mins, 1), "minute");
    const hours = Math.round(mins / 60);
    if (hours < 24) return rtf.format(-hours, "hour");
    return rtf.format(-Math.round(hours / 24), "day");
  };
}

/**
 * Bandeau de stories de la home : « + » pour publier, puis les groupes « à la
 * une » et les stories du jour par auteur. Un clic ouvre la visionneuse plein
 * écran (barres de progression, tap gauche/droite, maintien = pause).
 */
export function StoriesBar({
  groups, viewerId, isAdmin, tournaments,
}: {
  groups: StoryGroup[];
  viewerId: string | null;
  isAdmin: boolean;
  tournaments: { id: string; name: string }[];
}) {
  const t = useTranslations("stories");
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ group: number; story: number } | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => { setSeen(readSeen()); }, []);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id); writeSeen(next); return next;
    });
  }, []);

  const openGroup = (gi: number) => {
    // Reprend à la première story non vue du groupe.
    const first = groups[gi].stories.findIndex((s) => !seen.has(s.id));
    setOpen({ group: gi, story: first === -1 ? 0 : first });
  };

  if (groups.length === 0 && !viewerId) return null;

  return (
    <section className="stories-bar" aria-label={t("aria_label")}>
      <div className="stories-bar__scroller">
        {viewerId && (
          <button type="button" className="story-bubble" onClick={() => setComposing(true)}>
            <span className="story-bubble__ring story-bubble__ring--add">
              <span className="story-bubble__img story-bubble__img--add" aria-hidden>+</span>
            </span>
            <span className="story-bubble__label">{t("add")}</span>
          </button>
        )}
        {groups.map((g, gi) => {
          const allSeen = g.stories.every((s) => seen.has(s.id));
          return (
            <button key={g.key} type="button" className="story-bubble" onClick={() => openGroup(gi)} title={g.title}>
              <span className={`story-bubble__ring${g.kind === "highlight" ? " story-bubble__ring--highlight" : ""}${allSeen ? " story-bubble__ring--seen" : ""}`}>
                {g.cover
                  ? <img className="story-bubble__img" src={g.cover} alt="" loading="lazy" />
                  : <span className="story-bubble__img story-bubble__img--initial" aria-hidden>{g.title.slice(0, 1).toUpperCase()}</span>}
              </span>
              <span className="story-bubble__label">
                {g.kind === "highlight" && <span aria-hidden>★ </span>}
                {g.stories[0]?.author.id === viewerId && g.kind === "author" ? t("yours") : g.title}
              </span>
            </button>
          );
        })}
        {groups.length === 0 && viewerId && (
          <p className="stories-bar__empty">{t("empty")}</p>
        )}
      </div>

      {open && (
        <StoryViewer
          groups={groups}
          start={open}
          viewerId={viewerId}
          isAdmin={isAdmin}
          onSeen={markSeen}
          onClose={() => setOpen(null)}
        />
      )}
      {composing && <StoryComposer tournaments={tournaments} onClose={() => setComposing(false)} />}
    </section>
  );
}

function StoryViewer({
  groups, start, viewerId, isAdmin, onSeen, onClose,
}: {
  groups: StoryGroup[];
  start: { group: number; story: number };
  viewerId: string | null;
  isAdmin: boolean;
  onSeen: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("stories");
  const router = useRouter();
  const timeAgo = useTimeAgo();
  const [pos, setPos] = useState(start);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const holdRef = useRef(false);

  const group = groups[pos.group];
  const story: StoryItem | undefined = group?.stories[pos.story];

  // Position courante lue via une ref : pas d'effet de bord (onClose) dans un
  // updater de setState.
  const posRef = useRef(pos);
  posRef.current = pos;

  const next = useCallback(() => {
    const p = posRef.current;
    if (p.story + 1 < groups[p.group].stories.length) setPos({ group: p.group, story: p.story + 1 });
    else if (p.group + 1 < groups.length) setPos({ group: p.group + 1, story: 0 });
    else onClose();
  }, [groups, onClose]);

  const prev = useCallback(() => {
    const p = posRef.current;
    if (p.story > 0) setPos({ group: p.group, story: p.story - 1 });
    else if (p.group > 0) setPos({ group: p.group - 1, story: groups[p.group - 1].stories.length - 1 });
    else setPos({ ...p }); // 1re story : on la relance depuis le début
  }, [groups]);

  // Nouvelle story : on repart de zéro et on attend que l'image soit chargée.
  useEffect(() => { setProgress(0); setLoaded(false); setNotice(null); }, [pos]);
  useEffect(() => { if (story && loaded) onSeen(story.id); }, [story, loaded, onSeen]);

  // Minuterie : avance quand la barre est pleine (pause pendant le maintien,
  // tant que l'image charge, ou quand un message est affiché).
  useEffect(() => {
    if (!loaded || paused || notice) return;
    const startedAt = performance.now() - progress * STORY_DURATION_MS;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - startedAt) / STORY_DURATION_MS, 1);
      setProgress(p);
      if (p >= 1) { next(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, paused, notice, pos, next]);

  // Clavier + blocage du scroll de la page derrière.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") { e.preventDefault(); setPaused((v) => !v); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [next, prev, onClose]);

  if (!group || !story) return null;
  const isMine = story.author.id === viewerId;

  // Tap : tiers gauche = précédente, reste = suivante ; un appui long = pause.
  const onPointerDown = () => {
    holdRef.current = false;
    const timer = setTimeout(() => { holdRef.current = true; setPaused(true); }, 220);
    const up = (e: PointerEvent) => {
      clearTimeout(timer);
      window.removeEventListener("pointerup", up);
      if (holdRef.current) { setPaused(false); return; }
      const target = e.target as HTMLElement;
      if (target.closest("button, a")) return;
      const rect = (document.querySelector(".story-viewer__frame") as HTMLElement | null)?.getBoundingClientRect();
      if (rect && e.clientX < rect.left + rect.width / 3) prev(); else next();
    };
    window.addEventListener("pointerup", up);
  };

  const act = async (fn: () => Promise<Response>, done: string, refresh = true) => {
    setPaused(true);
    const res = await fn();
    if (!res.ok) {
      const code = res.headers.get("content-type")?.includes("json") ? (await res.json()).error : null;
      setNotice(code === "already_reported" ? t("already_reported") : t("error"));
      return;
    }
    setNotice(done);
    if (refresh) router.refresh();
  };

  const remove = () => {
    if (!confirm(t("confirm_delete"))) return;
    act(() => fetch(`/api/stories/${story.id}`, { method: "DELETE" }), t("deleted")).then(() => setTimeout(onClose, 900));
  };
  const report = () => {
    if (!confirm(t("confirm_report"))) return;
    act(() => fetch(`/api/stories/${story.id}/report`, { method: "POST" }), t("reported"), false);
  };
  const pin = () => {
    const title = window.prompt(t("pin_prompt"), story.highlightTitle ?? story.tournament?.name ?? "");
    if (title === null) return;
    act(() => fetch(`/api/stories/${story.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highlightTitle: title.trim() || null }),
    }), title.trim() ? t("pinned") : t("unpinned"));
  };

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={group.title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="story-viewer__frame" onPointerDown={onPointerDown}>
        <div className="story-viewer__bars">
          {group.stories.map((s, i) => (
            <span key={s.id} className="story-viewer__bar">
              <span style={{ width: `${i < pos.story ? 100 : i === pos.story ? progress * 100 : 0}%` }} />
            </span>
          ))}
        </div>

        <header className="story-viewer__head">
          <Link href={story.author.slug ? `/player/${story.author.slug}` : "#"} className="story-viewer__author" onClick={onClose}>
            {story.author.photoPath
              ? <img src={story.author.photoPath} alt="" />
              : <span className="story-viewer__initial">{story.author.name.slice(0, 1).toUpperCase()}</span>}
            <span>
              <strong>{story.author.name}</strong>
              <small>{group.kind === "highlight" ? `★ ${group.title}` : timeAgo(story.createdAt)}</small>
            </span>
          </Link>
          <div className="story-viewer__tools">
            <button type="button" onClick={() => setPaused((v) => !v)} aria-label={paused ? t("play") : t("pause")}>{paused ? "▶" : "❚❚"}</button>
            <button type="button" onClick={onClose} aria-label={t("close")}>✕</button>
          </div>
        </header>

        {!loaded && <div className="story-viewer__spinner" aria-hidden />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={story.id} className="story-viewer__img" src={story.imagePath} alt={story.caption ?? ""} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} draggable={false} />

        <footer className="story-viewer__foot">
          {story.caption && <p className="story-viewer__caption">{story.caption}</p>}
          {story.tournament && (
            <Link href={`/tournament/${story.tournament.slug ?? story.tournament.id}`} className="story-viewer__chip" onClick={onClose}>
              🏆 {story.tournament.name} →
            </Link>
          )}
          {notice && <p className="story-viewer__notice">{notice}</p>}
          <div className="story-viewer__actions">
            {(isMine || isAdmin) && <button type="button" onClick={remove}>🗑 {t("delete")}</button>}
            {isAdmin && <button type="button" onClick={pin}>★ {story.highlightTitle ? t("edit_pin") : t("pin")}</button>}
            {viewerId && !isMine && <button type="button" onClick={report}>⚠ {t("report")}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

function StoryComposer({ tournaments, onClose }: { tournaments: { id: string; name: string }[]; onClose: () => void }) {
  const t = useTranslations("stories");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const publish = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "stories");
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (!up.ok) {
        setError(up.status === 413 ? t("err_too_big") : up.status === 415 ? t("err_not_image") : t("error"));
        return;
      }
      const { path } = await up.json();
      const res = await fetch("/api/stories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath: path, caption: caption.trim() || null, tournamentId: tournamentId || null }),
      });
      if (!res.ok) {
        const code = res.headers.get("content-type")?.includes("json") ? (await res.json()).error : null;
        setError(code === "rate_limited" ? t("err_rate_limited") : code === "suspended" ? t("err_suspended") : t("error"));
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="story-composer" role="dialog" aria-modal="true" aria-label={t("compose_title")} onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="story-composer__panel panel">
        <div className="story-composer__head">
          <h3>{t("compose_title")}</h3>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label={t("close")}>✕</button>
        </div>

        <label className={`story-composer__drop${preview ? " has-preview" : ""}`}>
          {preview
            ? <img src={preview} alt="" />
            : <span>📷 {t("pick_photo")}</span>}
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
        </label>

        <label className="story-composer__field">
          {t("caption")}
          <textarea value={caption} maxLength={CAPTION_MAX} rows={2} onChange={(e) => setCaption(e.target.value)} placeholder={t("caption_ph")} disabled={busy} />
          <small>{caption.length}/{CAPTION_MAX}</small>
        </label>

        {tournaments.length > 0 && (
          <label className="story-composer__field">
            {t("tournament")}
            <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} disabled={busy}>
              <option value="">{t("tournament_none")}</option>
              {tournaments.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
            </select>
          </label>
        )}

        <p className="story-composer__hint">{t("compose_hint")}</p>
        {error && <p className="story-composer__error">{error}</p>}
        <button type="button" className="primary" onClick={publish} disabled={!file || busy}>
          {busy ? t("publishing") : t("publish")}
        </button>
      </div>
    </div>
  );
}
