"use client";

import { type RefObject, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fotoDelVideo } from "@/lib/codigos/foto-video";
import { normalizarCodigo } from "@/lib/codigos/reclamo";
import type { Transmisor } from "@/lib/vivos/transmisor";
import { type ConfigDetector, DetectorVoz } from "@/lib/voz/detector";
import { entender } from "@/lib/voz/entender";
import { aWav } from "@/lib/voz/wav";
import type { Borrador } from "./panel-codigo";

export type EstadoVoz = "apagada" | "esperando" | "escuchando" | "sin-servicio";

export const AVISO_LIMITE_VOZ = "Llegaste al límite de voz de hoy. Usá + Nuevo código.";
const AVISO_SIN_AUDIO = "Este celular no deja escuchar la voz. Usá + Nuevo código.";
/** Errores seguidos de la ruta de la voz antes de darla por caída. */
const ERRORES_PARA_CORTAR = 3;

// Fuera del componente: las reglas de React no dejan leer el reloj mientras se dibuja.
const reloj = () => performance.now();
const sinSuscripcion = () => () => undefined;
const hayWebAudio = () => typeof AudioContext !== "undefined";

/**
 * Lo que dijo la feriante → el cartel del código, o null si no hay nada para lanzar
 * (no nombró un código, o esa palabra ya se usó en este vivo).
 */
export function armarBorrador(texto: string, foto: Blob | null, usadas: ReadonlySet<string>): Borrador | null {
  const { precio, codigo } = entender(texto);
  if (!codigo) return null;
  const normal = normalizarCodigo(codigo);
  if (!normal || usadas.has(normal)) return null;
  return {
    foto,
    precio: precio === null ? null : Math.round(precio * 100),
    palabra: codigo,
    cantidad: 1,
    productoId: null,
    porVoz: true,
  };
}

type Opciones = {
  transmisor: Transmisor | null;
  video: RefObject<HTMLVideoElement | null>;
  vivoId: string;
  config: ConfigDetector;
  /** Las palabras de los códigos de este vivo, normalizadas con `normalizarCodigo`. */
  palabrasUsadas: ReadonlySet<string>;
  /** El interruptor de la feriante. */
  activa: boolean;
};

type Bloqueo = "limite" | "sin-servicio" | "sin-audio";

type Grafo = { ctx: AudioContext; fuente: MediaStreamAudioSourceNode; proceso: ScriptProcessorNode };

/**
 * Arma el audio para escuchar una copia de la pista, en un AudioContext propio.
 * Si algo falla (por ejemplo, Firefox con otra frecuencia de muestreo), cierra el contexto y tira el error.
 */
