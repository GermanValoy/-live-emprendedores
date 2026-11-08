"use client";

import { useEffect, useState } from "react";
import { CAMPOS_PEDIDO, type Pedido } from "@/lib/codigos/tipos";
import { createClient } from "@/lib/supabase/client";

export type CodigoDePedido = { label: string; photo_path: string | null };
export type VivoDePedido = { started_at: string };

const masNuevoPrimero = (a: Pedido, b: Pedido) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);

/**
 * Los pedidos de un puesto (el más nuevo primero), al día por Realtime, con el código de cada uno
 * y la hora de cada vivo. Con `vivoId`, solo los de ese vivo.
 */
export function usePedidosPuesto(storeId: string, vivoId?: string) {
  const [supabase] = useState(createClient);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [codigos, setCodigos] = useState<Record<string, CodigoDePedido>>({});
  const [vivos, setVivos] = useState<Record<string, VivoDePedido>>({});
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let cerrando = false;
    const juntar = (p: Pedido) => setPedidos((actual) => [...actual.filter((x) => x.id !== p.id), p].sort(masNuevoPrimero));
    const releer = async () => {
      let q = supabase.from("orders").select(CAMPOS_PEDIDO).eq("store_id", storeId).order("created_at", { ascending: false }).limit(200);
      if (vivoId) q = q.eq("live_session_id", vivoId);
      const { data, error } = await q;
      if (error) { console.error("Leer los pedidos del puesto", error); return; }
      if (!cerrando) { setPedidos((data as Pedido[]).sort(masNuevoPrimero)); setCargado(true); }
    };
    const canal = supabase
      .channel(`pedidos-puesto:${storeId}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, (cambio) => {
        if (cambio.eventType === "DELETE") return;
        const p = cambio.new as Pedido;
        if (!vivoId || p.live_session_id === vivoId) juntar(p);
      })
      .subscribe((estado, errorCanal) => {
        // Lo que cambió mientras el canal se conectaba no llega por el canal: se lee una vez.
        if (estado === "SUBSCRIBED") void releer();
        else if (estado === "CHANNEL_ERROR") console.error("Pedidos del puesto: falló el canal", errorCanal);
      });
    return () => { cerrando = true; void supabase.removeChannel(canal); };
  }, [supabase, storeId, vivoId]);

  // Los códigos y los vivos que todavía no se conocen se piden una vez (la dueña lee los suyos).
  const claveCodigos = [...new Set(pedidos.map((p) => p.code_id).filter((id) => !codigos[id]))].join(",");
  const claveVivos = [...new Set(pedidos.map((p) => p.live_session_id).filter((id) => !vivos[id]))].join(",");
  useEffect(() => {
    if (!claveCodigos) return;
    let cancelado = false;
    void supabase.from("live_codes").select("id, label, photo_path").in("id", claveCodigos.split(",")).then(({ data, error }) => {
      if (error) { console.error("Leer los códigos de los pedidos", error); return; }
      if (cancelado) return;
      setCodigos((a) => ({
        ...a,
        ...Object.fromEntries((data ?? []).map((c) => [c.id as string, { label: c.label as string, photo_path: c.photo_path as string | null }])),
      }));
    });
    return () => { cancelado = true; };
  }, [supabase, claveCodigos]);
  useEffect(() => {
    if (!claveVivos) return;
    let cancelado = false;
    void supabase.from("live_sessions").select("id, started_at").in("id", claveVivos.split(",")).then(({ data, error }) => {
      if (error) { console.error("Leer los vivos de los pedidos", error); return; }
      if (cancelado) return;
      setVivos((a) => ({ ...a, ...Object.fromEntries((data ?? []).map((v) => [v.id as string, { started_at: v.started_at as string }])) }));
    });
    return () => { cancelado = true; };
  }, [supabase, claveVivos]);

  return { pedidos, codigos, vivos, cargado };
}
