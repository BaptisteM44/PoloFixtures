import { notFound } from "next/navigation";
import { getScreenData } from "@/lib/screen-data";
import { TournamentScreenView } from "@/components/screen/TournamentScreenView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string; screen: string } }) {
  const data = await getScreenData(params.id);
  return { title: data ? `📺 ${data.tournament.name}` : "Poloperator", robots: { index: false } };
}

/** Écran de salle : /tournament/<tournoi>/screen/<écran> (« diaporama », « terrain-1 », ou un écran créé par l'orga). */
export default async function TournamentScreenPage({ params }: { params: { id: string; screen: string } }) {
  const data = await getScreenData(params.id);
  if (!data || !data.screens.some((s) => s.slug === params.screen)) notFound();
  return <TournamentScreenView initial={data} screenSlug={params.screen} />;
}
