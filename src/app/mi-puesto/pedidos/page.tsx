import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PedidosVivo } from "@/components/codigos/pedidos-vivo";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";

async function Contenido() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  return <PedidosVivo storeId={tienda.id} />;
}

export default function PedidosPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Link href="/mi-puesto" className="flex min-h-11 items-center font-semibold text-primary">← Mi puesto</Link>
      <h1 className="text-2xl font-extrabold">Pedidos</h1>
      <Suspense>
        <Contenido />
      </Suspense>
    </main>
  );
}
