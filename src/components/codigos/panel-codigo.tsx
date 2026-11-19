"use client";

import { useEffect, useMemo, useState } from "react";
import { formatARS } from "@/lib/format/plata";
import { urlFoto } from "@/lib/fotos/rutas";

export type Borrador = {
  foto: Blob | null;
  /** En centavos. */
  precio: number | null;
  palabra: string;
  cantidad: number;
  productoId: string | null;
  porVoz: boolean;
};

export type ProductoResumen = { id: string; nombre: string; precio: number; cantidad: number; foto: string | null };

type Props = {
  inicial: Borrador;
  productos: ProductoResumen[];
  /** Lanza el código; si algo falla, tira un Error con el texto para mostrarle a la feriante. */
  alLanzar(b: Borrador): Promise<void>;
  alCerrar(): void;
};

const MAX_CANTIDAD = 99;

/** El cartel para lanzar un código: foto, precio, palabra y cantidad. Sube desde abajo. */
export function PanelCodigo({ inicial, productos, alLanzar, alCerrar }: Props) {
  const [foto, setFoto] = useState<Blob | null>(inicial.foto);
  const [precio, setPrecio] = useState(inicial.precio === null ? "" : String(Math.round(inicial.precio / 100)));
  const [palabra, setPalabra] = useState(inicial.palabra.toUpperCase());
  const [cantidad, setCantidad] = useState(inicial.cantidad);
  const [productoId, setProductoId] = useState<string | null>(inicial.productoId);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vista = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  const pesos = precio ? Number(precio) : null;
  const centavos = pesos !== null && Number.isSafeInteger(pesos * 100) && pesos > 0 ? pesos * 100 : null;
  const listo = centavos !== null && palabra.trim().length > 0 && !enviando;

  async function elegirProducto(p: ProductoResumen) {
    setProductoId(p.id);
    setPrecio(String(Math.round(p.precio / 100)));
    setCantidad(Math.min(Math.max(p.cantidad, 1), MAX_CANTIDAD));
    if (!p.foto) return;
    try {
      const r = await fetch(urlFoto(p.foto, "grande"));
      if (r.ok) setFoto(await r.blob());
    } catch (e) {
      console.error("Panel de código: no se pudo bajar la foto del producto", e);
    }
  }

  async function lanzar() {
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      await alLanzar({ foto, precio: centavos, palabra: palabra.trim(), cantidad, productoId, porVoz: inicial.porVoz });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar. Revisá tu conexión y probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-panel-codigo"
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-foreground animate-in slide-in-from-bottom duration-(--duracion-sheet) ease-out"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-panel-codigo" className="text-xl font-extrabold">Nuevo código</h2>
          <button type="button" onClick={alCerrar} aria-label="Descartar" className="flex size-11 items-center justify-center rounded-full bg-secondary text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="flex gap-4">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-secondary">
            {vista ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob), no es una imagen para optimizar
              <img src={vista} alt="Foto del producto" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-center text-xs text-muted-foreground">Sin foto</span>
            )}
          </div>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
            Precio
            <span className="flex h-14 items-center gap-1 rounded-2xl border bg-card px-3 text-2xl font-extrabold focus-within:ring-3 focus-within:ring-ring/50">
              $
              <input
                inputMode="numeric"
                autoComplete="off"
                aria-label="Precio"
                value={precio}
                onChange={(e) => setPrecio(e.target.value.replace(/\D/g, "").slice(0, 9))}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </span>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-semibold">
          Código
          <input
            aria-label="Código"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={40}
            value={palabra}
            onChange={(e) => setPalabra(e.target.value.toUpperCase())}
            className="h-14 rounded-2xl border bg-card px-4 text-2xl font-extrabold tracking-wide uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Cantidad</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Menos" disabled={cantidad <= 1} onClick={() => setCantidad((c) => Math.max(1, c - 1))} className="flex size-11 items-center justify-center rounded-full bg-secondary text-2xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40">−</button>
            <span aria-live="polite" className="w-8 text-center text-xl font-extrabold tabular-nums">{cantidad}</span>
            <button type="button" aria-label="Más" disabled={cantidad >= MAX_CANTIDAD} onClick={() => setCantidad((c) => Math.min(MAX_CANTIDAD, c + 1))} className="flex size-11 items-center justify-center rounded-full bg-secondary text-2xl font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40">+</button>
          </div>
        </div>

        {productos.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">O elegí uno de tus productos</h3>
            <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {productos.map((p) => (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => void elegirProducto(p)}
                    aria-pressed={productoId === p.id}
                    className="flex min-h-11 w-32 flex-col items-start gap-0.5 rounded-2xl border bg-card p-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-primary/5"
                  >
                    <span className="line-clamp-1 w-full text-sm font-bold">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{formatARS(p.precio)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>}

        <button
          type="button"
          onClick={() => void lanzar()}
          disabled={!listo}
          className="h-14 w-full rounded-full bg-vivo text-base font-extrabold text-white outline-none transition-[scale,opacity] duration-(--duracion-instant) ease-out focus-visible:ring-3 focus-visible:ring-vivo/40 disabled:opacity-50 motion-safe:active:scale-[0.98]"
        >
          {enviando ? "Lanzando…" : `Lanzar código ${palabra.trim().toUpperCase()}${centavos !== null ? ` · ${formatARS(centavos)}` : ""}`}
        </button>
      </div>
    </div>
  );
}
