import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/AdminNav";
import { PollManager } from "@/components/PollManager";
import { PollApprovalQueue } from "@/components/PollApprovalQueue";

export default async function AdminPollsPage() {
  const t = await getTranslations("poll_manage");
  return (
    <div className="page">
      <AdminNav />
      <h1 style={{ fontFamily: "var(--font-display)", marginTop: 16 }}>📊 {t("admin_title")}</h1>
      <div style={{ marginTop: 16 }}><PollApprovalQueue /></div>
      <PollManager mode="admin" />
    </div>
  );
}
