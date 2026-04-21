import { getTranslations, getLocale } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Use — Poloperator" };

export default async function TermsPage() {
  const t = await getTranslations("legal_terms");
  const locale = await getLocale();
  return (
    <div className="legal-page">
      <h1>{t("title")}</h1>
      <p className="legal-intro">{t("intro")}</p>

      <section>
        <h2>{t("s1_title")}</h2>
        <p>{t("s1_text")}</p>
      </section>

      <section>
        <h2>{t("s2_title")}</h2>
        <ul>
          <li>{t("s2_age")}</li>
          <li>{t("s2_accuracy")}</li>
          <li>{t("s2_password")}</li>
          <li>{t("s2_one_account")}</li>
          <li>{t("s2_delete")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("s3_title")}</h2>
        <p>{t("s3_intro")}</p>
        <ul>
          <li>{t("s3_respect")}</li>
          <li>{t("s3_no_harassment")}</li>
          <li>{t("s3_fair_play")}</li>
          <li>{t("s3_no_spam")}</li>
          <li>{t("s3_report")}</li>
        </ul>
        <p>{t("s3_sanction")}</p>
      </section>

      <section>
        <h2>{t("s4_title")}</h2>
        <p>{t("s4_ownership")}</p>
        <p>{t("s4_forbidden_intro")}</p>
        <ul>
          <li>{t("s4_illegal")}</li>
          <li>{t("s4_false")}</li>
          <li>{t("s4_malware")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("s5_title")}</h2>
        <p>{t("s5_intro")}</p>
        <ul>
          <li><strong>{t("s5_player")}</strong></li>
          <li><strong>{t("s5_ref")}</strong></li>
          <li><strong>{t("s5_orga")}</strong></li>
          <li><strong>{t("s5_admin")}</strong></li>
        </ul>
        <p>{t("s5_access_codes")}</p>
      </section>

      <section>
        <h2>{t("s6_title")}</h2>
        <p>{t("s6_text")}</p>
      </section>

      <section>
        <h2>{t("s7_title")}</h2>
        <p>{t("s7_text")}</p>
      </section>

      <section>
        <h2>{t("s8_title")}</h2>
        <p>{t("s8_text")}</p>
      </section>

      <section>
        <h2>{t("s9_title")}</h2>
        <p>{t("s9_text")}</p>
      </section>

      <p className="legal-updated">{t("updated")} : {new Date().toLocaleDateString(locale, { year: "numeric", month: "long" })}</p>
    </div>
  );
}
