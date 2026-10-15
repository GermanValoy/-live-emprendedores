import { connection } from "next/server";
import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";

async function ContenidoSeguidos() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) {
    return (
      <EstadoVacio
        texto="Entrá con Google para ver los puestos que seguís."
        accion={
          <form action={entrarConGoogle}>
            <input type="hidden" name="next" value="/seguidos" />
            <Button type="submit">Entrar con Google</Button>
          </form>
        }
      />
    );
  }
  return <EstadoVacio texto="Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten." />;
}

export default function SeguidosPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Seguidos</h1>
      <Suspense>
        <ContenidoSeguidos />
      </Suspense>
    </main>
  );
}
