/**
 * Fuseau horaire d'un tournoi. Le champ Tournament.timezone n'était jamais
 * rempli (seul le bac à sable le posait) : tous les « 21h heure locale »
 * tombaient à 21h UTC (23h en France l'été, 17h à New York). On le déduit du
 * pays, et pour les grands pays à plusieurs fuseaux, de la longitude du lieu
 * (les tournois sont géocodés). Approximation assumée près des frontières.
 */
import { countryToIso } from "@/lib/country-utils";

/** Pays à plusieurs fuseaux dont le fuseau principal n'est pas le 1er de la liste Intl. */
const MAIN_ZONE: Record<string, string> = {
  PT: "Europe/Lisbon", ES: "Europe/Madrid", DE: "Europe/Berlin", AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago", EC: "America/Guayaquil", NZ: "Pacific/Auckland", ID: "Asia/Jakarta",
  KZ: "Asia/Almaty", CN: "Asia/Shanghai", UA: "Europe/Kyiv", CY: "Asia/Nicosia", MY: "Asia/Kuala_Lumpur",
  UZ: "Asia/Tashkent", MN: "Asia/Ulaanbaatar", NL: "Europe/Amsterdam", DK: "Europe/Copenhagen",
  FR: "Europe/Paris", GB: "Europe/London", IT: "Europe/Rome", NO: "Europe/Oslo",
};

/**
 * Grands pays : [longitude minimale, fuseau], d'est en ouest (Russie et
 * Australie : d'ouest en est, cf. `eastward`).
 */
const LNG_BANDS: Record<string, { eastward?: boolean; bands: Array<[number, string]> }> = {
  US: { bands: [[-87.5, "America/New_York"], [-101, "America/Chicago"], [-114.5, "America/Denver"], [-130, "America/Los_Angeles"], [-169, "America/Anchorage"], [-180, "Pacific/Honolulu"]] },
  CA: { bands: [[-60, "America/St_Johns"], [-67.5, "America/Halifax"], [-90, "America/Toronto"], [-102, "America/Winnipeg"], [-120, "America/Edmonton"], [-180, "America/Vancouver"]] },
  MX: { bands: [[-89, "America/Cancun"], [-106, "America/Mexico_City"], [-114, "America/Mazatlan"], [-180, "America/Tijuana"]] },
  BR: { bands: [[-54, "America/Sao_Paulo"], [-66, "America/Manaus"], [-180, "America/Rio_Branco"]] },
  // Pays s'étendant vers l'est : on prend le fuseau dont la longitude max n'est pas dépassée.
  RU: { eastward: true, bands: [[22, "Europe/Kaliningrad"], [50, "Europe/Moscow"], [58, "Europe/Samara"], [68, "Asia/Yekaterinburg"], [78, "Asia/Omsk"], [96, "Asia/Novosibirsk"], [110, "Asia/Irkutsk"], [130, "Asia/Yakutsk"], [180, "Asia/Vladivostok"]] },
  AU: { eastward: true, bands: [[129, "Australia/Perth"], [138, "Australia/Darwin"], [141, "Australia/Adelaide"], [180, "Australia/Sydney"]] },
};

function intlZones(iso: string): string[] {
  try {
    const locale = new Intl.Locale(`und-${iso}`) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
    return (typeof locale.getTimeZones === "function" ? locale.getTimeZones() : locale.timeZones) ?? [];
  } catch {
    return [];
  }
}

/** Fuseau IANA probable d'un lieu (pays + longitude), ou null si pays inconnu. */
export function guessTimezone(country: string | null | undefined, lng?: number | null): string | null {
  const iso = countryToIso(country);
  if (!iso) return null;
  const spec = LNG_BANDS[iso];
  if (spec) {
    if (lng == null) return spec.eastward ? spec.bands[1][1] : spec.bands[0][1];
    if (spec.eastward) {
      for (const [max, zone] of spec.bands) if (lng <= max) return zone;
    } else {
      for (const [min, zone] of spec.bands) if (lng >= min) return zone;
    }
    return spec.bands[spec.bands.length - 1][1];
  }
  if (MAIN_ZONE[iso]) return MAIN_ZONE[iso];
  return intlZones(iso)[0] ?? null;
}

/** Fuseau effectif d'un tournoi : le sien s'il est renseigné, sinon déduit du lieu. */
export function tournamentTimezone(t: { timezone?: string | null; country?: string | null; lng?: number | null }): string | null {
  return t.timezone || guessTimezone(t.country, t.lng);
}
