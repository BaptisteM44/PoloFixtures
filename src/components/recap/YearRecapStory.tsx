"use client";

/**
 * Récap « Ton année en bike polo », façon story : un écran par idée. On touche
 * l'écran pour avancer (tiers gauche = revenir), on garde le doigt appuyé pour
 * mettre en pause. Les écrans sans chiffre ne s'affichent pas. Jamais de
 * classement ; toujours rappeler que seuls les tournois gérés sur Poloperator
 * sont comptés.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";
import { getBadgeInfo } from "@/lib/badge-catalog";
import { EARTH_KM, travelKm, type RecapTournament, type YearRecapData } from "@/lib/year-recap";

const SLIDE_MS = 8000;
// Espace insécable normal (l'espace fine du français disparaît dans la police d'affichage : « 1412 »).
const nf = (n: number) => n.toLocaleString("fr-FR").replace(/\u202f/g, "\u00a0");
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const month = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "");
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const FACE_COLORS = ["var(--yellow)", "var(--teal)", "var(--purple)", "var(--orange)", "var(--surface)"];

type Bg = "yellow" | "teal" | "pink" | "dark" | "cream" | "purple" | "orange";
type Slide = { key: string; bg: Bg; body: ReactNode };

/** Compteur qui monte jusqu'à la valeur (à l'affichage de l'écran). */
function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
function Count({ n, format = nf }: { n: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(n))}</>;
}

/** Apparition en cascade (délai en ms). */
function Rise({ d = 0, as, className = "", children }: { d?: number; as?: ElementType; className?: string; children: ReactNode }) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={`rc-rise ${className}`} style={{ "--d": `${d}ms` } as CSSProperties}>{children}</Tag>;
}

const Note = ({ children = "Tournois gérés sur Poloperator" }: { children?: ReactNode }) => <p className="rc-note">{children}</p>;

/** La saison sur une carte : un point par tournoi, reliés dans l'ordre des dates. */
function RouteMap({ tournaments, home }: { tournaments: RecapTournament[]; home: YearRecapData["home"] }) {
  const id = useId().replace(/:/g, "");
  const W = 320, H = 200, P = 30;
  const all = home ? [...tournaments, home] : tournaments;
  const k = Math.cos(((all.reduce((s, p) => s + p.lat, 0) / all.length) * Math.PI) / 180);
  const xs = all.map((p) => p.lng * k), ys = all.map((p) => -p.lat);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const s = Math.min((W - 2 * P) / Math.max(Math.max(...xs) - Math.min(...xs), 3), (H - 2 * P) / Math.max(Math.max(...ys) - Math.min(...ys), 2));
  const pt = (p: { lat: number; lng: number }) => [W / 2 + (p.lng * k - cx) * s, H / 2 + (-p.lat - cy) * s] as const;
  const pts = tournaments.map(pt);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const homePt = home ? pt(home) : null;
  return (
    <svg className="rc-route" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tournaments.map((t) => t.city).join(", ")}>
      <defs>
        <pattern id={`${id}dots`} width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" /></pattern>
      </defs>
      <rect className="rc-route__bg" x="1" y="1" width={W - 2} height={H - 2} rx="12" />
      <rect className="rc-route__dots" x="1" y="1" width={W - 2} height={H - 2} rx="12" fill={`url(#${id}dots)`} />
      {pts.length > 1 && <path d={d} pathLength={1} className="rc-route__line" />}
      {homePt && <text className="rc-route__home" x={homePt[0]} y={homePt[1] + 5} textAnchor="middle">🏠</text>}
      {pts.map(([x, y], i) => (
        <g key={i} className="rc-route__stop" style={{ "--d": `${450 + i * 200}ms` } as CSSProperties}>
          <circle cx={x} cy={y} r="9" />
          <text x={x} y={y + 3.5} textAnchor="middle">{i + 1}</text>
          <text className="rc-route__city" x={Math.min(W - 26, Math.max(26, x))} y={y > 34 ? y - 14 : y + 22} textAnchor="middle">{tournaments[i].city}</text>
        </g>
      ))}
    </svg>
  );
}

