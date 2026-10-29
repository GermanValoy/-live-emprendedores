import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearSenal, type DatosSenal } from "./senal";

const VIVO = "11111111-1111-4111-8111-111111111111";
const DISPOSITIVO = "22222222-2222-4222-8222-222222222222";

type Respuesta = Response | Error;

function fetchFalso(respuestas: () => Respuesta) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const r = respuestas();
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

let datos: DatosSenal;
beforeEach(() => {
  vi.useFakeTimers();
  datos = { fuera: false, silenciada: false, mirando: 3 };
});
afterEach(() => vi.useRealTimers());

function armar(respuestas: () => Respuesta) {
  const { f, llamadas } = fetchFalso(respuestas);
  const alResultado = vi.fn();
  const renovarSesion = vi.fn(async () => {});
  const senal = crearSenal({
    vivoId: VIVO, dispositivo: DISPOSITIVO, cadaSegundos: 20, leer: () => datos, alResultado, f, renovarSesion,
  });
  return { senal, llamadas, alResultado, renovarSesion };
}

describe("crearSenal", () => {
  it("manda la señal cada tantos segundos con los datos del momento", async () => {
    const { senal, llamadas, alResultado } = armar(() => json({ resultado: "ok" }));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(llamadas).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe("/mi-puesto/vivo/senal");
    expect(llamadas[0]!.init?.method).toBe("POST");
    expect(llamadas[0]!.init?.keepalive).toBe(true);
    expect(new Headers(llamadas[0]!.init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(llamadas[0]!.init?.body))).toEqual({
      vivoId: VIVO, dispositivo: DISPOSITIVO, fuera: false, silenciada: false, mirando: 3,
    });
    expect(alResultado).toHaveBeenCalledWith("ok");

    datos = { fuera: true, silenciada: true, mirando: 7 };
    await vi.advanceTimersByTimeAsync(20_000);
    expect(llamadas).toHaveLength(2);
    expect(JSON.parse(String(llamadas[1]!.init?.body))).toMatchObject({ fuera: true, silenciada: true, mirando: 7 });
    senal.detener();
  });

  it("avisarAhora manda una enseguida", async () => {
    const { senal, llamadas } = armar(() => json({ resultado: "ok" }));
    senal.avisarAhora();
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas).toHaveLength(1);
    senal.detener();
  });

  it("si el vivo terminó, avisa y deja de mandar", async () => {
    const { llamadas, alResultado } = armar(() => json({ resultado: "terminado" }));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(alResultado).toHaveBeenCalledWith("terminado");
    await vi.advanceTimersByTimeAsync(100_000);
    expect(llamadas).toHaveLength(1);
  });

  it("si otro celular tomó el control, avisa y deja de mandar", async () => {
    const { llamadas, alResultado } = armar(() => json({ resultado: "otro_dispositivo" }));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(alResultado).toHaveBeenCalledWith("otro_dispositivo");
    await vi.advanceTimersByTimeAsync(100_000);
    expect(llamadas).toHaveLength(1);
  });

  it("uno o dos 401 seguidos no cortan: renueva la sesión y sigue mandando", async () => {
    let n = 0;
    const { senal, llamadas, alResultado, renovarSesion } = armar(() =>
      ++n <= 2 ? json({ error: "sin_sesion" }, 401) : json({ resultado: "ok" }),
    );
    await vi.advanceTimersByTimeAsync(40_000);
    expect(llamadas).toHaveLength(2);
    expect(renovarSesion).toHaveBeenCalledTimes(2);
    expect(alResultado).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(alResultado).toHaveBeenCalledWith("ok");
    expect(alResultado).not.toHaveBeenCalledWith("sin_sesion");
    senal.detener();
  });

  it("si la sesión se venció de verdad (tres 401 seguidos), avisa sin_sesion y deja de mandar", async () => {
    const { llamadas, alResultado } = armar(() => json({ error: "sin_sesion" }, 401));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(alResultado).toHaveBeenCalledTimes(1);
    expect(alResultado).toHaveBeenCalledWith("sin_sesion");
    await vi.advanceTimersByTimeAsync(100_000);
    expect(llamadas).toHaveLength(3);
  });

  it("una respuesta que no es 401 en el medio vuelve a contar desde cero", async () => {
    let n = 0;
    // 401, 401, error del servidor, 401, 401, ok
    const { senal, llamadas, alResultado } = armar(() =>
      [1, 2, 4, 5].includes(++n) ? json({ error: "sin_sesion" }, 401) : n === 3 ? json({ error: "error" }, 500) : json({ resultado: "ok" }),
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(llamadas).toHaveLength(6);
    expect(alResultado).not.toHaveBeenCalledWith("sin_sesion");
    expect(alResultado).toHaveBeenCalledWith("ok");
    senal.detener();
  });

  it("si renovar la sesión falla, igual sigue mandando", async () => {
    let n = 0;
    const { f, llamadas } = fetchFalso(() => (++n === 1 ? json({ error: "sin_sesion" }, 401) : json({ resultado: "ok" })));
    const alResultado = vi.fn();
    const senal = crearSenal({
      vivoId: VIVO, dispositivo: DISPOSITIVO, cadaSegundos: 20, leer: () => datos, alResultado, f,
      renovarSesion: async () => { throw new Error("sin red"); },
    });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(llamadas).toHaveLength(2);
    expect(alResultado).toHaveBeenCalledWith("ok");
    senal.detener();
  });

  it("si ya no tiene permiso sobre el vivo, lo da por terminado", async () => {
    const { llamadas, alResultado } = armar(() => json({ error: "sin_permiso" }, 403));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(alResultado).toHaveBeenCalledWith("terminado");
    await vi.advanceTimersByTimeAsync(100_000);
    expect(llamadas).toHaveLength(1);
  });

  it("un error de red no corta las señales siguientes", async () => {
    let n = 0;
    const { senal, llamadas, alResultado } = armar(() => (++n === 1 ? new TypeError("Failed to fetch") : json({ resultado: "ok" })));
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(llamadas).toHaveLength(2);
    expect(alResultado).toHaveBeenCalledTimes(1);
    expect(alResultado).toHaveBeenCalledWith("ok");
    senal.detener();
  });

  it("un error del servidor o una respuesta rara no cortan las señales", async () => {
    let n = 0;
    const { senal, llamadas, alResultado } = armar(() =>
      ++n === 1 ? json({ error: "error" }, 500) : n === 2 ? new Response("<html>", { status: 200 }) : json({ resultado: "ok" }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(llamadas).toHaveLength(3);
    expect(alResultado).toHaveBeenCalledTimes(1);
    expect(alResultado).toHaveBeenCalledWith("ok");
    senal.detener();
  });

  it("manda de a una: si hay una en camino, la siguiente espera y sale con el estado más nuevo", async () => {
    // Si dos señales viajan juntas, el servidor puede recibir primero la nueva y quedarse con la vieja.
    const pendientes: ((r: Response) => void)[] = [];
    const llamadas: RequestInit[] = [];
    const f = (async (_url: string, init?: RequestInit) => {
      llamadas.push(init!);
      return new Promise<Response>((ok) => pendientes.push(ok));
    }) as unknown as typeof fetch;
    const senal = crearSenal({
      vivoId: VIVO, dispositivo: DISPOSITIVO, cadaSegundos: 20, leer: () => datos, alResultado: vi.fn(), f, renovarSesion: async () => {},
    });
    senal.avisarAhora();
    datos = { ...datos, fuera: true };
    senal.avisarAhora();
    datos = { ...datos, silenciada: true };
    senal.avisarAhora();
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas).toHaveLength(1);

    pendientes[0]!(json({ resultado: "ok" }));
    await vi.advanceTimersByTimeAsync(0);
    // Las dos que esperaban salen como una sola, con lo último.
    expect(llamadas).toHaveLength(2);
    expect(JSON.parse(String(llamadas[1]!.body))).toMatchObject({ fuera: true, silenciada: true });
    pendientes[1]!(json({ resultado: "ok" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(llamadas).toHaveLength(2);
    senal.detener();
  });

  it("una señal que no responde se abandona a tiempo y no frena las siguientes", async () => {
    const llamadas: RequestInit[] = [];
    const f = (async (_url: string, init?: RequestInit) => {
      llamadas.push(init!);
      if (llamadas.length > 1) return json({ resultado: "ok" });
      // La primera queda colgada hasta que se la cancela.
      return new Promise<Response>((_ok, mal) => init?.signal?.addEventListener("abort", () => mal(init.signal!.reason)));
    }) as unknown as typeof fetch;
    const alResultado = vi.fn();
    const senal = crearSenal({
      vivoId: VIVO, dispositivo: DISPOSITIVO, cadaSegundos: 20, leer: () => datos, alResultado, f, renovarSesion: async () => {},
    });
    senal.avisarAhora();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(llamadas.length).toBeGreaterThanOrEqual(2);
    expect(alResultado).toHaveBeenCalledWith("ok");
    senal.detener();
  });

  it("después de detener no manda ni avisa nada", async () => {
    const { senal, llamadas, alResultado } = armar(() => json({ resultado: "terminado" }));
    senal.avisarAhora();
    senal.detener();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(llamadas).toHaveLength(1);
    expect(alResultado).not.toHaveBeenCalled();
    senal.avisarAhora();
    expect(llamadas).toHaveLength(1);
  });
});
