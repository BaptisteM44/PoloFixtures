import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotificationForm } from "@/components/NotificationForm";

export default async function NotificationsSettingsPage() {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) redirect("/login");

  const t = await getTranslations("settings_notifications");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefs = await (prisma as any).notificationPreference.findUnique({
    where: { playerId },
  });

  return (
    <main className="page-container" style={{ maxWidth: 680 }}>
      <h1 className="page-title">{t("title")}</h1>
      <p className="page-subtitle">{t("subtitle")}</p>

      <NotificationForm
        initialEnabled={prefs?.enabled ?? true}
        initialContinents={prefs?.continents ?? []}
        initialCountries={prefs?.countries ?? []}
        initialNotifyNewTournaments={prefs?.notifyNewTournaments ?? true}
        initialNotifyFollowedClosing={prefs?.notifyFollowedClosing ?? true}
        initialNotifySquadInvite={prefs?.notifySquadInvite ?? true}
      />
    </main>
  );
}
