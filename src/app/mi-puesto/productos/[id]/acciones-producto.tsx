"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormularioProducto } from "@/components/tiendas/formulario-producto";
import { Button } from "@/components/ui/button";
import { borrarProducto, cambiarVisibilidad } from "@/app/mi-puesto/acciones";
import type { Producto } from "@/lib/tiendas/tipos";

export function AccionesProducto({ storeId, producto }: { storeId: string; producto: Producto }) {
  const router = useRouter();
  const [visible, setVisible] = useState(producto.visible);
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const volver = () => {
    router.push("/mi-puesto/productos");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <FormularioProducto storeId={storeId} producto={{ ...producto, visible }} textoBoton="Guardar cambios" alGuardar={volver} />
      <Button
        variant="secondary"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await cambiarVisibilidad(producto.id, !visible);
            if (r.ok) setVisible(!visible);
            else toast.error(r.error);
          })
        }
      >
        {visible ? "Ocultar de la tienda" : "Mostrar en la tienda"}
      </Button>
      {!confirmando ? (
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmando(true)}>Borrar producto</Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive p-3">
          <p className="font-semibold">¿Borrar &quot;{producto.name}&quot;? No se puede deshacer.</p>
          <Button
            variant="destructive"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await borrarProducto(producto.id);
                if (r.ok) volver();
                else toast.error(r.error);
              })
            }
          >
            Sí, borrar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}
