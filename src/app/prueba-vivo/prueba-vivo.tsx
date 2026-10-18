"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { leerMuestra } from "@/lib/vivos/estadisticas";
import { agregarEvento, esperaReconexion, type EventoRegistro, resumir, textoResumen } from "@/lib/vivos/registro";
import { type ConexionVivo, mirar, transmitir } from "@/lib/vivos/webrtc";

type Modo = "transmitir" | "mirar";
type Estado = "conectando" | "en-vivo" | "reconectando" | "manual" | "terminado";

const TEXTO_ESTADO: Record<Estado, string> = {
  conectando: "Conectando…",
  "en-vivo": "En vivo",
  reconectando: "Se cortó, reconectando…",
  manual: "Se cortó: tocá Volver a transmitir",
  terminado: "Terminado",
};

const SEGUNDOS_CONGELADO_PARA_RECONECTAR = 5;

function aparato(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  return "Computadora";
}

function pedirCamara(frente: "user" | "environment", conAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: frente, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: conAudio,
  });
}

function pistaDeVideo(stream: MediaStream): MediaStreamTrack {
  const pista = stream.getVideoTracks()[0];
  if (!pista) throw new Error("La cámara no dio imagen");
  return pista;
}

const hora = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function describir(e: EventoRegistro): string {
  switch (e.tipo) {
    case "inicio": return "Empezó";
    case "fin": return "Terminó";
    case "corte": return `Corte (${{ conexion: "conexión", "sin-cuadros": "sin imagen", pista: "cámara o sonido" }[e.motivo]})`;
    case "vuelta": return e.como === "sola" ? "Volvió sola" : "Volvió tocando el botón";
    case "muestra":
      return `${e.ancho ?? "?"}×${e.alto ?? "?"} · ${e.fps === null ? "?" : Math.round(e.fps)} fps · atraso ${e.atrasoMs === null ? "?" : `${e.atrasoMs} ms`}`;
  }
}

export function PruebaVivo({ urlTransmitir, urlMirar }: { urlTransmitir: string; urlMirar: string }) {
  const [modo, setModo] = useState<Modo | null>(null);

  if (!modo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">
          Uno transmite y el otro mira. Para medir el atraso, poné el celular que mira frente a la cámara del que transmite.
        </p>
        <Button size="lg" className="h-16 text-lg" onClick={() => setModo("transmitir")}>Transmitir</Button>
        <Button size="lg" variant="outline" className="h-16 text-lg" onClick={() => setModo("mirar")}>Mirar</Button>
      </div>
    );
  }
  return <Sesion key={modo} modo={modo} url={modo === "transmitir" ? urlTransmitir : urlMirar} onSalir={() => setModo(null)} />;
}

type Acciones = { terminar(): void; cambiarCamara(): Promise<void>; volverATransmitir(): Promise<void> };

