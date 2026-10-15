"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { entrarConGoogle } from "@/app/auth/acciones";
import { alternarSeguir } from "@/app/tienda/acciones";
import { Button } from "@/components/ui/button";
import { alServidor } from "@/lib/red";

type Props = { storeId: string; handle: string; siguiendo: boolean; conSesion: boolean };

export function BotonSeguir({ storeId, handle, siguiendo, conSesion }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useOptimistic(siguiendo);
  const [, iniciar] = useTransition();

  if (!conSesion) {
    return (
      <form action={entrarConGoogle}>
        <input type="hidden" name="next" value={`/@${handle}`} />
        <Button type="submit">Seguir</Button>
      </form>
    );
  }
  return (
    <Button
      variant={estado ? "secondary" : "default"}
      aria-pressed={estado}
      onClick={() =>
        iniciar(async () => {
          setEstado(!estado);
          const r = await alServidor(() => alternarSeguir(storeId, !estado));
          if (!r.ok) toast.error(r.error);
          router.refresh();
        })
      }
    >
      {estado ? "Siguiendo" : "Seguir"}
    </Button>
  );
}
