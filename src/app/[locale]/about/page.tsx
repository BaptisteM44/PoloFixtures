import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PokemonCard } from "@/components/PokemonCard";
import { ContactForm } from "@/components/ContactForm";

export default async function AboutPage() {
  const t = await getTranslations("about");

  const features = [
    { key: "tournament", icon: "🏆" },
    { key: "registration", icon: "📋" },
    { key: "schedule", icon: "📅" },
    { key: "live", icon: "⚡" },
    { key: "players", icon: "🃏" },
    { key: "orga", icon: "🎯" },
  ] as const;

  const steps = [
    { key: "create", color: "var(--teal)" },
    { key: "register", color: "var(--pink)" },
    { key: "draw", color: "var(--yellow)" },
    { key: "play", color: "var(--teal)" },
  ] as const;

  const audiences = [
    { key: "orga", icon: "🛠️" },
    { key: "player", icon: "🚲" },
    { key: "spectator", icon: "👀" },
  ] as const;

  return (
    <div className="about-page">

      {/* ── HERO ── */}
      <section className="about-hero">
        <div className="about-hero__content">
          <span className="about-eyebrow">{t("hero_eyebrow")}</span>
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
                <div className="about-mockup__badge" style={{ background: "var(--yellow)" }}>8 équipes</div>
                <div className="about-mockup__badge" style={{ background: "var(--pink)" }}>24 joueurs</div>
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

      {/* ── PHOTO PLACEHOLDER 1 (action shot) ── */}
      <section className="about-photo-band">
        <div className="about-photo-placeholder">
          <span>📸</span>
          <p>Photo d'un match en live — un but en pleine action</p>
        </div>
        <div className="about-photo-placeholder">
          <span>📸</span>
          <p>Les équipes au tirage au sort du tournoi</p>
        </div>
        <div className="about-photo-placeholder">
          <span>📸</span>
          <p>Podium & remise des prix</p>
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

      {/* ── SCREENSHOT PLACEHOLDER ── */}
      <section className="about-section">
        <div className="about-screenshot-row">
          <div className="about-screenshot-placeholder">
            <div className="about-screenshot-placeholder__label">📱 Vue tournoi (live)</div>
          </div>
          <div className="about-screenshot-placeholder">
            <div className="about-screenshot-placeholder__label">🎯 Console arbitre</div>
          </div>
          <div className="about-screenshot-placeholder">
            <div className="about-screenshot-placeholder__label">📊 Tableau des poules</div>
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
            {"★★★".split("").map((s, i) => (
              <span key={i} style={{ color: "var(--yellow)", fontSize: 24 }}>{s}</span>
            ))}
            {"★★".split("").map((s, i) => (
              <span key={i} style={{ color: "var(--text-muted)", fontSize: 24 }}>{s}</span>
            ))}
          </div>
          <p className="meta" style={{ marginTop: 8 }}>Joue plus pour débloquer plus d'étoiles — jusqu'à 5 ✨</p>
        </div>
        <div className="about-card-section__card">
          <PokemonCard
            name="Baptiste M."
            country="France"
            city="Paris"
            badges={["champion", "hat_trick", "tidal_wave"]}
            startYear={2019}
            theme="teal"
            metalBorder="gold"
            holoVariant="iris"
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
