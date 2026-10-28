import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearReproductor, reproducirConSonido } from "./reproductor";
import { mirar } from "./webrtc";

vi.mock("./webrtc", () => ({ mirar: vi.fn() }));

/** Una conexión ya conectada cuya imagen no avanza (siempre los mismos cuadros). */
function conexionCongelada() {
  const pc = {
    connectionState: "connected",
    addEventListener: vi.fn(),
    getStats: vi.fn(async () => new Map([["v", { type: "inbound-rtp", kind: "video", framesDecoded: 42 }]])),
  };
  return { pc: pc as unknown as RTCPeerConnection, stream: {} as MediaStream, cerrar: vi.fn(async () => undefined) };
}

describe("crearReproductor: pausa de la reconexión", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(mirar).mockReset().mockImplementation(async () => conexionCongelada());
  });
  afterEach(() => vi.useRealTimers());

  const video = () => ({ muted: false, srcObject: null, play: vi.fn(async () => undefined) }) as unknown as HTMLVideoElement;

  it("con la imagen congelada vuelve a pedir la transmisión", async () => {
    const r = crearReproductor("https://ejemplo.invalid/whep", video(), { estado: vi.fn(), sinSonido: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.mocked(mirar).mock.calls.length).toBeGreaterThan(1);
    r.cerrar();
  });

  it("en pausa no reconecta ni avisa 'reconectando' aunque la imagen esté quieta", async () => {
    const estado = vi.fn();
    const r = crearReproductor("https://ejemplo.invalid/whep", video(), { estado, sinSonido: vi.fn() });
    r.pausarReconexion(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mirar).toHaveBeenCalledTimes(1);
    expect(estado).not.toHaveBeenCalledWith("reconectando");

    r.pausarReconexion(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.mocked(mirar).mock.calls.length).toBeGreaterThan(1);
    r.cerrar();
  });
});

function videoFalso(play: () => Promise<void>) {
  return { muted: true, play: vi.fn(play) } as unknown as HTMLVideoElement & { play: ReturnType<typeof vi.fn> };
}

describe("reproducirConSonido", () => {
  it("arranca mudo si el navegador bloquea el sonido", async () => {
    let veces = 0;
    const video = videoFalso(() =>
      ++veces === 1 ? Promise.reject(new DOMException("sin toque", "NotAllowedError")) : Promise.resolve(),
    );
    const alSinSonido = vi.fn();
    await reproducirConSonido(video, alSinSonido);
    expect(video.muted).toBe(true);
    expect(alSinSonido).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it("arranca con sonido si el navegador lo deja", async () => {
    const video = videoFalso(() => Promise.resolve());
    const alSinSonido = vi.fn();
    await reproducirConSonido(video, alSinSonido);
    expect(video.muted).toBe(false);
    expect(alSinSonido).not.toHaveBeenCalled();
  });

  it("no rechaza si tampoco puede arrancar mudo", async () => {
    const video = videoFalso(() => Promise.reject(new DOMException("no", "NotAllowedError")));
    const alSinSonido = vi.fn();
    await expect(reproducirConSonido(video, alSinSonido)).resolves.toBeUndefined();
    expect(video.muted).toBe(true);
    expect(alSinSonido).toHaveBeenCalledTimes(1);
  });
});
