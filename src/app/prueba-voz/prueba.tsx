"use client";

// PRUEBA DESCARTABLE: cámara + micrófono prendidos (como al transmitir) y, a la vez, reconocimiento de voz.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { entender, type Entendido } from "./entender";

type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: (pista?: MediaStreamTrack) => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

type Modo = "pausa" | "soltar" | "pista" | "nube";
const NOMBRES: Record<Modo, string> = { pausa: "A (pausar)", soltar: "B (soltar)", pista: "C (pasar audio)", nube: "D (Cloudflare)" };

// Hora para medir demoras (se usa solo en respuesta a toques, no al dibujar).
const reloj = () => performance.now();

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export function PruebaVoz() {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [nivel, setNivel] = useState(0);
  const [estadoMic, setEstadoMic] = useState("apagado");
  const [escuchando, setEscuchando] = useState(false);
  const escuchandoRef = useRef(false);
  const reconocedor = useRef<Reconocedor | null>(null);
  const [parcial, setParcial] = useState("");
  const [frases, setFrases] = useState<{ texto: string; entendido: Entendido; hora: string }[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  // Cambia cuando el walkie-talkie devuelve el micrófono con una pista nueva (para rehacer el medidor).
  const [versionMic, setVersionMic] = useState(0);
  const [apretado, setApretado] = useState<Modo | null>(null);
  const walkie = useRef<{ modo: Modo; desde: number; texto: string; r?: Reconocedor; grabador?: MediaRecorder } | null>(null);

  const anotarError = (m: string) => setErrores((e) => [`${new Date().toLocaleTimeString("es-AR")} · ${m}`, ...e].slice(0, 25));


  // Medidor del micrófono de la "transmisión": si baja a cero al escuchar, el reconocimiento le sacó el micrófono.
  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const fuente = ctx.createMediaStreamSource(stream);
    const analizador = ctx.createAnalyser();
    analizador.fftSize = 512;
    fuente.connect(analizador);
    const datos = new Uint8Array(analizador.fftSize);
    const pista = stream.getAudioTracks()[0];
    if (!pista) {
      void ctx.close();
      return;
    }
    let cuadro = 0;
    const medir = () => {
      analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (const d of datos) suma += ((d - 128) / 128) ** 2;
      setNivel(Math.min(1, Math.sqrt(suma / datos.length) * 4));
      setEstadoMic(pista.readyState === "ended" ? "CORTADO" : pista.muted ? "SILENCIADO por el sistema" : "andando");
      cuadro = requestAnimationFrame(medir);
    };
    medir();
    return () => {
      cancelAnimationFrame(cuadro);
      void ctx.close();
    };
  }, [stream, versionMic]);

  async function prenderCamara() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setStream(s);
      if (video.current) video.current.srcObject = s;
    } catch (e) {
      anotarError(`No se pudo prender la cámara: ${(e as Error).message}`);
    }
  }

  function empezar() {
    const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
    const Clase = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Clase) return anotarError("Este navegador NO tiene reconocimiento de voz.");
    anotarError(`Navegador: ${navigator.userAgent.slice(0, 140)}`);
    anotarError(stream ? "Escuchando CON la cámara prendida" : "Escuchando SIN la cámara");
    const r = new Clase();
    r.lang = "es-AR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interino = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        const texto = res[0].transcript.trim();
        if (res.isFinal) {
          anotarError(`resultado: "${texto}"`);
          setFrases((f) => [{ texto, entendido: entender(texto), hora: new Date().toLocaleTimeString("es-AR") }, ...f].slice(0, 20));
        } else interino += texto + " ";
      }
      setParcial(interino);
    };
    r.onerror = (e) => anotarError(`error: ${e.error}`);
    r.onstart = () => anotarError("arrancó");
    r.onaudiostart = () => anotarError("le llega audio");
    r.onspeechstart = () => anotarError("detectó que alguien habla");
    r.onspeechend = () => anotarError("dejó de oír voz");
    // El celular corta la escucha cada tanto: si seguimos escuchando, se vuelve a arrancar sola.
    r.onend = () => {
      anotarError("se detuvo");
      if (escuchandoRef.current) {
        try { r.start(); } catch (err) { anotarError(`No se pudo seguir escuchando: ${(err as Error).message}`); }
      }
    };
    reconocedor.current = r;
    escuchandoRef.current = true;
    setEscuchando(true);
    try { r.start(); } catch (err) { anotarError(`No arrancó: ${(err as Error).message}`); }
  }

  function parar() {
    escuchandoRef.current = false;
    setEscuchando(false);
    setParcial("");
    reconocedor.current?.stop();
  }

  // WALKIE-TALKIE: mientras se mantiene apretado, la "transmisión" le presta el micrófono al reconocimiento.
  // "pausa": solo apaga la pista (no suelta el micrófono). "soltar": la corta y al terminar pide una nueva.
  // "pista": no toca el micrófono; le pasa al reconocimiento la misma pista de audio de la transmisión.
  // "nube": graba una copia de la pista y la manda a Whisper de Cloudflare.
  function apretar(modo: Modo) {
    if (!stream || walkie.current) return;
    const pista = stream.getAudioTracks()[0];
    if (!pista) return anotarError("No hay pista de audio.");
    const desde = reloj();
    if (modo === "nube") return grabarParaNube(pista, desde);
    const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
    const Clase = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Clase) return anotarError("Este navegador NO tiene reconocimiento de voz.");
    if (modo === "pausa" || modo === "soltar") {
      for (const t of stream.getAudioTracks()) {
        if (modo === "pausa") t.enabled = false;
        else {
          t.stop();
          stream.removeTrack(t);
        }
      }
    }
    const r = new Clase();
    r.lang = "es-AR";
    r.continuous = true;
    r.interimResults = true;
    walkie.current = { modo, desde, texto: "", r };
    setApretado(modo);
    anotarError(`walkie ${NOMBRES[modo]}: apretado`);
    r.onstart = () => anotarError(`walkie: arrancó a los ${Math.round(reloj() - desde)} ms`);
    r.onaudiostart = () => anotarError("walkie: le llega audio");
    r.onspeechstart = () => anotarError("walkie: detectó que alguien habla");
    r.onspeechend = null;
    r.onerror = (e) => anotarError(`walkie error: ${e.error}`);
    r.onresult = (e) => {
      // Android repite la frase entera en cada pedacito: nos quedamos con la última versión.
      let texto = "";
      for (let i = 0; i < e.results.length; i++) texto += (e.results[i]?.[0].transcript ?? "") + " ";
      if (walkie.current) walkie.current.texto = texto.trim();
      setParcial(texto.trim());
    };
    r.onend = () => void devolverMicrofono();
    try {
      if (modo === "pista") r.start(pista);
      else r.start();
    } catch (err) {
      anotarError(`walkie no arrancó: ${(err as Error).name} ${(err as Error).message}`);
      void devolverMicrofono();
    }
  }

  function grabarParaNube(pista: MediaStreamTrack, desde: number) {
    const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    let grabador: MediaRecorder;
    try {
      grabador = new MediaRecorder(new MediaStream([pista]), tipo ? { mimeType: tipo } : undefined);
    } catch (err) {
      return anotarError(`nube: no se pudo grabar: ${(err as Error).message}`);
    }
    const pedazos: Blob[] = [];
    grabador.ondataavailable = (e) => { if (e.data.size) pedazos.push(e.data); };
    grabador.onstop = async () => {
      const audio = new Blob(pedazos, { type: grabador.mimeType });
      anotarError(`nube: mandando ${Math.round(audio.size / 1024)} KB (${grabador.mimeType})…`);
      setParcial("Entendiendo…");
      const t0 = reloj();
      try {
        const r = await fetch("/prueba-voz/transcribir", { method: "POST", body: audio });
        const j = (await r.json()) as { texto?: string; error?: string; ms?: number };
        if (j.error) anotarError(`nube error: ${j.error}`);
        else {
          const texto = j.texto ?? "";
          anotarError(`nube: respondió en ${Math.round(reloj() - t0)} ms (Cloudflare ${j.ms} ms): "${texto}"`);
          if (texto) setFrases((f) => [{ texto, entendido: entender(texto), hora: new Date().toLocaleTimeString("es-AR") }, ...f].slice(0, 20));
        }
      } catch (err) {
        anotarError(`nube: falló el envío: ${(err as Error).message}`);
      }
      walkie.current = null;
      setApretado(null);
      setParcial("");
    };
    walkie.current = { modo: "nube", desde, texto: "", grabador };
    setApretado("nube");
    anotarError("walkie D (Cloudflare): grabando (la transmisión sigue con sonido)");
    grabador.start();
  }

  function soltar() {
    const actual = walkie.current;
    if (!actual) return;
    anotarError(`walkie: soltado después de ${Math.round(reloj() - actual.desde)} ms`);
    if (actual.grabador) {
      if (actual.grabador.state === "recording") actual.grabador.stop();
    } else actual.r?.stop(); // el resultado final llega después; al terminar se devuelve el micrófono
  }

  async function devolverMicrofono() {
    const actual = walkie.current;
    if (!actual || !stream) return;
    walkie.current = null;
    setApretado(null);
    setParcial("");
    if (actual.texto) {
      setFrases((f) => [{ texto: actual.texto, entendido: entender(actual.texto), hora: new Date().toLocaleTimeString("es-AR") }, ...f].slice(0, 20));
      anotarError(`walkie resultado: "${actual.texto}"`);
    } else anotarError("walkie: no entendió nada");
    const t0 = reloj();
    if (actual.modo === "pista") {
      anotarError("walkie: la transmisión nunca soltó el micrófono");
    } else if (actual.modo === "pausa") {
      for (const t of stream.getAudioTracks()) t.enabled = true;
      anotarError("walkie: micrófono de la transmisión reactivado");
    } else {
      try {
        const nuevo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        for (const t of nuevo.getAudioTracks()) stream.addTrack(t);
        setVersionMic((v) => v + 1);
        anotarError(`walkie: micrófono devuelto a la transmisión en ${Math.round(reloj() - t0)} ms`);
      } catch (err) {
        anotarError(`walkie: NO se pudo devolver el micrófono: ${(err as Error).message}`);
      }
    }
  }

  const ultima = frases.find((f) => f.entendido.precio !== null || f.entendido.codigo !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black aspect-[3/4]">
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
        {!stream && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <Button onClick={prenderCamara}>1. Prender cámara y micrófono</Button>
          </div>
        )}
        {ultima && (
          <div className="absolute inset-x-3 top-3 rounded-xl bg-black/75 p-3 text-white">
            <p className="text-xs opacity-80">Entendí (a las {ultima.hora}):</p>
            <p className="text-lg font-bold">
              Precio: {ultima.entendido.precio !== null ? pesos.format(ultima.entendido.precio) : "—"} · Código:{" "}
              {ultima.entendido.codigo ?? "—"}
            </p>
          </div>
        )}
        {parcial && (
          <p className="absolute inset-x-3 bottom-3 rounded-lg bg-black/60 p-2 text-sm text-white">{parcial}</p>
        )}
      </div>

      <div className="rounded-xl bg-secondary p-3 text-sm">
        <p>
          Micrófono de la transmisión: <b>{estadoMic}</b>
        </p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(nivel * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs opacity-70">Hablá: la barra tiene que moverse también mientras escucha.</p>
      </div>

      {escuchando ? (
        <Button variant="outline" onClick={parar}>Dejar de escuchar</Button>
      ) : (
        <Button onClick={empezar}>2. Empezar a escuchar{stream ? "" : " (sin cámara)"}</Button>
      )}

      {stream && !escuchando && (
        <div className="grid grid-cols-2 gap-2">
          {(["pista", "nube", "pausa", "soltar"] as const).map((modo) => (
            <button
              key={modo}
              type="button"
              onPointerDown={() => apretar(modo)}
              onPointerUp={soltar}
              onPointerCancel={soltar}
              onContextMenu={(e) => e.preventDefault()}
              disabled={apretado !== null && apretado !== modo}
              className={`select-none touch-none rounded-2xl p-4 text-center font-bold text-white disabled:opacity-40 ${apretado === modo ? "bg-red-600" : "bg-primary"}`}
            >
              🎤 {apretado === modo ? "Hablá… (soltá al terminar)" : `Mantené apretado ${NOMBRES[modo]}`}
            </button>
          ))}
        </div>
      )}

      {errores.length > 0 && (
        <ul className="rounded-xl bg-secondary p-3 text-xs">
          <li className="font-bold">Registro (lo más nuevo arriba)</li>
          {errores.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <section>
        <h2 className="text-sm font-bold">Lo que escuchó</h2>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {frases.map((f, i) => (
            <li key={i} className="rounded-lg border p-2">
              <span className="text-xs opacity-60">{f.hora}</span> “{f.texto}”
              <br />→ {f.entendido.precio !== null ? pesos.format(f.entendido.precio) : "sin precio"} ·{" "}
              {f.entendido.codigo ?? "sin código"}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
