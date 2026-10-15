import { medidasEscaladas, TAMANOS_FOTO } from "./rutas";

export class ErrorDeFoto extends Error {}

export type FotoComprimida = {
  ext: "webp" | "jpg";
  tipo: "image/webp" | "image/jpeg";
  chica: Blob;
  grande: Blob;
};

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolver) => canvas.toBlob(resolver, tipo, calidad));
}

async function dibujar(bitmap: ImageBitmap, maximo: number): Promise<HTMLCanvasElement> {
  const { ancho, alto } = medidasEscaladas(bitmap.width, bitmap.height, maximo);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErrorDeFoto("No pudimos usar esta foto. Probá con otra.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  return canvas;
}

/**
 * Endereza la foto según su orientación, la achica a 1200 y 400 px y la vuelve a codificar
 * (WebP si el navegador puede, si no JPEG). Al recodificar se pierden los datos EXIF (incluida la ubicación).
 */
export async function comprimirFoto(archivo: File): Promise<FotoComprimida> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorDeFoto("No pudimos usar esta foto. Probá con otra.");
  }
  try {
    const lienzoGrande = await dibujar(bitmap, TAMANOS_FOTO.grande);
    const lienzoChico = await dibujar(bitmap, TAMANOS_FOTO.chica);
    const webp = await aBlob(lienzoGrande, "image/webp", 0.8);
    if (webp && webp.type === "image/webp") {
      const chica = await aBlob(lienzoChico, "image/webp", 0.8);
      if (chica) return { ext: "webp", tipo: "image/webp", grande: webp, chica };
    }
    const grande = await aBlob(lienzoGrande, "image/jpeg", 0.85);
    const chica = await aBlob(lienzoChico, "image/jpeg", 0.85);
    if (!grande || !chica) throw new ErrorDeFoto("No pudimos usar esta foto. Probá con otra.");
    return { ext: "jpg", tipo: "image/jpeg", grande, chica };
  } finally {
    bitmap.close();
  }
}
