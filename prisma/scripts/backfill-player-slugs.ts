/**
 * Backfill slugs for players that don't have one yet.
 * Run with: npx tsx prisma/scripts/backfill-player-slugs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function main() {
  const players = await prisma.player.findMany({
    where: { slug: null },
    select: { id: true, name: true },
  });

  console.log(`Found ${players.length} players without slug`);

  let updated = 0;
  for (const player of players) {
    const base = toSlug(player.name);
    let slug = base;
    let si = 2;
    while (await prisma.player.findUnique({ where: { slug } })) {
      slug = `${base}-${si++}`;
    }
    await prisma.player.update({ where: { id: player.id }, data: { slug } });
    console.log(`  ${player.name} → ${slug}`);
    updated++;
  }

  console.log(`\nDone: ${updated} slugs generated`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
