import { EstadoVacio } from "@/components/estado-vacio";

export default function MisComprasPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Mis compras</h1>
      <EstadoVacio texto="Cuando ganes un código, lo vas a ver acá." />
    </main>
  );
}
