"use client";

/**
 * Prototype « Poloperator en mode app » (page /demo-app). Tout est factice :
 * l'objectif est de ressentir, sur un vrai téléphone, ce que donneraient une
 * barre d'onglets, un en-tête qui se réduit, une carte « live » toujours
 * visible, des feuilles qui montent du bas, le tirer pour rafraîchir, le
 * retour par balayage depuis le bord, la vibration et le hors ligne.
 * Un onglet « Moi » contient les réglages d'essai et un diagnostic.
 */
import "./app-demo.css";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode, type TouchEvent as RTouchEvent } from "react";

type TabKey = "home" | "tournaments" | "live" | "messages" | "me";
type Settings = { haptics: boolean; transitions: boolean; skeleton: boolean; installBar: boolean; liveBar: boolean };
const DEFAULTS: Settings = { haptics: true, transitions: true, skeleton: false, installBar: true, liveBar: true };
const SETTINGS_KEY = "app_demo_settings";

// ── Icônes (traits épais, comme le reste du site) ──
const ICONS = {
  home: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8" /></>,
  live: <><circle cx="12" cy="12" r="2.6" /><path d="M6.4 6.4a8 8 0 0 0 0 11.2M17.6 6.4a8 8 0 0 1 0 11.2" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  back: <path d="M15 5 8 12l7 7" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  share: <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
};
function Icon({ k, size = 24 }: { k: keyof typeof ICONS; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[k]}
    </svg>
  );
}

const TABS: { key: TabKey; label: string; icon: keyof typeof ICONS }[] = [
  { key: "home", label: "Accueil", icon: "home" },
  { key: "tournaments", label: "Tournois", icon: "trophy" },
  { key: "live", label: "Jour J", icon: "live" },
  { key: "messages", label: "Messages", icon: "chat" },
  { key: "me", label: "Moi", icon: "user" },
];
const TITLES: Record<TabKey, string> = { home: "Salut Camille", tournaments: "Tournois", live: "Jour J", messages: "Messages", me: "Moi" };

// ── Données factices ──
type Status = "live" | "open" | "done";
const STATUS_LABEL: Record<Status, string> = { live: "En cours", open: "Inscriptions ouvertes", done: "Terminé" };
const TOURNAMENTS = [
  { id: "t1", name: "Hendlbar Open", city: "Graz", country: "Autriche", dates: "7–8 nov.", status: "live" as Status, teams: "16/16", cont: "Europe" },
  { id: "t2", name: "Snow Polo Cup", city: "Lyon", country: "France", dates: "21–22 nov.", status: "open" as Status, teams: "9/16", cont: "Europe" },
  { id: "t3", name: "Grand Royal XVI", city: "Bruxelles", country: "Belgique", dates: "12–13 déc.", status: "open" as Status, teams: "12/24", cont: "Europe" },
  { id: "t4", name: "Bay Polo Classic", city: "San Francisco", country: "États-Unis", dates: "5–6 déc.", status: "open" as Status, teams: "6/12", cont: "Amérique du Nord" },
  { id: "t5", name: "Poloween", city: "Leipzig", country: "Allemagne", dates: "31 oct.", status: "done" as Status, teams: "20/20", cont: "Europe" },
];
type Tournament = (typeof TOURNAMENTS)[number];
const CONVERSATIONS = [
  { id: "c1", name: "Les Mangins", last: "On se retrouve à 8h devant le gymnase ?", time: "08:12", unread: 2 },
  { id: "c2", name: "Léa Martin", last: "Merci pour le lift 🙏", time: "hier", unread: 1 },
  { id: "c3", name: "Hendlbar Open · orga", last: "Ton match est décalé de 10 min", time: "hier", unread: 0 },
  { id: "c4", name: "Nantes Bike Polo", last: "Entraînement demain 20h", time: "lun.", unread: 0 },
];
const LIVE_MATCHES = [
  { court: "Terrain 1", a: "Steelcity", b: "Golem", sa: 2, sb: 2 },
  { court: "Terrain 2", a: "Graziella", b: "Hendl With Care", sa: 3, sb: 2 },
  { court: "Terrain 3", a: "Medusa", b: "Safety Third", sa: 1, sb: 0 },
];

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// ── Petites briques ──
function Skeleton() {
  return (
    <div className="ad-skel" aria-busy="true" aria-label="Chargement">
      <i style={{ width: "62%", height: 22 }} /><i style={{ width: "100%", height: 96 }} /><i style={{ width: "100%", height: 96 }} /><i style={{ width: "78%", height: 18 }} /><i style={{ width: "100%", height: 96 }} />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="ad-toggle ad-press" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <i className={checked ? "is-on" : ""} aria-hidden />
    </button>
  );
}

