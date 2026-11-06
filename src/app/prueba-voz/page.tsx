import type { Metadata } from "next";
import { PruebaVoz } from "./prueba";

// PRUEBA DESCARTABLE (rama prueba-voz): no se une a main.
export const metadata: Metadata = {
  title: "Prueba de voz · Tu Feria Live",
  robots: { index: false, follow: false },
};

export default function Pagina() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Prueba de voz</h1>
      <p className="text-sm">
        Prendé la cámara, tocá “Empezar a escuchar” y decí, por ejemplo: <b>“ocho mil, código rojo”</b>.
      </p>
      <PruebaVoz />
    </main>
  );
}
