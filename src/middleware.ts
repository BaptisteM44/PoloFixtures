import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { Role } from "@prisma/client";

const ROLE_GUARDS: Array<{ path: string; role: Role }> = [
  { path: "/admin", role: "ADMIN" },
  { path: "/referee", role: "REF" },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  for (const guard of ROLE_GUARDS) {
    if (pathname.startsWith(guard.path)) {
      if (!session?.user?.role || !hasAtLeastRole(session.user.role, guard.role)) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  // account & my-tournaments pages -> needs player session
  if (pathname.startsWith("/account") || pathname.startsWith("/my-tournaments")) {
    if (!session?.user?.playerId) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // organizer dashboard -> needs player who is creator of this tournament
  if (pathname.startsWith("/tournament/") && pathname.endsWith("/edit")) {
    if (!session?.user?.playerId && (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN"))) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/my-tournaments/:path*", "/tournament/:path*/edit", "/referee"]
};
