import type { Metadata } from "next";
import { EnVivo } from "@/components/marca/en-vivo";
import { EtiquetaCodigo } from "@/components/marca/etiqueta-codigo";
import { EsperaFeria } from "@/components/vivos/espera-feria";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Muestra de diseño · Tu Feria Live",
  robots: { index: false, follow: false },
};

const colores = [
  ["Lapacho", "bg-primary"],
  ["Limón", "bg-codigo"],
  ["Hoja", "bg-exito"],
  ["En vivo", "bg-vivo"],
  ["Error", "bg-destructive"],
] as const;

export default function DisenoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 p-4">
      <h1 className="text-3xl font-extrabold">Muestra de diseño</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Colores</h2>
        <div className="grid grid-cols-4 gap-3">
          {colores.map(([nombre, clase]) => (
            <div key={nombre} className="flex flex-col items-center gap-1 text-xs">
              <div className={`size-12 rounded-xl border ${clase}`} />
              {nombre}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Botones</h2>
        <Button>Entrar con Google</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="ghost">Discreto</Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Campo de texto</h2>
        <Input placeholder="Escribí un mensaje o un código…" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Vivo</h2>
        <div className="flex flex-wrap items-center gap-3">
          <EnVivo />
          <EtiquetaCodigo codigo="rojo" centavos={800000} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Espera del vivo</h2>
        <div className="overflow-hidden rounded-2xl border">
          <EsperaFeria nombre="Mica" />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Tarjeta</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">Texto secundario dentro de una tarjeta.</CardContent>
      </Card>
    </main>
  );
}
