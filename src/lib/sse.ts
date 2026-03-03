import { EventEmitter } from "events";

export type MatchUpdatePayload = {
  matchId: string;
  tournamentId: string;
  type: "match_update" | "match_event";
  data: Record<string, unknown>;
};

export type NewMatchesPayload = {
  tournamentId: string;
  type: "new_matches";
  matches: Record<string, unknown>[];
};

const globalForSse = globalThis as unknown as { sseEmitter?: EventEmitter };

export const sseEmitter = globalForSse.sseEmitter ?? new EventEmitter();

if (!globalForSse.sseEmitter) {
  globalForSse.sseEmitter = sseEmitter;
}

export function publishMatchUpdate(payload: MatchUpdatePayload) {
  sseEmitter.emit("match", payload);
}

export function publishNewMatches(payload: NewMatchesPayload) {
  sseEmitter.emit("match", payload);
}
