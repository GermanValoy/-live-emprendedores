import { cn } from "cn";
import type { MensajeChat } from "@/lib/chat/tipos";

type Props = {
  mensaje: MensajeChat;
  /** Mi mensaje, todavía enviándose. */
  pendiente?: boolean;
  /** Mi mensaje, que no salió: se toca para reintentar. */
  error?: boolean;
  /** Si hay, la burbuja es un botón (el estudio la usa para moderar). */
  alTocar?: () => void;
};

/** Un mensaje del chat sobre el video. No se anima: aparece y listo. */
export function Burbuja({ mensaje, pendiente, error, alTocar }: Props) {
  const contenido = (
    <>
      <b className={cn("font-extrabold", mensaje.is_seller && "text-accent")}>
        {mensaje.author_name}
        {mensaje.is_seller && <span aria-label="del puesto"> ✔</span>}
      </b>{" "}
      <span className="wrap-anywhere">{mensaje.body}</span>
    </>
  );
  const caja = cn(
    "pointer-events-auto w-fit max-w-[88%] rounded-2xl bg-black/50 px-3 py-1.5 text-left text-sm leading-snug backdrop-blur",
    pendiente && "opacity-60",
    error && "ring-1 ring-red-400",
  );
  return (
    <li data-testid="burbuja" className="flex flex-col items-start gap-1">
      {alTocar && !error ? (
        <button type="button" onClick={alTocar} className={cn(caja, "min-h-11 outline-none focus-visible:ring-3 focus-visible:ring-white/70")}>
          {contenido}
        </button>
      ) : (
        <p className={caja}>{contenido}</p>
      )}
      {error && alTocar && (
        <button
          type="button"
          onClick={alTocar}
          className="pointer-events-auto min-h-11 rounded-full bg-white px-4 text-sm font-extrabold text-primary outline-none focus-visible:ring-3 focus-visible:ring-white/70"
        >
          Reintentar
        </button>
      )}
    </li>
  );
}
