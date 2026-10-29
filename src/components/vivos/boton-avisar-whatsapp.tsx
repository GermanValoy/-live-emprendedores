"use client";

import { cn } from "cn";
import { linkSala, linkWhatsapp, mensajeAviso } from "@/lib/vivos/whatsapp";

/** Abre WhatsApp con el aviso del vivo listo para mandar (ella elige a quién). */
export function BotonAvisarWhatsapp({
  handle, momento, className,
}: { handle: string; momento: "antes" | "durante"; className?: string }) {
  const abrir = () => {
    const texto = mensajeAviso(momento, linkSala(window.location.origin, handle));
    window.open(linkWhatsapp(texto), "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={abrir}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#1fa855] px-4 text-sm font-bold text-white outline-none transition-[scale] duration-(--duracion-instant) ease-out focus-visible:ring-3 focus-visible:ring-white/70 motion-safe:active:scale-[0.97]",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 fill-current">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
      </svg>
      Avisar por WhatsApp
    </button>
  );
}
