import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/AdminNav";
import { PollManager } from "@/components/PollManager";

export default async function AdminPollsPage() {
  const t = await getTranslations("poll_manage");
  return (
    <div className="page">
      <AdminNav />
      <h1 style={{ fontFamily: "var(--font-display)", marginTop: 16 }}>📊 {t("admin_title")}</h1>
      <PollManager mode="admin" />
    </div>
  );
}
