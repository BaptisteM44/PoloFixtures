"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateFridaySwissRoundAction,
  computeSaturdayGroupsAction,
  generateSaturdaySwissRoundAction,
  generateSundaySwissRoundAction,
  generateBerlinFinalBracketsAction,
} from "@/app/[locale]/tournament/[id]/edit/berlin-mixed-actions";

interface Props {
  tournamentId: string;
  teams: any[];
  matches: any[];
  tournament: any;
  /** Which section to display. Defaults to "all" (legacy full view). */
  phase?: "vendredi" | "samedi" | "dimanche" | "brackets" | "all";
}

// Count rounds for a given phase
function countRounds(matches: any[], phase: string) {
  const filtered = matches.filter((m) => m.phase === phase);
  return filtered.length > 0 ? Math.max(...filtered.map((m: any) => m.roundIndex)) : 0;
}

function allFinished(matches: any[], phase: string, round: number) {
  const filtered = matches.filter((m) => m.phase === phase && m.roundIndex === round);
  return filtered.length > 0 && filtered.every((m: any) => m.status === "FINISHED");
}

function phaseFinished(matches: any[], phase: string, maxRounds: number) {
  const rounds = countRounds(matches, phase);
  return rounds >= maxRounds && allFinished(matches, phase, rounds);
}

