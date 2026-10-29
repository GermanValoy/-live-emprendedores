import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearReproductor, reproducirConSonido } from "./reproductor";
import { mirar } from "./webrtc";

vi.mock("./webrtc", () => ({ mirar: vi.fn() }));

/**
 * Una conexión ya conectada. `cuadros()` dice cuántos cuadros lleva mostrados (null: todavía no llegó
 * imagen, como cuando Cloudflare acepta la conexión pero la feriante no está mandando nada).
 */
function conexion(cuadros: () => number | null) {
  const pc = {
    connectionState: "connected",
    addEventListener: vi.fn(),
    getStats: vi.fn(async () => {
      const c = cuadros();
      return new Map(c === null ? [] : [["v", { type: "inbound-rtp", kind: "video", framesDecoded: c }]]);
    }),
  };
  return { pc: pc as unknown as RTCPeerConnection, stream: {} as MediaStream, cerrar: vi.fn(async () => undefined) };
}

/** Una conexión ya conectada cuya imagen no avanza (siempre los mismos cuadros). */
const conexionCongelada = () => conexion(() => 42);

/** Una conexión cuya imagen avanza 30 cuadros por segundo desde que se crea. */
function conexionEnMovimiento() {
  const desde = Date.now();
  return conexion(() => Math.floor(((Date.now() - desde) / 1000) * 30));
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
    await vi.advanceTimersByTimeAsync(15_000);
    expect(vi.mocked(mirar).mock.calls.length).toBeGreaterThan(1);
    r.cerrar();
  });

  it("si la feriante se corta y la conexión nueva llega sin imagen, sigue 'reconectando' y la vuelve a pedir", async () => {
    // 1.ª: imagen 3 s y se corta. 2.ª: Cloudflare la acepta pero no llega nada. 3.ª: la feriante ya volvió.
    let cuadros = 0;
    let cortada = false;
    setTimeout(() => (cortada = true), 3_000);
    const avanzar = setInterval(() => !cortada && (cuadros += 15), 500);
    vi.mocked(mirar)
      .mockImplementationOnce(async () => conexion(() => cuadros))
      .mockImplementationOnce(async () => conexion(() => null))
      .mockImplementation(async () => conexionEnMovimiento());
    const estados: string[] = [];
    const r = crearReproductor("https://ejemplo.invalid/whep", video(), {
      estado: (e) => estados.push(`${vi.mocked(mirar).mock.calls.length}:${e}`),
      sinSonido: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(40_000);
    clearInterval(avanzar);
    expect(vi.mocked(mirar).mock.calls.length).toBeGreaterThanOrEqual(3);
    // Mientras la conexión nueva no trae imagen, no se saca el cartel.
    expect(estados).not.toContain("2:reproduciendo");
    expect(estados.at(-1)).toMatch(/:reproduciendo$/);
    r.cerrar();
  });

  it("no avisa 'reconectando' por un solo segundo sin cuadros nuevos", async () => {
    let cuadros = 0;
    let quieta = false;
    setTimeout(() => (quieta = true), 4_000);
    setTimeout(() => (quieta = false), 5_000);
    const avanzar = setInterval(() => !quieta && (cuadros += 15), 500);
    vi.mocked(mirar).mockImplementation(async () => conexion(() => cuadros));
    const estado = vi.fn();
    const r = crearReproductor("https://ejemplo.invalid/whep", video(), { estado, sinSonido: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    clearInterval(avanzar);
    expect(estado).not.toHaveBeenCalledWith("reconectando");
    expect(estado).toHaveBeenLastCalledWith("reproduciendo");
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
    await vi.advanceTimersByTimeAsync(15_000);
    expect(vi.mocked(mirar).mock.calls.length).toBeGreaterThan(1);
    r.cerrar();
  });

  it("al reanudar con la imagen en movimiento vuelve a 'reproduciendo' aunque se congeló antes de la pausa", async () => {
    let cuadros = 42;
    vi.mocked(mirar).mockImplementation(async () => conexion(() => cuadros));
    const estado = vi.fn();
    const r = crearReproductor("https://ejemplo.invalid/whep", video(), { estado, sinSonido: vi.fn() });
    const arranque = setInterval(() => (cuadros += 30), 500);
    await vi.advanceTimersByTimeAsync(3_000); // se ve bien un rato
    clearInterval(arranque);
    await vi.advanceTimersByTimeAsync(3_000); // la imagen se congela un par de segundos
    expect(estado).toHaveBeenLastCalledWith("reconectando");
    r.pausarReconexion(true); // recién ahí llega que la feriante salió
    await vi.advanceTimersByTimeAsync(5_000);
    r.pausarReconexion(false);
    const avanzar = setInterval(() => (cuadros += 30), 500);
    await vi.advanceTimersByTimeAsync(3_000);
    clearInterval(avanzar);
    expect(estado).toHaveBeenLastCalledWith("reproduciendo");
    expect(mirar).toHaveBeenCalledTimes(1);
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
