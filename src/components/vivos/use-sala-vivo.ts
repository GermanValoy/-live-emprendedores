"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vivoAbiertoDe } from "@/lib/vivos/datos";
import { anunciarPresencia, contarMirando } from "@/lib/vivos/presencia";
import { crearReproductor, type EstadoReproduccion, type Reproductor } from "@/lib/vivos/reproductor";
import { estadoSala } from "@/lib/vivos/sala";
import { CAMPOS_VIVO, type ConfigVivo, type Vivo } from "@/lib/vivos/tipos";

/**
 * Lo que mira la compradora: el vivo del puesto (al día por Supabase Realtime, sin recargar),
 * el estado de la sala recalculado cada segundo, el reproductor y la cuenta de gente mirando.
 */
export function useSalaVivo(storeId: string, vivoInicial: Vivo | null, config: ConfigVivo, videoRef: RefObject<HTMLVideoElement | null>) {
  const [supabase] = useState(createClient);
  const [vivo, setVivo] = useState(vivoInicial);
  const [ahora, setAhora] = useState(() => Date.now());
  const [mirando, setMirando] = useState(vivoInicial?.viewers ?? 0);
  const [reproduccion, setReproduccion] = useState<EstadoReproduccion>("conectando");
  const [sinSonido, setSinSonido] = useState(false);
  const reproductorRef = useRef<Reproductor | null>(null);
  const vivoRef = useRef(vivo);

  const estado = estadoSala(vivo, ahora, config);
  const afuera = estado === "vuelve-pronto";
  const afueraRef = useRef(afuera);

  useEffect(() => {
    vivoRef.current = vivo;
  }, [vivo]);

  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);

  // Cambios del vivo del puesto: arranca (INSERT), cambia de estado o termina (UPDATE).
  useEffect(() => {
    const recibir = (fila: Vivo, esNuevo: boolean) => {
      setAhora(Date.now());
      setVivo((actual) => {
        if (esNuevo || actual?.id === fila.id) return fila;
        // Si se perdió el aviso de que arrancó, se toma el vivo abierto igual.
        if ((!actual || actual.ended_at) && !fila.ended_at) return fila;
        return actual;
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
    const filtro = { schema: "public", table: "live_sessions", filter: `store_id=eq.${storeId}` } as const;
    const canal = supabase
      .channel(`sala:${storeId}`)
      .on("postgres_changes", { event: "INSERT", ...filtro }, (cambio) => recibir(cambio.new as Vivo, true))
      .on("postgres_changes", { event: "UPDATE", ...filtro }, (cambio) => recibir(cambio.new as Vivo, false))
      .subscribe((estadoCanal, error) => {
        if (estadoCanal === "SUBSCRIBED") void releer().catch((e: unknown) => console.error("Sala: leer el vivo al conectar el canal", e));
        else if (estadoCanal === "CHANNEL_ERROR") console.error("Sala: falló el canal del vivo", error);
      });
    return () => void supabase.removeChannel(canal);
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

  return { vivo, estado, mirando, reproduccion, sinSonido, activarSonido };
}
