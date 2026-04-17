import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.tournament.groupBy({ by: ["continentCode"], _count: { id: true } });
  console.log(JSON.stringify(r, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
