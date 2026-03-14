import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const teams = await prisma.team.findMany({
    where: { tournament: { name: "Paris Hardcourt Open 2026" } },
    select: { id: true, name: true, seed: true, selected: true, waitlistPosition: true },
    orderBy: [{ selected: "desc" }, { seed: "asc" }],
  });
  console.log(JSON.stringify(teams, null, 2));
}
main().finally(() => prisma.$disconnect());
