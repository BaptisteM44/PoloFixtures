import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const account = await prisma.playerAccount.findUnique({
    where: { email: "baptiste@bikepolo.dev" },
    include: { player: { select: { id: true, name: true, status: true } } }
  });
  console.log(JSON.stringify(account, null, 2));
}
main().finally(() => prisma.$disconnect());