function Sesion({ modo, url, onSalir }: { modo: Modo; url: string; onSalir(): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const accionesRef = useRef<Acciones | null>(null);
  const [estado, setEstado] = useState<Estado>("conectando");
  const [eventos, setEventos] = useState<EventoRegistro[]>([]);
  const [sinSonido, setSinSonido] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let lista: EventoRegistro[] = [];
    const anotar = (e: EventoRegistro) => {
      lista = agregarEvento(lista, e);
      setEventos(lista);
    };

    let activo = true;
    let conexion: ConexionVivo | null = null;
    let camara: MediaStream | null = null;
    let frente: "user" | "environment" = "user";
    let intento = 0;
    let proximaVueltaManual = false;
    let ultimosCuadros: number | null = null;
    let segundosCongelado = 0;
    let segundos = 0;
    let quitarEscuchasPista = () => {};

    const cambiarEstado = (e: Estado) => { if (activo) setEstado(e); };
    const volvio = () => {
      anotar({ tipo: "vuelta", en: Date.now(), como: proximaVueltaManual ? "manual" : "sola" });
      proximaVueltaManual = false;
    };

    const escucharPista = (pista: MediaStreamTrack) => {
      quitarEscuchasPista();
      const silenciada = () => anotar({ tipo: "corte", en: Date.now(), motivo: "pista" });
      const activa = () => { if (conexion?.pc.connectionState === "connected") volvio(); };
      const terminada = () => {
        anotar({ tipo: "corte", en: Date.now(), motivo: "pista" });
        void recuperarCamara();
      };
      pista.addEventListener("mute", silenciada);
      pista.addEventListener("unmute", activa);
      pista.addEventListener("ended", terminada);
      quitarEscuchasPista = () => {
        pista.removeEventListener("mute", silenciada);
        pista.removeEventListener("unmute", activa);
        pista.removeEventListener("ended", terminada);
      };
    };

    const ponerVideo = (stream: MediaStream) => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      if (modo === "transmitir") {
        video.muted = true;
        void video.play().catch(() => undefined);
        return;
      }
      video.muted = false;
      video.play().catch(() => {
        // El navegador no deja arrancar con sonido sin un toque: arranca mudo y ofrece el botón.
        video.muted = true;
        setSinSonido(true);
        void video.play().catch(() => undefined);
      });
    };

    /** Cambia la pista de video que se manda, sin reconectar. */
    const reemplazarVideo = async (nueva: MediaStreamTrack) => {
      const vieja = camara?.getVideoTracks()[0];
      if (vieja) { camara!.removeTrack(vieja); vieja.stop(); }
      camara!.addTrack(nueva);
      escucharPista(nueva);
      const emisor = conexion?.pc.getSenders().find((s) => s.track?.kind === "video" || s.track === null);
      await emisor?.replaceTrack(nueva);
      ponerVideo(camara!);
    };

    async function recuperarCamara() {
      if (!activo || modo !== "transmitir") return;
      try {
        const nueva = pistaDeVideo(await pedirCamara(frente, false));
        await reemplazarVideo(nueva);
        if (conexion?.pc.connectionState === "connected") volvio();
      } catch {
        cambiarEstado("manual");
      }
    }

    async function conectar() {
      if (!activo) return;
      cambiarEstado(lista.length ? "reconectando" : "conectando");
      try {
        const nueva = modo === "transmitir" ? await transmitir(url, camara!) : await mirar(url);
        if (!activo) { await nueva.cerrar(); return; }
        conexion = nueva;
        ultimosCuadros = null;
        segundosCongelado = 0;
        if ("stream" in nueva) ponerVideo(nueva.stream as MediaStream);
        nueva.pc.addEventListener("connectionstatechange", () => {
          if (conexion !== nueva) return;
          const s = nueva.pc.connectionState;
          if (s === "connected") {
            intento = 0;
            cambiarEstado("en-vivo");
            if (modo === "transmitir") volvio();
          } else if (s === "disconnected" || s === "failed") {
            anotar({ tipo: "corte", en: Date.now(), motivo: "conexion" });
            cambiarEstado("reconectando");
            if (s === "failed") void reconectar();
          }
        });
      } catch {
        void reconectar();
      }
    }

    async function reconectar() {
      if (!activo) return;
      const anterior = conexion;
      conexion = null;
      await anterior?.cerrar();
      cambiarEstado("reconectando");
      const espera = esperaReconexion(intento++);
      setTimeout(() => void conectar(), espera);
    }

    // Cada segundo: cuadros nuevos (para detectar imagen congelada) y cada 10 s una muestra.
    const reloj = setInterval(async () => {
      setAhora(Date.now());
      const pc = conexion?.pc;
      if (!pc || pc.connectionState !== "connected") return;
      const reporte = await pc.getStats();
      const m = leerMuestra(reporte.values() as Iterable<Record<string, unknown>>, modo);
      if (modo === "mirar" && m.cuadros !== null) {
        if (ultimosCuadros !== null && m.cuadros === ultimosCuadros) {
          anotar({ tipo: "corte", en: Date.now(), motivo: "sin-cuadros" });
          cambiarEstado("reconectando");
          // Si quien transmite se reconectó, esta conexión queda "conectada" pero sin imagen:
          // después de unos segundos congelada, se vuelve a pedir la transmisión.
          if (++segundosCongelado >= SEGUNDOS_CONGELADO_PARA_RECONECTAR) void reconectar();
        } else if (ultimosCuadros !== null) {
          segundosCongelado = 0;
          volvio();
          cambiarEstado("en-vivo");
        }
        ultimosCuadros = m.cuadros;
      }
      if (++segundos % 10 === 0) {
        anotar({ tipo: "muestra", en: Date.now(), atrasoMs: m.atrasoMs, ancho: m.ancho, alto: m.alto, fps: m.fps });
      }
    }, 1000);

    accionesRef.current = {
      terminar() {
        if (!activo) return;
        anotar({ tipo: "fin", en: Date.now() });
        cerrarTodo();
        setEstado("terminado");
      },
      async cambiarCamara() {
        frente = frente === "user" ? "environment" : "user";
        quitarEscuchasPista();
        camara?.getVideoTracks()[0]?.stop();
        try {
          await reemplazarVideo(pistaDeVideo(await pedirCamara(frente, false)));
        } catch {
          toast.error("No se pudo cambiar de cámara");
          await recuperarCamara();
        }
      },
      async volverATransmitir() {
        proximaVueltaManual = true;
        try {
          await reemplazarVideo(pistaDeVideo(await pedirCamara(frente, false)));
          if (conexion?.pc.connectionState === "connected") { cambiarEstado("en-vivo"); volvio(); }
          else void reconectar();
        } catch {
          toast.error("No se pudo prender la cámara");
        }
      },
    };

    function cerrarTodo() {
      activo = false;
      clearInterval(reloj);
      quitarEscuchasPista();
      void conexion?.cerrar();
      conexion = null;
      camara?.getTracks().forEach((p) => p.stop());
    }

    anotar({ tipo: "inicio", en: Date.now() });
    if (modo === "transmitir") {
      pedirCamara(frente, true)
        .catch((error: unknown) => {
          // Sin micrófono (por ejemplo, una computadora): se transmite solo la imagen.
          if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
          toast("No se encontró micrófono: se transmite sin sonido");
          return pedirCamara(frente, false);
        })
        .then((stream) => {
          if (!activo) { stream.getTracks().forEach((p) => p.stop()); return; }
          camara = stream;
          escucharPista(pistaDeVideo(stream));
          ponerVideo(stream);
          void conectar();
        })
        .catch(() => {
          toast.error("No se pudo usar la cámara. Revisá los permisos del navegador.");
          cambiarEstado("manual");
        });
    } else {
      void conectar();
    }

    return cerrarTodo;
  }, [modo, url]);

  const resumen = textoResumen(resumir(eventos, ahora), modo, aparato());
  const terminado = estado === "terminado";

  return (
    <div className="flex flex-col gap-4">
      <p className="font-semibold" aria-live="polite">
        {modo === "transmitir" ? "Transmitiendo" : "Mirando"} · {TEXTO_ESTADO[estado]}
      </p>

      <video ref={videoRef} playsInline autoPlay muted={modo === "transmitir"} className="aspect-[9/16] w-full rounded-xl bg-black object-cover" />

      {modo === "mirar" && sinSonido && !terminado && (
        <Button variant="secondary" onClick={() => {
          if (videoRef.current) videoRef.current.muted = false;
          setSinSonido(false);
        }}>Activar sonido</Button>
      )}
      {modo === "mirar" && <Reloj />}

      {!terminado && (
        <div className="flex flex-wrap gap-2">
          {modo === "transmitir" && estado === "manual" && (
            <Button onClick={() => void accionesRef.current?.volverATransmitir()}>Volver a transmitir</Button>
          )}
          {modo === "transmitir" && (
            <Button variant="outline" onClick={() => void accionesRef.current?.cambiarCamara()}>Cambiar cámara</Button>
          )}
          <Button variant="destructive" onClick={() => accionesRef.current?.terminar()}>Terminar</Button>
        </div>
      )}

      <section className="flex flex-col gap-2 rounded-xl border p-3">
        <h2 className="font-bold">Resumen</h2>
        <p className="text-sm">{resumen}</p>
        <Button variant="outline" onClick={() => {
          void navigator.clipboard.writeText(resumen).then(() => toast.success("Resumen copiado"));
        }}>Copiar resumen</Button>
        {terminado && <Button variant="ghost" onClick={onSalir}>Volver al inicio</Button>}
      </section>

      <section className="flex flex-col gap-1 rounded-xl border p-3">
        <h2 className="font-bold">Registro</h2>
        <ol className="flex flex-col gap-0.5 text-sm tabular-nums">
          {[...eventos].reverse().slice(0, 40).map((e, i) => (
            <li key={`${e.en}-${i}`}><span className="text-muted-foreground">{hora(e.en)}</span> {describir(e)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Reloj grande con décimas, para filmarlo y comparar con el que aparece en el video. */
function Reloj() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let cuadro = 0;
    const dibujar = () => {
      const d = new Date();
      if (ref.current) ref.current.textContent = `${hora(d.getTime())}.${Math.floor(d.getMilliseconds() / 100)}`;
      cuadro = requestAnimationFrame(dibujar);
    };
    dibujar();
    return () => cancelAnimationFrame(cuadro);
  }, []);
  return <p ref={ref} className="text-center font-mono text-5xl font-bold tabular-nums" />;
}
