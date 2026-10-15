"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormularioCobro } from "@/components/tiendas/formulario-cobro";
import { FormularioDatosTienda } from "@/components/tiendas/formulario-datos-tienda";
import { FormularioEntregas } from "@/components/tiendas/formulario-entregas";
import type { DatosPrivados, OpcionEntrega, Tienda } from "@/lib/tiendas/tipos";

export function SeccionesMiTienda({ tienda, privados, opciones }: { tienda: Tienda; privados: DatosPrivados | null; opciones: OpcionEntrega[] }) {
  const router = useRouter();
  const listo = (mensaje: string) => () => {
    toast.success(mensaje);
    router.refresh();
  };
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Tu puesto</h2>
        <FormularioDatosTienda tienda={tienda} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Cómo cobrás</h2>
        <FormularioCobro inicial={privados ?? undefined} textoBoton="Guardar cobro" alGuardar={listo("Datos de cobro guardados")} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Cómo entregás</h2>
        <FormularioEntregas zona={tienda.zone} opciones={opciones} privados={privados} textoBoton="Guardar entregas" alGuardar={listo("Formas de entrega guardadas")} />
      </section>
    </>
  );
}
