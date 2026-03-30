/**
 * Reads EXIF orientation from a JPEG file and redraws it correctly on a canvas.
 * Returns a corrected File (same name/type). Works only client-side.
 */
export async function fixImageOrientation(file: File): Promise<File> {
  // Only JPEG files have EXIF orientation data
  if (!file.type.includes("jpeg") && !file.type.includes("jpg")) return file;

  const orientation = await getExifOrientation(file);
  // Orientation 1 = normal, no fix needed
  if (!orientation || orientation === 1) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      // For orientations 5-8 width/height are swapped
      const swapped = orientation >= 5 && orientation <= 8;
      canvas.width = swapped ? img.naturalHeight : img.naturalWidth;
      canvas.height = swapped ? img.naturalWidth : img.naturalHeight;

      // Apply transform based on EXIF orientation
      switch (orientation) {
        case 2: ctx.transform(-1, 0, 0, 1, canvas.width, 0); break;
        case 3: ctx.transform(-1, 0, 0, -1, canvas.width, canvas.height); break;
        case 4: ctx.transform(1, 0, 0, -1, 0, canvas.height); break;
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
        case 6: ctx.transform(0, 1, -1, 0, canvas.height, 0); break;
        case 7: ctx.transform(0, -1, -1, 0, canvas.height, canvas.width); break;
        case 8: ctx.transform(0, -1, 1, 0, 0, canvas.width); break;
      }

      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name, { type: file.type }));
      }, file.type, 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function getExifOrientation(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      if (!buf) { resolve(null); return; }
      const view = new DataView(buf);
      // Check JPEG SOI marker
      if (view.getUint16(0) !== 0xFFD8) { resolve(null); return; }
      let offset = 2;
      while (offset < view.byteLength) {
        if (view.getUint16(offset) === 0xFFE1) {
          // APP1 marker — check for Exif header
          const exifOffset = offset + 4;
          if (view.getUint32(exifOffset) !== 0x45786966) { resolve(null); return; }
          const little = view.getUint16(exifOffset + 6) === 0x4949;
          const ifdOffset = exifOffset + 6 + view.getUint32(exifOffset + 10, little);
          const entries = view.getUint16(ifdOffset, little);
          for (let i = 0; i < entries; i++) {
            if (view.getUint16(ifdOffset + 2 + i * 12, little) === 0x0112) {
              resolve(view.getUint16(ifdOffset + 2 + i * 12 + 8, little));
              return;
            }
          }
        }
        offset += 2 + view.getUint16(offset + 2);
      }
      resolve(null);
    };
    reader.onerror = () => resolve(null);
    // Only read first 64KB — enough for EXIF
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}
