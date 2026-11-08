import { comprimirFoto, ErrorDeFoto } from "@/lib/fotos/comprimir";
import { createClient } from "@/lib/supabase/client";

export const BUCKET_COMPROBANTES = "comprobantes";

/**
 * Comprime la captura (se le sacan los datos EXIF) y sube solo el tamaño grande al bucket privado.
 * Ruta: `<compradora>/<pedido>/<uuid>.<ext>`. Devuelve la ruta para pasársela a `informar_pago`.
 */
export async function subirComprobante(compradoraId: string, pedidoId: string, archivo: File): Promise<string> {
  const foto = await comprimirFoto(archivo);
  const ruta = `${compradoraId}/${pedidoId}/${crypto.randomUUID()}.${foto.ext}`;
  const { error } = await createClient().storage.from(BUCKET_COMPROBANTES).upload(ruta, foto.grande, {
    contentType: foto.tipo,
    upsert: false,
  });
  if (error) throw new ErrorDeFoto("No se pudo subir el comprobante. Revisá tu conexión y probá de nuevo.");
  return ruta;
}
