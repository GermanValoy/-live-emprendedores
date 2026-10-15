import { connection } from "next/server";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import { BarraInferior } from "./barra-inferior";

export async function BarraSegunSesion() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const esFeriante = userId ? (await obtenerMiTienda(supabase, userId)) !== null : false;
  return <BarraInferior esFeriante={esFeriante} />;
}
