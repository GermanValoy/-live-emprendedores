"use client";

import { cn } from "cn";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { salirEnVivo, terminarVivo } from "@/app/mi-puesto/vivo/acciones";
import { entrarConGoogle } from "@/app/auth/acciones";
import { EnVivo } from "@/components/marca/en-vivo";
import { BotonAvisarWhatsapp } from "@/components/vivos/boton-avisar-whatsapp";
import { createClient } from "@/lib/supabase/client";
import { contarMirando } from "@/lib/vivos/presencia";
import { vigilarSalida } from "@/lib/vivos/privacidad";
import { duracionVivoMs } from "@/lib/vivos/sala";
import { crearSenal } from "@/lib/vivos/senal";
import { CAMPOS_VIVO, type ConfigVivo, type Vivo } from "@/lib/vivos/tipos";
import { crearTransmisor, type EstadoTransmision, type Transmisor } from "@/lib/vivos/transmisor";

type Props = {
  tienda: { id: string; handle: string; name: string };
  /** URL para transmitir (WHIP): es una credencial, solo llega a la dueña y nunca se muestra ni se registra. */
  urlTransmitir: string;
  config: ConfigVivo;
  vivoAbierto: Vivo | null;
};

/** Cómo terminó la transmisión en este celular. */
type Fin =
  | { tipo: "cerrado"; vivo: Vivo }
  | { tipo: "otro-celular" }
  | { tipo: "sin-sesion" };

type Fase = "vista-previa" | "saliendo" | "en-vivo" | "fin";

const ERROR_RED = "No se pudo completar. Revisá tu conexión y probá de nuevo.";

/** Pantalla completa para salir en vivo: vista previa → en vivo → resumen. */
export function EstudioVivo(props: Props) {
  // Cada "Salir en vivo de nuevo" arma una pantalla nueva (cámara, señal y canales desde cero).
  const [intento, setIntento] = useState(0);
  return (
    <Estudio
      key={intento}
      {...props}
      vivoAbierto={intento === 0 ? props.vivoAbierto : null}
      alSalirDeNuevo={() => setIntento((i) => i + 1)}
    />
  );
}

