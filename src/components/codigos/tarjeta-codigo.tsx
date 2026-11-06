import { Foto } from "@/components/fotos/foto";
import type { Codigo } from "@/lib/codigos/tipos";
import { formatARS } from "@/lib/format/plata";

/** El código que se está vendiendo, entre el chat y el campo de escribir. Aparece con un fundido corto. */
export function TarjetaCodigo({ codigo }: { codigo: Codigo }) {
  const quedan = Math.max(codigo.quantity - codigo.sold, 0);
  return (
    <div
      key={codigo.id}
      className="pointer-events-auto flex min-h-14 items-center gap-3 rounded-2xl bg-black/65 p-2 pr-4 backdrop-blur animate-in fade-in duration-(--duracion-base)"
    >
      {codigo.photo_path && (
        <Foto path={codigo.photo_path} tamano="chica" alt="" className="size-12 shrink-0 rounded-xl object-cover" />
      )}
      <p className="min-w-0 flex-1 leading-tight">
        <span className="flex items-baseline gap-2">
          <b className="truncate text-xl font-extrabold tracking-wide text-codigo">{codigo.label}</b>
          <b className="text-base tabular-nums">{formatARS(codigo.price_cents)}</b>
        </span>
        <span className="block text-xs font-semibold text-white/85">
          {quedan > 0 ? `Quedan ${quedan}` : "Agotado"}
          <span aria-hidden="true"> · </span>
          Escribilo en el chat
        </span>
      </p>
    </div>
  );
}
