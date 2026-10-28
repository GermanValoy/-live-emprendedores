import Link from "next/link";
import { Foto } from "@/components/fotos/foto";
import { EnVivo } from "@/components/marca/en-vivo";
import type { VivoEnPortada } from "@/lib/vivos/datos";

/** Tarjeta vertical de un vivo abierto. WebRTC no da miniaturas: se usa la portada (o la foto) del puesto. */
export function TarjetaVivo({ item }: { item: VivoEnPortada }) {
  const { vivo, puesto } = item;
  const imagen = puesto.cover_path ?? puesto.avatar_path;
  return (
    <Link
      href={`/@${puesto.handle}/vivo`}
      className="relative block aspect-[9/16] w-40 shrink-0 snap-start overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-primary text-white"
    >
      {imagen && <Foto path={imagen} tamano="grande" alt="" className="absolute inset-0 size-full object-cover" />}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />
      <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
        <EnVivo />
        <span className="rounded-full bg-black/60 px-2 py-1 text-xs font-bold tabular-nums">👁 {vivo.viewers}</span>
      </span>
      <span className="absolute inset-x-2 bottom-2 min-w-0">
        <span className="line-clamp-2 break-words text-sm font-extrabold leading-tight">{puesto.name}</span>
        <span className="block truncate text-xs opacity-90">{puesto.zone}</span>
      </span>
    </Link>
  );
}
