"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { verificarHandle } from "@/app/mi-puesto/acciones";
import { normalizarHandle } from "@/lib/tiendas/validacion";

type Inicial = { name?: string; handle?: string; category?: string; zone?: string };

/** Campos básicos del puesto. El @usuario se normaliza y se verifica mientras se escribe. */
export function CamposTienda({ inicial = {} }: { inicial?: Inicial }) {
  const [handle, setHandle] = useState(inicial.handle ?? "");
  const [verificado, setVerificado] = useState<{ handle: string; mensaje: string | null } | null>(null);
  const normal = normalizarHandle(handle);
  // El aviso solo vale para el @usuario que se verificó; si se sigue escribiendo, desaparece solo.
  const aviso = verificado && verificado.handle === normal && normal !== inicial.handle ? verificado.mensaje : null;

  useEffect(() => {
    if (!normal || normal === inicial.handle) return;
    const t = setTimeout(async () => {
      const r = await verificarHandle(normal);
      setVerificado({ handle: normal, mensaje: r.mensaje });
    }, 400);
    return () => clearTimeout(t);
  }, [normal, inicial.handle]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="font-semibold">Nombre del puesto</label>
        <Input id="name" name="name" required minLength={2} maxLength={60} defaultValue={inicial.name} placeholder="La Ropería de Mica" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="handle" className="font-semibold">@usuario</label>
        <Input
          id="handle" name="handle" required autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={handle} onChange={(e) => setHandle(normalizarHandle(e.target.value))} placeholder="roperiademica"
        />
        <p className="text-xs text-muted-foreground">Tu link: tuferialive.vercel.app/@{normal || "usuario"}</p>
        {aviso && <p className="text-sm font-semibold text-destructive">{aviso}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="font-semibold">¿Qué vendés?</label>
        <Input id="category" name="category" required maxLength={40} defaultValue={inicial.category} placeholder="Ropa usada" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="zone" className="font-semibold">Zona o barrio</label>
        <Input id="zone" name="zone" required maxLength={40} defaultValue={inicial.zone} placeholder="Yerba Buena" />
      </div>
    </>
  );
}
