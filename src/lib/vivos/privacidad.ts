/**
 * Privacidad de la feriante: si sale de la pantalla (otra app, minimiza, bloquea el celular),
 * el micrófono se apaga en el acto. En la prueba de transmisión, al salir la imagen quedaba
 * negra pero el sonido seguía llegando.
 */

/** Apaga (o vuelve a prender) todas las pistas de sonido. No toca la imagen. */
export function silenciarAudio(stream: MediaStream, silenciada: boolean): void {
  for (const pista of stream.getAudioTracks()) pista.enabled = !silenciada;
}

type Documento = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

/**
 * Avisa cuando la página deja de verse (`visibilitychange` a "hidden" o `pagehide`)
 * y cuando vuelve a verse. Devuelve la función para dejar de vigilar.
 */
export function vigilarSalida(doc: Documento, alSalir: () => void, alVolver: () => void): () => void {
  let fuera = false;
  const salir = () => {
    if (fuera) return;
    fuera = true;
    alSalir();
  };
  const alCambiar = () => {
    if (doc.visibilityState === "hidden") salir();
    else if (fuera) {
      fuera = false;
      alVolver();
    }
  };
  doc.addEventListener("visibilitychange", alCambiar);
  doc.addEventListener("pagehide", salir);
  return () => {
    doc.removeEventListener("visibilitychange", alCambiar);
    doc.removeEventListener("pagehide", salir);
  };
}
