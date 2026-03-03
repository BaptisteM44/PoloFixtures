import { Role } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: Role | null;
      tournamentId: string | null;
      playerId: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role | null;
    tournamentId?: string | null;
    accessCodeId?: string | null;
    playerId?: string | null;
  }
}
