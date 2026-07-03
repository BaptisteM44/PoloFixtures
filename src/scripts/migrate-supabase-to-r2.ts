/**
 * Migrate all Supabase Storage URLs to Cloudflare R2.
 *
 * For each image URL pointing to supabase.co/storage, this script:
 *   1. Downloads the image from Supabase
 *   2. Uploads it to R2 (same folder/filename structure)
 *   3. Updates the URL in the database
 *
 * Run: npx tsx src/scripts/migrate-supabase-to-r2.ts
 *
 * Required env vars: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL
 */

import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;
const SUPABASE_PREFIX = "https://hoywbbgvlgikkxrcdqul.supabase.co/storage/v1/object/public/uploads/";

const FIELDS: Array<{ table: string; idField: string; pathField: string }> = [
  { table: "Player", idField: "id", pathField: "photoPath" },
  { table: "Player", idField: "id", pathField: "clubLogoPath" },
  { table: "Player", idField: "id", pathField: "teamLogoPath" },
  { table: "Club", idField: "id", pathField: "logoPath" },
  { table: "Squad", idField: "id", pathField: "logoPath" },
  { table: "Team", idField: "id", pathField: "logoPath" },
  { table: "Tournament", idField: "id", pathField: "bannerPath" },
  { table: "Tournament", idField: "id", pathField: "photoFinishPath" },
];

let migrated = 0;
let skipped = 0;
let failed = 0;

async function alreadyOnR2(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: "uploads", Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateUrl(supabaseUrl: string): Promise<string | null> {
  // Extract the key (e.g. "misc/StF_rM-n.webp") from the full Supabase URL
  const key = supabaseUrl.replace(SUPABASE_PREFIX, "");
  if (!key || key === supabaseUrl) {
    console.warn(`  ⚠ Cannot parse key from URL: ${supabaseUrl}`);
    return null;
  }

  // Check if already on R2
  if (await alreadyOnR2(key)) {
    return `${R2_PUBLIC_URL}/${key}`;
  }

  // Download from Supabase
  const res = await fetch(supabaseUrl);
  if (!res.ok) {
    console.warn(`  ⚠ Download failed (${res.status}): ${supabaseUrl}`);
    return null;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/webp";

  // Upload to R2
  await r2.send(
    new PutObjectCommand({
      Bucket: "uploads",
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    })
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

async function main() {
  console.log("🚀 Migration Supabase Storage → Cloudflare R2\n");

  for (const { table, idField, pathField } of FIELDS) {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT "${idField}", "${pathField}" FROM "${table}" WHERE "${pathField}" LIKE '%supabase%'`
    );

    if (rows.length === 0) continue;
    console.log(`\n📦 ${table}.${pathField}: ${rows.length} URLs à migrer`);

    for (const row of rows) {
      const oldUrl = row[pathField];
      const id = row[idField];

      try {
        const newUrl = await migrateUrl(oldUrl);
        if (newUrl) {
          await prisma.$executeRawUnsafe(
            `UPDATE "${table}" SET "${pathField}" = $1 WHERE "${idField}" = $2`,
            newUrl,
            id
          );
          migrated++;
          process.stdout.write(".");
        } else {
          skipped++;
        }
      } catch (err: any) {
        console.error(`\n  ✗ ${table}[${id}]: ${err.message}`);
        failed++;
      }
    }
    console.log();
  }

  console.log(`\n✅ Terminé: ${migrated} migrées, ${skipped} ignorées, ${failed} échouées`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
