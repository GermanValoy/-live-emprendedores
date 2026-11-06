import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import type { ProductoResumen } from "@/components/codigos/panel-codigo";
import { EstadoVacio } from "@/components/estado-vacio";
import { buttonVariants } from "@/components/ui/button";
import { EstudioVivo } from "@/components/vivos/estudio-vivo";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { obtenerConfigChat } from "@/lib/chat/config";
import { mensajesIniciales } from "@/lib/chat/datos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { obtenerConfigCodigo } from "@/lib/codigos/config";
import { CAMPOS_CODIGO, type Codigo } from "@/lib/codigos/tipos";
import { listarProductos, obtenerMiTienda } from "@/lib/tiendas/datos";
import { ErrorCloudflare, type UrlsTransmision } from "@/lib/vivos/cloudflare";
import { credencialesCloudflare } from "@/lib/vivos/config";
import { obtenerConfigVivo, vivoAbiertoDe } from "@/lib/vivos/datos";
import { obtenerTransmisionDelPuesto } from "@/lib/vivos/transmision-puesto";

export const metadata: Metadata = { title: "Salir en vivo · Tu Feria Live", robots: { index: false, follow: false } };

async function ContenidoVivo() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) redirect("/");
  const tienda = await obtenerMiTienda(supabase, userId);
  if (!tienda) {
    return (
      <EstadoVacio
        titulo="Todavía no tenés un puesto."
        texto="Si querés vender en Tu Feria Live, pedí una invitación."
        accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>}
      />
    );
  }
  if (tienda.onboarding_step < 5) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <p className="font-semibold">Terminá de armar tu puesto para salir en vivo.</p>
        <Link href="/mi-puesto/armar" className={buttonVariants()}>Seguir armando</Link>
      </div>
    );
  }

  let urls: UrlsTransmision;
  try {
    // La URL para transmitir es una credencial: se lee con la llave secreta y solo llega a la dueña.
    urls = await obtenerTransmisionDelPuesto(tienda.id, { db: createAdminClient(), cred: credencialesCloudflare });
  } catch (error) {
    if (!(error instanceof ErrorCloudflare)) throw error;
    console.error("mi-puesto/vivo: transmisión", error.message);
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border p-4">
        <p className="font-semibold">No pudimos preparar la transmisión. Probá de nuevo en un rato.</p>
        {/* Link común (no de Next) para que la página se vuelva a pedir entera. */}
        <a href="/mi-puesto/vivo" className={buttonVariants()}>Probar de nuevo</a>
      </div>
    );
  }
  const [config, vivoAbierto, configChat, configCodigo] = await Promise.all([
    obtenerConfigVivo(supabase),
    vivoAbiertoDe(supabase, tienda.id),
    obtenerConfigChat(),
    obtenerConfigCodigo(),
  ]);
  // Solo los números del detector de voz: el resto de `code_config` no le hace falta al estudio.
  const configVoz = {
    umbralMinimo: Number(configCodigo.voz_umbral_minimo),
    previoMs: configCodigo.voz_previo_ms,
    silencioFinMs: configCodigo.voz_silencio_fin_ms,
    maximoMs: configCodigo.voz_maximo_ms,
    solapeMs: configCodigo.voz_solape_ms,
    minimoVozMs: configCodigo.voz_minimo_voz_ms,
  };
  const productos: ProductoResumen[] = (await listarProductos(supabase, tienda.id))
    .filter((p) => p.visible)
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      precio: p.price_cents,
      cantidad: p.quantity,
      foto: [...p.fotos].sort((a, b) => a.position - b.position)[0]?.path ?? null,
    }));
  let codigosIniciales: Codigo[] = [];
  if (vivoAbierto) {
    const { data } = await supabase.from("live_codes").select(CAMPOS_CODIGO).eq("live_session_id", vivoAbierto.id).order("created_at");
    codigosIniciales = (data as Codigo[] | null) ?? [];
  }
  const mensajes = vivoAbierto ? await mensajesIniciales(supabase, vivoAbierto.id, configChat.mensajes_al_entrar) : [];
  return (
    <EstudioVivo
      tienda={{ id: tienda.id, handle: tienda.handle, name: tienda.name }}
      urlTransmitir={urls.urlTransmitir}
      config={config}
      vivoAbierto={vivoAbierto}
      chat={{ config: configChat, mensajes, userId }}
      codigos={{ iniciales: codigosIniciales, productos, voz: configVoz }}
    />
  );
}

export default function VivoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <ContenidoVivo />
      </Suspense>
    </main>
  );
}
