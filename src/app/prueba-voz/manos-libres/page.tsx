import type { Metadata } from "next";
import { ManosLibres } from "./manos-libres";

// PRUEBA DESCARTABLE (rama prueba-voz): no se une a main.
export const metadata: Metadata = {
  title: "Prueba manos libres · Tu Feria Live",
  robots: { index: false, follow: false },
};

export default function Pagina() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Prueba manos libres</h1>
      <p className="text-sm">
        Prendé la cámara y hablá como en un vivo, sin tocar nada. Cuando digas el precio y el código (por ejemplo{" "}
        <b>“se la llevan por ocho mil con el código rojo”</b>), tiene que aparecer el código armado con la foto.
      </p>
      <ManosLibres />
    </main>
  );
}
