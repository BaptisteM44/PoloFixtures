/**
 * Create a new admin access code.
 * Usage: ADMIN_CODE=moncode npx tsx prisma/create-admin-code.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const code = process.env.ADMIN_CODE;
  if (!code) throw new Error("Set ADMIN_CODE env var: ADMIN_CODE=yourcode npx tsx prisma/create-admin-code.ts");

  const codeHash = await bcrypt.hash(code, 10);
  const record = await prisma.accessCode.create({
    data: { role: "ADMIN", codeHash },
  });
  console.log(`✅ Admin code created: ${record.id}`);
  console.log(`   Role: ${record.role}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
