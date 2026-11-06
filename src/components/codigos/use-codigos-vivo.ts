"use client";

import { useCallback, useEffect, useState } from "react";
import { CAMPOS_CODIGO, type Codigo } from "@/lib/codigos/tipos";
import { createClient } from "@/lib/supabase/client";

const porFecha = (a: Codigo, b: Codigo) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

function juntar(lista: Codigo[], c: Codigo): Codigo[] {
  return [...lista.filter((x) => x.id !== c.id), c].sort(porFecha);
}

/** Los códigos de un vivo, al día por Realtime. `activo` es el último que sigue activo. */
export function useCodigosVivo(vivoId: string, inicial: Codigo[]): { activo: Codigo | null; codigos: Codigo[]; releer(): Promise<void> } {
  const [supabase] = useState(createClient);
  const [codigos, setCodigos] = useState<Codigo[]>(() => inicial.filter((c) => c.live_session_id === vivoId).sort(porFecha));

  const releer = useCallback(async () => {
    const { data, error } = await supabase.from("live_codes").select(CAMPOS_CODIGO).eq("live_session_id", vivoId).order("created_at");
    if (error) { console.error("Leer los códigos del vivo", error); return; }
    setCodigos((data as Codigo[]).sort(porFecha));
  }, [supabase, vivoId]);

  useEffect(() => {
    let cerrando = false;
    const canal = supabase
      .channel(`codigos:${vivoId}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_codes", filter: `live_session_id=eq.${vivoId}` },
        (cambio) => {
          if (cambio.eventType === "DELETE") return;
          setCodigos((actual) => juntar(actual, cambio.new as Codigo));
        })
      .subscribe((estado, errorCanal) => {
        // Lo que cambió mientras el canal se conectaba no llega por el canal: se lee una vez.
        if (estado === "SUBSCRIBED") void releer();
        else if (estado === "CHANNEL_ERROR") console.error("Códigos: falló el canal", errorCanal);
        else if (estado === "CLOSED" && !cerrando) console.error("Códigos: se cerró el canal");
      });
    return () => { cerrando = true; void supabase.removeChannel(canal); };
  }, [supabase, vivoId, releer]);

  const activo = [...codigos].reverse().find((c) => c.status === "activo") ?? null;
  return { activo, codigos, releer };
}
