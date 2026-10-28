import Link from "next/link";
import { Foto } from "@/components/fotos/foto";
import { EnVivo } from "@/components/marca/en-vivo";
import { formatARS } from "@/lib/format/plata";
import type { PuestoResumen } from "@/lib/tiendas/tipos";
import { BotonSeguir } from "./boton-seguir";

type Props = { puesto: PuestoResumen; siguiendo: boolean; conSesion: boolean; enVivo?: boolean };

export function TarjetaPuesto({ puesto, siguiendo, conSesion, enVivo = false }: Props) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border p-3">
      <div className="flex items-center gap-3">
        <Link href={`/@${puesto.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
          {puesto.avatar_path ? (
            <Foto path={puesto.avatar_path} tamano="chica" alt="" className="size-11 shrink-0 rounded-full object-cover" />
          ) : (
            <div aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-primary">
              {puesto.name.charAt(0)}
            </div>
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-bold">{puesto.name}</span>
              {enVivo && <EnVivo chico />}
            </span>
            <span className="block truncate text-sm text-muted-foreground">{puesto.category} · {puesto.zone}</span>
          </span>
        </Link>
        <BotonSeguir storeId={puesto.id} handle={puesto.handle} siguiendo={siguiendo} conSesion={conSesion} />
      </div>
      {puesto.productos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {puesto.productos.map((p) => (
            <Link key={p.id} href={`/@${puesto.handle}/p/${p.id}`} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              {p.foto && <Foto path={p.foto} tamano="chica" alt="" className="size-full object-cover" />}
              <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-xs font-bold tabular-nums">{formatARS(p.price_cents)}</span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
