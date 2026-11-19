"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { datosEntrega, type DatosEntrega, elegirEntrega, informarPago } from "@/app/pedidos/acciones";
import { Foto } from "@/components/fotos/foto";
import { subirComprobante } from "@/lib/codigos/comprobante";
import { restante } from "@/lib/codigos/pedido";
import type { Pedido } from "@/lib/codigos/tipos";
import { ErrorDeFoto } from "@/lib/fotos/comprimir";
import { formatARS } from "@/lib/format/plata";
import { metodoDePago } from "@/lib/payments";
import { alServidor, NO_GUARDO } from "@/lib/red";
import { createClient } from "@/lib/supabase/client";
import type { OpcionEntrega, TipoEntrega } from "@/lib/tiendas/tipos";

type Props = {
  pedido: Pedido;
  tienda: { name: string; zone: string };
  /** Las formas de entrega del puesto (las deshabilitadas no se muestran). */
  opciones: OpcionEntrega[];
  /** La foto y el código del pedido (para el encabezado). */
  codigo?: { label: string; photo_path: string | null } | null;
  /** Festejo animado: solo la primera vez que se abre. */
  festejar?: boolean;
  alCerrar(): void;
};

const ORDEN: TipoEntrega[] = ["pickup", "shipping", "meetup"];
const CONFETI = ["#b0135f", "#f5d90a", "#2f7d32", "#e0549a", "#f5d90a", "#b0135f", "#2f7d32", "#e0549a", "#f5d90a", "#b0135f"];
const BOTON =
  "flex min-h-12 w-full items-center justify-center rounded-full text-base font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 motion-safe:active:scale-[0.97]";

function etiquetaEntrega(o: OpcionEntrega, zona: string): { titulo: string; detalle: string | null } {
  if (o.kind === "pickup") return { titulo: "Retiro", detalle: `En ${zona}. La dirección te la damos cuando pagues.` };
  if (o.kind === "meetup") return { titulo: "Punto de encuentro", detalle: o.note };
  if (o.shipping_mode === "free") return { titulo: "Envío gratis", detalle: o.note };
  if (o.shipping_mode === "fixed" && o.shipping_cost_cents) return { titulo: `Envío ${formatARS(o.shipping_cost_cents)}`, detalle: o.note };
  return { titulo: "Envío a coordinar", detalle: o.note ?? "Lo arreglás con la feriante" };
}

/** El panel que sube desde abajo con todo el recorrido de un pedido. Sirve dentro y fuera de la sala. */
export function PanelPago({ pedido: recibido, tienda, opciones, codigo, festejar = false, alCerrar }: Props) {
  // Lo que respondió el servidor a esta compradora se ve al instante; después manda lo que llegue por Realtime.
  const [local, setLocal] = useState<Pedido | null>(null);
  const pedido = local && local.id === recibido.id && local.updated_at >= recibido.updated_at ? local : recibido;
  const [paso, setPaso] = useState<"datos" | "comprobante">("datos");

  // Foco al panel al abrirse (cierra el teclado del celular y avisa a los lectores de pantalla); al cerrarse vuelve a donde estaba.
  const dialogo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogo.current?.focus();
    return () => { if (anterior?.isConnected) anterior.focus(); };
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);

  let contenido: ReactNode;
  if (pedido.status === "por_pagar" && paso === "datos") {
    contenido = (
      <PasoGanaste
        pedido={pedido}
        tienda={tienda}
        opciones={opciones}
        codigo={codigo}
        festejar={festejar}
        alActualizar={setLocal}
        alSeguir={() => setPaso("comprobante")}
      />
    );
  } else if (pedido.status === "por_pagar") {
    contenido = <PasoComprobante pedido={pedido} alActualizar={setLocal} alVolver={() => setPaso("datos")} alCerrar={alCerrar} />;
  } else if (pedido.status === "pago_informado") {
    contenido = (
      <Aviso emoji="⏳" titulo="Esperando confirmación" alCerrar={alCerrar} boton="Seguir mirando">
        {`Le avisamos a ${tienda.name}. Cuando confirme que le llegó la plata, lo vas a ver acá y en Mis compras.`}
      </Aviso>
    );
  } else if (pedido.status === "en_revision") {
    contenido = (
      <Aviso emoji="🔎" titulo="Estamos revisando tu pago" alCerrar={alCerrar} boton="Entendido">
        {`${tienda.name} no encuentra tu pago. Te va a escribir por WhatsApp para aclararlo.`}
      </Aviso>
    );
  } else if (pedido.status === "pagado") {
    contenido = <PasoPagado pedido={pedido} tienda={tienda} alCerrar={alCerrar} />;
  } else if (pedido.status === "vencido") {
    contenido = (
      <Aviso emoji="⌛" titulo="Se te pasó el tiempo para pagar." alCerrar={alCerrar} boton="Cerrar">
        Este código pasó a la siguiente persona.
      </Aviso>
    );
  } else {
    contenido = (
      <Aviso emoji="🚫" titulo="Este pedido se anuló" alCerrar={alCerrar} boton="Cerrar">
        {`${tienda.name} anuló este pedido.`}
      </Aviso>
    );
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 flex items-end bg-black/60 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-(--duracion-base)"
      onClick={alCerrar}
    >
      <div
        ref={dialogo}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Tu pedido"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-3xl bg-background p-5 outline-none pb-[max(env(safe-area-inset-bottom),1.25rem)] text-foreground motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-(--duracion-sheet)"
      >
        <span aria-hidden="true" className="mx-auto -mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        {contenido}
      </div>
    </div>
  );
}

