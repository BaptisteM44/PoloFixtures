import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * robots.txt généré : autorise l'indexation des pages publiques, bloque les
 * zones privées/techniques (admin, compte, API, overlay OBS, sandbox…).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/*/admin",
        "/*/account",
        "/*/settings",
        "/*/my-teams",
        "/*/my-tournaments",
        "/*/overlay",
        "/*/tournament/*/overlay",
        "/*/tournament/*/referee",
        "/*/tournament/*/edit",
        "/*/sandbox",
        "/*/login",
        "/*/register",
        "/*/reset-password",
        "/*/forgot-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
