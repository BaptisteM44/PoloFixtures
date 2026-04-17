import { redirect } from "next/navigation";

export default function NotificationsSettingsPage() {
  redirect("/account?tab=settings");
}