function Festejo() {
  return (
    <div aria-hidden="true" className="relative mx-auto grid h-16 w-24 place-items-center">
      <span className="festejo-emoji text-5xl">🎉</span>
      {CONFETI.map((color, i) => {
        const angulo = (i / CONFETI.length) * Math.PI * 2;
        const radio = 70 + (i % 3) * 18;
        return (
          <i
            key={i}
            className="festejo-confeti"
            style={{
              background: color,
              animationDelay: `${(i % 4) * 40}ms`,
              ["--dx" as string]: `${Math.round(Math.cos(angulo) * radio)}px`,
              ["--dy" as string]: `${Math.round(Math.sin(angulo) * radio - 20)}px`,
              ["--giro" as string]: `${(i % 2 ? 1 : -1) * (180 + i * 40)}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

function Cuenta({ deadline }: { deadline: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{`Tenés ${restante(deadline, ahora).texto} para pagar. Si no, pasa a la siguiente.`}</>;
}

function PasoGanaste({
  pedido, tienda, opciones, codigo, festejar, alActualizar, alSeguir,
}: Pick<Props, "tienda" | "opciones" | "codigo"> & { pedido: Pedido; festejar: boolean; alActualizar(p: Pedido): void; alSeguir(): void }) {
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const datos = metodoDePago().datosParaPagar(pedido);
  const habilitadas = opciones.filter((o) => o.enabled).sort((a, b) => ORDEN.indexOf(a.kind) - ORDEN.indexOf(b.kind));
  const envio = pedido.delivery_kind === "shipping" ? pedido.shipping_cents : null;
  const aCoordinar = pedido.delivery_kind === "shipping" && pedido.shipping_cents === null;

  const elegir = async (tipo: TipoEntrega) => {
    setOcupada(true);
    setError(null);
    const r = await alServidor(() => elegirEntrega(pedido.id, tipo));
    setOcupada(false);
    if (r.ok) alActualizar(r.pedido);
    else setError(r.error);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(datos.alias);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No pudimos copiar el alias. Copialo a mano.");
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-1 text-center">
        {festejar ? <Festejo /> : <span aria-hidden="true" className="text-4xl">🎉</span>}
        <h2 className="text-2xl leading-tight font-extrabold text-balance">{`¡Ganaste el código ${codigo?.label ?? ""}!`}</h2>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-accent p-3">
        {codigo?.photo_path && <Foto path={codigo.photo_path} tamano="chica" alt="" className="size-14 shrink-0 rounded-xl object-cover" />}
        <p className="min-w-0 flex-1 text-sm leading-tight">
          <b className="block truncate text-base">{codigo?.label}</b>
          <span className="block truncate font-bold text-primary">{tienda.name}</span>
        </p>
        <b className="text-lg tabular-nums">{formatARS(pedido.price_cents)}</b>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">¿Cómo la querés recibir?</legend>
        {habilitadas.map((o) => {
          const { titulo, detalle } = etiquetaEntrega(o, tienda.zone);
          const elegida = pedido.delivery_kind === o.kind;
          return (
            <button
              key={o.kind}
              type="button"
              disabled={ocupada}
              aria-pressed={elegida}
              onClick={() => void elegir(o.kind)}
              className={`flex min-h-14 flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${elegida ? "border-primary bg-accent" : "border-border"}`}
            >
              <b>{titulo}</b>
              {detalle && <span className="text-sm text-muted-foreground">{detalle}</span>}
            </button>
          );
        })}
      </fieldset>

      <section className="flex flex-col gap-2 text-base" aria-label="Datos para pagar">
        <p className="text-sm text-muted-foreground">{`Transferile a ${tienda.name} este monto exacto:`}</p>
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Alias</span>
          <b className="min-w-0 flex-1 truncate text-right">{datos.alias}</b>
          <button
            type="button"
            onClick={() => void copiar()}
            className="min-h-11 min-w-16 rounded-full border-2 border-primary px-3 text-sm font-bold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Titular</span>
          <b className="text-right">{datos.titular}</b>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{envio ? `Monto (prenda + envío ${formatARS(envio)})` : "Monto"}</span>
          <b className="text-xl tabular-nums">{formatARS(datos.monto)}</b>
        </div>
        {aCoordinar && <p className="text-sm text-muted-foreground">el envío lo arreglás con la feriante</p>}
      </section>

      <p role="timer" className="rounded-2xl bg-codigo/25 px-4 py-3 text-center text-sm font-bold">
        <Cuenta deadline={pedido.deadline} />
      </p>
      {error && <p role="alert" className="text-center text-sm font-bold text-destructive">{error}</p>}
      <button type="button" disabled={!pedido.delivery_kind || ocupada} onClick={alSeguir} className={`${BOTON} bg-primary text-primary-foreground`}>
        Ya pagué
      </button>
    </>
  );
}

function PasoComprobante({
  pedido, alActualizar, alVolver, alCerrar,
}: { pedido: Pedido; alActualizar(p: Pedido): void; alVolver(): void; alCerrar(): void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [whatsapp, setWhatsapp] = useState(pedido.buyer_whatsapp ?? "");
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vencido, setVencido] = useState(false);
  const digitos = whatsapp.replace(/\D/g, "");

  // Si ya usó un WhatsApp en otra compra, viene completado.
  useEffect(() => {
    let vigente = true;
    void createClient()
      .rpc("ultimo_whatsapp")
      .then(({ data }) => {
        if (vigente && typeof data === "string") setWhatsapp((actual) => actual || data);
      });
    return () => { vigente = false; };
  }, []);

  const enviar = async () => {
    if (!archivo) return;
    setOcupada(true);
    setError(null);
    try {
      const { data } = await createClient().auth.getUser();
      if (!data.user) { setError("Entrá de nuevo para pagar."); return; }
      const ruta = await subirComprobante(data.user.id, pedido.id, archivo);
      const r = await informarPago(pedido.id, ruta, whatsapp.trim());
      if (r.ok) alActualizar(r.pedido);
      else if (r.motivo === "vencido") setVencido(true);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof ErrorDeFoto ? e.message : "No pudimos enviarlo. Revisá tu conexión y probá de nuevo.");
    } finally {
      setOcupada(false);
    }
  };

  if (vencido) {
    return (
      <Aviso emoji="⌛" titulo="Se te pasó el tiempo para pagar." alCerrar={alCerrar} boton="Cerrar">
        Este código pasó a la siguiente persona.
      </Aviso>
    );
  }

  return (
    <>
      <h2 className="text-2xl leading-tight font-extrabold text-balance">Mandá el comprobante</h2>
      <p className="text-sm text-muted-foreground">Ayuda a que la feriante lo confirme más rápido. Solo lo ven vos y ella.</p>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border px-4 py-4 text-center focus-within:ring-3 focus-within:ring-ring/50">
        <span aria-hidden="true" className="text-2xl">📎</span>
        <b>{archivo ? "Cambiar la captura" : "Subir captura del comprobante"}</b>
        <span className="text-sm text-muted-foreground">{archivo ? archivo.name : "desde tu galería"}</span>
        <input
          type="file"
          accept="image/*"
          aria-label="Subir captura del comprobante"
          className="sr-only"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Tu WhatsApp
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="381 555-0123"
          className="h-12 rounded-xl border-2 border-border bg-background px-4 text-base font-normal outline-none focus-visible:border-primary"
        />
        <span className="text-xs font-normal text-muted-foreground">Para coordinar la entrega.</span>
      </label>
      {error && <p role="alert" className="text-center text-sm font-bold text-destructive">{error}</p>}
      <button
        type="button"
        disabled={!archivo || digitos.length < 8 || digitos.length > 15 || ocupada}
        onClick={() => void enviar()}
        className={`${BOTON} bg-primary text-primary-foreground`}
      >
        {ocupada ? "Enviando…" : "Enviar"}
      </button>
      <button type="button" disabled={ocupada} onClick={alVolver} className={`${BOTON} bg-secondary text-secondary-foreground`}>
        Volver
      </button>
    </>
  );
}

function Aviso({ emoji, titulo, children, boton, alCerrar }: { emoji: string; titulo: string; children: ReactNode; boton: string; alCerrar(): void }) {
  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="text-5xl">{emoji}</span>
        <h2 className="text-2xl leading-tight font-extrabold text-balance">{titulo}</h2>
        <p className="text-base text-pretty">{children}</p>
      </div>
      <button type="button" onClick={alCerrar} className={`${BOTON} bg-secondary text-secondary-foreground`}>
        {boton}
      </button>
    </>
  );
}

function PasoPagado({ pedido, tienda, alCerrar }: { pedido: Pedido; tienda: { name: string }; alCerrar(): void }) {
  const [datos, setDatos] = useState<DatosEntrega | null>(null);
  const [falloLaRed, setFalloLaRed] = useState(false);
  useEffect(() => {
    let vigente = true;
    void alServidor(() => datosEntrega(pedido.id)).then((r) => {
      if (!vigente) return;
      if ("datos" in r) setDatos(r.datos);
      else { setDatos({}); setFalloLaRed("error" in r); }
    });
    return () => { vigente = false; };
  }, [pedido.id]);

  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-exito/15 text-4xl">✅</span>
        <h2 className="text-2xl leading-tight font-extrabold text-balance">{`¡${tienda.name} confirmó tu pago!`}</h2>
      </div>
      <div className="flex flex-col gap-1 rounded-2xl bg-accent p-4 text-base">
        {pedido.delivery_kind === "shipping" && <p className="font-bold">{`${tienda.name} te va a escribir por WhatsApp para coordinar`}</p>}
        {pedido.delivery_kind === "pickup" && (
          <>
            <b>Retiro</b>
            <span>{datos === null ? "Cargando…" : (datos.direccion ?? "")}</span>
            {datos?.horarios && <span className="text-muted-foreground">{datos.horarios}</span>}
          </>
        )}
        {pedido.delivery_kind === "meetup" && (
          <>
            <b>Punto de encuentro</b>
            <span>{datos === null ? "Cargando…" : (datos.nota ?? "A coordinar con la feriante")}</span>
          </>
        )}
      </div>
      {falloLaRed && <p role="alert" className="text-center text-sm font-bold text-destructive">{NO_GUARDO.replace("No se pudo guardar.", "No pudimos cargar los datos de la entrega.")}</p>}
      <button type="button" onClick={alCerrar} className={`${BOTON} bg-primary text-primary-foreground`}>
        Listo
      </button>
    </>
  );
}
