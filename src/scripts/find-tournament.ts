import { prisma } from '../lib/db';
async function main() {
  const ts = await prisma.tournament.findMany({ 
    where: { name: { contains: 'montpellier', mode: 'insensitive' } }, 
    select: { id: true, name: true, slug: true } 
  });
  console.log(JSON.stringify(ts, null, 2));
  await prisma.$disconnect();
}
main();
