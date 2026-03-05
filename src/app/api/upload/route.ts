import { uploadsEnabled } from "@/lib/uploads";
import { nanoid } from "nanoid";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const formData = await request.formData();
  const base64 = formData.get("base64");

  if (!uploadsEnabled()) {
    if (typeof base64 === "string") {
      return Response.json({ path: base64, isBase64: true });
    }
    return new Response("Uploads disabled", { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return new Response("Missing file", { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > MAX_BYTES) {
    return new Response("Fichier trop volumineux (max 5 Mo)", { status: 413 });
  }

  // Vérifier que c'est bien une image
  const mime = file.type ?? "";
  if (!mime.startsWith("image/")) {
    return new Response("Seules les images sont acceptées", { status: 415 });
  }

  // Convertir en WebP avec Sharp
  const webpBuffer = await sharp(buffer)
    .webp({ quality: 82 })
    .toBuffer();

  const filename = `${nanoid(8)}.webp`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), webpBuffer);

  return Response.json({ path: `/uploads/${filename}`, isBase64: false });
}
