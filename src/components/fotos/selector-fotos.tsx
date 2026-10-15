"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { urlFoto } from "@/lib/fotos/rutas";

export type ItemFoto = { tipo: "existente"; path: string } | { tipo: "nueva"; archivo: File; vista: string };

export function SelectorFotos({
  inicial, maximo, alCambiar, etiqueta = "Fotos",
}: { inicial: string[]; maximo: number; alCambiar: (items: ItemFoto[]) => void; etiqueta?: string }) {
  const [items, setItems] = useState<ItemFoto[]>(inicial.map((path) => ({ tipo: "existente", path })));
  const [aviso, setAviso] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => alCambiar(items), [items, alCambiar]);

  const agregar = (archivos: FileList | null) => {
    if (!archivos) return;
    const nuevas = Array.from(archivos).map((archivo) => ({ tipo: "nueva" as const, archivo, vista: URL.createObjectURL(archivo) }));
    setItems((actuales) => {
      if (actuales.length + nuevas.length > maximo) setAviso(`Podés subir hasta ${maximo} fotos por producto.`);
      else setAviso(null);
      return [...actuales, ...nuevas].slice(0, maximo);
    });
    if (input.current) input.current.value = "";
  };

  const mover = (i: number) =>
    setItems((a) => {
      const copia = [...a];
      [copia[i - 1], copia[i]] = [copia[i]!, copia[i - 1]!];
      return copia;
    });

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="fotos" className="font-semibold">{etiqueta}</label>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, i) => (
          <div key={item.tipo === "existente" ? item.path : item.vista} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.tipo === "existente" ? urlFoto(item.path, "chica") : item.vista} alt={`Foto ${i + 1}`} className="size-full object-cover" />
            <button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => setItems((a) => a.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-foreground/70 text-background">
              <X className="size-4" />
            </button>
            {i > 0 && (
              <button type="button" aria-label={`Mover foto ${i + 1} antes`} onClick={() => mover(i)}
                className="absolute bottom-1 left-1 grid size-7 place-items-center rounded-full bg-foreground/70 text-background">
                <ArrowLeft className="size-4" />
              </button>
            )}
          </div>
        ))}
        {items.length < maximo && (
          <button type="button" aria-label="Agregar foto" onClick={() => input.current?.click()}
            className="grid aspect-square min-h-11 place-items-center rounded-xl border-2 border-dashed text-2xl text-muted-foreground">
            ＋
          </button>
        )}
      </div>
      <input ref={input} id="fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple={maximo > 1}
        className="sr-only" onChange={(e) => agregar(e.target.files)} />
      {aviso && <p role="alert" className="text-sm font-semibold text-destructive">{aviso}</p>}
    </div>
  );
}
