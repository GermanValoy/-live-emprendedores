"use client";

import { useEffect } from "react";

type Props = {
  nombre: string;
  alBorrar(): void;
  alSilenciarTemporal(): void;
  alSilenciarSala(): void;
  alCerrar(): void;
};

const OPCION =
  "flex min-h-14 w-full flex-col items-start justify-center rounded-2xl bg-secondary px-4 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Lo que puede hacer la feriante al tocar el mensaje de otra persona. Sube desde abajo; sin confirmación extra. */
export function PanelModerar({ nombre, alBorrar, alSilenciarTemporal, alSilenciarSala, alCerrar }: Props) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);

  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/60" onClick={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderar-titulo"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col gap-2 rounded-t-3xl bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-foreground motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
      >
        <p id="moderar-titulo" className="text-lg font-extrabold">{nombre}</p>
        <p className="text-sm text-muted-foreground">Tocaste su mensaje</p>
        <button type="button" onClick={alBorrar} className={`${OPCION} font-bold`}>
          Borrar este mensaje
        </button>
        <button type="button" onClick={alSilenciarTemporal} className={OPCION}>
          <span className="font-bold">Silenciar 10 minutos</span>
          <span className="text-sm text-muted-foreground">No puede escribir; sigue mirando</span>
        </button>
        <button type="button" onClick={alSilenciarSala} className={OPCION}>
          <span className="font-bold">Silenciar en mi sala</span>
          <span className="text-sm text-muted-foreground">No vuelve a escribir en tus vivos (lo podés deshacer)</span>
        </button>
        <button
          type="button"
          onClick={alCerrar}
          autoFocus
          className="min-h-12 rounded-full text-base font-bold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
