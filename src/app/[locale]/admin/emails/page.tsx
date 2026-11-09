/**
 * Admin — aperçu des emails envoyés par Poloperator, dans chaque langue, avec
 * des données d'exemple. Rien n'est envoyé : c'est le HTML exact des emails,
 * affiché dans un cadre (comme dans une boîte mail).
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { AdminNav } from "@/components/AdminNav";
import {
  type EmailLang, selectionEmail, waitlistEmail, tournamentDigestEmail, announceEmail,
  accommodationAssignedEmail, accommodationHostEmail, squadInviteEmail, resetPasswordEmail,
  newTournamentEmail, pollVoteConfirmEmail,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const LANGS: EmailLang[] = ["fr", "en", "de", "es", "pt"];
const T = { tournamentName: "Open de Lille #2", tournamentId: "demo", tournamentSlug: "open-de-lille-2-lille-2026" };
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const TEMPLATES: Record<string, { label: string; render: (lang: EmailLang) => { subject: string; html: string } }> = {
  selection: { label: "✅ Équipe sélectionnée", render: (l) => selectionEmail(l, { ...T, teamName: "Les Nouvêtres" }) },
  waitlist: { label: "⏳ Liste d'attente", render: (l) => waitlistEmail(l, { ...T, teamName: "Rookie n' Roule", rank: 2 }) },
  digest: {
    label: "🆕 Nouveaux tournois (quotidien)",
    render: (l) => tournamentDigestEmail(l, {
      playerName: "Baptiste",
      newTournaments: [{ id: "a", name: "LDC Tours", city: "Tours", country: "France", dateStart: soon(25) }, { id: "b", name: "Grand Royal XVI", city: "Brussels", country: "Belgium", dateStart: soon(60) }],
      closingTournaments: [{ id: "c", name: "PoloZoo Vol. 6", city: "Perpignan", country: "France", registrationEnd: soon(3) }],
    }),
  },
  announce: {
    label: "📢 Message de l'orga",
    render: (l) => announceEmail(l, {
      tournamentName: T.tournamentName, tournamentUrl: "https://poloperator.com/fr/tournament/demo", subject: "Infos pratiques pour samedi",
      messageHtml: "<p>Salut tout le monde !</p><p>Rendez-vous <strong>samedi à 9h</strong> au terrain. Pensez à vos gants et à votre lampe pour le retour.</p>",
      recipientLabel: "Les Nouvêtres",
    }),
  },
  accommodation: { label: "🏠 Hébergement attribué", render: (l) => accommodationAssignedEmail(l, { ...T, hostName: "Flavien", hostContact: "06 12 34 56 78" }) },
  host: { label: "🏠 Invités de l'hébergeur", render: (l) => accommodationHostEmail(l, { ...T, guestLines: ["Choko (Bordeaux)", "Aidan Livesey (Brussels)"] }) },
  squad: { label: "💜 Invitation squad", render: (l) => squadInviteEmail(l, { inviterName: "Mehdi", squadName: "PERPIGNAN 1", playerName: "Baptiste" }) },
  reset: { label: "🔑 Mot de passe oublié", render: (l) => resetPasswordEmail(l, { resetUrl: "https://poloperator.com/reset-password/demo" }) },
  poll: { label: "🗳️ Confirmation de vote", render: (l) => pollVoteConfirmEmail(l, { confirmUrl: "https://poloperator.com/api/polls/demo/verify", pollQuestion: "Quel format pour les Euros 2027 ?" }) },
  newTournament: { label: "🆕 Nouveau tournoi (ancien, inutilisé)", render: (l) => newTournamentEmail(l, { tournamentName: "LDC Tours", city: "Tours", country: "France", dateStart: "28 nov. 2026", tournamentId: "demo" }) },
};

export default async function AdminEmailsPage({ searchParams }: { searchParams: { t?: string; lang?: string } }) {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") redirect("/");

  const key = searchParams.t && TEMPLATES[searchParams.t] ? searchParams.t : "selection";
  const lang = (LANGS as string[]).includes(searchParams.lang ?? "") ? (searchParams.lang as EmailLang) : "fr";
  const { subject, html } = TEMPLATES[key].render(lang);
  const pill = { fontSize: 12, padding: "4px 10px", textDecoration: "none" };

  return (
    <div className="page">
      <h1>Emails</h1>
      <AdminNav />
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 16px" }}>
        Aperçu exact des emails envoyés, avec des données d&apos;exemple. Rien n&apos;est envoyé depuis cette page.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.entries(TEMPLATES).map(([k, v]) => (
          <Link key={k} href={`/admin/emails?t=${k}&lang=${lang}`} className={k === key ? "primary" : "ghost"} style={pill}>{v.label}</Link>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {LANGS.map((l) => (
          <Link key={l} href={`/admin/emails?t=${key}&lang=${l}`} className={l === lang ? "primary" : "ghost"} style={pill}>{l.toUpperCase()}</Link>
        ))}
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden", maxWidth: 680 }}>
        <div style={{ padding: "10px 14px", borderBottom: "2px solid var(--border)", fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)" }}>Objet :</span> <strong>{subject}</strong>
        </div>
        <iframe title="Aperçu de l'email" srcDoc={html} style={{ width: "100%", height: 820, border: "none", display: "block", background: "#fcfbf5" }} />
      </div>
    </div>
  );
}
