"use client";

// PRUEBA DESCARTABLE: escucha todo el vivo. El celular detecta cuándo hay voz (gratis) y manda cada frase
// a Whisper de Cloudflare al hacer una pausa. Si la frase trae precio y código, arma el código con la foto.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { entender } from "../entender";

const TASA = 16_000; // Whisper trabaja a 16 kHz
const PREVIO_S = 0.6; // audio de antes de que arranque la voz (para no cortar la primera palabra)
const SILENCIO_FIN_MS = 800; // pausa que cierra una frase
const MAXIMO_S = 12; // si habla sin pausa, se corta igual…
const SOLAPE_S = 2; // …y la frase siguiente arranca con los últimos 2 s (por si cortó "código | ROJO")
const MINIMO_S = 0.7;

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const hora = () => new Date().toLocaleTimeString("es-AR");
const reloj = () => performance.now();

type Codigo = { codigo: string; precio: number; foto: string; texto: string; hora: string };

/** Pasa muestras a 16 kHz (promediando) y arma un WAV mono de 16 bits. */
function aWav(muestras: Float32Array, tasaOrigen: number): Blob {
  const paso = tasaOrigen / TASA;
  const n = Math.floor(muestras.length / paso);
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const txt = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, TASA, true); b.setUint32(28, TASA * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true);
  txt(36, "data"); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const desde = Math.floor(i * paso);
    const hasta = Math.min(muestras.length, Math.floor((i + 1) * paso));
    let s = 0;
    for (let j = desde; j < hasta; j++) s += muestras[j] ?? 0;
    const v = Math.max(-1, Math.min(1, s / Math.max(1, hasta - desde)));
    b.setInt16(44 + i * 2, v * 0x7fff, true);
  }
  return new Blob([b.buffer], { type: "audio/wav" });
}

function unir(trozos: Float32Array[]): Float32Array {
  const total = trozos.reduce((a, t) => a + t.length, 0);
  const r = new Float32Array(total);
  let o = 0;
  for (const t of trozos) { r.set(t, o); o += t.length; }
  return r;
}

