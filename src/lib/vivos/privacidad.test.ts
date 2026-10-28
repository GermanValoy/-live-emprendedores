import { describe, expect, it, vi } from "vitest";
import { silenciarAudio, vigilarSalida } from "./privacidad";

function streamFalso() {
  const audio1 = { kind: "audio", enabled: true };
  const audio2 = { kind: "audio", enabled: true };
  const video = { kind: "video", enabled: true };
  const stream = {
    getAudioTracks: () => [audio1, audio2],
    getVideoTracks: () => [video],
    getTracks: () => [audio1, audio2, video],
  } as unknown as MediaStream;
  return { stream, audio1, audio2, video };
}

function documentoFalso() {
  const blanco = new EventTarget();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: vi.fn(blanco.addEventListener.bind(blanco)),
    removeEventListener: vi.fn(blanco.removeEventListener.bind(blanco)),
  };
  const disparar = (tipo: string) => blanco.dispatchEvent(new Event(tipo));
  return { doc: doc as unknown as Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">, crudo: doc, disparar };
}

describe("silenciarAudio", () => {
  it("apaga solo las pistas de sonido y las vuelve a prender", () => {
    const { stream, audio1, audio2, video } = streamFalso();
    silenciarAudio(stream, true);
    expect(audio1.enabled).toBe(false);
    expect(audio2.enabled).toBe(false);
    expect(video.enabled).toBe(true);
    silenciarAudio(stream, false);
    expect(audio1.enabled).toBe(true);
    expect(audio2.enabled).toBe(true);
    expect(video.enabled).toBe(true);
  });
});

describe("vigilarSalida", () => {
  it("avisa al salir y al volver a la pantalla", () => {
    const { doc, crudo, disparar } = documentoFalso();
    const alSalir = vi.fn();
    const alVolver = vi.fn();
    vigilarSalida(doc, alSalir, alVolver);

    crudo.visibilityState = "hidden";
    disparar("visibilitychange");
    expect(alSalir).toHaveBeenCalledTimes(1);
    expect(alVolver).not.toHaveBeenCalled();

    crudo.visibilityState = "visible";
    disparar("visibilitychange");
    expect(alVolver).toHaveBeenCalledTimes(1);
  });

  it("cerrar o cambiar de página también cuenta como salir", () => {
    const { doc, disparar } = documentoFalso();
    const alSalir = vi.fn();
    vigilarSalida(doc, alSalir, vi.fn());
    disparar("pagehide");
    expect(alSalir).toHaveBeenCalledTimes(1);
  });

  it("deja de vigilar", () => {
    const { doc, crudo, disparar } = documentoFalso();
    const alSalir = vi.fn();
    const alVolver = vi.fn();
    const dejar = vigilarSalida(doc, alSalir, alVolver);
    dejar();
    expect(crudo.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(crudo.removeEventListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    crudo.visibilityState = "hidden";
    disparar("visibilitychange");
    disparar("pagehide");
    crudo.visibilityState = "visible";
    disparar("visibilitychange");
    expect(alSalir).not.toHaveBeenCalled();
    expect(alVolver).not.toHaveBeenCalled();
  });
});
