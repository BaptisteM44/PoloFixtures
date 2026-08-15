import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FullPageState } from "@/components/FullPageState";

/**
 * 404 localisée : rendue quand notFound() est appelé sous /[locale], ou pour
 * une URL inexistante. Garde le Header/Footer du layout.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("errors");
  return (
    <FullPageState
      emoji="🤷"
      title={t("not_found_title")}
      description={t("not_found_desc")}
      actions={
        <>
          <Link href="/" className="primary">{t("btn_home")}</Link>
          <Link href="/tournaments" className="ghost">{t("btn_tournaments")}</Link>
        </>
      }
    />
  );
}
