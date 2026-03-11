import { nanoid } from "nanoid";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const { error } = await supabase.storage
    .from("uploads")
    .upload(filename, webpBuffer, {
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    return new Response("Erreur upload", { status: 500 });
  }

  const { data } = supabase.storage.from("uploads").getPublicUrl(filename);

  return Response.json({ path: data.publicUrl, isBase64: false });
}
