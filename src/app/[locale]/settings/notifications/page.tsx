import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/page-metadata";

export async function generateMetadata() {
  return pageMetadata("notification_settings");
}

export default function NotificationsSettingsPage() {
  redirect("/account?tab=settings");
}
