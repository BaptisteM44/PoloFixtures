import { prisma } from "@/lib/db";
import { pageMetadata } from "@/lib/page-metadata";
import { AboutView, type AboutNumbers } from "@/components/AboutView";

export const revalidate = 3600; // chiffres de la communauté : une mise à jour par heure suffit

export async function generateMetadata() {
  return pageMetadata("about", true, "/about");
}

async function communityNumbers(): Promise<AboutNumbers> {
  const [players, countries, tournaments, clubs, matches, labsDone] = await Promise.all([
    prisma.player.count({ where: { status: "ACTIVE", account: { isNot: null } } }),
    prisma.player.findMany({ where: { status: "ACTIVE", account: { isNot: null } }, select: { country: true }, distinct: ["country"] }),
    prisma.tournament.count({ where: { approved: true, hidden: false, testMode: false } }),
    prisma.club.count({ where: { approved: true } }),
    prisma.match.count({ where: { status: "FINISHED", tournament: { testMode: false } } }),
    prisma.communityItem.count({ where: { status: "done" } }),
  ]);
  return { players, countries: countries.length, tournaments, clubs, matches, labsDone };
}

export default async function AboutPage() {
  return <AboutView n={await communityNumbers()} />;
}
