import { formatARS } from "@/lib/format/plata";

type Props = { codigo: string; centavos: number };

export function EtiquetaCodigo({ codigo, centavos }: Props) {
  const nombre = codigo.toUpperCase();
  const precio = formatARS(centavos);
  return (
    <div
      aria-label={`Código ${nombre}, ${precio}`}
      className="inline-flex items-center gap-3 rounded-xl bg-codigo-fondo px-4 py-2 text-white"
    >
      <span>
        Código <strong className="font-extrabold text-codigo">{nombre}</strong>
      </span>
      <span aria-hidden="true">–</span>
      <strong className="font-extrabold tabular-nums">{precio}</strong>
    </div>
  );
}
