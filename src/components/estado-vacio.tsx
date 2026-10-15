import type { ReactNode } from "react";

export function EstadoVacio({ titulo, texto, accion }: { titulo?: string; texto: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
      {titulo && <p className="text-lg font-bold">{titulo}</p>}
      <p className="text-muted-foreground">{texto}</p>
      {accion}
    </div>
  );
}
