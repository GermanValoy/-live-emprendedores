import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { Foto } from "@/components/fotos/foto";
import { BotonSeguir } from "@/components/tiendas/boton-seguir";
import { buttonVariants } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/server";
import { contarSeguidores, idsSeguidos, listarProductos, obtenerEntregas, obtenerTiendaPorHandle } from "@/lib/tiendas/datos";
import { resumenEntregas } from "@/lib/tiendas/entrega";
import { handleDeRuta } from "@/lib/tiendas/validacion";
import { vivoAbiertoDe } from "@/lib/vivos/datos";

function NoEncontrado() {
  return <EstadoVacio texto="No encontramos este puesto." accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>} />;
}

async function Contenido({ params }: { params: Promise<{ handle: string }> }) {
  await connection();
  const { handle } = await params;
  const supabase = await createClient();
  const handleTienda = handleDeRuta(handle);
  const tienda = handleTienda ? await obtenerTiendaPorHandle(supabase, handleTienda) : null;
  if (!tienda) return <NoEncontrado />;
  const userId = await obtenerUsuarioId(supabase);
  const [productos, opciones, seguidores, seguidos, vivo] = await Promise.all([
    listarProductos(supabase, tienda.id),
    obtenerEntregas(supabase, tienda.id),
    contarSeguidores(supabase, tienda.id),
    userId ? idsSeguidos(supabase, userId) : Promise.resolve(new Set<string>()),
    vivoAbiertoDe(supabase, tienda.id),
  ]);
  const visibles = productos.filter((p) => p.visible);

  return (
    <>
      <div className="relative -mx-4 -mt-4 h-28 bg-gradient-to-br from-accent to-primary">
        {tienda.cover_path && <Foto path={tienda.cover_path} tamano="grande" alt="" className="size-full object-cover" />}
      </div>
      <div className="-mt-10 flex items-end justify-between gap-3">
        {tienda.avatar_path ? (
          <Foto path={tienda.avatar_path} tamano="chica" alt={`Foto de ${tienda.name}`} className="size-20 rounded-full border-4 border-background object-cover" />
        ) : (
          <div aria-hidden="true" className="grid size-20 place-items-center rounded-full border-4 border-background bg-accent text-3xl font-extrabold text-primary">
            {tienda.name.charAt(0)}
          </div>
        )}
        <BotonSeguir storeId={tienda.id} handle={tienda.handle} siguiendo={seguidos.has(tienda.id)} conSesion={Boolean(userId)} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">{tienda.name}</h1>
        <p className="text-sm text-muted-foreground">
          {tienda.category} · {tienda.zone} · {seguidores === 1 ? "1 seguidor" : `${seguidores} seguidores`}
        </p>
        {tienda.description && <p>{tienda.description}</p>}
      </div>
      {vivo && (
        <Link
          href={`/@${tienda.handle}/vivo`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-vivo px-4 py-3 text-center font-extrabold text-white"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-white motion-safe:animate-pulse" />
          Está en vivo · Entrar a la sala
        </Link>
      )}
      {tienda.live_schedule_note && (
        <p className="rounded-xl bg-codigo/30 p-3 text-sm">📅 Suele estar en vivo <b>{tienda.live_schedule_note}</b></p>
      )}
      <ul aria-label="Formas de entrega" className="flex flex-wrap gap-2">
        {resumenEntregas(opciones, tienda.zone).map((t) => (
          <li key={t} className="rounded-full bg-secondary px-3 py-1 text-sm">{t}</li>
        ))}
      </ul>
      <h2 className="text-lg font-bold">Productos</h2>
      {visibles.length === 0 ? (
        <EstadoVacio texto="Todavía no cargó productos. Mirala en su próximo vivo." />
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {visibles.map((p) => (
            <li key={p.id}>
              <Link href={`/@${tienda.handle}/p/${p.id}`} className="flex flex-col overflow-hidden rounded-xl border">
                {p.fotos[0] ? (
                  <Foto path={p.fotos[0].path} tamano="chica" alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square bg-muted" />
                )}
                <span className="p-2 text-sm">
                  <b className="block tabular-nums">{formatARS(p.price_cents)}</b>
                  {p.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TiendaPage({ params }: PageProps<"/tienda/[handle]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
