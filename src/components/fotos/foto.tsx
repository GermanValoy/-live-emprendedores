import { type TamanoFoto, TAMANOS_FOTO, urlFoto } from "@/lib/fotos/rutas";

/** Las fotos ya vienen achicadas desde el celular: se muestran directo, sin optimizador de imágenes. */
export function Foto({ path, tamano, alt, className }: { path: string; tamano: TamanoFoto; alt: string; className?: string }) {
  const lado = TAMANOS_FOTO[tamano];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={urlFoto(path, tamano)} alt={alt} width={lado} height={lado} loading="lazy" decoding="async" className={className} />
  );
}
