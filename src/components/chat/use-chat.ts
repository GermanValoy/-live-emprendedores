"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarMensaje } from "@/app/tienda/[handle]/vivo/acciones";
import { mensajesIniciales, miSilencio } from "@/lib/chat/datos";
import type { MensajeChat, SilencioChat } from "@/lib/chat/tipos";
import { alServidor } from "@/lib/red";
import { createClient } from "@/lib/supabase/client";

/** Cuántos mensajes se guardan en memoria. */
const MAXIMO_EN_MEMORIA = 100;
/** Cuántos se piden al reconectar el canal. */
const AL_RECONECTAR = 50;
/** Cada cuánto se revisa si un silencio ya venció o se levantó. */
const REVISAR_SILENCIO_MS = 30_000;
const AVISO_MS = 6_000;

export const AVISO_RAFAGA = "Esperá un ratito para volver a escribir.";

/** Un mensaje en pantalla: el del servidor ("ok") o uno propio que todavía se está enviando o falló. */
export type ItemChat = MensajeChat & { estado: "ok" | "pendiente" | "error" };

/** Une los del servidor (ordenados por hora, sin repetir) y deja al final los propios sin confirmar. */
function juntar(lista: ItemChat[], nuevos: MensajeChat[]): ItemChat[] {
  const porId = new Map(lista.map((i) => [i.id, i]));
  for (const m of nuevos) if (!porId.has(m.id)) porId.set(m.id, { ...m, estado: "ok" });
  const todos = [...porId.values()];
  const firmes = todos
    .filter((i) => i.estado === "ok")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const sueltos = todos.filter((i) => i.estado !== "ok");
  return [...firmes.slice(-MAXIMO_EN_MEMORIA), ...sueltos];
}

