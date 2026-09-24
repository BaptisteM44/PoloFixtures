import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PollManager } from "@/components/PollManager";

export default async function MyPollsPage() {
  const session = await auth();
  if (!session?.user?.playerId) redirect("/login");
  const t = await getTranslations("poll_manage");
  const tp = await getTranslations("poll");

  return (
    <div className="page" style={{ maxWidth: 760, margin: "0 auto" }}>
      <Link href="/polls" className="ghost" style={{ fontSize: 13 }}>← {tp("page_title")}</Link>
      <h1 style={{ fontFamily: "var(--font-display)", marginTop: 12 }}>📊 {t("page_title")}</h1>
      <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("page_intro")}</p>
      <PollManager mode="mine" />
    </div>
  );
}
