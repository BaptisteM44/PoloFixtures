import { nanoid } from "nanoid";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
  const formData = await request.formData();
  const file = formData.get("file");
  const folder = (formData.get("folder") as string) || "misc";

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

  const webpBuffer = await sharp(buffer).webp({ quality: 82 }).toBuffer();
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
