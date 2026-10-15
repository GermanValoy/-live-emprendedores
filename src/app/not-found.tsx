import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-extrabold">No encontramos esta página</h1>
      <Link href="/" className={buttonVariants()}>Ir al inicio</Link>
    </main>
  );
}
