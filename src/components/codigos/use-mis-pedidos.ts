"use client";

import { useEffect, useState } from "react";
import { CAMPOS_PEDIDO, type Pedido } from "@/lib/codigos/tipos";
import { createClient } from "@/lib/supabase/client";

const masNuevoPrimero = (a: Pedido, b: Pedido) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);

/** Los pedidos de la compradora (el más nuevo primero), al día por Realtime. Sin sesión: lista vacía. */
export function useMisPedidos(userId: string | null): Pedido[] {
  const [supabase] = useState(createClient);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cerrando = false;
    const juntar = (p: Pedido) => setPedidos((actual) => [...actual.filter((x) => x.id !== p.id), p].sort(masNuevoPrimero));
    const releer = async () => {
      const { data, error } = await supabase.from("orders").select(CAMPOS_PEDIDO).eq("buyer_id", userId).order("created_at", { ascending: false });
      if (error) { console.error("Leer mis pedidos", error); return; }
      if (!cerrando) setPedidos((data as Pedido[]).sort(masNuevoPrimero));
    };
    const canal = supabase
      .channel(`pedidos:${userId}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${userId}` }, (cambio) => {
        if (cambio.eventType === "DELETE") return;
        juntar(cambio.new as Pedido);
      })
      .subscribe((estado, errorCanal) => {
        // Lo que cambió mientras el canal se conectaba no llega por el canal: se lee una vez.
        if (estado === "SUBSCRIBED") void releer();
        else if (estado === "CHANNEL_ERROR") console.error("Pedidos: falló el canal", errorCanal);
      });
    return () => { cerrando = true; void supabase.removeChannel(canal); };
  }, [supabase, userId]);

  return userId ? pedidos : [];
}
