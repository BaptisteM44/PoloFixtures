import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";

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
      async authorize(raw) {
        const parsed = accessCodeSchema.safeParse(raw);
        if (!parsed.success) return null;

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
      async authorize(raw) {
        const parsed = playerSchema.safeParse(raw);
        if (!parsed.success) return null;

        const account = await prisma.playerAccount.findUnique({
          where: { email: parsed.data.email },
          include: { player: true }
        });
        if (!account) return null;

        const ok = await bcrypt.compare(parsed.data.password, account.passwordHash);
        if (!ok) return null;

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
