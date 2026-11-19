import { connection } from "next/server";
import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { ListaMisCompras, type CodigoDeCompra, type PuestoDeCompra } from "@/components/codigos/lista-mis-compras";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { CAMPOS_PEDIDO, type Pedido } from "@/lib/codigos/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { obtenerEntregas } from "@/lib/tiendas/datos";

async function ContenidoMisCompras() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) {
    return (
      <EstadoVacio
        texto="Entrá con Google para ver tus compras."
        accion={
          <form action={entrarConGoogle}>
            <input type="hidden" name="next" value="/mis-compras" />
            <Button type="submit">Entrar con Google</Button>
          </form>
        }
      />
    );
  }

  const { data } = await supabase.from("orders").select(CAMPOS_PEDIDO).eq("buyer_id", userId).order("created_at", { ascending: false });
  const pedidos = (data as Pedido[] | null) ?? [];

  // La compradora no puede leer los códigos de un vivo ya cerrado: se leen acá, solo los de SUS pedidos y solo nombre y foto.
  const codigos: Record<string, CodigoDeCompra> = {};
  const idsCodigos = [...new Set(pedidos.map((p) => p.code_id))];
  if (idsCodigos.length > 0) {
    const { data: filas } = await createAdminClient().from("live_codes").select("id, label, photo_path").in("id", idsCodigos);
    for (const c of filas ?? []) codigos[c.id as string] = { label: c.label as string, photo_path: (c.photo_path as string | null) ?? null };
  }

  const puestos: Record<string, PuestoDeCompra> = {};
  const idsPuestos = [...new Set(pedidos.map((p) => p.store_id))];
  if (idsPuestos.length > 0) {
    const { data: tiendas } = await supabase.from("stores").select("id, name, handle, zone").in("id", idsPuestos);
    const entregas = await Promise.all((tiendas ?? []).map((t) => obtenerEntregas(supabase, t.id as string)));
    (tiendas ?? []).forEach((t, i) => {
      puestos[t.id as string] = { name: t.name as string, handle: t.handle as string, zone: t.zone as string, entregas: entregas[i] ?? [] };
    });
  }

  return <ListaMisCompras userId={userId} inicial={pedidos} codigos={codigos} puestos={puestos} />;
}

export default function MisComprasPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Mis compras</h1>
      <Suspense>
        <ContenidoMisCompras />
      </Suspense>
    </main>
  );
}
