/**
 * Reproductor de la sala (la compradora mira por WHEP). Reconecta solo si se corta la conexión
 * o si la imagen queda congelada unos segundos (pasa cuando la feriante se reconectó).
 */
import { leerMuestra } from "./estadisticas";
import { esperaReconexion } from "./registro";
import { type ConexionVivo, mirar } from "./webrtc";

export type EstadoReproduccion = "conectando" | "reproduciendo" | "reconectando";
export type Reproductor = { activarSonido(): void; cerrar(): void };

const SEGUNDOS_CONGELADO_PARA_RECONECTAR = 5;

/**
 * Intenta reproducir con sonido. Si el navegador no lo deja sin un toque de la persona,
 * arranca mudo y avisa con `alSinSonido` (para mostrar "Tocá para activar el sonido").
 */
export async function reproducirConSonido(video: HTMLVideoElement, alSinSonido: () => void): Promise<void> {
  video.muted = false;
  try {
    await video.play();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotAllowedError")) return;
    video.muted = true;
    alSinSonido();
    await video.play().catch(() => undefined);
  }
}

export function crearReproductor(
  urlMirar: string,
  video: HTMLVideoElement,
  al: { estado(e: EstadoReproduccion): void; sinSonido(): void },
): Reproductor {
  let activo = true;
  let conexion: ConexionVivo | null = null;
  // Cada intento de conexión tiene un número; un intento viejo que termina tarde se cierra.
  let generacion = 0;
  let reconexionPendiente = false;
  let intento = 0;
  let yaConecto = false;
  let ultimosCuadros: number | null = null;
  let segundosCongelado = 0;
  let avisoSinSonido = false;

  const cambiarEstado = (e: EstadoReproduccion) => { if (activo) al.estado(e); };

  const ponerVideo = (stream: MediaStream) => {
    video.srcObject = stream;
    // Si ya arrancó mudo por el navegador, no se repite el aviso en cada reconexión.
    if (avisoSinSonido && video.muted) {
      void video.play().catch(() => undefined);
      return;
    }
    void reproducirConSonido(video, () => {
      avisoSinSonido = true;
      if (activo) al.sinSonido();
    });
  };

  async function conectar() {
    if (!activo) return;
    const mio = ++generacion;
    cambiarEstado(yaConecto ? "reconectando" : "conectando");
    try {
      const nueva = await mirar(urlMirar);
      if (!activo || mio !== generacion) { await nueva.cerrar(); return; }
      conexion = nueva;
      ultimosCuadros = null;
      segundosCongelado = 0;
      ponerVideo(nueva.stream);
      const alCambiar = () => {
        if (conexion !== nueva) return;
        const s = nueva.pc.connectionState;
        if (s === "connected") {
          intento = 0;
          yaConecto = true;
          cambiarEstado("reproduciendo");
        } else if (s === "disconnected" || s === "failed") {
          cambiarEstado("reconectando");
          if (s === "failed") void reconectar();
        }
      };
      nueva.pc.addEventListener("connectionstatechange", alCambiar);
      if (nueva.pc.connectionState === "connected") alCambiar();
    } catch {
      if (mio === generacion) void reconectar();
    }
  }

  /** Cierra la conexión actual y programa un solo reintento, aunque lo pidan varias señales. */
  async function reconectar() {
    if (!activo || reconexionPendiente) return;
    reconexionPendiente = true;
    generacion++;
    const anterior = conexion;
    conexion = null;
    await anterior?.cerrar();
    cambiarEstado("reconectando");
    setTimeout(() => {
      reconexionPendiente = false;
      void conectar();
    }, esperaReconexion(intento++));
  }

  // Cada segundo: si la imagen no avanza durante unos segundos, se vuelve a pedir la transmisión.
  const reloj = setInterval(async () => {
    const actual = conexion;
    if (!actual || actual.pc.connectionState !== "connected") return;
    let reporte: RTCStatsReport;
    try {
      reporte = await actual.pc.getStats();
    } catch {
      return;
    }
    if (conexion !== actual) return;
    const { cuadros } = leerMuestra(reporte.values() as Iterable<Record<string, unknown>>, "mirar");
    if (cuadros === null) return;
    if (ultimosCuadros !== null && cuadros === ultimosCuadros) {
      cambiarEstado("reconectando");
      if (++segundosCongelado >= SEGUNDOS_CONGELADO_PARA_RECONECTAR) void reconectar();
    } else if (ultimosCuadros !== null && segundosCongelado > 0) {
      segundosCongelado = 0;
      cambiarEstado("reproduciendo");
    }
    ultimosCuadros = cuadros;
  }, 1000);

  void conectar();

  return {
    activarSonido() {
      video.muted = false;
      avisoSinSonido = false;
      void video.play().catch(() => undefined);
    },
    cerrar() {
      if (!activo) return;
      activo = false;
      clearInterval(reloj);
      generacion++;
      void conexion?.cerrar();
      conexion = null;
      video.srcObject = null;
    },
  };
}
