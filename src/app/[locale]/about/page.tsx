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
    { key: "map", icon: "🗺️" },
    { key: "calendar", icon: "📆" },
    { key: "formats", icon: "🔀" },
    { key: "notifications", icon: "🔔" },
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
                <div className="about-mockup__badge" style={{ background: "var(--yellow)" }}>16 teams</div>
                <div className="about-mockup__badge" style={{ background: "var(--pink)" }}>48 players</div>
                <div className="about-mockup__badge" style={{ background: "var(--teal)" }}>S.E Format</div>
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

      {/* ── SHOWCASE: CARTE INTERACTIVE ── */}
      <section className="about-showcase about-showcase--teal">
        <div className="about-showcase__text">
          <span className="about-showcase__tag" style={{ borderColor: "var(--teal)", color: "var(--teal)" }}>{t("showcase_map_tag")}</span>
          <h2>{t("showcase_map_title")}</h2>
          <p>{t("showcase_map_desc")}</p>
          <Link className="primary" href="/" style={{ alignSelf: "flex-start" }}>
            {t("showcase_map_cta")}
          </Link>
        </div>
        <div className="about-showcase__visual">
          <div className="about-showcase__mockup">
            <div className="about-mockup__bar"><span /><span /><span /></div>
            <div style={{ padding: 2, background: "var(--surface-2)" }}>
              <div style={{ width: "100%", aspectRatio: "16/10", background: "var(--bg)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, opacity: 0.08, background: "repeating-linear-gradient(0deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, var(--border) 0px, var(--border) 1px, transparent 1px, transparent 40px)" }} />
                {[
                  { top: "20%", left: "15%", color: "var(--pink)" },
                  { top: "35%", left: "45%", color: "var(--teal)" },
                  { top: "25%", left: "52%", color: "var(--teal)" },
                  { top: "40%", left: "48%", color: "var(--yellow)" },
                  { top: "30%", left: "55%", color: "var(--teal)" },
                  { top: "60%", left: "30%", color: "var(--pink)" },
                  { top: "45%", left: "70%", color: "var(--yellow)" },
                  { top: "50%", left: "80%", color: "var(--teal)" },
                  { top: "70%", left: "85%", color: "var(--pink)" },
                ].map((pin, i) => (
                  <div key={i} style={{ position: "absolute", top: pin.top, left: pin.left, width: 10, height: 10, borderRadius: "50%", background: pin.color, border: "2px solid var(--bg)", boxShadow: `0 0 8px ${pin.color}` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PHOTOS QUINCONCE 1 ── */}
      <section className="about-stagger">
        <div className="about-stagger-item about-stagger-item--left">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/live.png" alt={t("stagger1_title")} />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">{t("stagger1_tag")}</span>
            <h3>{t("stagger1_title")}</h3>
            <p>{t("stagger1_desc")}</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--right">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/tirage.png" alt={t("stagger2_title")} />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">{t("stagger2_tag")}</span>
            <h3>{t("stagger2_title")}</h3>
            <p>{t("stagger2_desc")}</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--left">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/bracket.png" alt={t("stagger3_title")} />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">{t("stagger3_tag")}</span>
            <h3>{t("stagger3_title")}</h3>
            <p>{t("stagger3_desc")}</p>
          </div>
        </div>
      </section>

      {/* ── SHOWCASE: CALENDRIER ── */}
      <section className="about-showcase about-showcase--yellow">
        <div className="about-showcase__visual">
          <div className="about-showcase__mockup">
            <div className="about-mockup__bar"><span /><span /><span /></div>
            <div style={{ padding: 16, background: "var(--surface)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--font-display)" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {Array.from({ length: 28 }, (_, i) => {
                  const hasEvent = [5, 6, 12, 13, 14, 20, 21].includes(i);
                  const colors = ["var(--pink)", "var(--teal)", "var(--yellow)"];
                  return (
                    <div key={i} style={{
                      aspectRatio: "1", borderRadius: 4, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                      background: hasEvent ? colors[i % 3] : "var(--surface-2)",
                      color: hasEvent ? "#fff" : "var(--text-muted)",
                      fontWeight: hasEvent ? 700 : 400,
                      border: `1px solid ${hasEvent ? "transparent" : "var(--border-light)"}`,
                    }}>
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="about-showcase__text">
          <span className="about-showcase__tag" style={{ borderColor: "var(--teal)", color: "var(--teal)" }}>{t("showcase_calendar_tag")}</span>
          <h2>{t("showcase_calendar_title")}</h2>
          <p>{t("showcase_calendar_desc")}</p>
          <Link className="primary" href="/calendar" style={{ alignSelf: "flex-start" }}>
            {t("showcase_calendar_cta")}
          </Link>
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

      {/* ── SCREENSHOTS QUINCONCE 2 ── */}
      <section className="about-stagger">
        <div className="about-stagger-item about-stagger-item--right">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/matchs.png" alt={t("stagger4_title")} />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">{t("stagger4_tag")}</span>
            <h3>{t("stagger4_title")}</h3>
            <p>{t("stagger4_desc")}</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--left">
          <div className="about-stagger-img-wrap about-stagger-img-wrap--portrait">
            <ParallaxImage src="/arbitre2.png" alt={t("stagger5_title")} />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">{t("stagger5_tag")}</span>
            <h3>{t("stagger5_title")}</h3>
            <p>{t("stagger5_desc")}</p>
          </div>
        </div>
        <div className="about-stagger-item about-stagger-item--right">
          <div className="about-stagger-img-wrap">
            <ParallaxImage src="/tableau.png" alt={t("stagger6_title")} />
          </div>
          <div className="about-stagger-text">
            <span className="about-stagger-tag">{t("stagger6_tag")}</span>
            <h3>{t("stagger6_title")}</h3>
            <p>{t("stagger6_desc")}</p>
          </div>
        </div>
      </section>

      {/* ── SHOWCASE: CLUBS ── */}
      <section className="about-showcase about-showcase--pink">
        <div className="about-showcase__text">
          <span className="about-showcase__tag" style={{ borderColor: "var(--pink)", color: "var(--pink)" }}>{t("showcase_clubs_tag")}</span>
          <h2>{t("showcase_clubs_title")}</h2>
          <p>{t("showcase_clubs_desc")}</p>
          <Link className="primary" href="/clubs" style={{ alignSelf: "flex-start" }}>
            {t("showcase_clubs_cta")}
          </Link>
        </div>
        <div className="about-showcase__visual">
          <div className="about-showcase__clubs-grid">
            {["Paris Bike Polo", "Berlin Hardcourt", "NYC Polo", "Tokyo BPC", "Melbourne HBC", "Barcelona Polo"].map((name, i) => (
              <div key={i} className="about-showcase__club-card">
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: ["var(--pink)", "var(--teal)", "var(--yellow)"][i % 3], border: "2px solid var(--border)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-display)" }}>{name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{[12, 8, 15, 6, 10, 9][i]} members</div>
                </div>
              </div>
            ))}
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
              <span key={i} style={{ color: "var(--pink)", fontSize: 24 }}>{s}</span>
            ))}
          </div>
        </div>
        <div className="about-card-section__card">
          <PokemonCard
            name="BM"
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
