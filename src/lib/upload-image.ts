/**
 * Envoi d'image (côté navigateur) : une photo trop lourde pour le serveur
 * (5 Mo max) est d'abord réduite dans le navigateur — 2048 px au plus grand
 * côté, JPEG — au lieu d'être refusée. Le serveur la réduit de toute façon à
 * 2048 px : aucune perte visible, et l'envoi est bien plus rapide (une photo
 * de téléphone de 8-12 Mo tombe autour de 1 Mo).
 */

const SERVER_MAX = 5 * 1024 * 1024;
const TARGET = 4.5 * 1024 * 1024; // marge sous la limite du serveur
const MAX_SIDE = 2048;

async function decode(file: File): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number } | null> {
  try {
    // imageOrientation « from-image » : la photo garde son sens (EXIF du téléphone)
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
  } catch {
    // Navigateurs plus anciens : <img> applique aussi l'orientation EXIF
    return await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) }); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/** Renvoie le fichier tel quel s'il passe, sinon une version réduite (ou l'original si le navigateur ne sait pas le lire). */
export async function shrinkImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= TARGET) return file;
  const img = await decode(file);
  if (!img) return file; // ex. HEIC sur un navigateur qui ne le lit pas : le serveur tranchera
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    img.draw(ctx, canvas.width, canvas.height);
    const blob = await toBlob(canvas, attempt === 0 ? 0.88 : 0.8);
    if (blob && blob.size <= TARGET) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    side = Math.round(side * 0.8);
  }
  return file;
}

/** POST /api/upload avec réduction automatique de l'image du formulaire (champ « file »). */
export async function postUpload(form: FormData): Promise<Response> {
  const f = form.get("file");
  if (f instanceof File && f.size > TARGET && f.size > 0) {
    const small = await shrinkImageForUpload(f);
    if (small !== f) form.set("file", small, small.name);
  }
  return fetch("/api/upload", { method: "POST", body: form });
}

export const UPLOAD_SERVER_MAX = SERVER_MAX;
