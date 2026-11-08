const TASA = 16_000; // Whisper trabaja a 16 kHz

/** Pasa muestras a 16 kHz (promediando) y arma un WAV mono de 16 bits. */
export function aWav(muestras: Float32Array, tasaOrigen: number): Blob {
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
