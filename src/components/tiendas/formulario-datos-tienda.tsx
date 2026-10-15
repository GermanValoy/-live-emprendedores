"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Foto } from "@/components/fotos/foto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarDatosTienda, guardarFotoTienda } from "@/app/mi-puesto/acciones";
import { ErrorDeFoto } from "@/lib/fotos/comprimir";
import { subirFoto } from "@/lib/fotos/subir";
import { alServidor } from "@/lib/red";
import { useMontado } from "@/lib/use-montado";
import type { Tienda } from "@/lib/tiendas/tipos";
import { CamposTienda } from "./campos-tienda";

function SubirFotoTienda({ tienda, tipo }: { tienda: Tienda; tipo: "avatar" | "cover" }) {
  const router = useRouter();
  const montado = useMontado();
  const [pendiente, iniciar] = useTransition();
  const etiqueta = tipo === "avatar" ? "Foto del puesto" : "Portada (opcional)";
  const actual = tipo === "avatar" ? tienda.avatar_path : tienda.cover_path;
  const id = `foto-${tipo}`;
  return (
    <div className="flex items-center gap-3">
      {actual ? (
        <Foto path={actual} tamano="chica" alt={etiqueta} className={tipo === "avatar" ? "size-16 rounded-full object-cover" : "h-16 w-28 rounded-xl object-cover"} />
      ) : (
        <div className={tipo === "avatar" ? "size-16 rounded-full bg-muted" : "h-16 w-28 rounded-xl bg-muted"} />
      )}
      <label htmlFor={id} className="font-semibold">{etiqueta}</label>
      <input
        id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!montado || pendiente}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (!archivo) return;
          iniciar(async () => {
            try {
              const path = await subirFoto(tienda.id, tipo === "avatar" ? "perfil" : "portada", archivo);
              const r = await guardarFotoTienda(tipo, path);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Foto guardada");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof ErrorDeFoto ? err.message : "No se pudo subir la foto. Probá con otra o revisá tu conexión.");
            }
          });
        }}
      />
      <Button variant="secondary" type="button" disabled={!montado || pendiente} onClick={() => document.getElementById(id)?.click()}>
        {pendiente ? "Preparando foto…" : "Cambiar"}
      </Button>
    </div>
  );
}

export function FormularioDatosTienda({ tienda }: { tienda: Tienda }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <SubirFotoTienda tienda={tienda} tipo="avatar" />
      <SubirFotoTienda tienda={tienda} tipo="cover" />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const valor = (k: string) => String(fd.get(k) ?? "");
          iniciar(async () => {
            setError(null);
            const r = await alServidor(() =>
              guardarDatosTienda({
                name: valor("name"), handle: valor("handle"), category: valor("category"), zone: valor("zone"),
                description: valor("description"), live_schedule_note: valor("live_schedule_note"),
              }),
            );
            if (!r.ok) return setError(r.error);
            toast.success("Datos guardados");
            router.refresh();
          });
        }}
      >
        <CamposTienda inicial={tienda} />
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-semibold">Descripción (opcional)</label>
          <Input id="description" name="description" maxLength={300} defaultValue={tienda.description ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="live_schedule_note" className="font-semibold">Suele estar en vivo…</label>
          <Input id="live_schedule_note" name="live_schedule_note" maxLength={80} defaultValue={tienda.live_schedule_note ?? ""} placeholder="Mar. y jue. 20 h" />
        </div>
        <p className="text-xs text-muted-foreground">Si cambiás tu @usuario, el link anterior deja de funcionar. Se puede cambiar una vez cada 30 días.</p>
        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
        <Button type="submit" disabled={pendiente}>Guardar datos</Button>
      </form>
    </div>
  );
}
