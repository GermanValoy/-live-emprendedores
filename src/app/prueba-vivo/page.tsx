import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { ErrorCloudflare, obtenerOCrearTransmision, type UrlsTransmision } from "@/lib/vivos/cloudflare";
import { credencialesCloudflare } from "@/lib/vivos/config";
import { PruebaVivo } from "./prueba-vivo";

export const metadata: Metadata = { title: "Prueba de transmisión · Tu Feria Live", robots: { index: false, follow: false } };

async function ContenidoPrueba() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) notFound();
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) notFound();

  let urls: UrlsTransmision;
  try {
    urls = await obtenerOCrearTransmision("prueba-vivo", credencialesCloudflare());
  } catch (error) {
    if (!(error instanceof ErrorCloudflare)) throw error;
    return <p className="text-destructive">No se pudo preparar la transmisión de prueba: {error.message}</p>;
  }
  return <PruebaVivo urlTransmitir={urls.urlTransmitir} urlMirar={urls.urlMirar} />;
}

export default function PruebaVivoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Prueba de transmisión</h1>
      <Suspense>
        <ContenidoPrueba />
      </Suspense>
    </main>
  );
}