function Estudio({ tienda, urlTransmitir, config, vivoAbierto, alSalirDeNuevo }: Props & { alSalirDeNuevo(): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transmisorRef = useRef<Transmisor | null>(null);
  const senalRef = useRef<{ avisarAhora(): void; detener(): void } | null>(null);
  const limpiezasRef = useRef<(() => void)[]>([]);
  const dispositivoRef = useRef<string | null>(null);
  const finRef = useRef(false);
  const fueraRef = useRef(false);
  const silenciadaRef = useRef(false);
  const mirandoRef = useRef(0);

  const [estadoTx, setEstadoTx] = useState<EstadoTransmision>("preparando");
  const [fase, setFase] = useState<Fase>("vista-previa");
  const [vivo, setVivo] = useState<Vivo | null>(null);
  const [fin, setFin] = useState<Fin | null>(null);
  const [silenciada, setSilenciada] = useState(false);
  const [avisoSilenciada, setAvisoSilenciada] = useState(false);
  const [mirando, setMirando] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const [espejo, setEspejo] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Corta todo lo del vivo en este celular: señal, cuenta de gente, canal y cámara. */
  const cortarTodo = () => {
    for (const limpiar of limpiezasRef.current) limpiar();
    limpiezasRef.current = [];
    senalRef.current = null;
    transmisorRef.current?.detener();
    transmisorRef.current = null;
  };

  const terminarCon = (f: Fin) => {
    if (finRef.current) return;
    finRef.current = true;
    cortarTodo();
    setConfirmando(false);
    setFin(f);
    setFase("fin");
  };

  // Cámara y privacidad: se arman al entrar y se apagan siempre al salir de la pantalla.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelado = false;
    // Se espera un instante: si React desmonta enseguida (modo desarrollo), no se pide la cámara dos veces.
    const espera = setTimeout(() => {
      void crearTransmisor(video, setEstadoTx).then((t) => {
        if (cancelado) { t.detener(); return; }
        if (silenciadaRef.current) t.silenciar(true);
        transmisorRef.current = t;
      });
    }, 0);

    // Privacidad (no negociable): si sale de la pantalla, el micrófono se apaga en el acto.
    const dejarDeVigilar = vigilarSalida(
      document,
      () => {
        silenciadaRef.current = true;
        transmisorRef.current?.silenciar(true);
        setSilenciada(true);
        fueraRef.current = true;
        senalRef.current?.avisarAhora();
      },
      () => {
        fueraRef.current = false;
        senalRef.current?.avisarAhora();
        // Sigue silenciada: pudo haber salido por una llamada. Ella decide cuándo vuelve el sonido.
        setAvisoSilenciada(true);
      },
    );

    return () => {
      cancelado = true;
      clearTimeout(espera);
      dejarDeVigilar();
      cortarTodo();
    };
  }, []);

  useEffect(() => {
    if (fase !== "en-vivo") return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [fase]);

  const cambiarSilencio = () => {
    const si = !silenciadaRef.current;
    silenciadaRef.current = si;
    transmisorRef.current?.silenciar(si);
    setSilenciada(si);
    if (!si) setAvisoSilenciada(false);
    senalRef.current?.avisarAhora();
  };

  const cambiarCamara = async () => {
    await transmisorRef.current?.cambiarCamara();
    const pista = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    // Solo la cámara de adelante se ve espejada (como un espejo); la de atrás, tal cual.
    setEspejo(pista?.getSettings().facingMode !== "environment");
  };

  async function salir() {
    const transmisor = transmisorRef.current;
    if (fase !== "vista-previa" || !transmisor) return;
    setFase("saliendo");
    setError(null);
    const dispositivo = (dispositivoRef.current ??= crypto.randomUUID());
    const r = await salirEnVivo(dispositivo).catch(() => ({ ok: false as const, error: ERROR_RED }));
    if (finRef.current || transmisorRef.current !== transmisor) return;
    if (!r.ok) {
      setError(r.error);
      setFase("vista-previa");
      return;
    }
    const v = r.vivo;
    setVivo(v);
    setAhora(Date.now());
    setFase("en-vivo");
    void transmisor.salirEnVivo(urlTransmitir);

    const supabase = createClient();
    const alCambiarVivo = (fila: Vivo) => {
      if (fila.ended_at) terminarCon({ tipo: "cerrado", vivo: fila });
      else if (fila.device_id !== dispositivo) terminarCon({ tipo: "otro-celular" });
    };
    const releer = async () => {
      const { data } = await supabase.from("live_sessions").select(CAMPOS_VIVO).eq("id", v.id).maybeSingle();
      if (data) alCambiarVivo(data as Vivo);
      return data as Vivo | null;
    };

    const senal = crearSenal({
      vivoId: v.id,
      dispositivo,
      cadaSegundos: config.senal_cada_segundos,
      leer: () => ({ fuera: fueraRef.current, silenciada: silenciadaRef.current, mirando: mirandoRef.current }),
      alResultado: (resultado) => {
        if (resultado === "otro_dispositivo") terminarCon({ tipo: "otro-celular" });
        else if (resultado === "sin_sesion") terminarCon({ tipo: "sin-sesion" });
        else if (resultado === "terminado") {
          // Se lee la fila para saber por qué terminó; si no se puede, se muestra el resumen igual.
          void releer().catch(() => null).then((fila) => {
            if (!fila?.ended_at) terminarCon({ tipo: "cerrado", vivo: { ...v, ended_at: new Date().toISOString() } });
          });
        }
      },
    });
    senalRef.current = senal;
    senal.avisarAhora();

    const dejarDeContar = contarMirando(supabase, v.id, (n) => {
      mirandoRef.current = n;
      setMirando(n);
    });
    // Si otro celular toma el vivo o la plataforma lo corta, esta pantalla se entera por acá.
    const canal = supabase
      .channel(`estudio:${v.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${v.id}` },
        (cambio) => alCambiarVivo(cambio.new as Vivo))
      .subscribe((estado) => {
        // Lo que cambió mientras el canal se conectaba no llega por el canal: se mira una vez.
        if (estado === "SUBSCRIBED") void releer().catch(() => null);
      });
    limpiezasRef.current = [senal.detener, dejarDeContar, () => void supabase.removeChannel(canal)];
  }

  async function terminar() {
    if (!vivo || terminando) return;
    setTerminando(true);
    setError(null);
    const r = await terminarVivo(vivo.id).catch(() => ({ ok: false as const, error: ERROR_RED }));
    setTerminando(false);
    if (r.ok) terminarCon({ tipo: "cerrado", vivo: r.vivo });
    else if (!finRef.current) {
      setConfirmando(false);
      setError(r.error);
    }
  }

  const enVivo = fase === "en-vivo";
  const camaraLista = estadoTx === "vista-previa" || estadoTx === "conectando" || estadoTx === "en-vivo" || estadoTx === "reconectando";
  const sinCamaraEnPrevia = fase !== "en-vivo" && fase !== "fin" && estadoTx === "sin-camara";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className={cn("absolute inset-0 size-full object-cover", espejo && "-scale-x-100")}
      />

      {fase !== "fin" && (
        <>
          {/* Sombras arriba y abajo para que los textos se lean sobre cualquier imagen. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-b from-black/60 to-transparent" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-linear-to-t from-black/75 to-transparent" />
        </>
      )}

      {fase !== "fin" && (
        <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          {enVivo && vivo ? (
            <>
              <div className="flex items-center gap-2">
                <EnVivo />
                <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold tabular-nums backdrop-blur" aria-label="Tiempo en vivo">
                  {reloj(duracionVivoMs(vivo, ahora))}
                </span>
              </div>
              <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-bold tabular-nums backdrop-blur" aria-label={`${mirando} mirando`}>
                {`👁 ${mirando}`}
              </span>
            </>
          ) : (
            <>
              <Link
                href="/mi-puesto"
                aria-label="Volver a mi puesto"
                className="flex size-11 items-center justify-center rounded-full bg-black/55 text-xl backdrop-blur outline-none focus-visible:ring-3 focus-visible:ring-white/70"
              >
                <span aria-hidden="true">✕</span>
              </Link>
              <span className="mt-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold backdrop-blur">
                {vivoAbierto ? "Vista previa · tu vivo sigue abierto" : "Vista previa · nadie te ve todavía"}
              </span>
              <span className="size-11" aria-hidden="true" />
            </>
          )}
        </header>
      )}

      {silenciada && fase !== "fin" && (
        <p className="absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+3.25rem)] left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-sm font-extrabold text-primary shadow-lg">
          🔇 Silenciada
        </p>
      )}

      {enVivo && (estadoTx === "reconectando" || estadoTx === "conectando") && (
        <p role="status" className="absolute top-1/3 left-1/2 -translate-x-1/2 rounded-2xl bg-black/65 px-5 py-3 text-base font-bold backdrop-blur">
          {estadoTx === "conectando" ? "Conectando…" : "Reconectando…"}
        </p>
      )}

      {enVivo && avisoSilenciada && silenciada && (
        <div role="status" className="absolute inset-x-6 top-1/3 flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-center text-foreground shadow-2xl">
          <p className="text-xl font-extrabold">Estás silenciada</p>
          <p className="text-sm text-muted-foreground">Saliste de la pantalla y apagamos tu micrófono. Nadie te escucha.</p>
          <button type="button" onClick={cambiarSilencio} className="h-12 w-full rounded-full bg-primary text-base font-extrabold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/40">
            Activar sonido
          </button>
        </div>
      )}

      {enVivo && estadoTx === "sin-camara" && (
        <div role="alert" className="absolute inset-x-6 top-1/3 flex flex-col items-center gap-3 rounded-3xl bg-black/80 p-5 text-center backdrop-blur">
          <p className="text-lg font-extrabold">Se apagó la cámara</p>
          <BotonClaro onClick={() => void transmisorRef.current?.volverATransmitir()}>Volver a transmitir</BotonClaro>
        </div>
      )}

      {sinCamaraEnPrevia && <PermisoCamara alProbar={() => void transmisorRef.current?.volverATransmitir()} />}

      {error && fase !== "fin" && (
        <p role="alert" className="absolute inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),1rem)+11rem)] rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-destructive shadow-lg">
          {error}
        </p>
      )}

      {(fase === "vista-previa" || fase === "saliendo") && !sinCamaraEnPrevia && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <p className="rounded-2xl bg-black/55 px-4 py-3 text-sm leading-snug backdrop-blur">
            <span aria-hidden="true">📌 </span>
            Mientras estés en vivo no salgas de esta pantalla. Si salís, se silencia el micrófono y la gente ve
            “Vuelvo en un momento”.
          </p>
          <div className="flex items-end justify-between gap-2">
            <BotonAvisarWhatsapp handle={tienda.handle} momento="antes" />
            <div className="flex gap-3">
              <BotonRedondo icono="🔄" texto="Cámara" etiqueta="Cambiar cámara" onClick={() => void cambiarCamara()} disabled={!camaraLista} />
              <BotonRedondo icono={silenciada ? "🔇" : "🎙"} texto={silenciada ? "Activar sonido" : "Silenciar"} onClick={cambiarSilencio} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void salir()}
            disabled={estadoTx !== "vista-previa" || fase === "saliendo"}
            className="h-16 w-full rounded-full bg-vivo text-lg font-extrabold text-white shadow-[0_8px_30px_-6px] shadow-vivo/70 outline-none transition-[scale,opacity] duration-(--duracion-instant) ease-out focus-visible:ring-3 focus-visible:ring-white/70 disabled:opacity-60 motion-safe:active:scale-[0.98]"
          >
            {fase === "saliendo" ? "Saliendo en vivo…" : estadoTx === "preparando" ? "Prendiendo la cámara…" : "Salir en vivo"}
          </button>
        </div>
      )}

      {enVivo && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <BotonAvisarWhatsapp handle={tienda.handle} momento="durante" />
          <div className="flex flex-col items-center gap-3">
            <BotonRedondo icono={silenciada ? "🔇" : "🎙"} texto={silenciada ? "Activar sonido" : "Silenciar"} onClick={cambiarSilencio} />
            <BotonRedondo icono="🔄" texto="Cámara" etiqueta="Cambiar cámara" onClick={() => void cambiarCamara()} disabled={!camaraLista} />
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="min-h-11 rounded-full bg-white px-5 text-sm font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70 motion-safe:active:scale-[0.97]"
            >
              Terminar
            </button>
          </div>
        </div>
      )}

      {enVivo && confirmando && (
        <div className="absolute inset-0 flex items-end bg-black/60 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-fin" className="flex w-full flex-col gap-3 rounded-3xl bg-background p-5 text-foreground">
            <p id="confirmar-fin" className="text-lg font-extrabold">¿Seguro que querés terminar el vivo?</p>
            <p className="text-sm text-muted-foreground">Quien está mirando va a ver que terminó.</p>
            <button
              type="button"
              onClick={() => void terminar()}
              disabled={terminando}
              className="h-12 rounded-full bg-vivo text-base font-extrabold text-white outline-none focus-visible:ring-3 focus-visible:ring-vivo/40 disabled:opacity-60"
            >
              {terminando ? "Terminando…" : "Sí, terminar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="h-12 rounded-full bg-secondary text-base font-bold text-secondary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Seguir en vivo
            </button>
          </div>
        </div>
      )}

      {fase === "fin" && fin && <PantallaFin fin={fin} alSalirDeNuevo={alSalirDeNuevo} />}
    </div>
  );
}

function BotonRedondo({
  icono, texto, etiqueta, onClick, disabled,
}: { icono: string; texto: string; etiqueta?: string; onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="group flex min-w-14 flex-col items-center gap-1 outline-none disabled:opacity-50 [&:focus-visible>span:first-child]:ring-3 [&:focus-visible>span:first-child]:ring-white/70"
    >
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-black/55 text-xl backdrop-blur transition-[scale] duration-(--duracion-instant) ease-out motion-safe:group-active:scale-95">
        {icono}
      </span>
      <span className="text-[11px] font-semibold leading-none drop-shadow">{texto}</span>
    </button>
  );
}

function BotonClaro({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-full bg-white px-5 text-base font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70"
    >
      {children}
    </button>
  );
}

function PermisoCamara({ alProbar }: { alProbar(): void }) {
  return (
    <div role="alert" className="absolute inset-0 flex flex-col justify-center gap-5 overflow-y-auto bg-black px-6 py-16">
      <h1 className="text-2xl font-extrabold">Necesitamos tu cámara y tu micrófono</h1>
      <p className="text-white/80">Para salir en vivo, el navegador tiene que dejarnos usarlos. Así se habilitan:</p>
      <section className="flex flex-col gap-1">
        <h2 className="font-bold">En iPhone</h2>
        <p className="text-sm text-white/80">Ajustes → Safari → Cámara y Micrófono → Permitir. Después volvé acá.</p>
      </section>
      <section className="flex flex-col gap-1">
        <h2 className="font-bold">En Android</h2>
        <p className="text-sm text-white/80">Tocá el candado de la barra de direcciones → Permisos → activá Cámara y Micrófono.</p>
      </section>
      <BotonClaro onClick={alProbar}>Probar de nuevo</BotonClaro>
      <Link href="/mi-puesto" className="flex h-11 items-center justify-center font-semibold text-white/80 underline-offset-4 hover:underline">
        Volver a mi puesto
      </Link>
    </div>
  );
}

function PantallaFin({ fin, alSalirDeNuevo }: { fin: Fin; alSalirDeNuevo(): void }) {
  const volver = (
    <Link
      href="/mi-puesto"
      className="flex h-14 items-center justify-center rounded-full bg-white text-base font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70"
    >
      Volver a mi puesto
    </Link>
  );

  if (fin.tipo === "otro-celular") {
    return (
      <Aviso titulo="Seguís el vivo en otro celular" texto="Este celular dejó de transmitir. Tu vivo sigue desde el otro.">
        {volver}
      </Aviso>
    );
  }
  if (fin.tipo === "sin-sesion") {
    return (
      <Aviso titulo="Se cerró tu sesión. Volvé a entrar para seguir en vivo." texto="Tu vivo queda abierto unos minutos: entrá y tocá Salir en vivo.">
        <form action={entrarConGoogle}>
          <input type="hidden" name="next" value="/mi-puesto/vivo" />
          <button type="submit" className="flex h-14 w-full items-center justify-center rounded-full bg-white text-base font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70">
            Entrar con Google
          </button>
        </form>
      </Aviso>
    );
  }

  const { vivo } = fin;
  if (vivo.end_reason === "plataforma") {
    return (
      <Aviso titulo="La plataforma terminó este vivo" texto="Un administrador de Tu Feria Live cortó la transmisión. Quien miraba ya no te ve.">
        {volver}
      </Aviso>
    );
  }

  const porAusencia = vivo.end_reason === "sin_senal";
  return (
    <section className="absolute inset-0 flex flex-col justify-center gap-6 overflow-y-auto bg-primary px-6 py-16 text-primary-foreground">
      <h1 className="text-3xl leading-tight font-extrabold text-balance">
        {porAusencia ? "Tu vivo terminó porque estuviste afuera mucho tiempo" : "¡Terminó tu vivo! 🎉"}
      </h1>
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-3xl bg-white/12 p-4">
          <dt className="text-sm text-white/80">Duró</dt>
          <dd className="text-2xl leading-tight font-extrabold tabular-nums">{duracionEnPalabras(duracionVivoMs(vivo, Date.parse(vivo.started_at)))}</dd>
        </div>
        <div className="flex flex-col gap-1 rounded-3xl bg-white/12 p-4">
          <dt className="text-sm text-white/80">Más gente mirando a la vez</dt>
          <dd className="text-3xl font-extrabold tabular-nums">{vivo.peak_viewers}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-3">
        {porAusencia && (
          <button
            type="button"
            onClick={alSalirDeNuevo}
            className="flex h-14 items-center justify-center rounded-full bg-vivo text-base font-extrabold text-white outline-none focus-visible:ring-3 focus-visible:ring-white/70"
          >
            Salir en vivo de nuevo
          </button>
        )}
        {volver}
      </div>
    </section>
  );
}

function Aviso({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <section role="alert" className="absolute inset-0 flex flex-col justify-center gap-4 overflow-y-auto bg-primary px-6 py-16 text-primary-foreground">
      <h1 className="text-3xl leading-tight font-extrabold text-balance">{titulo}</h1>
      <p className="text-white/85">{texto}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** mm:ss (los minutos siguen contando después de la hora). */
function reloj(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${dosCifras(Math.floor(s / 60))}:${dosCifras(s % 60)}`;
}

function duracionEnPalabras(ms: number): string {
  const minutos = Math.round(ms / 60_000);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const resto = minutos % 60;
  return resto ? `${Math.floor(minutos / 60)} h ${resto} min` : `${Math.floor(minutos / 60)} h`;
}
