import { nanoid } from "nanoid";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Dossiers autorisés (évite un path traversal via `folder` et cantonne les
// uploads à des usages connus). Toute autre valeur retombe sur "misc".
const ALLOWED_FOLDERS = new Set([
  "misc", "players", "clubs", "teams", "squads", "tournaments", "sponsors", "venues",
]);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!; // e.g. https://pub-xxx.r2.dev

export async function POST(request: Request) {
  // Auth obligatoire : cette route écrit dans un bucket public payant. Sans
  // garde, n'importe qui pouvait uploader (abus de stockage, contenu illégal
  // hébergé sur notre compte). Réservé aux utilisateurs connectés.
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Rate-limit par utilisateur : 30 images / 5 min (largement suffisant pour de
  // l'édition de profil/club/tournoi, bloque un compte qui spammerait le bucket).
  if (isRateLimited(`upload:${playerId}`, 30, 5 * 60 * 1000)) {
    return new Response("Trop d'uploads, réessayez dans quelques minutes.", { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const rawFolder = (formData.get("folder") as string) || "misc";
  const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : "misc";

  if (!file || typeof file === "string") {
    return new Response("Missing file", { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > MAX_BYTES) {
    return new Response("Fichier trop volumineux (max 5 Mo)", { status: 413 });
  }

  const mime = (file as File).type ?? "";
  if (!mime.startsWith("image/")) {
    return new Response("Seules les images sont acceptées", { status: 415 });
  }

  // sharp valide le CONTENU réel (pas juste le type MIME déclaré, falsifiable) :
  // un fichier qui n'est pas une vraie image lève ici → 415, pas un 500 opaque.
  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(buffer).rotate().webp({ quality: 82 }).toBuffer();
  } catch {
    return new Response("Fichier image invalide ou corrompu", { status: 415 });
  }
  const filename = `${folder}/${nanoid(8)}.webp`;

  try {
    await r2.send(new PutObjectCommand({
      Bucket: "uploads",
      Key: filename,
      Body: webpBuffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000",
    }));
  } catch (err) {
    console.error("R2 upload error:", err);
    return new Response("Erreur upload", { status: 500 });
  }

  const publicUrl = `${R2_PUBLIC_URL}/${filename}`;
  return Response.json({ path: publicUrl, isBase64: false });
}
