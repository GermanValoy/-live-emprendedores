import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda, obtenerProducto } from "@/lib/tiendas/datos";
import { AccionesProducto } from "./acciones-producto";

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  const producto = await obtenerProducto(supabase, tienda.id, id);
  if (!producto) notFound();
  return <AccionesProducto storeId={tienda.id} producto={producto} />;
}

export default function EditarProductoPage({ params }: PageProps<"/mi-puesto/productos/[id]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Editar producto</h1>
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
