"use client";

import { type RefObject, useState } from "react";
import { lanzarCodigo } from "@/app/mi-puesto/vivo/acciones-codigos";
import { fotoDelVideo } from "@/lib/codigos/foto-video";
import type { Codigo } from "@/lib/codigos/tipos";
import { ErrorDeFoto } from "@/lib/fotos/comprimir";
import { subirFoto } from "@/lib/fotos/subir";
import { CodigoActivo } from "./codigo-activo";
import { PedidosVivo } from "./pedidos-vivo";
import { usePedidosPuesto } from "./use-pedidos-puesto";
import { type Borrador, PanelCodigo, type ProductoResumen } from "./panel-codigo";
import { useCodigosVivo } from "./use-codigos-vivo";

type Props = {
  vivoId: string;
  storeId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  inicial: Codigo[];
  productos: ProductoResumen[];
};

/** Lo de los códigos en el estudio: el botón para crear uno, el cartel para lanzarlo y la barra del código activo. */
export function CodigosEstudio({ vivoId, storeId, videoRef, inicial, productos }: Props) {
  const { activo, releer } = useCodigosVivo(vivoId, inicial);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [revisando, setRevisando] = useState(false);
  const { pedidos } = usePedidosPuesto(storeId, vivoId);
  const porRevisar = pedidos.filter((p) => p.status === "pago_informado").length;

  async function abrir() {
    // La foto se saca ahora, con lo que está mostrando en cámara.
    const foto = videoRef.current ? await fotoDelVideo(videoRef.current).catch(() => null) : null;
    setBorrador({ foto, precio: null, palabra: "", cantidad: 1, productoId: null, porVoz: false });
  }

  async function lanzar(b: Borrador) {
    if (b.precio === null) throw new Error("Poné el precio.");
    let ruta: string | null = null;
    if (b.foto) {
      try {
        ruta = await subirFoto(storeId, "codigos", new File([b.foto], "codigo.jpg", { type: b.foto.type || "image/jpeg" }));
      } catch (e) {
        console.error("Código: no se pudo subir la foto", e);
        throw new Error(e instanceof ErrorDeFoto ? e.message : "No se pudo subir la foto. Revisá tu conexión y probá de nuevo.");
      }
    }
    const r = await lanzarCodigo(vivoId, {
      palabra: b.palabra,
      precioCentavos: b.precio,
      cantidad: b.cantidad,
      foto: ruta,
      productoId: b.productoId,
      porVoz: b.porVoz,
    }).catch((e: unknown) => {
      console.error("lanzarCodigo: no respondió el servidor", e);
      return { ok: false as const, error: "No se pudo completar. Revisá tu conexión y probá de nuevo." };
    });
    if (!r.ok) throw new Error(r.error);
    setBorrador(null);
    await releer();
  }

  return (
    <>
      <div className="pointer-events-none absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+3.25rem)] right-3 z-10 flex w-[62%] flex-col items-end gap-2">
        {activo && <div className="w-full"><CodigoActivo key={activo.id} codigo={activo} alCambiar={releer} /></div>}
        <button
          type="button"
          onClick={() => void abrir()}
          className="pointer-events-auto min-h-11 rounded-full bg-white px-4 text-sm font-extrabold text-primary shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-white/70 motion-safe:active:scale-[0.97]"
        >
          + Nuevo código
        </button>
        {porRevisar > 0 && (
          <button
            type="button"
            onClick={() => setRevisando(true)}
            className="pointer-events-auto min-h-11 rounded-full bg-vivo px-4 text-sm font-extrabold text-white shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-white/70 motion-safe:active:scale-[0.97]"
          >
            {`Pagos para revisar (${porRevisar})`}
          </button>
        )}
      </div>
      {revisando && (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-end bg-black/60 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-(--duracion-base)"
          onClick={(e) => { if (e.target === e.currentTarget) setRevisando(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pagos para revisar"
            className="flex max-h-[92dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-foreground motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-(--duracion-sheet)"
          >
            <PedidosVivo storeId={storeId} vivoId={vivoId} titulo="Pedidos de este vivo" />
            <button type="button" onClick={() => setRevisando(false)} className="flex min-h-11 items-center justify-center rounded-full bg-secondary text-sm font-extrabold text-secondary-foreground">
              Cerrar
            </button>
          </div>
        </div>
      )}
      {borrador && (
        <PanelCodigo inicial={borrador} productos={productos} alLanzar={lanzar} alCerrar={() => setBorrador(null)} />
      )}
    </>
  );
}
