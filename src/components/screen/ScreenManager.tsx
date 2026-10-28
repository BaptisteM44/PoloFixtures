"use client";

/**
 * Dashboard orga (onglet Jour J) : gestion des écrans de salle.
 * Créer un écran, choisir ce qu'il montre (un terrain ou un diaporama), composer
 * le diaporama, et le piloter en direct : pause, diapo figée, annonce.
 * Chaque changement est envoyé tout de suite aux écrans ouverts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { autoSlides, parseSlideKey, slideCatalog, type ScreenConfig, type SlideContext, type SlideEntry, type SlideKey } from "@/lib/screen-slides";
import type { ScreenData } from "@/lib/screen-data";
import { copyText } from "@/lib/ui/copy-text";
import { PixelIcon } from "@/components/screen/PixelIcon";

type T = ReturnType<typeof useTranslations>;

export function slideLabel(key: SlideKey, ctx: SlideContext, t: T): string {
  const p = parseSlideKey(key);
  if (!p) return key;
  switch (p.kind) {
    case "court": return t("slide_court", { n: p.court });
    case "courts": return t("slide_courts");
    case "overview": return t("slide_overview");
    case "upcoming": return t("slide_upcoming");
    case "referees": return t("slide_referees");
    case "results": return t("slide_results");
    case "sponsors": return t("slide_sponsors");
    case "qr": return t("slide_qr");
    case "standings": {
      const s = ctx.stages.find((x) => x.order === p.stageOrder);
      return `${t("slide_standings")} · ${s?.name ?? "?"}${p.group ? ` · ${t("group", { group: p.group })}` : ""}`;
    }
    case "bracket": {
      const s = ctx.stages.find((x) => x.order === p.stageOrder);
      return `${t("slide_bracket")} · ${s?.name ?? "?"}`;
    }
  }
}

export function screenTitle(s: ScreenConfig, t: T): string {
  if (s.name) return s.name;
  if (s.slug === "diaporama") return t("default_slideshow");
  if (s.slug === "vue-d-ensemble") return t("default_overview");
  return t("court_n", { n: s.court });
}

export function ScreenManager({ tournamentId, tournamentSlug }: { tournamentId: string; tournamentSlug: string }) {
  const t = useTranslations("screen");
  const locale = useLocale();
  const [data, setData] = useState<ScreenData | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const urlOf = (slug: string) => `${origin}/${locale}/tournament/${tournamentSlug}/screen/${slug}`;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (slug: string) => {
    if (!(await copyText(urlOf(slug)))) return;
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1800);
  };

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/screen`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  const patch = async (slug: string, body: Record<string, unknown>) => {
    setError(null);
    // Optimiste : l'interface suit tout de suite.
    setData((d) => d && ({ ...d, screens: d.screens.map((s) => (s.slug === slug ? { ...s, ...body } as ScreenConfig : s)) }));
    const res = await fetch(`/api/tournaments/${tournamentId}/screens/${slug}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? t("error")); load(); }
  };

  const create = async () => {
    if (!newName.trim()) return;
    const res = await fetch(`/api/tournaments/${tournamentId}/screens`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? t("error")); return; }
    const s = (await res.json()) as ScreenConfig;
    setNewName("");
    await load();
    setOpen(s.slug);
  };

  const remove = async (slug: string) => {
    if (!window.confirm(t("confirm_delete"))) return;
    await fetch(`/api/tournaments/${tournamentId}/screens/${slug}`, { method: "DELETE" });
    setOpen(null);
    load();
  };

  // Même id pendant le chargement : un lien « …&goto=edit-screens » y défile tout de suite.
  if (!data) return <div id="edit-screens" className="panel orga-anchor"><p className="meta">…</p></div>;
  const ctx = data.context;

  return (
    <div id="edit-screens" className="panel screen-mgr orga-anchor">
      <h3 style={{ margin: 0 }}>📺 {t("mgr_title")}</h3>
      <p className="meta" style={{ margin: "4px 0 14px" }}>{t("mgr_desc")}</p>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      <ul className="screen-mgr__list">
        {data.screens.map((s) => {
          const isDefault = !s.name;
          const isOpen = open === s.slug;
          return (
            <li key={s.slug} className={`screen-mgr__item${isOpen ? " is-open" : ""}`}>
              <div className="screen-mgr__row">
                <button type="button" className="screen-mgr__name" onClick={() => setOpen(isOpen ? null : s.slug)}>
                  <span>{isOpen ? "▾" : "▸"}</span>
                  <span className="screen-mgr__icon"><PixelIcon kind={s.mode === "court" ? "court" : "tv"} size={s.mode === "court" ? 26 : 20} /></span>
                  <strong>{screenTitle(s, t)}</strong>
                  <small>
                    {s.mode === "court" ? t("mode_court_short", { n: s.court })
                      : !s.slides ? t("mode_auto_short")
                      : s.slides.length === 1 ? slideLabel(s.slides[0].key, ctx, t)
                      : t("mode_custom_short", { count: s.slides.length })}
                    {s.paused ? ` · ⏸ ${t("paused")}` : ""}
                    {s.pinnedSlide ? ` · 📌 ${slideLabel(s.pinnedSlide, ctx, t)}` : ""}
                    {s.announcement ? " · 📣" : ""}
                  </small>
                </button>
                <div className="screen-mgr__links">
                  <a className="ghost" href={urlOf(s.slug)} target="_blank" rel="noreferrer">{t("open")}</a>
                  <button type="button" className={copied === s.slug ? "primary" : "ghost"} onClick={() => copy(s.slug)}>{copied === s.slug ? `✓ ${t("copied")}` : t("copy_link")}</button>
                </div>
              </div>
              {/* Adresse courte (la complète est dans « Copier le lien ») */}
              <code className="screen-mgr__url" title={urlOf(s.slug)}>…/screen/{s.slug}</code>

              {isOpen && (
                <ScreenEditor
                  previewUrl={urlOf(s.slug)}
                  screen={s}
                  ctx={ctx}
                  courtsCount={data.tournament.courtsCount}
                  t={t}
                  onPatch={(body) => patch(s.slug, body)}
                  onDelete={() => remove(s.slug)}
                  isDefault={isDefault}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="screen-mgr__new">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("new_placeholder")} maxLength={40}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }} />
        <button type="button" className="primary" onClick={create} disabled={!newName.trim()}>+ {t("new_screen")}</button>
      </div>
    </div>
  );
}

