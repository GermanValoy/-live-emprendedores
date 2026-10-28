"use client";

import { cn } from "cn";
import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { Foto } from "@/components/fotos/foto";
import { EnVivo } from "@/components/marca/en-vivo";
import { BotonSeguir } from "@/components/tiendas/boton-seguir";
import { EsperaFeria } from "@/components/vivos/espera-feria";
import { useSalaVivo } from "@/components/vivos/use-sala-vivo";
import { formatARS } from "@/lib/format/plata";
import type { ConfigVivo, Vivo } from "@/lib/vivos/tipos";

type Props = {
  tienda: { id: string; handle: string; name: string; avatar_path: string | null; live_schedule_note: string | null };
  /** Hasta 3 productos visibles, con su primera foto. */
  productos: { id: string; price_cents: number; foto: string | null }[];
  vivoInicial: Vivo | null;
  config: ConfigVivo;
  siguiendo: boolean;
  conSesion: boolean;
};

/** La sala de la compradora: espera animada, el vivo a pantalla completa y el cierre. Siempre oscura. */
export function SalaVivo({ tienda, productos, vivoInicial, config, siguiendo, conSesion }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { vivo, estado, mirando, reproduccion, sinSonido, activarSonido } = useSalaVivo(tienda.id, vivoInicial, config, videoRef);
  const abierto = estado === "en-vivo" || estado === "vuelve-pronto" || estado === "reconectando-feriante";
  const linkTienda = `/@${tienda.handle}`;

  return (
    <main className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      {/* El video está siempre montado (así el reproductor lo encuentra); se ve solo con el vivo abierto. */}
      <video ref={videoRef} playsInline autoPlay className={cn("absolute inset-0 size-full object-cover", !abierto && "hidden")} />

      {abierto && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-black/60 to-transparent" />
          {/* Espacio del chat (Parte 3): queda libre abajo. */}
          <div aria-hidden="true" data-testid="espacio-chat" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-linear-to-t from-black/50 to-transparent" />
        </>
      )}

      {estado === "esperando" && (
        <div className="absolute inset-0 overflow-y-auto pt-[calc(max(env(safe-area-inset-top),0.5rem)+3.75rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
          <EsperaFeria nombre={tienda.name} />
          <div className="flex flex-col gap-4 px-4 pt-5">
            {tienda.live_schedule_note && (
              <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-pretty wrap-anywhere">
                <span aria-hidden="true">📅 </span>Suele estar en vivo {tienda.live_schedule_note}
              </p>
            )}
            {productos.length > 0 && (
              <section aria-labelledby="mientras-tanto" className="flex flex-col gap-3">
                <h2 id="mientras-tanto" className="font-bold">Mientras tanto, mirá lo que tiene</h2>
                <ul className="grid grid-cols-3 gap-2">
                  {productos.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`${linkTienda}/p/${p.id}`}
                        className="flex flex-col overflow-hidden rounded-xl bg-white/10 outline-none focus-visible:ring-3 focus-visible:ring-white/70"
                      >
                        {p.foto ? (
                          <Foto path={p.foto} tamano="chica" alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="aspect-square bg-white/5" />
                        )}
                        <b className="px-2 py-1.5 text-sm tabular-nums">{formatARS(p.price_cents)}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      <Cabecera tienda={tienda} siguiendo={siguiendo} conSesion={conSesion} linkTienda={linkTienda}>
        {abierto && (
          <div className="flex items-center gap-2">
            <EnVivo />
            <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-bold tabular-nums backdrop-blur" aria-label={`${mirando} mirando`}>
              {`👁 ${mirando}`}
            </span>
          </div>
        )}
      </Cabecera>

      {estado === "en-vivo" && vivo?.muted && (
        <p role="status" className="absolute top-[calc(max(env(safe-area-inset-top),0.5rem)+6.5rem)] left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-4 py-1.5 text-sm font-bold whitespace-nowrap backdrop-blur">
          <span aria-hidden="true">🔇 </span>Sin sonido por un momento
        </p>
      )}

      {estado === "en-vivo" && reproduccion === "reconectando" && <Cartel>Reconectando…</Cartel>}
      {estado === "vuelve-pronto" && <Cartel>{tienda.name} vuelve en un momento</Cartel>}
      {estado === "reconectando-feriante" && <Cartel>{tienda.name} se está reconectando</Cartel>}

      {abierto && sinSonido && (
        <button
          type="button"
          onClick={activarSonido}
          className="absolute bottom-[calc(max(env(safe-area-inset-bottom),1rem)+15rem)] left-1/2 min-h-12 -translate-x-1/2 rounded-full bg-white px-6 text-base font-extrabold whitespace-nowrap text-primary shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-white/70 motion-safe:active:scale-[0.97]"
        >
          <span aria-hidden="true">🔊 </span>Tocá para activar el sonido
        </button>
      )}

      {estado === "terminado" && (
        <section role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-black px-6 py-24 text-center">
          <p className="max-w-sm text-2xl leading-tight font-extrabold text-balance wrap-anywhere">
            El vivo terminó. Gracias por acompañar a {tienda.name}.
          </p>
          <Link
            href={linkTienda}
            className="flex h-14 w-full max-w-sm items-center justify-center rounded-full bg-white text-base font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70"
          >
            Ver su tienda
          </Link>
        </section>
      )}
    </main>
  );
}

function Cabecera({
  tienda, siguiendo, conSesion, linkTienda, children,
}: Pick<Props, "tienda" | "siguiendo" | "conSesion"> & { linkTienda: string; children: ReactNode }) {
  return (
    <header className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-black/45 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur">
      <div className="flex items-center gap-2">
        {tienda.avatar_path ? (
          <Foto path={tienda.avatar_path} tamano="chica" alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-primary">
            {tienda.name.charAt(0)}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate font-bold">{tienda.name}</p>
        <BotonSeguir storeId={tienda.id} handle={tienda.handle} siguiendo={siguiendo} conSesion={conSesion} volverA={`${linkTienda}/vivo`} />
        <Link
          href={linkTienda}
          aria-label="Cerrar la sala"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/55 text-xl outline-none focus-visible:ring-3 focus-visible:ring-white/70"
        >
          <span aria-hidden="true">✕</span>
        </Link>
      </div>
      {children}
    </header>
  );
}

/** Cartel centrado sobre la imagen (sin taparla de negro). Los nombres largos se cortan en renglones. */
function Cartel({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="absolute inset-x-6 top-1/3 mx-auto max-w-sm rounded-2xl bg-black/65 px-5 py-4 text-center text-lg leading-snug font-bold text-balance wrap-anywhere backdrop-blur">
      {children}
    </p>
  );
}
