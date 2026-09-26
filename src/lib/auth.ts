import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { getIp, recentHits, recordHit } from "@/lib/rate-limit";

// Anti-brute-force des connexions (en mémoire, par instance). Seuls les ÉCHECS
// comptent : sur un tournoi, des dizaines de joueurs se connectent depuis la
// même IP (wifi du lieu, NAT de l'opérateur mobile) sans jamais être bloqués.
const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_KEY = 10;  // par email, ou par IP pour les codes d'accès
const MAX_FAILS_PER_IP = 100;  // tous comptes confondus (anti-balayage)
const ipOf = (request: Request | undefined) => (request ? getIp(request) : "unknown");
function loginBlocked(request: Request | undefined, key: string) {
  return recentHits(`login-fail-ip:${ipOf(request)}`, LOGIN_WINDOW_MS) >= MAX_FAILS_PER_IP
    || recentHits(`login-fail:${key}`, LOGIN_WINDOW_MS) >= MAX_FAILS_PER_KEY;
}
function loginFailed(request: Request | undefined, key: string) {
  recordHit(`login-fail-ip:${ipOf(request)}`);
  recordHit(`login-fail:${key}`);
}

const accessCodeSchema = z.object({
  code: z.string().min(4),
  tournamentId: z.string().optional()
});

const playerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const authConfig = {
  trustHost: true,
  providers: [
    // ---------- Codes admin/arbitre/orga ----------
    Credentials({
      id: "access-code",
      name: "Access Code",
      credentials: {
        code: { label: "Access Code", type: "password" },
        tournamentId: { label: "Tournament", type: "text" }
      },
      async authorize(raw, request) {
        const parsed = accessCodeSchema.safeParse(raw);
        if (!parsed.success) return null;
        const codeKey = `code:${ipOf(request)}`;
        if (loginBlocked(request, codeKey)) return null;

        const { code, tournamentId } = parsed.data;
        const now = new Date();
        const codes = await prisma.accessCode.findMany({
          where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          include: { operator: { select: { playerId: true, name: true, player: { select: { name: true } } } } }
        });

        for (const c of codes) {
          const ok = await bcrypt.compare(code, c.codeHash);
          if (!ok) continue;
          const opName = c.operator?.player?.name ?? c.operator?.name ?? c.role;
          return { id: c.id, role: c.role, tournamentId: c.tournamentId ?? tournamentId ?? null, name: opName, playerId: c.operator?.playerId ?? null };
        }
        loginFailed(request, codeKey);
        return null;
      }
    }),

    // ---------- Compte joueur email/password ----------
    Credentials({
      id: "player",
      name: "Player",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(raw, request) {
        const parsed = playerSchema.safeParse(raw);
        if (!parsed.success) return null;
        const typed = parsed.data.email.trim();
        const emailKey = `email:${typed.toLowerCase()}`;
        if (loginBlocked(request, emailKey)) return null;

        // Email exact d'abord ; sinon insensible à la casse (« Bap@… » = « bap@… »).
        // S'il existe plusieurs comptes ne différant que par la casse, on garde
        // celui dont le mot de passe correspond (personne n'est bloqué dehors).
        const exact = await prisma.playerAccount.findUnique({ where: { email: typed }, include: { player: true } });
        const candidates = exact
          ? [exact]
          : await prisma.playerAccount.findMany({
              where: { email: { equals: typed, mode: "insensitive" } },
              include: { player: true },
              take: 5,
            });
        let account: (typeof candidates)[number] | null = null;
        for (const c of candidates) {
          if (await bcrypt.compare(parsed.data.password, c.passwordHash)) { account = c; break; }
        }
        if (!account) { loginFailed(request, emailKey); return null; }

        // Enregistre le jour de connexion (1 ligne par jour au max)
        const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
        await prisma.loginDay.upsert({
          where: { accountId_date: { accountId: account.id, date: today } },
          create: { accountId: account.id, date: today },
          update: {}, // conserve le 1er login de la journée (no-op)
        }).catch(() => {}); // silencieux si la table n'existe pas encore

        const clubMember = await prisma.clubMember.findFirst({
          where: { playerId: account.playerId, status: "MEMBER" },
          select: { clubId: true },
        });

        return {
          id: account.id,
          name: account.player.name,
          email: account.email,
          role: null,
          playerId: account.playerId,
          tournamentId: null,
          charterAccepted: !!account.charterAcceptedAt,
          playerStatus: account.player.status,
          suspendedReason: (account.player as { suspendedReason?: string | null }).suspendedReason ?? null,
          clubId: clubMember?.clubId ?? null,
        };
      }
    })
  ],
  session: { strategy: "jwt" as const },
  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) {
        token.role = user.role ?? null;
        token.tournamentId = user.tournamentId ?? null;
        token.accessCodeId = user.id ?? null;
        token.playerId = user.playerId ?? null;
        token.charterAccepted = user.charterAccepted ?? false;
        token.playerStatus = user.playerStatus ?? null;
        token.suspendedReason = user.suspendedReason ?? null;
        token.clubId = user.clubId ?? null;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      session.user = {
        ...(session.user ?? {}),
        role: token.role ?? null,
        tournamentId: token.tournamentId ?? null,
        playerId: token.playerId ?? null,
        charterAccepted: token.charterAccepted ?? false,
        playerStatus: token.playerStatus ?? null,
        suspendedReason: token.suspendedReason ?? null,
        clubId: token.clubId ?? null,
      };
      return session;
    }
  },
  pages: { signIn: "/login" }
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