export function BerlinMixedActions({ tournamentId, teams, matches, tournament, phase = "all" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const fridayRounds = tournament.fridayRounds ?? 5;
  const saturdayRounds = tournament.saturdayRounds ?? 5;
  const sundayRounds = tournament.sundayRounds ?? 2;

  const friARounds = countRounds(matches, "FRIDAY_A");
  const friBRounds = countRounds(matches, "FRIDAY_B");
  const satARounds = countRounds(matches, "SATURDAY_A");
  const satBRounds = countRounds(matches, "SATURDAY_B");
  const sunRounds = countRounds(matches, "SUNDAY_SWISS");

  const friADone = phaseFinished(matches, "FRIDAY_A", fridayRounds);
  const friBDone = phaseFinished(matches, "FRIDAY_B", fridayRounds);
  const fridayDone = friADone && friBDone;

  const saturdayGroupsAssigned = teams.some((t) => t.saturdayGroup);
  const satADone = phaseFinished(matches, "SATURDAY_A", saturdayRounds);
  const satBDone = phaseFinished(matches, "SATURDAY_B", saturdayRounds);
  const saturdayDone = satADone && satBDone;

  const sundaySwissDone = phaseFinished(matches, "SUNDAY_SWISS", sundayRounds);
  const top32Generated = matches.some((m) => m.phase === "TOP32");
  const bottom16Generated = matches.some((m) => m.phase === "BOTTOM16");

  const canGenFriA = !friADone && (friARounds === 0 || allFinished(matches, "FRIDAY_A", friARounds));
  const canGenFriB = !friBDone && (friBRounds === 0 || allFinished(matches, "FRIDAY_B", friBRounds));
  const canComputeSatGroups = fridayDone && !saturdayGroupsAssigned;
  const canGenSatA = saturdayGroupsAssigned && !satADone && (satARounds === 0 || allFinished(matches, "SATURDAY_A", satARounds));
  const canGenSatB = saturdayGroupsAssigned && !satBDone && (satBRounds === 0 || allFinished(matches, "SATURDAY_B", satBRounds));
  const canGenSunday = saturdayDone && !sundaySwissDone && (sunRounds === 0 || allFinished(matches, "SUNDAY_SWISS", sunRounds));
  const canGenBrackets = sundaySwissDone && !top32Generated;

  const run = (fn: () => Promise<any>) => {
    startTransition(async () => {
      setMessage(null);
      const res = await fn();
      if (res && "error" in res) {
        setMessage(`Erreur : ${res.error}`);
      } else {
        router.refresh();
      }
    });
  };

  const btn = (label: string, onClick: () => void, enabled: boolean, danger = false) => (
    <button
      type="button"
      className={danger ? "ghost" : "primary"}
      onClick={onClick}
      disabled={!enabled || pending}
      style={{
        fontSize: 12,
        padding: "7px 14px",
        opacity: enabled ? 1 : 0.4,
        color: danger ? "var(--danger)" : undefined,
      }}
    >
      {pending ? "..." : label}
    </button>
  );

  const status = (done: boolean, current: number, max: number) => (
    <span style={{ fontSize: 11, color: done ? "var(--teal)" : "var(--text-muted)" }}>
      {current}/{max} tours {done ? "✓" : ""}
    </span>
  );

  const sectionVendredi = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {btn(`Groupe A — Tour ${friARounds + 1}`, () => run(() => generateFridaySwissRoundAction(tournamentId, "A")), canGenFriA)}
          {status(friADone, friARounds, fridayRounds)}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {btn(`Groupe B — Tour ${friBRounds + 1}`, () => run(() => generateFridaySwissRoundAction(tournamentId, "B")), canGenFriB)}
          {status(friBDone, friBRounds, fridayRounds)}
        </div>
      </div>
    </div>
  );

  const sectionSamedi = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Transition Ven → Sam */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: 0 }}>
          Classement global &amp; groupes Samedi
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {btn("Calculer groupes Samedi", () => run(() => computeSaturdayGroupsAction(tournamentId)), canComputeSatGroups)}
          {saturdayGroupsAssigned && <span style={{ fontSize: 11, color: "var(--teal)" }}>Groupes assignés ✓</span>}
          {!fridayDone && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>En attente du Vendredi</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {btn(`Groupe A — Tour ${satARounds + 1}`, () => run(() => generateSaturdaySwissRoundAction(tournamentId, "A")), canGenSatA)}
          {status(satADone, satARounds, saturdayRounds)}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {btn(`Groupe B — Tour ${satBRounds + 1}`, () => run(() => generateSaturdaySwissRoundAction(tournamentId, "B")), canGenSatB)}
          {status(satBDone, satBRounds, saturdayRounds)}
        </div>
      </div>
    </div>
  );

  const sectionDimanche = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        Grand Swiss 48 équipes — aucun rematch possible avec Vendredi ni Samedi.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {btn(`Tour Swiss Dimanche ${sunRounds + 1}`, () => run(() => generateSundaySwissRoundAction(tournamentId)), canGenSunday)}
        {status(sundaySwissDone, sunRounds, sundayRounds)}
        {!saturdayDone && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>En attente du Samedi</span>}
      </div>
    </div>
  );

  const sectionBrackets = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        Top 32 (SE + petite finale) + Bottom 16 (SE + petite finale), seedés par classement Sunday Swiss.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {btn("Générer Top 32 + Bottom 16", () => run(() => generateBerlinFinalBracketsAction(tournamentId)), canGenBrackets)}
        {top32Generated && <span style={{ fontSize: 11, color: "var(--teal)" }}>Top 32 ✓</span>}
        {bottom16Generated && <span style={{ fontSize: 11, color: "var(--teal)" }}>Bottom 16 ✓</span>}
        {!sundaySwissDone && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>En attente du Swiss Dimanche</span>}
      </div>
      {(top32Generated || bottom16Generated) && (
        <button
          type="button"
          className="ghost"
          style={{ fontSize: 11, padding: "4px 10px", color: "var(--danger)", alignSelf: "flex-start" }}
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Régénérer les brackets ? Les matchs existants seront supprimés.")) return;
            run(() => generateBerlinFinalBracketsAction(tournamentId));
          }}
        >
          Régénérer les brackets
        </button>
      )}
    </div>
  );

  const sections: Record<string, React.ReactNode> = {
    vendredi: sectionVendredi,
    samedi: sectionSamedi,
    dimanche: sectionDimanche,
    brackets: sectionBrackets,
    all: (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div><p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>Vendredi</p>{sectionVendredi}</div>
        <div><p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>Samedi</p>{sectionSamedi}</div>
        <div><p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>Dimanche Swiss</p>{sectionDimanche}</div>
        <div><p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10 }}>Brackets finaux</p>{sectionBrackets}</div>
      </div>
    ),
  };

  return (
    <div>
      {sections[phase] ?? sections["all"]}
      {message && (
        <p style={{ fontSize: 12, color: message.startsWith("Erreur") ? "var(--danger)" : "var(--teal)", margin: "12px 0 0" }}>
          {message}
        </p>
      )}
    </div>
  );
}
