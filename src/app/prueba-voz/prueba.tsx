"use client";

// PRUEBA DESCARTABLE: cámara + micrófono prendidos (como al transmitir) y, a la vez, reconocimiento de voz.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { entender, type Entendido } from "./entender";

type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

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
    if (!pista) return;
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
  }, [stream]);

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
