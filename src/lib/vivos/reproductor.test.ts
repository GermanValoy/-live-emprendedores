import { describe, expect, it, vi } from "vitest";
import { reproducirConSonido } from "./reproductor";

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
