export const TAMANOS_FOTO = { chica: 400, grande: 1200 } as const;
export type TamanoFoto = keyof typeof TAMANOS_FOTO;
export type CarpetaFoto = "perfil" | "portada" | "productos";
export const BUCKET_FOTOS = "tienda-fotos";

/** Achica (nunca agranda) para que el lado mayor no pase de `maximo`. */
export function medidasEscaladas(ancho: number, alto: number, maximo: number): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/** "tienda/productos/abc.webp" → "tienda/productos/abc-400.webp". */
export function rutaVariante(path: string, tamano: TamanoFoto): string {
  const punto = path.lastIndexOf(".");
  return `${path.slice(0, punto)}-${TAMANOS_FOTO[tamano]}${path.slice(punto)}`;
}

export function nuevaRutaFoto(storeId: string, carpeta: CarpetaFoto, ext: "webp" | "jpg"): string {
  return `${storeId}/${carpeta}/${crypto.randomUUID()}.${ext}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** La ruta pertenece a esa tienda y carpeta, con el formato que genera `nuevaRutaFoto`. */
export function rutaEsDeTienda(path: string, storeId: string, carpeta: CarpetaFoto): boolean {
  return new RegExp(`^${storeId}/${carpeta}/${UUID}\\.(webp|jpg)$`).test(path);
}

export function urlFoto(path: string, tamano: TamanoFoto): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/${rutaVariante(path, tamano)}`;
}
