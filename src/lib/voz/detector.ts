export type ConfigDetector = {
  umbralMinimo: number;
  previoMs: number;
  silencioFinMs: number;
  maximoMs: number;
  solapeMs: number;
  minimoVozMs: number;
};

type Trozo = { datos: Float32Array; ms: number };

const msDe = (t: Trozo[]) => t.reduce((a, x) => a + x.ms, 0);
const unir = (trozos: Trozo[]): Float32Array => {
  const r = new Float32Array(trozos.reduce((a, t) => a + t.datos.length, 0));
  let o = 0;
  for (const t of trozos) {
    r.set(t.datos, o);
    o += t.datos.length;
  }
  return r;
};

/** Decide cuándo hay una frase en el audio del micrófono. Puro: no usa Web Audio ni relojes. */
export class DetectorVoz {
  private previo: Trozo[] = [];
  private frase: Trozo[] = [];
  private enFrase = false;
  private ultimaVozMs = 0;
  private vozMs = 0;
  private inicioMs = 0;
  private ruido = 0;

  constructor(
    private config: ConfigDetector,
    private tasa: number,
    private alFrase: (muestras: Float32Array, inicioMs: number) => void,
  ) {}

  procesar(bloque: Float32Array, ahoraMs: number): "esperando" | "escuchando" {
    let suma = 0;
    for (const d of bloque) suma += d * d;
    const rms = Math.sqrt(suma / (bloque.length || 1));
    const ms = (bloque.length / this.tasa) * 1000;
    const trozo: Trozo = { datos: bloque, ms };
    const hayVoz = rms > Math.max(this.config.umbralMinimo, this.ruido * 2.5);

    if (!this.enFrase) {
      this.ruido = this.ruido * 0.95 + rms * 0.05;
      if (!hayVoz) {
        this.previo.push(trozo);
        while (this.previo.length > 1 && msDe(this.previo) > this.config.previoMs) this.previo.shift();
        return "esperando";
      }
      this.enFrase = true;
      this.frase = [...this.previo, trozo];
      this.inicioMs = ahoraMs - msDe(this.previo);
      this.previo = [];
      this.ultimaVozMs = ahoraMs;
      this.vozMs = ms;
      return "escuchando";
    }

    this.frase.push(trozo);
    if (hayVoz) {
      this.ultimaVozMs = ahoraMs;
      this.vozMs += ms;
    }
    if (ahoraMs - this.ultimaVozMs > this.config.silencioFinMs) {
      this.entregar();
      this.enFrase = false;
      this.frase = [];
      return "esperando";
    }
    if (msDe(this.frase) >= this.config.maximoMs) {
      // Corta igual, pero la siguiente arranca con los últimos segundos (por si cortó "código | ROJO").
      const todo = this.frase;
      this.entregar();
      let resto: Trozo[] = [];
      for (let i = todo.length - 1; i >= 0 && msDe(resto) < this.config.solapeMs; i--) resto = [todo[i]!, ...resto];
      this.inicioMs = ahoraMs - msDe(resto);
      this.frase = resto;
      this.vozMs = 0; // lo que ya se mandó no cuenta como voz nueva
    }
    return "escuchando";
  }

  private entregar() {
    if (this.vozMs >= this.config.minimoVozMs) this.alFrase(unir(this.frase), this.inicioMs);
  }
}
