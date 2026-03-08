import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — PoloFixtures" };

export default async function PrivacyPage() {
  const t = await getTranslations("legal_privacy");
  return (
    <div className="legal-page">
      <h1>{t("title")}</h1>
      <p className="legal-intro">{t("intro")}</p>

      <section>
        <h2>{t("s1_title")}</h2>
        <p>
          <strong>Morvan</strong><br />
          Avenue Oscar Van Goidtsnoven 63, Bruxelles<br />
          {t("email_label")} : <a href="mailto:bapmorvan@gmail.com">bapmorvan@gmail.com</a>
        </p>
      </section>

      <section>
        <h2>{t("s2_title")}</h2>
        <p>{t("s2_account_intro")}</p>
        <ul>
          <li>{t("s2_name")}</li>
          <li>{t("s2_email")}</li>
          <li>{t("s2_location")}</li>
          <li>{t("s2_photo")}</li>
          <li>{t("s2_bio")}</li>
        </ul>
        <p>{t("s2_tournament_intro")}</p>
        <ul>
          <li>{t("s2_registrations")}</li>
          <li>{t("s2_results")}</li>
          <li>{t("s2_messages")}</li>
        </ul>
        <p>{t("s2_technical_intro")}</p>
        <ul>
          <li>{t("s2_ip")}</li>
          <li>{t("s2_charter_date")}</li>
          <li>{t("s2_created_at")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("s3_title")}</h2>
        <table className="legal-table">
          <thead>
            <tr><th>{t("s3_col_purpose")}</th><th>{t("s3_col_basis")}</th></tr>
          </thead>
          <tbody>
            <tr><td>{t("s3_r1_purpose")}</td><td>{t("s3_r1_basis")}</td></tr>
            <tr><td>{t("s3_r2_purpose")}</td><td>{t("s3_r2_basis")}</td></tr>
            <tr><td>{t("s3_r3_purpose")}</td><td>{t("s3_r3_basis")}</td></tr>
            <tr><td>{t("s3_r4_purpose")}</td><td>{t("s3_r4_basis")}</td></tr>
            <tr><td>{t("s3_r5_purpose")}</td><td>{t("s3_r5_basis")}</td></tr>
            <tr><td>{t("s3_r6_purpose")}</td><td>{t("s3_r6_basis")}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{t("s4_title")}</h2>
        <ul>
          <li><strong>{t("s4_active")}</strong></li>
          <li><strong>{t("s4_deleted")}</strong></li>
          <li><strong>{t("s4_messages")}</strong></li>
          <li><strong>{t("s4_ip")}</strong></li>
        </ul>
      </section>

      <section>
        <h2>{t("s5_title")}</h2>
        <p>{t("s5_intro")}</p>
        <ul>
          <li><strong>Vercel</strong> — <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">{t("s5_privacy_policy")}</a></li>
          <li><strong>Supabase</strong> — <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">{t("s5_privacy_policy")}</a></li>
          <li><strong>SMTP</strong> — {t("s5_smtp")}</li>
        </ul>
        <p>{t("s5_public_profiles")}</p>
      </section>

      <section>
        <h2>{t("s6_title")}</h2>
        <p>{t("s6_intro")}</p>
        <ul>
          <li><strong>{t("s6_access")}</strong></li>
          <li><strong>{t("s6_rectification")}</strong></li>
          <li><strong>{t("s6_erasure")}</strong></li>
          <li><strong>{t("s6_opposition")}</strong> <a href="mailto:bapmorvan@gmail.com">bapmorvan@gmail.com</a></li>
          <li><strong>{t("s6_portability")}</strong></li>
        </ul>
        <p>
          {t("s6_contact_text")} <a href="mailto:bapmorvan@gmail.com">bapmorvan@gmail.com</a>.{" "}
          {t("s6_cnil_text")} <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">CNIL</a> / <a href="https://www.autoriteprotectiondonnees.be" target="_blank" rel="noopener noreferrer">APD (Belgique)</a>.
        </p>
      </section>

      <section>
        <h2>{t("s7_title")}</h2>
        <p>{t("s7_text")}</p>
      </section>

      <section>
        <h2>{t("s8_title")}</h2>
        <p>{t("s8_text")}</p>
      </section>

      <p className="legal-updated">{t("updated")} : {new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</p>
    </div>
  );
}
