import { NextResponse } from "next/server";
import { z } from "zod";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";

const cuerpoSchema = z.object({
  vivoId: z.string().uuid(),
  dispositivo: z.string().uuid(),
  fuera: z.boolean(),
  silenciada: z.boolean(),
  mirando: z.number().int().min(0).max(100000),
});

/** Señal de vida del vivo: la dueña avisa que sigue transmitiendo. */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!(await obtenerUsuarioId(supabase))) return NextResponse.json({ error: "sin_sesion" }, { status: 401 });

  const cuerpo = cuerpoSchema.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const d = cuerpo.data;

  const { data, error } = await supabase.rpc("senal_vivo", {
    p_vivo: d.vivoId, p_device: d.dispositivo, p_fuera: d.fuera, p_silenciada: d.silenciada, p_mirando: d.mirando,
  });
  if (error) {
    if (error.message.includes("sin_permiso")) return NextResponse.json({ error: "sin_permiso" }, { status: 403 });
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
  return NextResponse.json({ resultado: data });
}
