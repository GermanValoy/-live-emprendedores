import { createClient } from "@/lib/supabase/client";
import { comprimirFoto, ErrorDeFoto } from "./comprimir";
import { BUCKET_FOTOS, type CarpetaFoto, nuevaRutaFoto, rutaVariante } from "./rutas";

/** Comprime y sube los dos tamaños; devuelve la ruta base para guardar en la base de datos. */
export async function subirFoto(storeId: string, carpeta: CarpetaFoto, archivo: File): Promise<string> {
  const foto = await comprimirFoto(archivo);
  const path = nuevaRutaFoto(storeId, carpeta, foto.ext);
  const bucket = createClient().storage.from(BUCKET_FOTOS);
  for (const [tamano, blob] of [["grande", foto.grande], ["chica", foto.chica]] as const) {
    const { error } = await bucket.upload(rutaVariante(path, tamano), blob, {
      contentType: foto.tipo,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new ErrorDeFoto("No se pudo subir la foto. Revisá tu conexión y probá de nuevo.");
  }
  return path;
}
