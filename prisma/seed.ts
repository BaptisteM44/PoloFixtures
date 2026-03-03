import { PrismaClient, Role, PlayerStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const knownCountries = [
  { code: 'US', name: 'United States' }, { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' },
  { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' }, { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' }, { code: 'MX', name: 'Mexico' },
  { code: 'SE', name: 'Sweden' }, { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' }, { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' }, { code: 'PL', name: 'Poland' },
  { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' }, { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' }, { code: 'ZA', name: 'South Africa' }
];

async function main() {
  await prisma.matchEvent.deleteMany();
  await prisma.match.deleteMany();
  await prisma.poolTeam.deleteMany();
  await prisma.pool.deleteMany();
  await prisma.teamPlayer.deleteMany();
  await prisma.playerAccount.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.sponsor.deleteMany();
  await prisma.freeAgent.deleteMany();
  await prisma.accessCode.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.knownBikePoloCountry.deleteMany();
  await prisma.tournament.deleteMany();

  await prisma.knownBikePoloCountry.createMany({ data: knownCountries });

  for (const c of [
    { role: Role.REF, code: 'REF2025' },
    { role: Role.ORGA, code: 'ORGA2025' },
    { role: Role.ADMIN, code: 'ADMIN2025' }
  ]) {
    await prisma.accessCode.create({ data: { role: c.role, codeHash: await bcrypt.hash(c.code, 10) } });
  }

  const demoPlayer = await prisma.player.create({
    data: { name: 'Demo Player', country: 'FR', city: 'Paris', status: PlayerStatus.ACTIVE, badges: [] }
  });
  await prisma.playerAccount.create({
    data: { email: 'demo@bikepolo.app', passwordHash: await bcrypt.hash('demo1234', 10), playerId: demoPlayer.id }
  });

  console.log('Seed done!');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
