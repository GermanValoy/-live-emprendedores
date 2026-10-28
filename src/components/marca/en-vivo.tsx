export function EnVivo({ chico = false }: { chico?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-vivo font-extrabold tracking-wide text-white ${chico ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"}`}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-white motion-safe:animate-pulse" />
      EN VIVO
    </span>
  );
}
