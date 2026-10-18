export type Muestra = { atrasoMs: number | null; ancho: number | null; alto: number | null; fps: number | null; cuadros: number | null };

type Entrada = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Lee una muestra de `pc.getStats()`. El atraso es una estimación de la red:
 * la mitad del tiempo de ida y vuelta, más (al mirar) la espera del reproductor.
 */
export function leerMuestra(reporte: Iterable<Entrada>, modo: "transmitir" | "mirar"): Muestra {
  const entradas = [...reporte];
  const video = entradas.find((e) => e.type === (modo === "mirar" ? "inbound-rtp" : "outbound-rtp") && e.kind === "video");
  const par = entradas.find((e) => e.type === "candidate-pair" && e.state === "succeeded" && e.nominated === true);

  const rtt = num(par?.currentRoundTripTime);
  let atrasoMs: number | null = rtt === null ? null : (rtt * 1000) / 2;
  if (modo === "mirar" && atrasoMs !== null) {
    const demora = num(video?.jitterBufferDelay);
    const emitidos = num(video?.jitterBufferEmittedCount);
    if (demora !== null && emitidos) atrasoMs += (demora / emitidos) * 1000;
  }

  return {
    atrasoMs: atrasoMs === null ? null : Math.round(atrasoMs),
    ancho: num(video?.frameWidth),
    alto: num(video?.frameHeight),
    fps: num(video?.framesPerSecond),
    cuadros: num(modo === "mirar" ? video?.framesDecoded : video?.framesEncoded),
  };
}
