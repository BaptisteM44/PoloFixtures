import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  if (!email || !password) throw new Error("Usage: EMAIL=x PASSWORD=y npx tsx prisma/reset-password.ts");

  const hash = await bcrypt.hash(password, 10);
  const account = await prisma.playerAccount.update({
    where: { email },
    data: { passwordHash: hash },
  });
  console.log(`✅ Password reset for ${account.email}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
