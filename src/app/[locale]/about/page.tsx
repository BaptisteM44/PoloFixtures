import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PokemonCard } from "@/components/PokemonCard";
import { ContactForm } from "@/components/ContactForm";
import { ParallaxImage } from "@/components/ParallaxImage";

export default async function AboutPage() {
  const t = await getTranslations("about");

  const features = [
    { key: "tournament", icon: "🏆" },
    { key: "registration", icon: "📋" },
    { key: "schedule", icon: "📅" },
    { key: "live", icon: "⚡" },
    { key: "players", icon: "🃏" },
    { key: "squads", icon: "👥" },
    { key: "clubs", icon: "🏙️" },
    { key: "orga", icon: "🎯" },
  ] as const;

  const steps = [
    { key: "create", color: "var(--pink)" },
    { key: "register", color: "var(--yellow)" },
    { key: "draw", color: "var(--teal)" },
    { key: "play", color: "var(--pink)" },
  ] as const;

  const audiences = [
    { key: "orga", icon: "🛠️" },
    { key: "player", icon: "🚲" },
  ] as const;

  return (
    <div className="about-page">

      {/* ── HERO ── */}
      <section className="about-hero">
        <div className="about-hero__content">
          <h1 className="about-hero__title">
            {t("hero_title").split("\n").map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}
          </h1>
          <p className="about-hero__subtitle">{t("hero_subtitle")}</p>
          <div className="about-hero__actions">
            <Link className="primary" href="/tournaments" style={{ fontSize: 15, padding: "11px 28px" }}>
              {t("hero_cta_primary")}
            </Link>
            <Link className="ghost" href="/tournament/new" style={{ fontSize: 15, padding: "11px 28px" }}>
              {t("hero_cta_secondary")}
            </Link>
          </div>
        </div>
        <div className="about-hero__visual">
          <div className="about-mockup">
            <div className="about-mockup__bar">
              <span /><span /><span />
            </div>
            <div className="about-mockup__content">
              <div className="about-mockup__row" style={{ background: "var(--teal)" }}>
                <span>🏆 Bike Polo Paris Open</span>
                <span className="status live">LIVE</span>
              </div>
              <div className="about-mockup__row">
                <span>Pool A · Court 1</span>
                <strong>3 — 1</strong>
              </div>
              <div className="about-mockup__row">
                <span>Pool B · Court 2</span>
                <strong>0 — 2</strong>
              </div>
              <div className="about-mockup__row" style={{ opacity: 0.5 }}>
                <span>Bracket · SF1</span>
                <strong>— — —</strong>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <div className="about-mockup__badge" style={{ background: "var(--yellow)" }}>16 équipes</div>
                <div className="about-mockup__badge" style={{ background: "var(--pink)" }}>48 joueurs</div>
                <div className="about-mockup__badge" style={{ background: "var(--teal)" }}>SE Format</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── POUR QUI ── */}
      <section className="about-section">
        <h2 className="about-section__title">{t("for_who_title")}</h2>
        <div className="about-audience-grid">
          {audiences.map(({ key, icon }) => (
            <div key={key} className="about-audience-card">
              <span className="about-audience-card__icon">{icon}</span>
              <h3>{t(`for_${key}_title` as Parameters<typeof t>[0])}</h3>
              <p>{t(`for_${key}_desc` as Parameters<typeof t>[0])}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PHOTOS QUINCONCE ── */}
      <section className="about-stagger">
        <div className="about-stagger-item about-stagger-item--left">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/live.png" alt="Match en live" />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">Live</span>
            <h3>Matches en direct</h3>
            <p>Suivez chaque but, chaque score en temps réel depuis n'importe quel appareil.</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--right">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/tirage.png" alt="Tirage au sort" />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">Organisation</span>
            <h3>Tirage au sort</h3>
            <p>Générez vos poules automatiquement, avec optimisation des têtes de série.</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--left">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/bracket.png" alt="Podium" />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">Bracket</span>
            <h3>Tableau final</h3>
            <p>Un bracket clair, mis à jour en live jusqu'au podium.</p>
          </div>
        </div>
      </section>

      {/* ── FONCTIONNALITÉS ── */}
      <section className="about-section about-section--dark">
        <h2 className="about-section__title">{t("features_title")}</h2>
        <div className="about-features-grid">
          {features.map(({ key, icon }) => (
            <div key={key} className="about-feature-card">
              <span className="about-feature-card__icon">{icon}</span>
              <h3>{t(`feat_${key}_title` as Parameters<typeof t>[0])}</h3>
              <p>{t(`feat_${key}_desc` as Parameters<typeof t>[0])}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SCREENSHOTS QUINCONCE ── */}
      <section className="about-stagger">
        <div className="about-stagger-item about-stagger-item--right">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/matchs.png" alt="Vue tournoi live" />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">App</span>
            <h3>Vue tournoi live</h3>
            <p>Tous les matchs d'un tournoi sur une seule page, mis à jour en temps réel.</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--left">
          <div className="about-stagger-img-wrap about-stagger-img-wrap--portrait">
            <ParallaxImage src="/arbitre2.png" alt="Console arbitre" />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">Arbitrage</span>
            <h3>Console arbitre</h3>
            <p>Saisissez les buts, gérez le chrono et le golden goal directement depuis votre téléphone.</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--right">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/tableau.png" alt="Tableau des poules" />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">Classement</span>
            <h3>Tableau des poules</h3>
            <p>Points, goal average, qualifications — tout est calculé et affiché instantanément.</p>
          </div>
        </div>
      </section>

      {/* ── COMMENT ÇA MARCHE ── */}
      <section className="about-section about-section--dark">
        <h2 className="about-section__title">{t("how_title")}</h2>
        <div className="about-steps">
          {steps.map(({ key, color }, i) => (
            <div key={key} className="about-step">
              <div className="about-step__connector">
                <div className="about-step__num" style={{ background: color }}>
                  {t(`step_${key}_num` as Parameters<typeof t>[0])}
                </div>
                {i < steps.length - 1 && <div className="about-step__line" />}
              </div>
              <div className="about-step__body">
                <h3>{t(`step_${key}_title` as Parameters<typeof t>[0])}</h3>
                <p>{t(`step_${key}_desc` as Parameters<typeof t>[0])}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CARTE JOUEUR ── */}
      <section className="about-section about-card-section">
        <div className="about-card-section__text">
          <h2>{t("card_section_title")}</h2>
          <p>{t("card_section_desc")}</p>
          <div className="about-card-stars">
            {"★★★★★".split("").map((s, i) => (
              <span key={i} style={{ color: "var(--yellow)", fontSize: 24 }}>{s}</span>
            ))}
          </div>
        </div>
        <div className="about-card-section__card">
          <PokemonCard
            name="Baptiste M."
            country="France"
            city="Paris"
            badges={[
              "unbeaten", "eruption", "century_club",
              "champion", "back_to_back", "comeback_kid", "globe_trotter", "circus_act",
              "hat_trick", "tidal_wave", "golden_double", "on_fire", "dragon_slayer", "goal_machine",
              "reverse_sweep", "wild_card", "united_nations", "no_days_off",
              "first_blood", "hat_trick", "podium", "dedicated",
              "veteran", "tidal_wave", "on_fire", "dragon_slayer",
              "wild_card", "comeback_kid", "globe_trotter", "circus_act",
            ]}
            startYear={2019}
            theme="teal"
            metalBorder="diamond"
            holoVariant="constellation"
          />
        </div>
      </section>

      {/* ── GRATUIT ── */}
      <section className="about-free">
        <div className="about-free__inner">
          <span style={{ fontSize: 40 }}>❤️</span>
          <h2>{t("free_title")}</h2>
          <p>{t("free_desc")}</p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="about-cta">
        <h2>{t("cta_title")}</h2>
        <p className="meta">{t("cta_subtitle")}</p>
        <Link className="primary" href="/tournament/new" style={{ fontSize: 16, padding: "14px 36px", marginTop: 8 }}>
          {t("cta_btn")}
        </Link>
      </section>

      {/* ── CONTACT ── */}
      <section className="about-section about-contact-section">
        <div className="about-contact-inner">
          <h2>{t("contact_title")}</h2>
          <p className="meta" style={{ marginBottom: 32, maxWidth: 520, margin: "0 auto 32px" }}>{t("contact_subtitle")}</p>
          <ContactForm />
        </div>
      </section>

    </div>
  );
}
