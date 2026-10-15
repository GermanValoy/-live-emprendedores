"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CamposTienda } from "@/components/tiendas/campos-tienda";
import { Button } from "@/components/ui/button";
import { guardarFotoTienda } from "@/app/mi-puesto/acciones";
import { subirFoto } from "@/lib/fotos/subir";
import { alServidor } from "@/lib/red";
import { abrirPuesto } from "./acciones";

export function PasoTuPuesto({ token }: { token: string }) {
  const router = useRouter();
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (k: string) => String(fd.get(k) ?? "");
        iniciar(async () => {
          setError(null);
          const r = await alServidor(() =>
            abrirPuesto(token, { name: v("name"), handle: v("handle"), category: v("category"), zone: v("zone") }),
          );
          if (!r.ok) return setError(r.error);
          if (foto) {
            try {
              await guardarFotoTienda("avatar", await subirFoto(r.storeId, "perfil", foto));
            } catch {
              toast.error("Tu puesto se creó, pero la foto no se pudo subir. Cargala después desde Mi tienda.");
            }
          }
          router.push("/mi-puesto/armar");
        });
      }}
    >
      <p className="text-sm font-semibold text-primary">Paso 1 de 4</p>
      <h1 className="text-2xl font-extrabold">Tu puesto</h1>
      <div className="flex flex-col gap-1">
        <label htmlFor="foto-avatar" className="font-semibold">Foto del puesto</label>
        <input id="foto-avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
      </div>
      <CamposTienda />
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pendiente}>{pendiente ? "Guardando…" : "Seguir"}</Button>
    </form>
  );
}
