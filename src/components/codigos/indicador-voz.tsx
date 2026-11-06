"use client";

import type { EstadoVoz } from "./use-voz";

type Props = {
  estado: EstadoVoz;
  /** Por qué está apagada sin que ella la haya apagado (límite del día, celular sin audio). */
  aviso: string | null;
  alCambiar(prender: boolean): void;
};

/** "🎤 Escuchando códigos" con su interruptor. El punto se pone rojo mientras oye una frase. */
export function IndicadorVoz({ estado, aviso, alCambiar }: Props) {
  const prendida = estado !== "apagada";
  const mensaje = estado === "sin-servicio" ? "La voz no responde ahora. Usá + Nuevo código." : aviso;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={prendida}
        onClick={() => alCambiar(!prendida)}
        className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full bg-black/55 py-1 pr-1.5 pl-3 text-sm font-bold text-white backdrop-blur outline-none focus-visible:ring-3 focus-visible:ring-white/70"
      >
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full transition-colors duration-(--duracion-instant) ${
            estado === "escuchando" ? "bg-vivo motion-safe:animate-pulse" : prendida ? "bg-white/70" : "bg-white/25"
          }`}
        />
        <span className={prendida ? undefined : "opacity-60"}>🎤 Escuchando códigos</span>
        <span
          aria-hidden="true"
          className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-(--duracion-instant) ${prendida ? "bg-white" : "bg-white/25"}`}
        >
          <span
            className={`size-5 rounded-full transition-transform duration-(--duracion-instant) ease-out ${
              prendida ? "translate-x-4 bg-primary" : "translate-x-0 bg-white"
            }`}
          />
        </span>
      </button>
      {mensaje && (
        <p role="status" className="max-w-full rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-foreground shadow-lg">
          {mensaje}
        </p>
      )}
    </div>
  );
}