function armarGrafo(pista: MediaStreamTrack): Grafo {
  const ctx = new AudioContext();
  try {
    // Una copia de la pista en un MediaStream propio: se lee, no se le saca a la transmisión.
    const fuente = ctx.createMediaStreamSource(new MediaStream([pista]));
    const proceso = ctx.createScriptProcessor(4096, 1, 1);
    const mudo = ctx.createGain();
    mudo.gain.value = 0; // Tiene que llegar a la salida para que procese, pero sin que suene.
    fuente.connect(proceso);
    proceso.connect(mudo);
    mudo.connect(ctx.destination);
    return { ctx, fuente, proceso };
  } catch (error) {
    void ctx.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Escucha una copia del micrófono de la transmisión y arma el cartel del código con cada frase.
 * Solo lee la pista con un AudioContext propio: la transmisión no se toca.
 */
export function useVoz({ transmisor, video, vivoId, config, palabrasUsadas, activa }: Opciones): {
  estado: EstadoVoz;
  aviso: string | null;
  borrador: Borrador | null;
  descartar(): void;
  /** Saca el bloqueo (límite o sin servicio) para volver a probar al prenderla de nuevo. */
  reintentar(): void;
} {
  const suscribir = useCallback(
    (avisar: () => void) => transmisor?.alCambiarAudio(avisar) ?? (() => undefined),
    [transmisor],
  );
  const pista = useSyncExternalStore(suscribir, () => transmisor?.pistaDeAudio() ?? null, () => null);
  const soportada = useSyncExternalStore(sinSuscripcion, hayWebAudio, () => true);
  const [bloqueo, setBloqueo] = useState<Bloqueo | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const usadas = useRef(palabrasUsadas);
  useEffect(() => { usadas.current = palabrasUsadas; }, [palabrasUsadas]);

  const escuchar = activa && soportada && pista !== null && bloqueo === null;
  const { umbralMinimo, previoMs, silencioFinMs, maximoMs, solapeMs, minimoVozMs } = config;

  useEffect(() => {
    if (!escuchar || !pista) return;
    let prendida = true;
    let errores = 0;
    let grafo: Grafo;
    try {
      grafo = armarGrafo(pista);
    } catch (e) {
      // Si el navegador no deja leer la pista, la voz se apaga sola: el vivo sigue igual.
      console.error("Voz: no se pudo escuchar el micrófono", e);
      queueMicrotask(() => { if (prendida) setBloqueo("sin-audio"); });
      return () => { prendida = false; };
    }
    const { ctx, fuente, proceso } = grafo;
    const tasa = ctx.sampleRate;

    // El navegador puede arrancar el audio en pausa hasta que la feriante toque la pantalla.
    const reanudar = () => { if (ctx.state === "suspended") void ctx.resume().catch(() => undefined); };
    reanudar();
    document.addEventListener("pointerdown", reanudar);

    const fallo = () => {
      errores++;
      if (errores >= ERRORES_PARA_CORTAR && prendida) setBloqueo("sin-servicio");
    };

    async function mandar(muestras: Float32Array, foto: Promise<Blob | null>) {
      let respuesta: Response;
      try {
        respuesta = await fetch(`/mi-puesto/vivo/voz?vivo=${encodeURIComponent(vivoId)}`, {
          method: "POST",
          headers: { "content-type": "audio/wav" },
          body: aWav(muestras, tasa),
        });
      } catch (e) {
        console.error("Voz: no se pudo mandar la frase", e);
        return fallo();
      }
      if (!prendida) return;
      if (respuesta.status === 429) return setBloqueo("limite");
      if (!respuesta.ok) {
        console.error("Voz: la ruta respondió", respuesta.status);
        return fallo();
      }
      const { texto } = (await respuesta.json().catch(() => ({}))) as { texto?: string };
      errores = 0;
      if (!texto || !prendida) return;
      const nuevo = armarBorrador(texto, await foto, usadas.current);
      if (nuevo && prendida) setBorrador(nuevo);
    }

    // La foto se saca cuando empieza la frase (ahí está mostrando la prenda) y queda en memoria.
    let foto: Promise<Blob | null> = Promise.resolve(null);
    const sacarFoto = () => {
      const v = video.current;
      foto = v ? fotoDelVideo(v).catch(() => null) : Promise.resolve(null);
    };
    let entrego = false;
    const detector = new DetectorVoz(
      { umbralMinimo, previoMs, silencioFinMs, maximoMs, solapeMs, minimoVozMs },
      tasa,
      (muestras) => {
        entrego = true;
        void mandar(muestras, foto);
      },
    );
    let anterior: "esperando" | "escuchando" = "esperando";
    proceso.onaudioprocess = (e) => {
      entrego = false;
      // Copia: el navegador reusa el mismo bloque en cada llamada.
      const ahora = detector.procesar(new Float32Array(e.inputBuffer.getChannelData(0)), reloj());
      // Frase nueva, o la continuación de una que se cortó por larga.
      if (ahora === "escuchando" && (anterior === "esperando" || entrego)) sacarFoto();
      if (ahora !== anterior) {
        anterior = ahora;
        setEscuchando(ahora === "escuchando");
      }
    };

    return () => {
      prendida = false;
      document.removeEventListener("pointerdown", reanudar);
      proceso.onaudioprocess = null;
      fuente.disconnect();
      void ctx.close().catch(() => undefined);
      setEscuchando(false);
    };
  }, [escuchar, pista, vivoId, video, umbralMinimo, previoMs, silencioFinMs, maximoMs, solapeMs, minimoVozMs]);

  let estado: EstadoVoz;
  let aviso: string | null = null;
  if (!activa) estado = "apagada";
  else if (bloqueo === "limite") { estado = "apagada"; aviso = AVISO_LIMITE_VOZ; }
  else if (!soportada || bloqueo === "sin-audio") { estado = "apagada"; aviso = AVISO_SIN_AUDIO; }
  else if (!pista) estado = "apagada";
  else if (bloqueo === "sin-servicio") estado = "sin-servicio";
  else estado = escuchando ? "escuchando" : "esperando";

  return {
    estado,
    aviso,
    borrador,
    descartar: useCallback(() => setBorrador(null), []),
    reintentar: useCallback(() => setBloqueo(null), []),
  };
}