export function ManosLibres() {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hablando, setHablando] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [registro, setRegistro] = useState<string[]>([]);
  const [enviados, setEnviados] = useState({ frases: 0, segundos: 0 });
  const codigosRef = useRef<Codigo[]>([]);

  const anotar = (m: string) => setRegistro((r) => [`${hora()} · ${m}`, ...r].slice(0, 40));

  useEffect(() => { codigosRef.current = codigos; }, [codigos]);

  function foto(): string {
    const v = video.current;
    if (!v || !v.videoWidth) return "";
    const c = document.createElement("canvas");
    const escala = 320 / v.videoWidth;
    c.width = 320;
    c.height = Math.round(v.videoHeight * escala);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  async function mandar(muestras: Float32Array, tasa: number, fotoFrase: string) {
    const segundos = muestras.length / tasa;
    if (segundos < MINIMO_S) return;
    setEnviados((e) => ({ frases: e.frases + 1, segundos: e.segundos + segundos }));
    const t0 = reloj();
    try {
      const r = await fetch("/prueba-voz/transcribir", { method: "POST", body: aWav(muestras, tasa) });
      const j = (await r.json()) as { texto?: string; error?: string };
      if (j.error) return anotar(`error: ${j.error}`);
      const texto = j.texto ?? "";
      const ms = Math.round(reloj() - t0);
      if (!texto) return anotar(`(${segundos.toFixed(1)} s, sin palabras) ${ms} ms`);
      const { precio, codigo } = entender(texto);
      anotar(`“${texto}” (${segundos.toFixed(1)} s, ${ms} ms)`);
      if (codigo && precio) {
        if (codigosRef.current.some((c) => c.codigo === codigo)) return anotar(`código ${codigo} ya estaba: no se duplica`);
        const nuevo = { codigo, precio, foto: fotoFrase, texto, hora: hora() };
        codigosRef.current = [nuevo, ...codigosRef.current];
        setCodigos(codigosRef.current);
        anotar(`✅ código armado: ${codigo} ${pesos.format(precio)}`);
      } else if (codigo) anotar(`dijo el código ${codigo} pero no entendí el precio`);
    } catch (err) {
      anotar(`falló el envío: ${(err as Error).message}`);
    }
  }

  async function prender() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setStream(s);
      if (video.current) video.current.srcObject = s;
    } catch (e) {
      anotar(`No se pudo prender la cámara: ${(e as Error).message}`);
    }
  }

  // Detector de voz: mide el volumen de la pista de la transmisión (sin sacarle el micrófono a nadie).
  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const fuente = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const silencio = ctx.createGain();
    silencio.gain.value = 0; // hace falta conectarlo a la salida para que procese, pero sin que suene
    fuente.connect(proc);
    proc.connect(silencio);
    silencio.connect(ctx.destination);
    const tasa = ctx.sampleRate;
    let previo: Float32Array[] = [];
    let frase: Float32Array[] = [];
    let enFrase = false;
    let ultimaVoz = 0;
    let ruido = 0.01;
    let fotoFrase = "";
    const largo = (t: Float32Array[]) => t.reduce((a, x) => a + x.length, 0) / tasa;

    proc.onaudioprocess = (e) => {
      const datos = new Float32Array(e.inputBuffer.getChannelData(0));
      let suma = 0;
      for (const d of datos) suma += d * d;
      const rms = Math.sqrt(suma / datos.length);
      setNivel(Math.min(1, rms * 8));
      const umbral = Math.max(0.012, ruido * 2.5);
      const hayVoz = rms > umbral;
      const ahora = reloj();
      if (!enFrase) {
        ruido = ruido * 0.95 + rms * 0.05;
        previo.push(datos);
        while (largo(previo) > PREVIO_S) previo.shift();
        if (hayVoz) {
          enFrase = true;
          ultimaVoz = ahora;
          frase = [...previo];
          previo = [];
          fotoFrase = foto();
          setHablando(true);
        }
        return;
      }
      frase.push(datos);
      if (hayVoz) ultimaVoz = ahora;
      if (ahora - ultimaVoz > SILENCIO_FIN_MS) {
        void mandar(unir(frase), tasa, fotoFrase);
        enFrase = false;
        frase = [];
        setHablando(false);
      } else if (largo(frase) > MAXIMO_S) {
        const todo = unir(frase);
        void mandar(todo, tasa, fotoFrase);
        frase = [todo.slice(todo.length - Math.floor(SOLAPE_S * tasa))];
        fotoFrase = foto();
      }
    };
    return () => {
      proc.onaudioprocess = null;
      void ctx.close();
    };
  }, [stream]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
        <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
        {!stream && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <Button onClick={prender}>Prender cámara y micrófono</Button>
          </div>
        )}
        {stream && (
          <span className={`absolute left-3 top-3 rounded-full px-2 py-1 text-xs font-bold text-white ${hablando ? "bg-red-600" : "bg-black/60"}`}>
            {hablando ? "● Escuchando frase" : "Esperando que hables"}
          </span>
        )}
        {codigos[0] && (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl bg-black/80 p-2 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {codigos[0].foto && <img src={codigos[0].foto} alt="" className="h-16 w-12 rounded object-cover" />}
            <div>
              <p className="text-xs opacity-80">Código armado ({codigos[0].hora})</p>
              <p className="text-lg font-bold">{codigos[0].codigo} – {pesos.format(codigos[0].precio)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-secondary p-3 text-sm">
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
          <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(nivel * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs">
          Mandado a Cloudflare: {enviados.frases} frases · {Math.round(enviados.segundos)} s de audio
        </p>
      </div>

      {codigos.length > 0 && (
        <section>
          <h2 className="text-sm font-bold">Códigos armados</h2>
          <ul className="mt-1 grid grid-cols-2 gap-2">
            {codigos.map((c) => (
              <li key={c.codigo} className="rounded-lg border p-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.foto && <img src={c.foto} alt="" className="mb-1 aspect-[3/4] w-full rounded object-cover" />}
                <b>{c.codigo}</b> · {pesos.format(c.precio)}
                <p className="text-xs opacity-60">“{c.texto}”</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {registro.length > 0 && (
        <ul className="rounded-xl bg-secondary p-3 text-xs">
          <li className="font-bold">Registro (lo más nuevo arriba)</li>
          {registro.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
