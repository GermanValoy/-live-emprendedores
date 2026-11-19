"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VivoEnPortada } from "@/lib/vivos/datos";
import { estadoEnPortada, ordenarPortada } from "@/lib/vivos/portada";
import { desfaseReloj } from "@/lib/vivos/sala";
import type { ConfigVivo, Vivo } from "@/lib/vivos/tipos";
import { TarjetaVivo } from "./tarjeta-vivo";

/** Espera antes de pedir los datos de nuevo, para que varios avisos juntos hagan una sola recarga. */
const ESPERA_RECARGA_MS = 500;
/** Cada cuánto se revisa si a algún vivo se le cortó la señal (el corte se nota a los 40 s). */
const REVISAR_CADA_MS = 5_000;

/**
 * "En vivo ahora": los vivos abiertos, el que más gente tiene primero. Se actualiza solo por Supabase Realtime:
 * si alguien arranca o termina se piden los datos de nuevo; si cambia la gente que mira, la señal o si la
 * feriante salió de la pantalla, se actualiza en el lugar. Los que esperan que vuelva la feriante van al final.
 */
export function VivosAhora({ iniciales, config }: { iniciales: VivoEnPortada[]; config: ConfigVivo }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [canalListo, setCanalListo] = useState(false);
  // Lo último que llegó por el canal de cada vivo (pisa lo que vino del servidor si es igual o más nuevo).
  const [cambios, setCambios] = useState<Record<string, Vivo>>({});
  // Cuánto difiere el reloj del celular del de la base, por vivo. Se mide al ver una señal por primera vez
  // (se la toma como recién llegada, igual que la sala) y de nuevo con cada señal nueva.
  const [desfases, setDesfases] = useState<Record<string, number>>({});
  // La hora se toma recién en el navegador (si se tomara al dibujar, el servidor y el celular no coincidirían).
  const [ahora, setAhora] = useState<number | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idsRef = useRef(new Set<string>());
  const vivosRef = useRef<Vivo[]>([]);

  const vivos = iniciales.map((i) => {
    const c = cambios[i.vivo.id];
    return { ...i, vivo: c && Date.parse(c.last_signal_at) >= Date.parse(i.vivo.last_signal_at) ? c : i.vivo };
  });

  useEffect(() => {
    idsRef.current = new Set(iniciales.map((i) => i.vivo.id));
    vivosRef.current = vivos.map((i) => i.vivo);
  });

  useEffect(() => {
    const revisar = () => {
      const t = Date.now();
      setAhora(t);
      setDesfases((d) => {
        const faltan = vivosRef.current.filter((v) => d[v.id] === undefined);
        if (!faltan.length) return d;
        return { ...d, ...Object.fromEntries(faltan.map((v) => [v.id, desfaseReloj(v.last_signal_at, t)])) };
      });
    };
    const inicio = setTimeout(revisar, 0);
    const reloj = setInterval(revisar, REVISAR_CADA_MS);
    return () => {
      clearTimeout(inicio);
      clearInterval(reloj);
    };
  }, []);

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
      // El código que se está vendiendo se ve en la tarjeta: si cambia, se piden los datos de nuevo.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_codes" }, recargar)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_codes" }, recargar)
      .on("postgres_changes", { event: "UPDATE", ...filtro }, (cambio) => {
        const fila = cambio.new as Vivo;
        if (fila.ended_at) return recargar();
        if (!idsRef.current.has(fila.id)) return recargar(); // un vivo que no conocíamos (se perdió su arranque)
        const llegada = Date.now();
        const conocido = vivosRef.current.find((v) => v.id === fila.id);
        if (conocido?.last_signal_at !== fila.last_signal_at) {
          setDesfases((d) => ({ ...d, [fila.id]: desfaseReloj(fila.last_signal_at, llegada) }));
        }
        setAhora(llegada);
        setCambios((c) => ({ ...c, [fila.id]: fila }));
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

  const items = ordenarPortada(
    vivos.map((i) => {
      const desfase = desfases[i.vivo.id];
      // Hasta medir el reloj, la señal se toma como recién llegada.
      const horaBase = ahora === null || desfase === undefined ? Date.parse(i.vivo.last_signal_at) : ahora - desfase;
      return { ...i, viewers: i.vivo.viewers, estado: estadoEnPortada(i.vivo, horaBase, config) };
    }),
  );

  // data-canal: avisa (a las pruebas) que los cambios ya llegan solos.
  return (
    <section data-canal={canalListo ? "listo" : "conectando"} aria-labelledby="en-vivo-ahora" className="flex flex-col gap-2">
      <h2 id="en-vivo-ahora" className="text-lg font-bold">En vivo ahora</h2>
      {items.length === 0 ? (
        <p className="rounded-xl bg-secondary p-3 text-sm">Ahora no hay nadie en vivo. Seguí a tus puestos favoritos.</p>
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
          {items.map((i) => (
            <TarjetaVivo key={i.vivo.id} item={i} volviendo={i.estado === "vuelve-pronto"} />
          ))}
        </div>
      )}
    </section>
  );
}
