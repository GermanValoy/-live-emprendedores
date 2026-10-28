"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VivoEnPortada } from "@/lib/vivos/datos";
import { TarjetaVivo } from "./tarjeta-vivo";

/** Espera antes de pedir los datos de nuevo, para que varios avisos juntos hagan una sola recarga. */
const ESPERA_RECARGA_MS = 500;

type FilaVivo = { id: string; viewers: number; ended_at: string | null };

/**
 * "En vivo ahora": los vivos abiertos, el que más gente tiene primero. Se actualiza solo por Supabase Realtime:
 * si alguien arranca o termina se piden los datos de nuevo; si cambia la gente que mira, se reordena en el lugar.
 */
export function VivosAhora({ iniciales }: { iniciales: VivoEnPortada[] }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [canalListo, setCanalListo] = useState(false);
  // Cuánta gente mira según los avisos del canal (pisa lo que vino del servidor hasta que éste se renueve).
  const [mirando, setMirando] = useState<Record<string, number>>({});
  const [anteriores, setAnteriores] = useState(iniciales);
  if (anteriores !== iniciales) {
    setAnteriores(iniciales);
    setMirando({});
  }
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idsRef = useRef(new Set<string>());
  useEffect(() => {
    idsRef.current = new Set(iniciales.map((i) => i.vivo.id));
  }, [iniciales]);

  useEffect(() => {
    const recargar = () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => router.refresh(), ESPERA_RECARGA_MS);
    };
    let cerrando = false;
    const filtro = { schema: "public", table: "live_sessions" } as const;
    const canal = supabase
      // Nombre único: si se vuelve a montar enseguida, no se reutiliza un canal que todavía se está cerrando.
      // wait: la base confirma el SUBSCRIBED recién cuando ya escucha los cambios (sin huecos entre la conexión y la escucha).
      .channel(`portada:vivos:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "INSERT", ...filtro }, recargar)
      .on("postgres_changes", { event: "UPDATE", ...filtro }, (cambio) => {
        const fila = cambio.new as FilaVivo;
        if (fila.ended_at) recargar();
        else if (!idsRef.current.has(fila.id)) recargar(); // un vivo que no conocíamos (se perdió su arranque)
        else setMirando((m) => ({ ...m, [fila.id]: fila.viewers }));
      })
      .subscribe((estadoCanal, error) => {
        setCanalListo(estadoCanal === "SUBSCRIBED");
        if (estadoCanal === "SUBSCRIBED") recargar(); // lo que cambió mientras se conectaba no llega por el canal
        else if (estadoCanal === "CHANNEL_ERROR") console.error("Inicio: falló el canal de los vivos", error);
        else if (estadoCanal === "TIMED_OUT") console.error("Inicio: el canal de los vivos no respondió a tiempo");
        else if (estadoCanal === "CLOSED" && !cerrando) console.error("Inicio: se cerró el canal de los vivos");
      });
    return () => {
      cerrando = true;
      if (espera.current) clearTimeout(espera.current);
      void supabase.removeChannel(canal);
    };
  }, [supabase, router]);

  const items = iniciales
    .map((i) => ({ ...i, vivo: { ...i.vivo, viewers: mirando[i.vivo.id] ?? i.vivo.viewers } }))
    .sort((a, b) => b.vivo.viewers - a.vivo.viewers);

  // data-canal: avisa (a las pruebas) que los cambios ya llegan solos.
  return (
    <section data-canal={canalListo ? "listo" : "conectando"} aria-labelledby="en-vivo-ahora" className="flex flex-col gap-2">
      <h2 id="en-vivo-ahora" className="text-lg font-bold">En vivo ahora</h2>
      {items.length === 0 ? (
        <p className="rounded-xl bg-secondary p-3 text-sm">Ahora no hay nadie en vivo. Seguí a tus puestos favoritos.</p>
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
          {items.map((i) => (
            <TarjetaVivo key={i.vivo.id} item={i} />
          ))}
        </div>
      )}
    </section>
  );
}
