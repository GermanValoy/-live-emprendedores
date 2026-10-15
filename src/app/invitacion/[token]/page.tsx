import Link from "next/link";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { Button, buttonVariants } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import { PasoTuPuesto } from "./paso-tu-puesto";

const MENSAJES: Record<string, string> = {
  vencida: "Esta invitación venció. Pedile una nueva a Tu Feria Live.",
  usada: "Esta invitación ya se usó.",
  invalida: "Esta invitación no es válida.",
};

function Mensaje({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-lg font-bold">{texto}</p>
      {children}
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) {
    return (
      <Mensaje texto="Te invitaron a abrir tu puesto en Tu Feria Live">
        <p className="text-muted-foreground">Entrá con tu cuenta de Google para empezar.</p>
        <form action={entrarConGoogle}>
          <input type="hidden" name="next" value={`/invitacion/${token}`} />
          <Button type="submit" size="lg">Entrar con Google</Button>
        </form>
      </Mensaje>
    );
  }
  if (await obtenerMiTienda(supabase, userId)) {
    return (
      <Mensaje texto="Ya tenés tu puesto.">
        <Link href="/mi-puesto" className={buttonVariants()}>Ir a Mi puesto</Link>
      </Mensaje>
    );
  }
  const { data: estado } = await supabase.rpc("estado_invitacion", { p_token: token });
  if (estado !== "valida") return <Mensaje texto={MENSAJES[String(estado)] ?? MENSAJES.invalida!} />;
  return <PasoTuPuesto token={token} />;
}

export default function InvitacionPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
