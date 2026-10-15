"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { type ItemFoto, SelectorFotos } from "@/components/fotos/selector-fotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actualizarProducto, crearProducto, type DatosProductoEntrada } from "@/app/mi-puesto/acciones";
import { ErrorDeFoto } from "@/lib/fotos/comprimir";
import { subirFoto } from "@/lib/fotos/subir";
import { formatARS } from "@/lib/format/plata";
import type { Producto } from "@/lib/tiendas/tipos";

type Props = {
  storeId: string;
  producto?: Producto;
  avanzarA?: number;
  textoBoton: string;
  alGuardar: () => void;
};

export function FormularioProducto({ storeId, producto, avanzarA, textoBoton, alGuardar }: Props) {
  const [fotos, setFotos] = useState<ItemFoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviando = useRef(false);
  // Un id por formulario: si la respuesta se pierde y se reintenta, el servidor no crea un duplicado.
  const [idNuevo] = useState(() => crypto.randomUUID());
  // Fotos ya subidas en un intento anterior: no se vuelven a subir al reintentar.
  const subidas = useRef(new Map<File, string>());
  const alCambiarFotos = useCallback((items: ItemFoto[]) => setFotos(items), []);

  const enviar = (formulario: HTMLFormElement) => {
    if (enviando.current) return; // un doble toque no crea dos productos
    enviando.current = true;
    const fd = new FormData(formulario);
    const datos: DatosProductoEntrada = {
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      price: String(fd.get("price") ?? ""),
      quantity: String(fd.get("quantity") ?? ""),
      visible: producto?.visible ?? true,
    };
    iniciar(async () => {
      setError(null);
      try {
        const paths: string[] = [];
        for (const [i, item] of fotos.entries()) {
          if (item.tipo === "existente") paths.push(item.path);
          else {
            let path = subidas.current.get(item.archivo);
            if (!path) {
              setEstado(`Preparando foto ${i + 1}…`);
              path = await subirFoto(storeId, "productos", item.archivo);
              subidas.current.set(item.archivo, path);
            }
            paths.push(path);
          }
        }
        setEstado(null);
        const r = producto
          ? await actualizarProducto(producto.id, datos, paths)
          : await crearProducto(idNuevo, datos, paths, avanzarA);
        if (!r.ok) {
          setError(r.error);
          enviando.current = false;
          return;
        }
        alGuardar();
      } catch (e) {
        setEstado(null);
        setError(e instanceof ErrorDeFoto ? e.message : "No se pudo guardar. Revisá tu conexión y probá de nuevo.");
        enviando.current = false;
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(e.currentTarget);
      }}
    >
      <SelectorFotos inicial={producto?.fotos.map((f) => f.path) ?? []} maximo={4} alCambiar={alCambiarFotos} />
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="font-semibold">Nombre</label>
        <Input id="name" name="name" required minLength={2} maxLength={60} defaultValue={producto?.name} placeholder="Vestido azul" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="price" className="font-semibold">Precio</label>
        <Input id="price" name="price" inputMode="decimal" required defaultValue={producto ? formatARS(producto.price_cents).replace("$", "") : ""} placeholder="8.000" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="font-semibold">Descripción</label>
        <Input id="description" name="description" maxLength={200} defaultValue={producto?.description ?? ""} placeholder="Talle M, impecable" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="quantity" className="font-semibold">Cantidad</label>
        <Input id="quantity" name="quantity" inputMode="numeric" required defaultValue={producto?.quantity ?? 1} />
      </div>
      {estado && <p role="status" className="text-sm text-muted-foreground">{estado}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pendiente}>{textoBoton}</Button>
    </form>
  );
}
