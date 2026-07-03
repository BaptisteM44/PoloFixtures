import { getTranslations, getLocale } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mentions légales — Poloperator" };

export default async function MentionsLegalesPage() {
  const t = await getTranslations("legal_mentions");
  const locale = await getLocale();
  return (
    <div className="legal-page">
      <h1>{t("title")}</h1>

      <section>
        <h2>{t("editor_title")}</h2>
        <p>
          <strong>{t("name_label")} :</strong> Morvan<br />
          <strong>{t("address_label")} :</strong> Avenue Oscar Van Goidtsnoven 63, Bruxelles<br />
          <strong>{t("email_label")} :</strong> <a href="mailto:bapmorvan@gmail.com">bapmorvan@gmail.com</a><br />
          <strong>{t("status_label")} :</strong> {t("status_value")}
        </p>
        <p>{t("publication_director")} : Morvan</p>
      </section>

      <section>
        <h2>{t("hosting_title")}</h2>
        <p>
          {t("hosted_by")} :<br />
          <strong>Hetzner Online GmbH (via Coolify)</strong><br />
          Industriestr. 25, 91710 Gunzenhausen, {t("germany")}<br />
          <a href="https://www.hetzner.com" target="_blank" rel="noopener noreferrer">hetzner.com</a>
        </p>
        <p>
          {t("db_hosted_by")} :<br />
          <strong>Supabase Inc.</strong><br />
          970 Toa Payoh North, {t("singapore")}<br />
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a>
        </p>
      </section>

      <section>
        <h2>{t("ip_title")}</h2>
        <p>{t("ip_text_1")}</p>
        <p>{t("ip_text_2")}</p>
      </section>

      <section>
        <h2>{t("liability_title")}</h2>
        <p>{t("liability_text")}</p>
      </section>

      <section>
        <h2>{t("law_title")}</h2>
        <p>{t("law_text")}</p>
      </section>

      <p className="legal-updated">{t("updated")} : {new Date().toLocaleDateString(locale, { year: "numeric", month: "long" })}</p>
    </div>
  );
}
