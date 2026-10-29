import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { formatFechaTucuman } from "@/lib/format/fecha";
import { createClient } from "@/lib/supabase/server";
import { listarVivosAbiertos } from "@/lib/vivos/datos";
import { PanelVivos } from "./panel-vivos";
import { type FilaInvitacion, PanelInvitaciones } from "./panel-invitaciones";

export const metadata: Metadata = { title: "Administración · Tu Feria Live", robots: { index: false, follow: false } };

type Fila = {
  id: string; note: string | null; created_at: string; expires_at: string;
  used_at: string | null; revoked_at: string | null; used_by: string | null;
};

function estadoDe(f: Fila): FilaInvitacion["estado"] {
  if (f.revoked_at) return "Anulada";
  if (f.used_at) return "Usada";
  if (new Date(f.expires_at) < new Date()) return "Vencida";
  return "Pendiente";
}

async function ContenidoAdmin() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) notFound();
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) notFound();

  const vivosAbiertos = await listarVivosAbiertos(supabase);
  const vivos = vivosAbiertos.map(({ vivo, puesto }) => ({
    id: vivo.id,
    handle: puesto.handle,
    name: puesto.name,
    desde: formatFechaTucuman(vivo.started_at),
    viewers: vivo.viewers,
  }));

  const { data } = await supabase
    .from("invitations")
    .select("id, note, created_at, expires_at, used_at, revoked_at, used_by")
    .order("created_at", { ascending: false })
    .limit(100);
  const invitaciones = (data as Fila[] | null) ?? [];
  const usuarias = invitaciones.flatMap((f) => (f.used_by ? [f.used_by] : []));
  const { data: tiendas } = usuarias.length
    ? await supabase.from("stores").select("owner_id, handle").in("owner_id", usuarias)
    : { data: [] };
  const handlePorDuena = new Map(((tiendas as { owner_id: string; handle: string }[] | null) ?? []).map((t) => [t.owner_id, t.handle]));

  const filas: FilaInvitacion[] = invitaciones.map((f) => ({
    id: f.id,
    note: f.note,
    estado: estadoDe(f),
    usadaPor: f.used_by ? (handlePorDuena.get(f.used_by) ?? null) : null,
    creada: formatFechaTucuman(f.created_at),
  }));

  return (
    <>
      <h1 className="sr-only">Administración</h1>
      <PanelVivos vivos={vivos} />
      <h2 className="text-2xl font-extrabold">Invitaciones</h2>
      <PanelInvitaciones filas={filas} />
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <ContenidoAdmin />
      </Suspense>
    </main>
  );
}
