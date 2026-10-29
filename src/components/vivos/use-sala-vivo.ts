"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vivoAbiertoDe } from "@/lib/vivos/datos";
import { anunciarPresencia, contarMirando } from "@/lib/vivos/presencia";
import { crearReproductor, type EstadoReproduccion, type Reproductor } from "@/lib/vivos/reproductor";
import { desfaseReloj, estadoSala } from "@/lib/vivos/sala";
import { CAMPOS_VIVO, type ConfigVivo, type Vivo } from "@/lib/vivos/tipos";

/** El vivo y cuánto difiere el reloj del celular del de la base (null: todavía no se midió). */
type Sala = { vivo: Vivo | null; desfase: number | null };

/**
 * Lo que mira la compradora: el vivo del puesto (al día por Supabase Realtime, sin recargar),
 * el estado de la sala recalculado cada segundo, el reproductor y la cuenta de gente mirando.
 */
export function useSalaVivo(storeId: string, vivoInicial: Vivo | null, config: ConfigVivo, videoRef: RefObject<HTMLVideoElement | null>) {
  const [supabase] = useState(createClient);
  const [{ vivo, desfase }, setSala] = useState<Sala>({ vivo: vivoInicial, desfase: null });
  // La hora se toma recién en el navegador (si se tomara al dibujar, el servidor y el celular no coincidirían).
  const [ahora, setAhora] = useState<number | null>(null);
  const [canalListo, setCanalListo] = useState(false);
  const [mirando, setMirando] = useState(vivoInicial?.viewers ?? 0);
  const [reproduccion, setReproduccion] = useState<EstadoReproduccion>("conectando");
  const [sinSonido, setSinSonido] = useState(false);
  const reproductorRef = useRef<Reproductor | null>(null);
  const vivoRef = useRef(vivo);

  // Hora "de la base": el reloj del celular corregido. Hasta medirlo, se toma como recién llegada la señal.
  const horaBase = ahora === null || desfase === null ? (vivo ? Date.parse(vivo.last_signal_at) : 0) : ahora - desfase;
  const estado = estadoSala(vivo, horaBase, config);
  const afuera = estado === "vuelve-pronto";
  const afueraRef = useRef(afuera);

  useEffect(() => {
    vivoRef.current = vivo;
  }, [vivo]);

  useEffect(() => {
    const inicio = setTimeout(() => {
      const t = Date.now();
      setAhora(t);
      setSala((s) => (s.vivo && s.desfase === null ? { ...s, desfase: desfaseReloj(s.vivo.last_signal_at, t) } : s));
    }, 0);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearTimeout(inicio);
      clearInterval(reloj);
    };
  }, []);

  // Cambios del vivo del puesto: arranca (INSERT), cambia de estado o termina (UPDATE).
  useEffect(() => {
    const recibir = (fila: Vivo, esNuevo: boolean) => {
      const llegada = Date.now();
      setAhora(llegada);
      setSala((actual) => {
        const previo = actual.vivo;
        // Si se perdió el aviso de que arrancó, se toma el vivo abierto igual.
        const tomar = esNuevo || previo?.id === fila.id || ((!previo || previo.ended_at) && !fila.ended_at);
        if (!tomar) return actual;
        // El desfase se mide solo con una señal nueva (una fila repetida ya no es "recién llegada").
        const mismaSenal = previo?.id === fila.id && previo.last_signal_at === fila.last_signal_at && actual.desfase !== null;
        return { vivo: fila, desfase: mismaSenal ? actual.desfase : desfaseReloj(fila.last_signal_at, llegada) };
      });
    };
    // Lo que cambió mientras el canal se conectaba no llega por el canal: se lee una vez.
    const releer = async () => {
      const abierto = await vivoAbiertoDe(supabase, storeId);
      if (abierto) return recibir(abierto, true);
      const actual = vivoRef.current;
      if (!actual || actual.ended_at) return;
      const { data, error } = await supabase.from("live_sessions").select(CAMPOS_VIVO).eq("id", actual.id).maybeSingle();
      if (error) throw error;
      if (data) recibir(data as Vivo, false);
    };
    let cerrando = false;
    const filtro = { schema: "public", table: "live_sessions", filter: `store_id=eq.${storeId}` } as const;
    const canal = supabase
      // Nombre único: si se vuelve a montar enseguida, no se reutiliza un canal que todavía se está cerrando.
      // wait: la base confirma el SUBSCRIBED recién cuando ya escucha los cambios (sin huecos entre la conexión y la escucha).
      .channel(`sala:${storeId}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "INSERT", ...filtro }, (cambio) => recibir(cambio.new as Vivo, true))
      .on("postgres_changes", { event: "UPDATE", ...filtro }, (cambio) => recibir(cambio.new as Vivo, false))
      .subscribe((estadoCanal, error) => {
        setCanalListo(estadoCanal === "SUBSCRIBED");
        if (estadoCanal === "SUBSCRIBED") void releer().catch((e: unknown) => console.error("Sala: leer el vivo al conectar el canal", e));
        else if (estadoCanal === "CHANNEL_ERROR") console.error("Sala: falló el canal del vivo", error);
        else if (estadoCanal === "TIMED_OUT") console.error("Sala: el canal del vivo no respondió a tiempo");
        else if (estadoCanal === "CLOSED" && !cerrando) console.error("Sala: se cerró el canal del vivo");
      });
    return () => {
      cerrando = true;
      void supabase.removeChannel(canal);
    };
  }, [supabase, storeId]);

  // Mientras el vivo está abierto: reproductor, anunciarse y contar. Al terminar, se cierra todo.
  const abiertoId = vivo && !vivo.ended_at ? vivo.id : null;
  const urlMirar = vivo?.whep_url ?? null;
  useEffect(() => {
    const video = videoRef.current;
    if (!abiertoId || !urlMirar || !video) return;
    const reproductor = crearReproductor(urlMirar, video, { estado: setReproduccion, sinSonido: () => setSinSonido(true) });
    reproductor.pausarReconexion(afueraRef.current);
    reproductorRef.current = reproductor;
    const dejarDeAnunciar = anunciarPresencia(supabase, abiertoId);
    const dejarDeContar = contarMirando(supabase, abiertoId, setMirando);
    return () => {
      reproductorRef.current = null;
      reproductor.cerrar();
      dejarDeAnunciar();
      dejarDeContar();
      setSinSonido(false);
      setReproduccion("conectando");
    };
  }, [supabase, abiertoId, urlMirar, videoRef]);

  // Si la feriante salió de la pantalla, su imagen queda quieta a propósito: no se reconecta por eso.
  useEffect(() => {
    afueraRef.current = afuera;
    reproductorRef.current?.pausarReconexion(afuera);
  }, [afuera]);

  const activarSonido = () => {
    reproductorRef.current?.activarSonido();
    setSinSonido(false);
  };

  return { vivo, estado, mirando, reproduccion, sinSonido, activarSonido, canalListo };
}
