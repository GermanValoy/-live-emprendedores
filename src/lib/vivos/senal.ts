/**
 * Señal de vida del vivo: mientras transmite, la pantalla de la feriante avisa al servidor
 * cada tantos segundos (lo dice `live_config`) que sigue ahí, si está fuera de la pantalla,
 * si está silenciada y cuánta gente mira.
 */

export type DatosSenal = { fuera: boolean; silenciada: boolean; mirando: number };
/** `sin_sesion`: se le venció la sesión (hay que volver a entrar). */
export type ResultadoSenal = "ok" | "otro_dispositivo" | "terminado" | "sin_sesion";

const RUTA = "/mi-puesto/vivo/senal";
const RESULTADOS: readonly string[] = ["ok", "otro_dispositivo", "terminado"];

export function crearSenal(op: {
  vivoId: string;
  dispositivo: string;
  cadaSegundos: number;
  leer(): DatosSenal;
  alResultado(r: ResultadoSenal): void;
  f?: typeof fetch;
}): { avisarAhora(): void; detener(): void } {
  const f = op.f ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let activa = true;

  const detener = () => {
    activa = false;
    clearInterval(reloj);
  };

  /** Lee la respuesta; `null` si fue un error pasajero y hay que seguir intentando. */
  async function interpretar(respuesta: Response): Promise<ResultadoSenal | null> {
    if (respuesta.status === 401) return "sin_sesion";
    // Ya no puede mandar señales de este vivo: para ella, terminó.
    if (respuesta.status === 403) return "terminado";
    if (!respuesta.ok) return null;
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    const resultado = (cuerpo as { resultado?: unknown } | null)?.resultado;
    return typeof resultado === "string" && RESULTADOS.includes(resultado) ? (resultado as ResultadoSenal) : null;
  }

  async function enviar() {
    if (!activa) return;
    let resultado: ResultadoSenal | null;
    try {
      const respuesta = await f(RUTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vivoId: op.vivoId, dispositivo: op.dispositivo, ...op.leer() }),
        // Para que la señal salga aunque la página se esté cerrando o pasando a segundo plano.
        keepalive: true,
      });
      resultado = await interpretar(respuesta);
    } catch {
      return; // Sin conexión: se vuelve a intentar en la próxima.
    }
    if (!activa || resultado === null) return;
    if (resultado !== "ok") detener();
    op.alResultado(resultado);
  }

  const reloj = setInterval(() => void enviar(), op.cadaSegundos * 1000);

  return {
    avisarAhora() {
      void enviar();
    },
    detener,
  };
}
