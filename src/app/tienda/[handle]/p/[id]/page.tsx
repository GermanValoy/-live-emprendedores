import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { Foto } from "@/components/fotos/foto";
import { buttonVariants } from "@/components/ui/button";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/server";
import { obtenerProducto, obtenerTiendaPorHandle } from "@/lib/tiendas/datos";
import { handleDeRuta } from "@/lib/tiendas/validacion";

async function Contenido({ params }: { params: Promise<{ handle: string; id: string }> }) {
  await connection();
  const { handle, id } = await params;
  const supabase = await createClient();
  const handleTienda = handleDeRuta(handle);
  const tienda = handleTienda ? await obtenerTiendaPorHandle(supabase, handleTienda) : null;
  const producto = tienda ? await obtenerProducto(supabase, tienda.id, id) : null;
  if (!tienda || !producto || !producto.visible) {
    return <EstadoVacio texto="No encontramos este producto." accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>} />;
  }
  return (
    <>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
        {producto.fotos.length ? (
          producto.fotos.map((f, i) => (
            <Foto key={f.id} path={f.path} tamano="grande" alt={`${producto.name}, foto ${i + 1}`} className="aspect-[3/4] w-[85%] shrink-0 snap-center rounded-2xl object-cover" />
          ))
        ) : (
          <div className="aspect-[3/4] w-full rounded-2xl bg-muted" />
        )}
      </div>
      <h1 className="text-2xl font-extrabold">{producto.name}</h1>
      <p className="text-2xl font-extrabold tabular-nums">{formatARS(producto.price_cents)}</p>
      {producto.description && <p>{producto.description}</p>}
      <p className="text-sm text-muted-foreground">{producto.quantity > 0 ? `Quedan ${producto.quantity}` : "Agotado"}</p>
      <p className="rounded-xl bg-accent p-3 text-sm">Se compra en los vivos de {tienda.name}, con el código que dice en el momento.</p>
      <Link href={`/@${tienda.handle}`} className={buttonVariants({ variant: "secondary" })}>Ver el puesto</Link>
    </>
  );
}

export default function ProductoPage({ params }: PageProps<"/tienda/[handle]/p/[id]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
