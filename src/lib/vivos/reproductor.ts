/**
 * Reproductor de la sala (la compradora mira por WHEP). Reconecta solo si se corta la conexión
 * o si la imagen queda congelada unos segundos (pasa cuando la feriante se reconectó).
 */
import { leerMuestra } from "./estadisticas";
import { esperaReconexion } from "./reconexion";
import { type ConexionVivo, mirar } from "./webrtc";

export type EstadoReproduccion = "conectando" | "reproduciendo" | "reconectando";
export type Reproductor = {
  activarSonido(): void;
  /**
   * En pausa no se reconecta por imagen congelada (ni se avisa "reconectando"): se usa mientras
   * la feriante salió de la pantalla y su imagen queda quieta a propósito.
   */
  pausarReconexion(si: boolean): void;
  cerrar(): void;
};

/** Un segundo suelto sin cuadros nuevos pasa seguido; recién al segundo seguido se avisa "reconectando". */
const SEGUNDOS_QUIETA_PARA_AVISAR = 2;
const SEGUNDOS_CONGELADO_PARA_RECONECTAR = 5;
/**
 * Una conexión que todavía no mostró imagen tiene más margen: el primer cuadro tarda en llegar.
 * Pasa también cuando la feriante se cortó: Cloudflare acepta la conexión pero no manda nada.
 */
const SEGUNDOS_SIN_IMAGEN_PARA_RECONECTAR = 10;

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
  // Ya se vio imagen alguna vez (desde ahí, sin imagen se avisa "reconectando") y en la conexión actual.
  let yaConecto = false;
  let conImagen = false;
  let ultimosCuadros: number | null = null;
  let segundosCongelado = 0;
  let avisoSinSonido = false;
  let enPausa = false;

  // El último estado avisado: si quedó "reconectando" (por ejemplo, la imagen se congeló justo antes de una
  // pausa), basta con que la imagen vuelva a moverse para avisar "reproduciendo".
  let estadoAvisado: EstadoReproduccion | null = null;
  const cambiarEstado = (e: EstadoReproduccion) => {
    if (!activo) return;
    estadoAvisado = e;
    al.estado(e);
  };

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
      conImagen = false;
      ultimosCuadros = null;
      segundosCongelado = 0;
      ponerVideo(nueva.stream);
      // "Conectada" no alcanza para decir "reproduciendo": eso lo dice el reloj cuando la imagen avanza.
      const alCambiar = () => {
        if (conexion !== nueva) return;
        const s = nueva.pc.connectionState;
        if (s === "disconnected" || s === "failed") {
          cambiarEstado("reconectando");
          if (s === "failed") void reconectar();
        }
      };
      nueva.pc.addEventListener("connectionstatechange", alCambiar);
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

  // Cada segundo: si la imagen avanza, se está reproduciendo; si no avanza durante unos segundos
  // (o nunca llegó), se vuelve a pedir la transmisión.
  const reloj = setInterval(async () => {
    const actual = conexion;
    if (enPausa || !actual || actual.pc.connectionState !== "connected") return;
    let reporte: RTCStatsReport;
    try {
      reporte = await actual.pc.getStats();
    } catch {
      return;
    }
    if (enPausa || conexion !== actual) return;
    // Sin cuadros todavía cuenta como imagen quieta: la conexión puede estar lista sin que llegue nada.
    const cuadros = leerMuestra(reporte.values() as Iterable<Record<string, unknown>>, "mirar").cuadros ?? 0;
    if (ultimosCuadros !== null && cuadros > ultimosCuadros) {
      segundosCongelado = 0;
      intento = 0;
      yaConecto = true;
      conImagen = true;
      if (estadoAvisado !== "reproduciendo") cambiarEstado("reproduciendo");
    } else if (ultimosCuadros !== null) {
      segundosCongelado++;
      if (yaConecto && segundosCongelado >= SEGUNDOS_QUIETA_PARA_AVISAR) cambiarEstado("reconectando");
      const limite = conImagen ? SEGUNDOS_CONGELADO_PARA_RECONECTAR : SEGUNDOS_SIN_IMAGEN_PARA_RECONECTAR;
      if (segundosCongelado >= limite) void reconectar();
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
    pausarReconexion(si) {
      if (si === enPausa) return;
      enPausa = si;
      // Al volver se cuenta desde cero: la imagen tiene unos segundos para empezar a moverse.
      ultimosCuadros = null;
      segundosCongelado = 0;
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
