"use client";

import { useEffect, useState } from "react";

/**
 * "🎉 ROJO es de Caro". Se muestra `segundos` y se va solo. Quien lo dibuja le pone una `key` que cambia
 * con cada ganadora nueva: así un cartel nuevo reemplaza al anterior y reinicia el tiempo.
 */
export function CartelGanadora({ etiqueta, nombre, segundos }: { etiqueta: string; nombre: string; segundos: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), segundos * 1000);
    return () => clearTimeout(t);
  }, [segundos]);
  if (!visible) return null;
  return (
    <p
      role="status"
      className="pointer-events-none absolute inset-x-6 top-[calc(max(env(safe-area-inset-top),0.5rem)+8.5rem)] mx-auto w-fit max-w-sm rounded-2xl bg-black/70 px-5 py-3 text-center text-lg leading-snug font-extrabold text-balance wrap-anywhere backdrop-blur animate-in fade-in zoom-in-95 duration-(--duracion-base)"
    >
      <span aria-hidden="true">🎉 </span>
      {`${etiqueta} es de ${nombre}`}
    </p>
  );
}
