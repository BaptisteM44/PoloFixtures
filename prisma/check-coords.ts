import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const cityCoords = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/data/polo-city-coords.json"), "utf8")
);

type CityEntry = { lat: number; lng: number; country: string; continent: string };

async function main() {
  const tournaments = await prisma.tournament.findMany({
    select: { id: true, name: true, city: true, country: true, lat: true, lng: true },
  });

  const mismatches: { id: string; name: string; city: string; dbLat: number | null; dbLng: number | null; refLat: number; refLng: number }[] = [];
  const noRef: { name: string; city: string; lat: number | null; lng: number | null }[] = [];

  for (const t of tournaments) {
    const ref = (cityCoords as Record<string, CityEntry>)[t.city];
    if (!ref) {
      noRef.push({ name: t.name, city: t.city, lat: t.lat, lng: t.lng });
      continue;
    }
    const latOk = t.lat !== null && Math.abs(ref.lat - t.lat) < 0.5;
    const lngOk = t.lng !== null && Math.abs(ref.lng - t.lng) < 0.5;
    if (!latOk || !lngOk) {
      mismatches.push({ id: t.id, name: t.name, city: t.city, dbLat: t.lat, dbLng: t.lng, refLat: ref.lat, refLng: ref.lng });
    }
  }

  console.log("\n=== Villes sans référence dans polo-city-coords.json ===");
  noRef.forEach(t => console.log(`  ${t.name} | ${t.city} | lat=${t.lat} lng=${t.lng}`));

  console.log("\n=== Coordonnées incorrectes en DB ===");
  mismatches.forEach(t => {
    console.log(`  [${t.name}] city=${t.city}`);
    console.log(`    DB:  lat=${t.dbLat} lng=${t.dbLng}`);
    console.log(`    REF: lat=${t.refLat} lng=${t.refLng}`);
  });

  if (mismatches.length > 0) {
    console.log("\n=== Correction des coordonnées incorrectes ===");
    for (const m of mismatches) {
      await prisma.tournament.update({
        where: { id: m.id },
        data: { lat: m.refLat, lng: m.refLng },
      });
      console.log(`  ✓ ${m.name} → lat=${m.refLat} lng=${m.refLng}`);
    }
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
