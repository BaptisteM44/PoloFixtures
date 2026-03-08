import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Charte de bonne conduite — PoloFixtures" };

export default async function CharterPage() {
  const t = await getTranslations("legal_charter");
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
        <p>{t("s2_text")}</p>
      </section>

      <section>
        <h2>{t("s3_title")}</h2>
        <p>{t("s3_text")}</p>
      </section>

      <section>
        <h2>{t("s4_title")}</h2>
        <p>{t("s4_text")}</p>
      </section>

      <section>
        <h2>{t("s5_title")}</h2>
        <p>{t("s5_text")}</p>
      </section>

      <section>
        <h2>{t("s6_title")}</h2>
        <p>{t("s6_text")}</p>
      </section>

      <p className="legal-updated">{t("updated")} : {new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</p>
    </div>
  );
}
