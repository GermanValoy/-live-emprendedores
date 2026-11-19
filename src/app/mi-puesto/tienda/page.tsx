import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerConfigCodigo } from "@/lib/codigos/config";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerDatosPrivados, obtenerEntregas, obtenerMiTienda } from "@/lib/tiendas/datos";
import { SeccionesMiTienda } from "./secciones";

async function Contenido() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  const [privados, opciones, plazo, config] = await Promise.all([
    obtenerDatosPrivados(supabase, tienda.id),
    obtenerEntregas(supabase, tienda.id),
    supabase.from("stores").select("payment_minutes").eq("id", tienda.id).maybeSingle(),
    obtenerConfigCodigo(),
  ]);
  return <SeccionesMiTienda tienda={tienda} privados={privados} opciones={opciones} plazo={(plazo.data?.payment_minutes as number | null) ?? null} plazoGeneral={config.plazo_minutos} />;
}

export default function MiTiendaPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <h1 className="text-2xl font-extrabold">Mi tienda</h1>
      <Suspense>
        <Contenido />
      </Suspense>
    </main>
  );
}