export function YearRecapStory({ data, closeHref = "/", demo = false }: { data: YearRecapData; closeHref?: string; demo?: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [fw, setFw] = useState(390);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Largeur du cadre : sert à dimensionner la carte de joueur·euse.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Plein écran : la page derrière ne défile pas.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const { year, tournaments, teammates, pitch, scene, community } = data;
  const km = travelKm(data.home, tournaments);
  const countries = new Set(tournaments.map((t) => t.country)).size;
  const cities = new Set(tournaments.map((t) => t.city)).size;
  const sceneRows = [
    { key: "ref", icon: "🟨", n: scene.refereed, label: plural(scene.refereed, "match arbitré", "matchs arbitrés") },
    { key: "host", icon: "🏠", n: scene.hosted, label: plural(scene.hosted, "personne hébergée chez toi", "personnes hébergées chez toi") },
    { key: "train", icon: "🚲", n: scene.trainings, label: plural(scene.trainings, "entraînement", "entraînements") },
    { key: "photo", icon: "📸", n: scene.photos, label: plural(scene.photos, "photo partagée", "photos partagées") },
    { key: "orga", icon: "📋", n: scene.organized, label: plural(scene.organized, "tournoi organisé", "tournois organisés") },
  ].filter((r) => r.n > 0);
  const pinned = data.card.pinnedBadges.filter((b) => data.badges.includes(b));
  const badges = [...pinned, ...data.badges.filter((b) => !pinned.includes(b))];
  const cardScale = Math.min(0.75, (fw * 0.6) / 340);
  const earth = km >= EARTH_KM
    ? `${(km / EARTH_KM).toFixed(1).replace(".", ",")} fois le tour de la Terre 🌍`
    : `${Math.max(1, Math.round((km / EARTH_KM) * 100))} % du tour de la Terre 🌍`;
  const shown = tournaments.length > 6 ? tournaments.slice(0, 5) : tournaments;

  const slides: Slide[] = [];
  slides.push({
    key: "intro", bg: "yellow", body: (
      <>
        <Rise><p className="rc-kicker">Ton année en bike polo</p></Rise>
        <Rise d={120}><p className="rc-year">{year}</p></Rise>
        <Rise d={260} className="rc-intro__card">
          <div style={{ width: 340 * cardScale, height: 520 * cardScale }}>
            <div style={{ width: 340, transform: `scale(${cardScale}) rotate(-3deg)`, transformOrigin: "top left" }}>
              <PlayerCollectibleCard
                name={data.card.name} country={data.card.country} city={data.card.city} photoPath={data.card.photoPath}
                clubName={data.card.clubName} badges={data.card.badges} pinnedBadges={data.card.pinnedBadges} startYear={data.card.startYear}
              />
            </div>
          </div>
        </Rise>
        <Rise d={420}>
          <p className="rc-lead">{data.firstSeason ? `Ta toute première saison, ${data.firstName} 🎉` : `Salut ${data.firstName} ! Voici ta saison, tournoi après tournoi.`}</p>
        </Rise>
        <Rise d={560}><p className="rc-tap">Touche l&apos;écran pour commencer →</p></Rise>
        <Note>Chiffres des tournois gérés sur Poloperator</Note>
      </>
    ),
  });
  if (tournaments.length > 0) {
    slides.push({
      key: "tournaments", bg: "teal", body: (
        <>
          <Rise><p className="rc-kicker">Tes tournois</p></Rise>
          <Rise d={100}><p className="rc-big"><Count n={tournaments.length} /> <span>{plural(tournaments.length, "tournoi", "tournois")}</span></p></Rise>
          <Rise d={200}><p className="rc-sub">dans <b>{countries} pays</b> · <b>{cities} {plural(cities, "ville", "villes")}</b></p></Rise>
          <Rise d={300}><RouteMap tournaments={tournaments} home={data.home} /></Rise>
          <ol className="rc-list">
            {shown.map((t, j) => (
              <Rise as="li" key={j} d={500 + j * 90}>
                <b>{j + 1}</b><span className="rc-list__date">{month(t.date)}</span>
                <span className="rc-list__name">{t.name}</span><span className="rc-list__city">{t.city}</span>
              </Rise>
            ))}
            {shown.length < tournaments.length && <Rise as="li" d={500 + shown.length * 90} className="rc-list__more">+ {tournaments.length - shown.length} autres</Rise>}
          </ol>
          <Note />
        </>
      ),
    });
  }
  if (km > 0 && data.home) {
    slides.push({
      key: "km", bg: "dark", body: (
        <>
          <Rise><p className="rc-kicker">Et pour y aller…</p></Rise>
          <div className="rc-center">
            <Rise d={120}><p className="rc-big rc-big--xl rc-yellow"><Count n={km} /><span> km</span></p></Rise>
            <Rise d={260}><p className="rc-sub">à vol d&apos;oiseau, en aller-retour depuis {data.home.city}</p></Rise>
            <Rise d={420} className="rc-earth">
              <div className="rc-earth__bar"><span style={{ width: `${Math.min(100, (km / EARTH_KM) * 100)}%` }} /></div>
              <p>{earth}</p>
            </Rise>
          </div>
          <Note />
        </>
      ),
    });
  }
  if (teammates.count > 0) {
    slides.push({
      key: "people", bg: "pink", body: (
        <>
          <Rise><p className="rc-kicker">Tes coéquipier·es</p></Rise>
          <Rise d={100}><p className="rc-big"><Count n={teammates.count} /> <span>{plural(teammates.count, "coéquipier·e", "coéquipier·es")}</span></p></Rise>
          <Rise d={220} className="rc-faces">
            {teammates.names.slice(0, 7).map((nm, j) => (
              <span key={j} className="rc-face" style={{ "--c": FACE_COLORS[j % FACE_COLORS.length] } as CSSProperties}>{initials(nm)}</span>
            ))}
            {teammates.count > 7 && <span className="rc-face rc-face--more">+{teammates.count - 7}</span>}
          </Rise>
          {teammates.buddy && (
            <Rise d={380} className="rc-buddy">
              <p className="rc-buddy__label">Ton binôme de la saison</p>
              <p className="rc-buddy__name">{teammates.buddy.name}</p>
              <p className="rc-buddy__meta">{teammates.buddy.together} tournois ensemble 🤝</p>
            </Rise>
          )}
          <Note />
        </>
      ),
    });
  }
  if (pitch.matches > 0) {
    slides.push({
      key: "pitch", bg: "cream", body: (
        <>
          <Rise><p className="rc-kicker">Sur le terrain</p></Rise>
          <div className="rc-stats">
            <Rise d={100} className="rc-stat"><strong><Count n={pitch.matches} /></strong><span>{plural(pitch.matches, "match joué", "matchs joués")}</span></Rise>
            <Rise d={220} className="rc-stat rc-stat--teal"><strong><Count n={pitch.minutes} format={hm} /></strong><span>de jeu</span></Rise>
            {pitch.goals > 0 && (
              <Rise d={340} className="rc-stat rc-stat--pink"><strong><Count n={pitch.goals} /></strong><span>{plural(pitch.goals, "but noté à ton nom", "buts notés à ton nom")}</span></Rise>
            )}
          </div>
          {pitch.opponents > 0 && (
            <Rise d={480}><p className="rc-sub">Tu as croisé <b>{nf(pitch.opponents)} joueur·euses</b> venu·es de <b>{pitch.opponentCountries} pays</b>.</p></Rise>
          )}
          <Note />
        </>
      ),
    });
  }
  if (sceneRows.length > 0) {
    slides.push({
      key: "scene", bg: "purple", body: (
        <>
          <Rise><p className="rc-kicker">Tu as fait vivre la scène</p></Rise>
          <Rise d={100}><p className="rc-big">Merci 💛</p></Rise>
          <ul className="rc-rows">
            {sceneRows.map((r, j) => (
              <Rise as="li" key={r.key} d={220 + j * 110}>
                <span className="rc-rows__icon">{r.icon}</span><strong><Count n={r.n} /></strong><span>{r.label}</span>
              </Rise>
            ))}
          </ul>
          <Note />
        </>
      ),
    });
  }
  if (badges.length > 0) {
    slides.push({
      key: "badges", bg: "orange", body: (
        <>
          <Rise><p className="rc-kicker">Ta collection</p></Rise>
          <Rise d={100}><p className="rc-big"><Count n={badges.length} /> <span>{plural(badges.length, "badge", "badges")}</span></p></Rise>
          <div className="rc-badges">
            {badges.slice(0, 12).map((b, j) => {
              const info = getBadgeInfo(b);
              return (
                <Rise key={b} d={200 + j * 60} className={`rc-badge${pinned.includes(b) ? " is-pinned" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {info.iconUrl ? <img src={info.iconUrl} alt="" /> : <span className="rc-badge__emoji">{info.emoji}</span>}
                  <small>{info.name}</small>
                </Rise>
              );
            })}
          </div>
          {badges.length > 12 && <p className="rc-sub">et {badges.length - 12} autres</p>}
          <Note>Ta collection à ce jour · tournois gérés sur Poloperator</Note>
        </>
      ),
    });
  }
  slides.push({
    key: "community", bg: "dark", body: (
      <>
        <Rise><p className="rc-kicker">Ensemble, en {year}</p></Rise>
        <ul className="rc-community">
          {[
            { n: community.tournaments, label: "tournois", c: "yellow" },
            { n: community.countries, label: "pays", c: "teal" },
            { n: community.players, label: "joueur·euses", c: "pink" },
            { n: community.matches, label: "matchs", c: "purple" },
            { n: community.goals, label: "buts", c: "orange" },
          ].map((l, j) => (
            <Rise as="li" key={l.label} d={120 + j * 120} className={`rc-c--${l.c}`}><strong><Count n={l.n} /></strong><span>{l.label}</span></Rise>
          ))}
        </ul>
        <Rise d={820}><p className="rc-sub">Merci aux orgas, aux arbitres, aux hôtes et à toutes celles et ceux qui font vivre le polo 🚲</p></Rise>
        <Note />
      </>
    ),
  });
  const shot = [
    { n: tournaments.length, label: plural(tournaments.length, "tournoi", "tournois") },
    { n: countries, label: "pays" },
    { n: km, label: "km" },
    { n: pitch.matches, label: plural(pitch.matches, "match", "matchs") },
    { n: pitch.goals, label: plural(pitch.goals, "but", "buts") },
    { n: teammates.count, label: plural(teammates.count, "coéquipier·e", "coéquipier·es") },
  ].filter((x) => x.n > 0).slice(0, 6);
  slides.push({
    key: "share", bg: "yellow", body: (
      <>
        <Rise><p className="rc-kicker">À partager</p></Rise>
        <Rise d={100}><p className="rc-title">Ta saison en une image</p></Rise>
        <Rise d={220} className="rc-share">
          <div className="rc-shot">
            <p className="rc-shot__brand"><i />Poloperator</p>
            <p className="rc-shot__year">{year}</p>
            <p className="rc-shot__name">{data.card.name}</p>
            <div className="rc-shot__grid">
              {shot.map((x, j) => <div key={x.label} className={`rc-shot--${["yellow", "teal", "pink", "purple", "orange", "yellow"][j]}`}><strong>{nf(x.n)}</strong><span>{x.label}</span></div>)}
            </div>
            <p className="rc-shot__foot">Tournois gérés sur Poloperator · poloperator.com</p>
          </div>
        </Rise>
        <Rise d={360} className="rc-share__actions">
          <button type="button" className="primary" onClick={() => setToast("Le partage arrive à l'étape 3 🙂")}>Partager</button>
          <button type="button" className="ghost" onClick={() => setToast("Le téléchargement arrive à l'étape 3 🙂")}>Télécharger</button>
        </Rise>
        <button type="button" className="rc-replay" onClick={() => setI(0)}>↺ Revoir depuis le début</button>
      </>
    ),
  });

  const n = slides.length;
  const next = useCallback(() => setI((x) => Math.min(n - 1, x + 1)), [n]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Toucher : tiers gauche = revenir, ailleurs = avancer ; appui long = pause.
  const holdRef = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    holdRef.current = false;
    const timer = setTimeout(() => { holdRef.current = true; setPaused(true); }, 220);
    const up = (ev: PointerEvent) => {
      clearTimeout(timer);
      window.removeEventListener("pointerup", up);
      if (holdRef.current) { setPaused(false); return; }
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect && ev.clientX < rect.left + rect.width / 3) prev(); else next();
    };
    window.addEventListener("pointerup", up);
  };

  const slide = slides[Math.min(i, n - 1)];
  const last = i >= n - 1;
  return (
    <div className="recap-story">
      <div ref={frameRef} className={`rc-frame rc-bg--${slide.bg}`} onPointerDown={onPointerDown}>
        <div className="rc-bars" aria-hidden>
          {slides.map((s, j) => (
            <span key={s.key} className="rc-bar">
              {j === i && !last ? (
                <span key={`run-${i}`} className="is-run" onAnimationEnd={next}
                  style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? "paused" : "running" }} />
              ) : (
                <span className={j <= i ? "is-done" : ""} />
              )}
            </span>
          ))}
        </div>
        <div className="rc-top">
          <span className="rc-brand"><i />Poloperator</span>
          {demo && <span className="rc-demo">Maquette · chiffres inventés</span>}
          <Link href={closeHref} className="rc-close" aria-label="Fermer">✕</Link>
        </div>
        <div key={slide.key} className="rc-slide">{slide.body}</div>
        {toast && <div className="rc-toast" role="status">{toast}</div>}
      </div>
    </div>
  );
}
