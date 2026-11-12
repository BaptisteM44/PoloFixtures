/**
 * Page « À propos » (mise en page) — refonte nov. 2026, avec les éléments du
 * reste du site : sections à titre souligné (.section-header), cartes
 * blanches bordées (.ab-card ≈ .continent-card), encarts jaunes
 * (≈ .hero-feature-card). Quelques vraies captures (public/about/, à refaire
 * quand le site change) et des maquettes en code (arbitre, stream). En plus :
 * les photos de terrain d'ABOUT_PHOTOS (masquées tant que la liste est vide).
 * Les chiffres viennent de la page (src/app/[locale]/about/page.tsx).
 */

import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PokemonCard } from "@/components/PokemonCard";
import { ContactForm } from "@/components/ContactForm";

/** Photos de terrain (fichiers dans public/about/). Vide = bandes photo masquées. */
const ABOUT_PHOTOS: { src: string; alt: string }[] = [];

export type AboutNumbers = { players: number; countries: number; tournaments: number; clubs: number; matches: number; labsDone: number };

/** Mise en page seule (chiffres fournis) : testable sans base de données. */
export async function AboutView({ n }: { n: AboutNumbers }) {
  const t = await getTranslations("about");
  const locale = await getLocale();
  const [photoTop, photoBottom] = ABOUT_PHOTOS;

  const numbers = [
    { value: n.players, label: t("num_players") },
    { value: n.countries, label: t("num_countries") },
    { value: n.tournaments, label: t("num_tournaments") },
    { value: n.matches, label: t("num_matches") },
    { value: n.clubs, label: t("num_clubs") },
  ];

  return (
    <div className="ab">
      {/* ── HERO ── */}
      <section className="ab-hero">
        <p className="ab-eyebrow">{t("hero_eyebrow")}</p>
        <h1>{t("hero_title").replace("\n", " ")}</h1>
        <p className="ab-hero__sub">{t("hero_subtitle")}</p>
        <div className="hero-actions">
          <Link className="primary" href="/tournaments">{t("cta_tournaments")}</Link>
          <Link className="ghost" href="/tournament/new">{t("cta_organize")}</Link>
        </div>
      </section>

      {/* ── Chiffres réels ── */}
      <section className="ab-numbers" aria-label={t("numbers_label")}>
        {numbers.map((x) => (
          <div key={x.label} className="ab-card ab-number">
            <span className="ab-number__value">{x.value.toLocaleString(locale)}</span>
            <span className="ab-number__label">{x.label}</span>
          </div>
        ))}
      </section>

      {photoTop && <PhotoBand photo={photoTop} />}

      {/* ── ORGAS ── */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>{t("orga_title")}</h2>
            <p>{t("orga_sub")}</p>
          </div>
        </div>
        {/* Vitrines : vraies captures du site (Open de Lille #2) */}
        <Showcase shot="/about/bracket.webp" alt={t("orga_formats_title")} title={`🔀 ${t("orga_formats_title")}`} desc={t("orga_formats_desc")} />
      </section>

      {/* ── DÉROULÉ d'un tournoi, côté orga ── */}
      <section className="section">
        <div className="section-header">
          <div>
            <h2>{t("flow_title")}</h2>
            <p>{t("flow_sub")}</p>
          </div>
        </div>
        <ol className="ab-flow">
          {([1, 2, 3, 4, 5] as const).map((i) => (
            <li key={i} className={`ab-card ab-flow__step${i === 4 ? " ab-card--feature" : ""}`}>
              <span className="ab-flow__num" aria-hidden>{i}</span>
              <h3>{{ 1: "📣", 2: "✅", 3: "🗓️", 4: "⚡", 5: "🏆" }[i]} {t(`flow_${i}_title`)}</h3>
              <p>{t(`flow_${i}_desc`)}</p>
            </li>
          ))}
        </ol>

        {/* Arbitrage au téléphone (maquette en code, d'après TournamentRefereePanel) */}
        <div className="ab-showcase ab-showcase--reverse ab-showcase--even">
          <div className="ab-shot"><RefereeMock t={t} /></div>
          <div className="ab-showcase__text">
            <h3>📱 {t("ref_title")}</h3>
            <p>{t("ref_desc")}</p>
            <ul className="ab-points">
              <li>{t("ref_point_1")}</li>
              <li>{t("ref_point_2")}</li>
              <li>{t("ref_point_3")}</li>
            </ul>
          </div>
        </div>

        {/* Stream : overlay OBS par-dessus la vidéo (maquette en code, d'après ScoreOverlay) */}
        <div className="ab-showcase">
          <div className="ab-shot"><StreamMock court={t("demo_court")} /></div>
          <div className="ab-showcase__text">
            <h3>🎬 {t("stream_title")}</h3>
            <p>{t("stream_desc")}</p>
          </div>
        </div>

        <Showcase shot="/about/recap.webp" alt={t("orga_after_title")} title={`🏆 ${t("orga_after_title")}`} desc={t("orga_after_desc")} reverse />
      </section>

      {/* ── JOUEUR·EUSES ── */}
      <section className="section">
        <div className="section-header">
          <h2>{t("players_title")}</h2>
        </div>
        <div className="ab-players">
          <div className="ab-players__card" aria-hidden>
            <PokemonCard
              name={t("demo_player_name")}
              country="France"
              city="Lille"
              badges={["champion", "hat_trick", "globe_trotter", "on_fire", "podium", "first_blood", "comeback_kid", "veteran"]}
              startYear={2019}
              theme="teal"
              metalBorder="diamond"
              holoVariant="constellation"
            />
          </div>
          <div className="ab-players__list">
            {(["card", "badges", "notifs", "recap"] as const).map((k) => (
              <article key={k} className="ab-card">
                <h3>{{ card: "🃏", badges: "🏅", notifs: "🔔", recap: "🎁" }[k]} {t(`players_${k}_title`)}</h3>
                <p>{t(`players_${k}_desc`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMMUNAUTÉ ── */}
      <section className="section">
        <div className="section-header">
          <h2>{t("community_title")}</h2>
        </div>
        <div className="ab-shots">
          <Link href="/" className="ab-shot ab-shot--link">
            <Shot src="/about/map.webp" alt={t("community_map_title")} />
            <span className="ab-shot__caption">🗺️ {t("community_map_title")}</span>
          </Link>
          <Link href="/calendar" className="ab-shot ab-shot--link">
            <Shot src="/about/calendar.webp" alt={t("community_map_title")} />
            <span className="ab-shot__caption">📅 {t("community_map_desc")}</span>
          </Link>
        </div>
        <div className="ab-grid">
          <Link href="/clubs" className="ab-card ab-card--link">
            <h3>🏙️ {t("community_clubs_title")}</h3>
            <p>{t("community_clubs_desc")}</p>
          </Link>
          <Link href="/polls" className="ab-card ab-card--link">
            <h3>📊 {t("community_polls_title")}</h3>
            <p>{t("community_polls_desc")}</p>
          </Link>
          <Link href="/labs" className="ab-card ab-card--link">
            <h3>🧪 {t("community_labs_title")}</h3>
            <p>{t("community_labs_desc", { count: n.labsDone })}</p>
          </Link>
          <article className="ab-card">
            <h3>💬 {t("community_chat_title")}</h3>
            <p>{t("community_chat_desc")}</p>
          </article>
          <article className="ab-card ab-card--wide">
            <h3>🌍 {t("community_lang_title")}</h3>
            <p>{t("community_lang_desc")}</p>
          </article>
        </div>
      </section>

      {photoBottom && <PhotoBand photo={photoBottom} />}

      {/* ── VALEURS : encart jaune, comme celui de la home visiteur ── */}
      <section className="section">
        <div className="ab-values hero-feature-card">
          {(["free", "community", "data"] as const).map((k) => (
            <div key={k} className="ab-value">
              <h3>{{ free: "❤️", community: "🚲", data: "🔒" }[k]} {t(`value_${k}_title`)}</h3>
              <p>{t(`value_${k}_desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="section ab-cta">
        <h2>{t("final_title")}</h2>
        <div className="hero-actions">
          <Link className="primary" href="/tournament/new">{t("cta_organize")}</Link>
          <Link className="ghost" href="/register">{t("cta_join")}</Link>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="section ab-contact" id="contact">
        <div className="section-header">
          <div>
            <h2>{t("contact_title")}</h2>
            <p>{t("contact_subtitle")}</p>
          </div>
        </div>
        <ContactForm />
      </section>
    </div>
  );
}

function PhotoBand({ photo }: { photo: { src: string; alt: string } }) {
  return (
    <div className="ab-photo">
      <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 1200px) 100vw, 1200px" style={{ objectFit: "cover" }} />
    </div>
  );
}

/** Capture d'écran dans un cadre « fenêtre », au style des cartes du site. */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="ab-frame">
      <span className="ab-frame__bar" aria-hidden><i /><i /><i /></span>
      <Image src={src} alt={alt} width={2720} height={1630} sizes="(max-width: 900px) 100vw, 700px" className="ab-frame__img" />
    </span>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"about">>>;

/** Téléphone d'arbitre : score, chrono, actions (purement décoratif). */
function RefereeMock({ t }: { t: T }) {
  return (
    <div className="ab-phone" aria-hidden>
      <div className="ab-phone__screen">
        <div className="ab-ref__top"><span className="ab-ref__live">● LIVE</span><span>{t("demo_court")}</span></div>
        <div className="ab-ref__clock">08:42</div>
        <div className="ab-ref__teams">
          <div className="ab-ref__team">
            <span className="ab-ref__name">Les Mailloches</span>
            <span className="ab-ref__score">3</span>
            <span className="ab-ref__btn ab-ref__btn--goal">+ {t("demo_ref_goal")}</span>
          </div>
          <div className="ab-ref__team">
            <span className="ab-ref__name">Fixie Fury</span>
            <span className="ab-ref__score">2</span>
            <span className="ab-ref__btn ab-ref__btn--goal">+ {t("demo_ref_goal")}</span>
          </div>
        </div>
        <div className="ab-ref__row">
          <span className="ab-ref__btn">🟨 {t("demo_ref_penalty")}</span>
          <span className="ab-ref__btn">⏸ {t("demo_ref_timeout")}</span>
        </div>
        <div className="ab-ref__feed">⚽ 07:58 · Lou M. <em>Les Mailloches</em></div>
      </div>
    </div>
  );
}

/** Vidéo de match avec l'overlay score/chrono incrusté (purement décoratif). */
function StreamMock({ court }: { court: string }) {
  return (
    <span className="ab-frame" aria-hidden>
      <span className="ab-frame__bar"><i /><i /><i /><b className="ab-frame__title">OBS · {court}</b></span>
      <span className="ab-stream">
        <span className="ab-stream__court" />
        {[1, 2, 3, 4, 5, 6].map((i) => <span key={i} className={`ab-stream__p ab-stream__p--${i}`} />)}
        <span className="ab-stream__rec">● REC</span>
        <span className="ab-stream__bug">
          <span className="ab-stream__team">Les Mailloches</span>
          <span className="ab-stream__score">3 – 2</span>
          <span className="ab-stream__team">Fixie Fury</span>
          <span className="ab-stream__clock">08:42</span>
        </span>
        <span className="ab-stream__feed">⚽ Lou M. · 07:58</span>
      </span>
    </span>
  );
}

function Showcase({ shot, alt, title, desc, reverse }: { shot: string; alt: string; title: string; desc: string; reverse?: boolean }) {
  return (
    <div className={`ab-showcase${reverse ? " ab-showcase--reverse" : ""}`}>
      <div className="ab-shot"><Shot src={shot} alt={alt} /></div>
      <div className="ab-showcase__text">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}
