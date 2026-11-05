"use client";

import { type FormEvent, useLayoutEffect, useRef, useState } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { Burbuja } from "@/components/chat/burbuja";
import { useChat } from "@/components/chat/use-chat";
import { largoVisible } from "@/lib/chat/moderar";
import type { ConfigChat, MensajeChat, SilencioChat } from "@/lib/chat/tipos";

type Props = {
  vivo: { id: string; storeId: string };
  inicial: MensajeChat[];
  silencioInicial: SilencioChat;
  config: ConfigChat;
  userId: string | null;
  handle: string;
};

/** Cuántos caracteres antes del máximo aparece el contador. */
const AVISAR_DESDE_QUEDAN = 20;

const BOTON_ROUND =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-black/55 text-xl outline-none backdrop-blur focus-visible:ring-3 focus-visible:ring-white/70";

/** El chat sobre el video: burbujas abajo, campo para escribir y botón para esconderlo. */
export function ChatSala({ vivo, inicial, silencioInicial, config, userId, handle }: Props) {
  const { mensajes, enviar, reintentar, silencio, aviso, canalListo } = useChat(vivo, inicial, silencioInicial, userId);
  const [visible, setVisible] = useState(true);
  const [texto, setTexto] = useState("");
  const lista = useRef<HTMLUListElement>(null);
  const maximo = config.largo_maximo;
  const largo = largoVisible(texto);

  // Siempre se ve lo último.
  useLayoutEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, visible]);

  const alCambiar = (valor: string) => setTexto([...valor].slice(0, maximo).join(""));

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;
    setTexto("");
    void enviar(limpio);
  };

  return (
    <div data-chat={canalListo ? "listo" : "conectando"} className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      {visible && (
        <ul
          ref={lista}
          aria-label="Chat del vivo"
          className="pointer-events-none flex max-h-[33dvh] flex-col gap-1.5 overflow-y-auto pt-8 [mask-image:linear-gradient(to_bottom,transparent,black_2rem)]"
        >
          {mensajes.map((m) => (
            <Burbuja
              key={m.id}
              mensaje={m}
              pendiente={m.estado === "pendiente"}
              error={m.estado === "error"}
              alTocar={m.estado === "error" ? () => void reintentar(m.id) : undefined}
            />
          ))}
        </ul>
      )}

      {aviso && (
        <p role="status" className="w-fit rounded-full bg-black/65 px-4 py-2 text-sm font-bold backdrop-blur">
          {aviso}
        </p>
      )}

      <div className="flex items-center gap-2">
        {visible && (
          <div className="min-w-0 flex-1">
            {!userId ? (
              <form action={entrarConGoogle}>
                <input type="hidden" name="next" value={`/@${handle}/vivo`} />
                <button
                  type="submit"
                  className="min-h-11 w-full rounded-full bg-white px-4 text-base font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70"
                >
                  Entrá con Google para escribir
                </button>
              </form>
            ) : silencio ? (
              <p role="status" className="flex min-h-11 items-center rounded-full bg-black/55 px-4 text-sm font-bold backdrop-blur">
                {silencio === "temporal" ? "No podés escribir en este vivo por un rato." : "No podés escribir en esta sala."}
              </p>
            ) : (
              <form onSubmit={alEnviar} className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={texto}
                    onChange={(e) => alCambiar(e.target.value)}
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
        )}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Esconder el chat" : "Mostrar el chat"}
          aria-pressed={!visible}
          className={`${BOTON_ROUND} ${visible ? "" : "ml-auto"}`}
        >
          <span aria-hidden="true">💬</span>
        </button>
      </div>
    </div>
  );
}
