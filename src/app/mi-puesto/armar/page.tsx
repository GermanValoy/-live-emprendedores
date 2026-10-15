import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerDatosPrivados, obtenerEntregas, obtenerMiTienda } from "@/lib/tiendas/datos";
import { Pasos } from "./pasos";

async function Contenido() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  if (tienda.onboarding_step >= 5) redirect("/mi-puesto");
  const [privados, opciones] = await Promise.all([obtenerDatosPrivados(supabase, tienda.id), obtenerEntregas(supabase, tienda.id)]);
  return <Pasos tienda={tienda} privados={privados} opciones={opciones} />;
}

export default function ArmarPuestoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido />
      </Suspense>
    </main>
  );
}
