import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { Foto } from "@/components/fotos/foto";
import { buttonVariants } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/server";
import { listarProductos, obtenerMiTienda } from "@/lib/tiendas/datos";

async function ListaProductos() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  const productos = await listarProductos(supabase, tienda.id);
  if (!productos.length) return <EstadoVacio texto="Todavía no cargaste productos." />;
  return (
    <ul className="grid grid-cols-2 gap-3">
      {productos.map((p) => (
        <li key={p.id}>
          <Link href={`/mi-puesto/productos/${p.id}`} className="flex flex-col overflow-hidden rounded-xl border">
            {p.fotos[0] ? (
              <Foto path={p.fotos[0].path} tamano="chica" alt={p.name} className="aspect-square w-full object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center bg-muted text-sm text-muted-foreground">Sin foto</div>
            )}
            <div className="flex flex-col p-2 text-sm">
              <span className="font-bold tabular-nums">{formatARS(p.price_cents)}</span>
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.visible ? `Quedan ${p.quantity}` : "Oculto"}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function MisProductosPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Mis productos</h1>
        <Link href="/mi-puesto/productos/nuevo" className={buttonVariants()}>＋ Producto</Link>
      </div>
      <Suspense>
        <ListaProductos />
      </Suspense>
    </main>
  );
}