/**
 * Aperçu en direct de l'écran (la vraie page, réduite) : l'orga voit ce que
 * montre la TV et l'effet de chaque réglage, sans quitter le dashboard.
 */
function LivePreview({ url, t }: { url: string; t: T }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const fit = () => { if (boxRef.current) setScale(boxRef.current.clientWidth / 1280); };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="screen-mgr__preview">
      <div className="screen-mgr__preview-box" ref={boxRef}>
        <iframe src={url} title={t("preview")} tabIndex={-1} style={{ transform: `scale(${scale})` }} />
      </div>
      <small>👁 {t("preview_live")}</small>
    </div>
  );
}

function ScreenEditor({ previewUrl, screen: s, ctx, courtsCount, t, onPatch, onDelete, isDefault }: {
  previewUrl: string;
  screen: ScreenConfig; ctx: SlideContext; courtsCount: number; t: T;
  onPatch: (body: Record<string, unknown>) => void; onDelete: () => void; isDefault: boolean;
}) {
  const [announce, setAnnounce] = useState(s.announcement ?? "");
  useEffect(() => setAnnounce(s.announcement ?? ""), [s.announcement]);
  const catalog = useMemo(() => slideCatalog(ctx), [ctx]);
  const current: SlideEntry[] = s.slides ?? autoSlides(ctx).map((key) => ({ key }));
  const inList = new Set(current.map((x) => x.key));

  const setSlides = (next: SlideEntry[]) => onPatch({ slides: next });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...current];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
  };

  return (
    <div className="screen-mgr__editor">
      <LivePreview url={previewUrl} t={t} />

      {/* Pilotage en direct */}
      <div className="screen-mgr__live">
        {s.mode === "slideshow" && (
          <>
            <button type="button" className={s.paused ? "primary" : "ghost"} onClick={() => onPatch({ paused: !s.paused })}>
              {s.paused ? `▶ ${t("resume")}` : `⏸ ${t("pause")}`}
            </button>
            <label className="screen-mgr__inline">
              📌 {t("pin")}
              <select value={s.pinnedSlide ?? ""} onChange={(e) => onPatch({ pinnedSlide: e.target.value || null })}>
                <option value="">{t("pin_none")}</option>
                {catalog.map((k) => <option key={k} value={k}>{slideLabel(k, ctx, t)}</option>)}
              </select>
            </label>
          </>
        )}
        <div className="screen-mgr__announce">
          <input value={announce} onChange={(e) => setAnnounce(e.target.value)} maxLength={200} placeholder={t("announce_placeholder")} />
          <button type="button" className="primary" disabled={!announce.trim() || announce.trim() === s.announcement} onClick={() => onPatch({ announcement: announce.trim() })}>
            📣 {t("announce_show")}
          </button>
          {s.announcement && <button type="button" className="ghost" onClick={() => onPatch({ announcement: null })}>{t("announce_clear")}</button>}
        </div>
      </div>

      {/* Réglages */}
      <div className="screen-mgr__settings">
        <label className="field-row">
          {t("field_mode")}
          <select value={s.mode} onChange={(e) => onPatch({ mode: e.target.value })}>
            <option value="slideshow">{t("mode_slideshow")}</option>
            <option value="court">{t("mode_court")}</option>
          </select>
        </label>
        {s.mode === "court" && (
          <label className="field-row">
            {t("field_court")}
            <select value={s.court} onChange={(e) => onPatch({ court: Number(e.target.value) })}>
              {Array.from({ length: courtsCount }, (_, i) => <option key={i} value={i + 1}>{t("court_n", { n: i + 1 })}</option>)}
            </select>
          </label>
        )}
        <label className="field-row">
          {t("field_theme")}
          <select value={s.theme} onChange={(e) => onPatch({ theme: e.target.value })}>
            <option value="dark">{t("theme_dark")}</option>
            <option value="light">{t("theme_light")}</option>
          </select>
        </label>
        <label className="field-row">
          {t("field_clock")}
          <select value={s.clockPosition} onChange={(e) => onPatch({ clockPosition: e.target.value })}>
            <option value="top">{t("clock_top")}</option>
            <option value="bottom">{t("clock_bottom")}</option>
          </select>
        </label>
        {s.mode === "slideshow" && (
          <label className="field-row">
            {t("field_seconds")}
            <input type="number" min={3} max={600} defaultValue={s.slideSeconds}
              onBlur={(e) => { const v = Math.min(600, Math.max(3, Number(e.target.value) || 12)); if (v !== s.slideSeconds) onPatch({ slideSeconds: v }); }} />
          </label>
        )}
      </div>

      {/* Composition du diaporama */}
      {s.mode === "slideshow" && (
        <div className="screen-mgr__slides">
          <label className="screen-mgr__auto">
            <input type="checkbox" checked={!s.slides} onChange={(e) => setSlides(e.target.checked ? (null as never) : autoSlides(ctx).map((key) => ({ key })))} />
            <span><strong>{t("auto_title")}</strong><small>{t("auto_desc")}</small></span>
          </label>
          <ol>
            {current.map((x, i) => (
              <li key={x.key}>
                <span className="screen-mgr__slide-name">{slideLabel(x.key, ctx, t)}</span>
                {s.slides && (
                  <>
                    <input type="number" min={3} max={600} placeholder={String(s.slideSeconds)} defaultValue={x.seconds ?? ""} title={t("field_seconds")}
                      onBlur={(e) => {
                        const v = e.target.value ? Math.min(600, Math.max(3, Number(e.target.value))) : undefined;
                        if (v !== x.seconds) setSlides(current.map((y, j) => (j === i ? { key: y.key, ...(v ? { seconds: v } : {}) } : y)));
                      }} />
                    <button type="button" className="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="↑">↑</button>
                    <button type="button" className="ghost" onClick={() => move(i, 1)} disabled={i === current.length - 1} aria-label="↓">↓</button>
                    <button type="button" className="ghost" onClick={() => setSlides(current.filter((_, j) => j !== i))} aria-label="✕">✕</button>
                  </>
                )}
              </li>
            ))}
          </ol>
          {s.slides && catalog.some((k) => !inList.has(k)) && (
            <label className="screen-mgr__inline">
              + {t("add_slide")}
              <select value="" onChange={(e) => e.target.value && setSlides([...current, { key: e.target.value }])}>
                <option value="">—</option>
                {catalog.filter((k) => !inList.has(k)).map((k) => <option key={k} value={k}>{slideLabel(k, ctx, t)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="screen-mgr__footer">
        <button type="button" className="ghost screen-mgr__delete" onClick={onDelete}>
          {isDefault ? t("reset") : t("delete")}
        </button>
      </div>
    </div>
  );
}
