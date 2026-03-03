import { uploadsEnabled } from "@/lib/uploads";
import { nanoid } from "nanoid";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

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
  const extension = path.extname(file.name || "") || ".png";
  const filename = `${nanoid(8)}${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  return Response.json({ path: `/uploads/${filename}`, isBase64: false });
}
