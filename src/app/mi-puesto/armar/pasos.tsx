"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormularioCobro } from "@/components/tiendas/formulario-cobro";
import { FormularioEntregas } from "@/components/tiendas/formulario-entregas";
import { FormularioProducto } from "@/components/tiendas/formulario-producto";
import { Button } from "@/components/ui/button";
import { marcarPuestoListo } from "@/app/mi-puesto/acciones";
import type { DatosPrivados, OpcionEntrega, Tienda } from "@/lib/tiendas/tipos";

type Props = { tienda: Tienda; privados: DatosPrivados | null; opciones: OpcionEntrega[] };

export function Pasos({ tienda, privados, opciones }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const refrescar = () => router.refresh();
  const terminar = () => {
    router.push("/mi-puesto?listo=1");
    router.refresh();
  };
  const paso = tienda.onboarding_step;

  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary motion-safe:transition-[width]" style={{ width: `${(paso / 4) * 100}%` }} />
      </div>
      <p className="text-sm font-semibold text-primary">Paso {paso} de 4</p>
      {paso === 2 && (
        <>
          <h1 className="text-2xl font-extrabold">Cómo cobrás</h1>
          <FormularioCobro inicial={privados ?? undefined} avanzarA={3} textoBoton="Seguir" alGuardar={refrescar} />
        </>
      )}
      {paso === 3 && (
        <>
          <h1 className="text-2xl font-extrabold">Cómo entregás</h1>
          <FormularioEntregas zona={tienda.zone} opciones={opciones} privados={privados} avanzarA={4} textoBoton="Seguir" alGuardar={refrescar} />
        </>
      )}
      {paso === 4 && (
        <>
          <h1 className="text-2xl font-extrabold">Tu primer producto</h1>
          <FormularioProducto storeId={tienda.id} avanzarA={5} textoBoton="Guardar y terminar" alGuardar={terminar} />
          <Button
            variant="ghost"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await marcarPuestoListo();
                if (r.ok) terminar();
              })
            }
          >
            Lo cargo después
          </Button>
        </>
      )}
    </div>
  );
}