/** Lo que ve la compradora del chat del vivo: mensajes al día por Realtime, envío propio y silencio. */
export function useChat(
  vivo: { id: string; storeId: string } | null,
  inicial: MensajeChat[],
  silencioInicial: SilencioChat,
  userId: string | null,
) {
  const [supabase] = useState(createClient);
  const [mensajes, setMensajes] = useState<ItemChat[]>(() => juntar([], inicial.filter((m) => m.live_session_id === vivo?.id)));
  const [silencio, setSilencio] = useState<SilencioChat>(silencioInicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [canalListo, setCanalListo] = useState(false);
  const vivoId = vivo?.id ?? null;
  const storeId = vivo?.storeId ?? null;
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarAviso = useCallback((texto: string) => {
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    setAviso(texto);
    avisoTimer.current = setTimeout(() => setAviso(null), AVISO_MS);
  }, []);
  useEffect(
    () => () => {
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
    },
    [],
  );

  // Mensajes del vivo: llegan nuevos (INSERT) o cambian (UPDATE: borrado o escondido).
  useEffect(() => {
    if (!vivoId) return;
    const recibir = (m: MensajeChat) => {
      setMensajes((actual) => {
        // Borrado, o escondido y de otra persona: sale de la lista.
        if (m.deleted_at || (m.hidden_reason && m.user_id !== userId)) return actual.filter((i) => i.id !== m.id);
        // Mi propio mensaje puede llegar por el canal antes que la respuesta del envío: se saca el pendiente igual.
        let base = actual;
        if (m.user_id === userId) {
          const k = actual.findIndex((x) => x.estado === "pendiente" && x.body === m.body);
          if (k >= 0) base = actual.filter((_, j) => j !== k);
        }
        if (base.some((i) => i.id === m.id)) return juntar(base.map((i) => (i.id === m.id ? { ...m, estado: "ok" as const } : i)), []);
        return juntar(base, [m]);
      });
    };
    // Lo que llegó mientras el canal se conectaba no viene por el canal: se lee una vez.
    const releer = async () => {
      const ultimos = await mensajesIniciales(supabase, vivoId, AL_RECONECTAR);
      setMensajes((actual) => juntar(actual, ultimos));
    };
    const filtro = { schema: "public", table: "chat_messages", filter: `live_session_id=eq.${vivoId}` } as const;
    let canal = supabase
      // Nombre único y wait: igual que el canal de la sala (sin huecos entre la conexión y la escucha).
      .channel(`chat:${vivoId}:${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "INSERT", ...filtro }, (c) => recibir(c.new as MensajeChat))
      .on("postgres_changes", { event: "UPDATE", ...filtro }, (c) => recibir(c.new as MensajeChat));
    if (userId && storeId) {
      const revisar = () =>
        void miSilencio(supabase, storeId, userId)
          .then(setSilencio)
          .catch((e: unknown) => console.error("Chat: leer el silencio", e));
      const silencios = { schema: "public", table: "chat_silences", filter: `user_id=eq.${userId}` } as const;
      canal = canal
        .on("postgres_changes", { event: "INSERT", ...silencios }, revisar)
        .on("postgres_changes", { event: "UPDATE", ...silencios }, revisar);
    }
    canal.subscribe((estadoCanal, error) => {
      setCanalListo(estadoCanal === "SUBSCRIBED");
      if (estadoCanal === "SUBSCRIBED") void releer().catch((e: unknown) => console.error("Chat: leer los mensajes al conectar", e));
      else if (estadoCanal === "CHANNEL_ERROR") console.error("Chat: falló el canal", error);
    });
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, vivoId, storeId, userId]);

  // Un silencio temporal vence solo (o la feriante lo levanta): se revisa de vez en cuando.
  useEffect(() => {
    if (!silencio || !userId || !storeId) return;
    const t = setInterval(() => {
      void miSilencio(supabase, storeId, userId)
        .then(setSilencio)
        .catch(() => undefined);
    }, REVISAR_SILENCIO_MS);
    return () => clearInterval(t);
  }, [supabase, silencio, userId, storeId]);

  const intentar = useCallback(
    async (idLocal: string, texto: string) => {
      if (!vivoId) return;
      const r = await alServidor(() => enviarMensaje(vivoId, texto));
      const fallo = () => setMensajes((a) => a.map((i) => (i.id === idLocal ? { ...i, estado: "error" as const } : i)));
      if (r.ok) {
        // Se reemplaza lo pendiente por el mensaje del servidor (sin duplicarlo si ya llegó por el canal).
        setMensajes((a) => juntar(a.filter((i) => i.id !== idLocal), [r.mensaje]));
        return;
      }
      // Sin respuesta del servidor (se cortó la conexión) o error del servidor: queda para reintentar.
      if (!("motivo" in r) || r.motivo === "error") return fallo();
      // El vivo terminó, ráfaga, silencio o texto inválido: no tiene sentido reintentar.
      setMensajes((a) => a.filter((i) => i.id !== idLocal));
      if (r.motivo === "rafaga") mostrarAviso(AVISO_RAFAGA);
      else if (r.motivo === "silenciada") setSilencio(r.silencio ?? "temporal");
      else if (r.motivo === "cerrado") mostrarAviso("El vivo terminó.");
      else if (r.motivo === "sin_sesion") mostrarAviso("Entrá con Google para escribir.");
      else mostrarAviso("No se pudo enviar ese mensaje.");
    },
    [vivoId, mostrarAviso],
  );

  const enviar = useCallback(
    async (texto: string) => {
      if (!vivoId || !userId) return;
      const idLocal = crypto.randomUUID();
      const propio: ItemChat = {
        id: idLocal,
        live_session_id: vivoId,
        user_id: userId,
        author_name: "Vos",
        body: texto,
        is_seller: false,
        hidden_reason: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        estado: "pendiente",
      };
      setAviso(null);
      setMensajes((a) => [...a, propio]);
      await intentar(idLocal, texto);
    },
    [vivoId, userId, intentar],
  );

  const reintentar = useCallback(
    async (idLocal: string) => {
      const item = mensajes.find((i) => i.id === idLocal && i.estado === "error");
      if (!item) return;
      setMensajes((a) => a.map((i) => (i.id === idLocal ? { ...i, estado: "pendiente" as const } : i)));
      await intentar(idLocal, item.body);
    },
    [mensajes, intentar],
  );

  return { mensajes, enviar, reintentar, silencio, aviso, canalListo };
}
