import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { Button } from "@/components/ui/button";

type Props = { searchParams: Promise<{ error?: string }> };

async function MensajeDeError({ searchParams }: Props) {
  const { error } = await searchParams;
  if (error !== "login") return null;
  return (
    <p role="alert" className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground">
      No pudimos hacerte entrar. Probá de nuevo.
    </p>
  );
}

export default function InicioPage({ searchParams }: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="bg-gradient-to-r from-primary to-coral bg-clip-text text-5xl font-extrabold text-transparent">
          Tu Feria Live
        </h1>
        <p className="text-lg text-muted-foreground">Vendé en vivo, sin que nadie te corte</p>
      </div>
      <Suspense>
        <MensajeDeError searchParams={searchParams} />
      </Suspense>
      <form action={entrarConGoogle} className="w-full max-w-xs">
        <Button type="submit" size="lg" className="w-full">
          Entrar con Google
        </Button>
      </form>
    </main>
  );
}
