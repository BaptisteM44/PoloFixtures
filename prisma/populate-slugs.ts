import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9\s-]/g, "")   // caractères spéciaux
    .trim()
    .replace(/\s+/g, "-");           // espaces → tirets
}

async function main() {
  const players = await prisma.player.findMany({ select: { id: true, name: true, slug: true } });
  let updated = 0;

  for (const player of players) {
    if (player.slug) continue; // déjà un slug

    const base = toSlug(player.name);
    let slug = base;
    let i = 2;

    // Unicité
    while (await prisma.player.findUnique({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }

    await prisma.player.update({ where: { id: player.id }, data: { slug } });
    console.log(`  ${player.name} → /player/${slug}`);
    updated++;
  }

  console.log(`\n✅ ${updated} joueurs mis à jour.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
