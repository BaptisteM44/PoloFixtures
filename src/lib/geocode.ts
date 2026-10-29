/**
 * Position d'un tournoi sur la carte (OpenStreetMap / Nominatim, au mieux).
 * L'adresse du terrain d'abord (point exact, même dans un village hors des
 * villes de polo), sinon le centre de la ville.
 */
async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "bikepolo-app" }, signal: AbortSignal.timeout(6000) },
    );
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null; // géolocalisation au mieux : jamais bloquante
  }
}

export async function geocodeTournament(p: { venueAddress?: string | null; city: string; country: string }): Promise<{ lat: number; lng: number; precise: boolean } | null> {
  const address = p.venueAddress?.trim();
  if (address) {
    // L'adresse contient souvent déjà la ville ; on l'ajoute quand même pour lever les ambiguïtés.
    const exact = await geocode(`${address}, ${p.city}, ${p.country}`) ?? await geocode(`${address}, ${p.country}`);
    if (exact) return { ...exact, precise: true };
  }
  const city = await geocode(`${p.city}, ${p.country}`);
  return city ? { ...city, precise: false } : null;
}
