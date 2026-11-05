"use client";

import { type FormEvent, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { borrarMensaje, silenciarEnSala } from "@/app/mi-puesto/vivo/acciones";
import { Burbuja } from "@/components/chat/burbuja";
import { PanelModerar } from "@/components/chat/panel-moderar";
import { useChat } from "@/components/chat/use-chat";
import { largoVisible } from "@/lib/chat/moderar";
import type { ConfigChat, MensajeChat } from "@/lib/chat/tipos";
import { alServidor } from "@/lib/red";

type Props = {
  vivo: { id: string; storeId: string };
  inicial: MensajeChat[];
  config: ConfigChat;
  userId: string;
  /** Cuánto subir el chat para dejar libres los botones de abajo. */
  claseBase?: string;
};

const AVISAR_DESDE_QUEDAN = 20;

/** Chat de la feriante sobre su cámara. Tocar el mensaje de otra persona abre la moderación. */
export function ChatEstudio({ vivo, inicial, config, userId, claseBase }: Props) {
  const { mensajes, enviar, reintentar, silencio, aviso, canalListo } = useChat(vivo, inicial, null, userId);
  const [texto, setTexto] = useState("");
  const [moderando, setModerando] = useState<{ id: string; userId: string; nombre: string } | null>(null);
  const lista = useRef<HTMLUListElement>(null);
  const maximo = config.largo_maximo;
  const largo = largoVisible(texto);

  useLayoutEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;
    setTexto("");
    void enviar(limpio);
  };

  async function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>, exito: string) {
    setModerando(null);
    const r = await alServidor(accion);
    if (r.ok) toast.success(exito);
    else toast.error(r.error);
  }

  return (
    <>
      <div
        data-chat={canalListo ? "listo" : "conectando"}
        className={`pointer-events-none absolute inset-x-0 z-10 flex flex-col gap-2 pr-24 pl-3 ${claseBase ?? ""}`}
      >
        <ul
          ref={lista}
          aria-label="Chat del vivo"
          className="pointer-events-none flex max-h-[25dvh] flex-col gap-1.5 overflow-y-auto pt-8 [mask-image:linear-gradient(to_bottom,transparent,black_2rem)]"
        >
          {mensajes.map((m) => (
            <Burbuja
              key={m.id}
              mensaje={m}
              pendiente={m.estado === "pendiente"}
              error={m.estado === "error"}
              alTocar={
                m.estado === "error"
                  ? () => void reintentar(m.id)
                  : m.user_id !== userId && m.estado === "ok"
                    ? () => setModerando({ id: m.id, userId: m.user_id, nombre: m.author_name })
                    : undefined
              }
            />
          ))}
        </ul>

        {aviso && (
          <p role="status" className="pointer-events-auto w-fit rounded-full bg-black/65 px-4 py-2 text-sm font-bold backdrop-blur">
            {aviso}
          </p>
        )}

        {silencio ? (
          <p role="status" className="pointer-events-auto flex min-h-11 items-center rounded-full bg-black/55 px-4 text-sm font-bold backdrop-blur">
            No podés escribir en esta sala.
          </p>
        ) : (
          <form onSubmit={alEnviar} className="pointer-events-auto flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                value={texto}
                onChange={(e) => setTexto([...e.target.value].slice(0, maximo).join(""))}
                placeholder="Escribí un mensaje…"
                aria-label="Mensaje"
                autoComplete="off"
                enterKeyHint="send"
                className="h-11 w-full rounded-full bg-black/55 px-4 text-base text-white outline-none backdrop-blur placeholder:text-white/70 focus-visible:ring-3 focus-visible:ring-white/70"
              />
              {largo >= maximo - AVISAR_DESDE_QUEDAN && (
                <span aria-live="polite" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs font-bold tabular-nums text-white/80">
                  {largo}/{maximo}
                </span>
              )}
            </div>
            <button type="submit" aria-label="Enviar" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-xl text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70">
              <span aria-hidden="true">➤</span>
            </button>
          </form>
        )}
      </div>

      {moderando && (
        <PanelModerar
          nombre={moderando.nombre}
          alCerrar={() => setModerando(null)}
          alBorrar={() => void ejecutar(() => borrarMensaje(moderando.id), "Borraste el mensaje.")}
          alSilenciarTemporal={() =>
            void ejecutar(() => silenciarEnSala(vivo.storeId, moderando.userId, "temporal"), `Silenciaste a ${moderando.nombre} por 10 minutos.`)
          }
          alSilenciarSala={() =>
            void ejecutar(() => silenciarEnSala(vivo.storeId, moderando.userId, "sala"), `Silenciaste a ${moderando.nombre} en tu sala.`)
          }
        />
      )}
    </>
  );
}
