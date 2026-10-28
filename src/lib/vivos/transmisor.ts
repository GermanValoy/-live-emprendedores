/**
 * Transmisor de la feriante (WHIP). Prende la cámara y queda en vista previa; recién al
 * `salirEnVivo` se conecta a Cloudflare. Se reconecta solo, recupera la cámara y el sonido
 * si el celular los corta, y mantiene el silencio aunque se renueve la pista del micrófono.
 *
 * El silencio automático al salir de la pantalla lo arma la pantalla con `vigilarSalida`
 * (privacidad.ts) llamando a `silenciar(true)`.
 */
import { toast } from "sonner";
import { silenciarAudio } from "./privacidad";
import { esperaReconexion } from "./reconexion";
import { type ConexionVivo, transmitir } from "./webrtc";

export type EstadoTransmision =
  | "preparando" | "vista-previa" | "conectando" | "en-vivo" | "reconectando" | "sin-camara" | "detenido";

export type Transmisor = {
  salirEnVivo(urlTransmitir: string): Promise<void>;
  silenciar(si: boolean): void;
  cambiarCamara(): Promise<void>;
  volverATransmitir(): Promise<void>;
  detener(): void;
};

type Frente = "user" | "environment";

function pedirCamara(frente: Frente, conAudio: boolean): Promise<MediaStream> {
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

/**
 * Prende la cámara y devuelve el transmisor. Si no se pudo usar la cámara (por ejemplo, se negó
 * el permiso), queda en "sin-camara" y `volverATransmitir()` la vuelve a pedir.
 */
export async function crearTransmisor(
  video: HTMLVideoElement,
  alEstado: (e: EstadoTransmision) => void,
): Promise<Transmisor> {
  let activo = true;
  let url: string | null = null; // Se completa al salir en vivo.
  let conexion: ConexionVivo | null = null;
  // Cada intento de conexión tiene un número; un intento viejo que termina tarde se cierra.
  let generacion = 0;
  let reconexionPendiente = false;
  let intento = 0;
  let yaConecto = false;
  let camara: MediaStream | null = null;
  let conSonido = false;
  let camaraCaida = false;
  let silenciada = false;
  let frente: Frente = "user";
  let escuchas = new AbortController();
  let bloqueo: WakeLockSentinel | null = null;

  const cambiarEstado = (e: EstadoTransmision) => { if (activo) alEstado(e); };
  const conectada = () => conexion?.pc.connectionState === "connected";
  /** El estado cuando la cámara anda pero no hay conexión en curso. */
  const estadoSinConexion = (): EstadoTransmision => (url === null ? "vista-previa" : "reconectando");

  const escucharPistas = (stream: MediaStream) => {
    escuchas.abort();
    escuchas = new AbortController();
    const { signal } = escuchas;
    for (const pista of stream.getTracks()) {
      pista.addEventListener("ended", () => {
        void (pista.kind === "video" ? recuperarCamara() : recuperarSonido());
      }, { signal });
    }
  };

  const ponerVideo = (stream: MediaStream) => {
    video.srcObject = stream;
    video.muted = true; // La feriante no se escucha a sí misma.
    void video.play().catch(() => undefined);
  };

  const emisorDe = (tipo: "video" | "audio") =>
    conexion?.pc.getTransceivers().find((t) => t.receiver.track.kind === tipo)?.sender;

  /** Pide una pista nueva (imagen o sonido) y la cambia por la anterior sin reconectar. */
  const renovarPista = async (tipo: "video" | "audio") => {
    const nueva = tipo === "video"
      ? pistaDeVideo(await pedirCamara(frente, false))
      : (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0];
    if (!nueva) throw new Error("Sin micrófono");
    // Privacidad: un micrófono nuevo nace silenciado si ella estaba silenciada.
    if (tipo === "audio") nueva.enabled = !silenciada;
    if (!activo || !camara) { nueva.stop(); return; }
    try {
      const vieja = camara.getTracks().find((p) => p.kind === tipo);
      if (vieja) { camara.removeTrack(vieja); vieja.stop(); }
      camara.addTrack(nueva);
      escucharPistas(camara);
      await emisorDe(tipo)?.replaceTrack(nueva);
      if (tipo === "video") ponerVideo(camara);
    } catch (error) {
      nueva.stop();
      throw error;
    }
  };

  async function recuperarCamara() {
    if (!activo || !camara) return;
    try {
      await renovarPista("video");
      camaraCaida = false;
      cambiarEstado(conectada() ? "en-vivo" : estadoSinConexion());
    } catch {
      camaraCaida = true;
      cambiarEstado("sin-camara");
    }
  }

  async function recuperarSonido() {
    if (!activo || !conSonido || !camara) return;
    try {
      await renovarPista("audio");
    } catch {
      toast.error("Se perdió el sonido de la transmisión");
    }
  }

  async function prenderCamara() {
    const stream = await pedirCamara(frente, true).catch((error: unknown) => {
      // Sin micrófono (por ejemplo, una computadora): se transmite solo la imagen.
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
      toast("No se encontró micrófono: se transmite sin sonido");
      return pedirCamara(frente, false);
    });
    if (!activo) { stream.getTracks().forEach((p) => p.stop()); return; }
    silenciarAudio(stream, silenciada);
    camara = stream;
    conSonido = stream.getAudioTracks().length > 0;
    camaraCaida = false;
    escucharPistas(stream);
    ponerVideo(stream);
  }

  async function conectar() {
    if (!activo || url === null || !camara) return;
    const mio = ++generacion;
    cambiarEstado(camaraCaida ? "sin-camara" : yaConecto ? "reconectando" : "conectando");
    try {
      const nueva = await transmitir(url, camara);
      if (!activo || mio !== generacion) { await nueva.cerrar(); return; }
      conexion = nueva;
      const alCambiar = () => {
        if (conexion !== nueva) return;
        const s = nueva.pc.connectionState;
        if (s === "connected") {
          intento = 0;
          yaConecto = true;
          cambiarEstado(camaraCaida ? "sin-camara" : "en-vivo");
        } else if (s === "disconnected" || s === "failed") {
          cambiarEstado(camaraCaida ? "sin-camara" : "reconectando");
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
    if (!activo || reconexionPendiente || url === null) return;
    reconexionPendiente = true;
    generacion++;
    const anterior = conexion;
    conexion = null;
    await anterior?.cerrar();
    if (!camaraCaida) cambiarEstado("reconectando");
    setTimeout(() => {
      reconexionPendiente = false;
      void conectar();
    }, esperaReconexion(intento++));
  }

  /** Que la pantalla no se apague mientras transmite (si el navegador lo permite). */
  async function pedirBloqueo() {
    if (!activo || url === null || !("wakeLock" in navigator)) return;
    if (bloqueo && !bloqueo.released) return;
    try {
      const nuevo = await navigator.wakeLock.request("screen");
      if (!activo) { void nuevo.release(); return; }
      bloqueo = nuevo;
    } catch {
      // Sin batería, sin permiso o la página no está a la vista: se reintenta al volver.
    }
  }

  // El navegador suelta el bloqueo de pantalla al salir de la página; se pide de nuevo al volver.
  const alVolverALaPagina = () => { if (document.visibilityState === "visible") void pedirBloqueo(); };
  document.addEventListener("visibilitychange", alVolverALaPagina);

  cambiarEstado("preparando");
  try {
    await prenderCamara();
    cambiarEstado("vista-previa");
  } catch {
    camaraCaida = true;
    cambiarEstado("sin-camara");
  }

  return {
    async salirEnVivo(urlTransmitir: string) {
      if (!activo || url !== null) return;
      url = urlTransmitir;
      void pedirBloqueo();
      if (camaraCaida || !camara) { cambiarEstado("sin-camara"); return; }
      await conectar();
    },

    silenciar(si: boolean) {
      silenciada = si;
      if (camara) silenciarAudio(camara, si);
    },

    async cambiarCamara() {
      if (!activo || !camara) return;
      const anterior = frente;
      frente = frente === "user" ? "environment" : "user";
      // Algunos celulares no prenden la otra cámara mientras la actual sigue encendida.
      camara.getVideoTracks()[0]?.stop();
      try {
        await renovarPista("video");
      } catch {
        frente = anterior;
        toast.error("No se pudo cambiar de cámara");
        await recuperarCamara();
      }
    },

    async volverATransmitir() {
      if (!activo) return;
      try {
        if (!camara) {
          await prenderCamara();
        } else {
          await renovarPista("video");
          if (conSonido && camara.getAudioTracks()[0]?.readyState !== "live") await recuperarSonido();
        }
        camaraCaida = false;
      } catch {
        toast.error("No se pudo prender la cámara");
        cambiarEstado("sin-camara");
        return;
      }
      if (url === null) cambiarEstado("vista-previa");
      else if (conectada()) cambiarEstado("en-vivo");
      else if (!conexion && !reconexionPendiente) await conectar();
      else void reconectar();
    },

    detener() {
      if (!activo) return;
      activo = false;
      escuchas.abort();
      document.removeEventListener("visibilitychange", alVolverALaPagina);
      generacion++;
      void conexion?.cerrar();
      conexion = null;
      camara?.getTracks().forEach((p) => p.stop());
      camara = null;
      video.srcObject = null;
      void bloqueo?.release().catch(() => undefined);
      bloqueo = null;
      alEstado("detenido");
    },
  };
}
