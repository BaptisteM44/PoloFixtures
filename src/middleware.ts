import createMiddleware from "next-intl/middleware";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { routing } from "@/i18n/routing";
import { NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);
const LOCALES_RE = /^\/(fr|en|de|es)/;

/** Retire le préfixe de locale pour les vérifications d'accès */
function stripLocale(pathname: string) {
  return pathname.replace(LOCALES_RE, "") || "/";
}

const ROLE_GUARDS: Array<{ path: string; role: Role }> = [
  { path: "/admin", role: "ADMIN" },
  { path: "/referee", role: "REF" },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const bare = stripLocale(pathname);
  const localePrefix = pathname.match(LOCALES_RE)?.[0] ?? "/fr";

  // ── Gardes de rôle ─────────────────────────────────────────────────────────
  for (const guard of ROLE_GUARDS) {
    if (bare.startsWith(guard.path)) {
      if (!session?.user?.role || !hasAtLeastRole(session.user.role, guard.role)) {
        const url = req.nextUrl.clone();
        url.pathname = `${localePrefix}/login`;
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  // ── Pages nécessitant un compte joueur ─────────────────────────────────────
  if (bare.startsWith("/account") || bare.startsWith("/my-tournaments")) {
    if (!session?.user?.playerId) {
      const url = req.nextUrl.clone();
      url.pathname = `${localePrefix}/login`;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // ── Page édition tournoi ────────────────────────────────────────────────────
  if (bare.includes("/tournament/") && bare.endsWith("/edit")) {
    if (!session?.user?.playerId && (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN"))) {
      const url = req.nextUrl.clone();
      url.pathname = `${localePrefix}/login`;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Toutes les routes sauf API, _next, fichiers statiques
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