/** Feuille qui monte du bas : se ferme en tirant la poignée vers le bas, en touchant le fond ou avec Échap. */
function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y0: number; id: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const down = (e: RPointerEvent) => { drag.current = { y0: e.clientY, id: e.pointerId }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const move = (e: RPointerEvent) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y0)); };
  const up = () => { if (!drag.current) return; drag.current = null; if (dy > 100) onClose(); setDy(0); };
  return (
    <div className={`ad-sheet${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="ad-sheet__veil" onClick={onClose} />
      <div className="ad-sheet__panel" role="dialog" aria-label={title} style={{ transform: open ? `translateY(${dy}px)` : undefined, transition: drag.current ? "none" : undefined }}>
        <div className="ad-sheet__grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i /></div>
        <h2 className="ad-sheet__title">{title}</h2>
        <div className="ad-sheet__body">{children}</div>
      </div>
    </div>
  );
}

export function AppShellDemo() {
  const [tab, setTab] = useState<TabKey>("home");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [collapse, setCollapse] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Tournament | null>(null);
  const [detailDx, setDetailDx] = useState(0);
  const [sheet, setSheet] = useState<null | "filters" | "share">(null);
  const [follow, setFollow] = useState<Record<string, boolean>>({ t2: true });
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [continent, setContinent] = useState<"all" | "Europe" | "Amérique du Nord">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [scores, setScores] = useState(LIVE_MATCHES.map((m) => ({ a: m.sa, b: m.sb })));
  const [updated, setUpdated] = useState(0);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [diag, setDiag] = useState<Record<string, string>>({});
  const [installEvt, setInstallEvt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const pull = useRef<{ y0: number } | null>(null);
  const edge = useRef<{ x0: number } | null>(null);
  const hydrated = useRef(false);

  const buzz = useCallback((pattern: number | number[] = 12) => {
    if (settings.haptics && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  }, [settings.haptics]);
  const say = (msg: string) => setToast(msg);

  // Réglages mémorisés (lus après l'affichage : pas de décalage serveur/navigateur)
  useEffect(() => {
    try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) }); } catch { /* stockage indisponible */ }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Page plein écran : la page derrière ne défile pas
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Compte à rebours du prochain match
  useEffect(() => {
    const end = Date.now() + 12 * 60_000;
    const tick = () => setRemaining(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Hors ligne + installation + diagnostic
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); say("De nouveau en ligne"); };
    const off = () => setOnline(false);
    const bip = (e: Event) => { e.preventDefault(); setInstallEvt(e as unknown as { prompt: () => Promise<void> }); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("beforeinstallprompt", bip);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", bip); };
  }, []);
  useEffect(() => {
    const measure = () => {
      const cs = probeRef.current ? getComputedStyle(probeRef.current) : null;
      const inset = cs ? `${cs.paddingTop} / ${cs.paddingRight} / ${cs.paddingBottom} / ${cs.paddingLeft}` : "?";
      const nav = navigator as Navigator & { standalone?: boolean; connection?: { effectiveType?: string } };
      const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      setDiag({
        "Mode installé (standalone)": standalone ? "oui ✅" : "non (navigateur)",
        "Taille de la page": `${window.innerWidth} × ${window.innerHeight}`,
        "Zones de sécurité (haut/droite/bas/gauche)": inset,
        "Densité d'écran": String(window.devicePixelRatio),
        "Écran tactile": `${navigator.maxTouchPoints} point(s)`,
        "Vibration": "vibrate" in navigator ? "supportée ✅" : "non supportée (normal sur iPhone)",
        "Partage natif": typeof nav.share === "function" ? "oui ✅" : "non",
        "Réseau": nav.connection?.effectiveType ?? "inconnu",
        "Langue": navigator.language,
        "Thème sombre du téléphone": window.matchMedia("(prefers-color-scheme: dark)").matches ? "oui" : "non",
        "Animations réduites": window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "oui (système)" : "non",
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, []);

  // Changement d'onglet : retour en haut, squelette si demandé ; re-toucher l'onglet actif remonte en haut
  const goTab = (k: TabKey) => {
    buzz(8);
    setDetail(null);
    if (k === tab) { scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setTab(k);
    scrollRef.current?.scrollTo({ top: 0 });
    setCollapse(0);
    if (settings.skeleton) { setLoading(true); setTimeout(() => setLoading(false), 1000); }
  };

  // Tirer pour rafraîchir
  const onTouchStart = (e: RTouchEvent) => {
    // Bord gauche du cadre (centré sur ordinateur) : la zone de départ du balayage de retour
    const x = e.touches[0].clientX - (frameRef.current?.getBoundingClientRect().left ?? 0);
    if (detail && x < 28) { edge.current = { x0: e.touches[0].clientX }; return; }
    if (!detail && (scrollRef.current?.scrollTop ?? 1) <= 0 && !refreshing) pull.current = { y0: e.touches[0].clientY };
  };
  const onTouchMove = (e: RTouchEvent) => {
    if (edge.current) { setDetailDx(Math.max(0, e.touches[0].clientX - edge.current.x0)); return; }
    if (!pull.current) return;
    const dy = e.touches[0].clientY - pull.current.y0;
    if (dy > 0 && (scrollRef.current?.scrollTop ?? 1) <= 0) setPullPx(Math.min(110, dy * 0.5));
    else if (dy < 0) { pull.current = null; setPullPx(0); }
  };
  const onTouchEnd = () => {
    if (edge.current) {
      edge.current = null;
      if (detailDx > 90) { setDetail(null); buzz(8); }
      setDetailDx(0);
      return;
    }
    if (!pull.current) return;
    pull.current = null;
    if (pullPx >= 60) {
      setRefreshing(true); setPullPx(56); buzz([10, 40, 10]);
      setTimeout(() => { setRefreshing(false); setPullPx(0); setUpdated((n) => n + 1); say("À jour ✓"); }, 1000);
    } else setPullPx(0);
  };

  const scoreGoal = (i: number) => {
    buzz(25);
    setScores((s) => s.map((x, j) => (j === i ? { ...x, a: x.a + 1 } : x)));
    say(`But ! ${LIVE_MATCHES[i].a}`);
  };
  const toggleFollow = (id: string) => {
    buzz(15);
    setFollow((f) => ({ ...f, [id]: !f[id] }));
    say(follow[id] ? "Tu ne suis plus ce tournoi" : "Tu suis ce tournoi ⭐");
  };
  const shown = TOURNAMENTS.filter((t) => (statusFilter === "all" || t.status === statusFilter) && (continent === "all" || t.cont === continent));
  const filterCount = (statusFilter !== "all" ? 1 : 0) + (continent !== "all" ? 1 : 0);
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const TournamentCard = ({ t }: { t: Tournament }) => (
    <div className="ad-card ad-press" role="button" tabIndex={0} onClick={() => { buzz(8); setDetail(t); }} onKeyDown={(e) => { if (e.key === "Enter") setDetail(t); }}>
      <div className="ad-card__top">
        <span className={`ad-pill ad-pill--${t.status}`}>{STATUS_LABEL[t.status]}</span>
        <button type="button" className={`ad-iconbtn${follow[t.id] ? " is-on" : ""}`} aria-label="Suivre ce tournoi" aria-pressed={!!follow[t.id]} onClick={(e) => { e.stopPropagation(); toggleFollow(t.id); }}>
          <Icon k="star" size={22} />
        </button>
      </div>
      <h3>{t.name}</h3>
      <p>📍 {t.city}, {t.country} · {t.dates}</p>
      <p className="ad-muted">{t.teams} équipes</p>
    </div>
  );

  const content = (() => {
    if (loading) return <Skeleton />;
    switch (tab) {
      case "home": return (
        <>
          {settings.installBar && (
            <div className="ad-install">
              <span>📲 Installe l&apos;app pour les notifications de match</span>
              <button type="button" onClick={() => { setSettings((s) => ({ ...s, installBar: false })); say("Bandeau masqué (réactivable dans Moi)"); }} aria-label="Fermer">✕</button>
            </div>
          )}
          <button type="button" className="ad-hero ad-press" onClick={() => goTab("live")}>
            <span className="ad-hero__kicker">🏆 Prochain match</span>
            <strong className="ad-hero__time">{remaining == null ? "12:00" : mmss(remaining)}</strong>
            <span>Terrain 2 · contre Steelcity</span>
          </button>
          <h2 className="ad-h2">À venir pour toi</h2>
          <div className="ad-list">
            {TOURNAMENTS.slice(1, 3).map((t) => <TournamentCard key={t.id} t={t} />)}
          </div>
          <h2 className="ad-h2">Galeries <small>pellicules de la semaine</small></h2>
          <div className="ad-bubbles">
            {["Graz", "Lyon", "Leipzig", "Lille", "Rouen"].map((c, i) => (
              <button key={c} type="button" className="ad-bubble ad-press" onClick={() => { buzz(8); say(`Galerie de ${c}`); }}>
                <i style={{ background: ["var(--yellow)", "var(--teal)", "var(--pink)", "var(--purple)", "var(--orange)"][i] }}>📷</i>
                <span>{c}</span>
              </button>
            ))}
          </div>
          <p className="ad-muted ad-center">Mis à jour {updated === 0 ? "à l'instant" : `${updated} fois`} · tire vers le bas pour rafraîchir</p>
        </>
      );
      case "tournaments": return (
        <>
          <div className="ad-search">
            <input placeholder="Rechercher un tournoi, une ville…" aria-label="Rechercher" />
            <button type="button" className={`ad-iconbtn ad-iconbtn--box${filterCount ? " is-on" : ""}`} aria-label="Filtres" onClick={() => { buzz(8); setSheet("filters"); }}>
              <Icon k="filter" size={22} />{filterCount > 0 && <b>{filterCount}</b>}
            </button>
          </div>
          <div className="ad-list">
            {shown.length ? shown.map((t) => <TournamentCard key={t.id} t={t} />) : <p className="ad-muted ad-center">Aucun tournoi pour ces filtres.</p>}
          </div>
        </>
      );
      case "live": return (
        <>
          <div className="ad-hero ad-hero--plain">
            <span className="ad-hero__kicker">🏆 Ton prochain match</span>
            <strong className="ad-hero__time">{remaining == null ? "12:00" : mmss(remaining)}</strong>
            <span>Terrain 2 · Les Mangins contre Steelcity</span>
            <span className="ad-chip">🟨 Tu arbitres ensuite · Terrain 1</span>
          </div>
          <h2 className="ad-h2">En direct <small>score mis à jour sans recharger</small></h2>
          <div className="ad-list">
            {LIVE_MATCHES.map((m, i) => (
              <div key={m.court} className="ad-match">
                <small>{m.court}</small>
                <div><span>{m.a}</span><b>{scores[i].a}</b></div>
                <div><span>{m.b}</span><b>{scores[i].b}</b></div>
                <button type="button" className="ad-ghost ad-press" onClick={() => scoreGoal(i)}>＋ Simuler un but</button>
              </div>
            ))}
          </div>
        </>
      );
      case "messages": return (
        <div className="ad-list ad-list--tight">
          {CONVERSATIONS.map((c) => (
            <button key={c.id} type="button" className="ad-row ad-press" onClick={() => { buzz(8); say(`Conversation · ${c.name}`); }}>
              <span className="ad-avatar">{c.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span className="ad-row__main"><strong>{c.name}</strong><small>{c.last}</small></span>
              <span className="ad-row__side"><small>{c.time}</small>{c.unread > 0 && <b>{c.unread}</b>}</span>
            </button>
          ))}
        </div>
      );
      case "me": return (
        <>
          <div className="ad-profile">
            <span className="ad-avatar ad-avatar--big">CO</span>
            <div><strong>Camille Orga</strong><small>Nantes · Nantes Bike Polo</small></div>
          </div>
          <h2 className="ad-h2">Réglages d&apos;essai</h2>
          <div className="ad-group">
            <Toggle label="Vibrations" hint="Android uniquement (Safari iPhone ne l'autorise pas)" checked={settings.haptics} onChange={set("haptics")} />
            <Toggle label="Transitions entre écrans" hint="Fondu et glissement" checked={settings.transitions} onChange={set("transitions")} />
            <Toggle label="Simuler un chargement lent" hint="Squelettes à chaque changement d'onglet" checked={settings.skeleton} onChange={set("skeleton")} />
            <Toggle label="Bandeau d'installation discret" hint="Une seule ligne, sur l'Accueil" checked={settings.installBar} onChange={set("installBar")} />
            <Toggle label="Carte « live » flottante" hint="Le score reste visible hors de Jour J" checked={settings.liveBar} onChange={set("liveBar")} />
          </div>
          <button type="button" className="ad-ghost ad-press" onClick={() => { setSettings(DEFAULTS); say("Réglages remis par défaut"); }}>Remettre les réglages par défaut</button>

          <h2 className="ad-h2">À tester</h2>
          <ol className="ad-todo">
            <li>Tire l&apos;Accueil vers le bas : rafraîchissement.</li>
            <li>Ouvre un tournoi puis balaie depuis le bord gauche : retour.</li>
            <li>Onglet Tournois → Filtres : feuille du bas, tire la poignée pour fermer.</li>
            <li>Onglet Jour J → « Simuler un but » : le score flottant se met à jour.</li>
            <li>Active le mode avion : le bandeau « Hors connexion » apparaît.</li>
            <li>Reviens en haut en touchant l&apos;onglet actif.</li>
          </ol>

          <h2 className="ad-h2">Installer</h2>
          <div className="ad-group ad-group--pad">
            {installEvt ? (
              <button type="button" className="ad-primary ad-press" onClick={() => installEvt.prompt()}>Installer l&apos;app</button>
            ) : (
              <p className="ad-muted">iPhone : Safari → Partager → « Sur l&apos;écran d&apos;accueil ». Android : menu ⋮ → « Installer l&apos;application ». Ensuite ouvre cette page depuis l&apos;icône pour voir le vrai mode plein écran.</p>
            )}
          </div>

          <h2 className="ad-h2">Diagnostic</h2>
          <dl className="ad-diag">
            {Object.entries(diag).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
        </>
      );
    }
  })();

  const lastDetail = useRef<Tournament | null>(null);
  if (detail) lastDetail.current = detail;
  const d = detail ?? lastDetail.current;
  const showLiveBar = settings.liveBar && tab !== "live" && !detail;
  return (
    <div className="ad-stage">
      <div ref={frameRef} className="ad" style={{ "--collapse": collapse } as CSSProperties}>
        {/* Sonde : mesure les zones de sécurité (encoche, barre d'accueil) */}
        <div ref={probeRef} className="ad-probe" aria-hidden />

        {!online && <div className="ad-offline" role="status">📡 Hors connexion — dernières données affichées</div>}

        <header className="ad-bar">
          <span className="ad-bar__title">{TITLES[tab]}</span>
          <span className="ad-bar__actions">
            <button type="button" className="ad-iconbtn" aria-label="Notifications" onClick={() => { buzz(8); say("3 notifications"); }}><Icon k="bell" /><b>3</b></button>
          </span>
        </header>

        <div
          ref={scrollRef}
          className="ad-scroll"
          onScroll={(e) => setCollapse(Math.min(1, e.currentTarget.scrollTop / 44))}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className={`ad-ptr${pullPx === 0 ? " is-rest" : ""}`} style={{ height: pullPx }} aria-hidden>
            <span className={refreshing ? "is-spin" : ""} style={{ transform: refreshing ? undefined : `rotate(${pullPx * 4}deg)`, opacity: Math.min(1, pullPx / 40) }}>⟳</span>
          </div>
          <h1 className="ad-large" style={{ opacity: 1 - collapse }}>{TITLES[tab]}</h1>
          <div key={tab + (loading ? "-l" : "")} className={settings.transitions ? "ad-enter" : undefined}>{content}</div>
          <div className="ad-spacer" />
        </div>

        {showLiveBar && (
          <button type="button" className="ad-livebar ad-press" onClick={() => goTab("live")}>
            <i className="ad-dot" /><span>Terrain 2 · Graziella <b>{scores[1].a}–{scores[1].b}</b> Hendl</span><em>Voir ›</em>
          </button>
        )}

        <nav className="ad-tabs" aria-label="Navigation">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ad-tab${tab === t.key ? " is-active" : ""}`} aria-current={tab === t.key ? "page" : undefined} onClick={() => goTab(t.key)}>
              <span className="ad-tab__icon"><Icon k={t.icon} />{t.key === "messages" && <b>3</b>}{t.key === "live" && <i className="ad-dot" />}</span>
              <span className="ad-tab__label">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Écran de détail : glisse depuis la droite, retour par le bouton ou en balayant depuis le bord */}
        <section className={`ad-detail${detail ? " is-open" : ""}`} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} style={{ transform: detail ? `translateX(${detailDx}px)` : undefined, transition: edge.current ? "none" : undefined }} aria-hidden={!detail}>
          {d && (
            <>
              <header className="ad-bar ad-bar--detail">
                <button type="button" className="ad-iconbtn" aria-label="Retour" onClick={() => { buzz(8); setDetail(null); }}><Icon k="back" /></button>
                <span className="ad-bar__title" style={{ opacity: 1 }}>{d.name}</span>
                <button type="button" className="ad-iconbtn" aria-label="Partager" onClick={() => setSheet("share")}><Icon k="share" /></button>
              </header>
              <div className="ad-scroll ad-scroll--detail">
                <span className={`ad-pill ad-pill--${d.status}`}>{STATUS_LABEL[d.status]}</span>
                <h1 className="ad-large" style={{ marginTop: 10 }}>{d.name}</h1>
                <p>📍 {d.city}, {d.country}</p>
                <p>📅 {d.dates} · {d.teams} équipes</p>
                <div className="ad-actions">
                  <button type="button" className={`ad-primary ad-press${follow[d.id] ? " is-on" : ""}`} onClick={() => toggleFollow(d.id)}>{follow[d.id] ? "★ Tu le suis" : "☆ Suivre"}</button>
                  <button type="button" className="ad-ghost ad-press" onClick={() => setSheet("share")}>Partager</button>
                </div>
                <p className="ad-muted">Balaie depuis le bord gauche de l&apos;écran pour revenir, comme dans une app.</p>
              </div>
            </>
          )}
        </section>

        <Sheet open={sheet === "filters"} title="Filtres" onClose={() => setSheet(null)}>
          <p className="ad-label">Statut</p>
          <div className="ad-chips">
            {(["all", "live", "open", "done"] as const).map((s) => (
              <button key={s} type="button" className={`ad-chipbtn ad-press${statusFilter === s ? " is-on" : ""}`} onClick={() => { buzz(8); setStatusFilter(s); }}>{s === "all" ? "Tous" : STATUS_LABEL[s]}</button>
            ))}
          </div>
          <p className="ad-label">Continent</p>
          <div className="ad-chips">
            {(["all", "Europe", "Amérique du Nord"] as const).map((c) => (
              <button key={c} type="button" className={`ad-chipbtn ad-press${continent === c ? " is-on" : ""}`} onClick={() => { buzz(8); setContinent(c); }}>{c === "all" ? "Tous" : c}</button>
            ))}
          </div>
          <div className="ad-actions">
            <button type="button" className="ad-ghost ad-press" onClick={() => { setStatusFilter("all"); setContinent("all"); }}>Réinitialiser</button>
            <button type="button" className="ad-primary ad-press" onClick={() => setSheet(null)}>Voir {shown.length} tournoi{shown.length > 1 ? "s" : ""}</button>
          </div>
        </Sheet>
        <Sheet open={sheet === "share"} title="Partager" onClose={() => setSheet(null)}>
          <div className="ad-group">
            {[
              ["🔗", "Copier le lien", "Lien copié ✓"],
              ["📲", "Partager…", "Feuille de partage du téléphone"],
              ["🖼️", "Image pour une story", "Image créée (démo)"],
            ].map(([ic, label, msg]) => (
              <button key={label} type="button" className="ad-row ad-press" onClick={async () => {
                buzz(12);
                if (label === "Partager…" && typeof navigator.share === "function") { try { await navigator.share({ title: "Poloperator", url: location.origin }); } catch { /* annulé */ } }
                else say(msg);
                setSheet(null);
              }}>
                <span className="ad-avatar">{ic}</span><span className="ad-row__main"><strong>{label}</strong></span>
              </button>
            ))}
          </div>
        </Sheet>

        {toast && <div className="ad-toast" role="status">{toast}</div>}
      </div>
    </div>
  );
}
