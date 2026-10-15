"use client";

import { useRouter } from "next/navigation";
import { FormularioProducto } from "@/components/tiendas/formulario-producto";

export function NuevoProducto({ storeId }: { storeId: string }) {
  const router = useRouter();
  return (
    <FormularioProducto
      storeId={storeId}
      textoBoton="Guardar producto"
      alGuardar={() => {
        router.push("/mi-puesto/productos");
        router.refresh();
      }}
    />
  );
}
