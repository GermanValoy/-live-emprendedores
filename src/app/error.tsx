"use client"; // Las pantallas de error de Next tienen que ser componentes de cliente

import { Button } from "@/components/ui/button";

export default function ErrorDePantalla({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-extrabold">Algo no salió bien</h1>
      <p className="text-muted-foreground">Puede ser la conexión. Revisá tu internet y probá de nuevo.</p>
      <Button onClick={() => retry()}>Probar de nuevo</Button>
    </main>
  );
}
