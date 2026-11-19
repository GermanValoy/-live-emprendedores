"use client";

import { useState } from "react";
import { ChatSala } from "@/components/chat/chat-sala";
import { AvisoReclamo, textoAviso } from "@/components/codigos/aviso-reclamo";
import { CartelGanadora } from "@/components/codigos/cartel-ganadora";
import { TarjetaCodigo } from "@/components/codigos/tarjeta-codigo";
import { PagosSala } from "@/components/codigos/pagos-sala";
import { useCodigosVivo } from "@/components/codigos/use-codigos-vivo";
import type { Codigo, ResultadoReclamo } from "@/lib/codigos/tipos";
import type { OpcionEntrega } from "@/lib/tiendas/tipos";

type PropsChat = Parameters<typeof ChatSala>[0];

const claveGanadora = (c: Codigo | null) => (c?.last_winner_at ? `${c.id}:${c.last_winner_at}` : null);

/** El chat de la sala junto con lo que tiene que ver con el código: tarjeta, cartel de la ganadora y respuestas al reclamo. */
export function CodigosSala({
  codigos: { iniciales, cartelSegundos, entregas, tienda },
  ...chat
}: Omit<PropsChat, "hayCodigoActivo"> & {
  codigos: { iniciales: Codigo[]; cartelSegundos: number; entregas: OpcionEntrega[]; tienda: { name: string; zone: string } };
}) {
  const { activo, codigos } = useCodigosVivo(chat.vivo.id, iniciales);
  // Lo que ya estaba ganado al entrar no se festeja de nuevo: el cartel es para las ganadoras que ocurren mientras se mira.
  const [claveAlEntrar] = useState(() => claveGanadora(ultimaGanada(iniciales.filter((c) => c.live_session_id === chat.vivo.id))));
  const ganada = ultimaGanada(codigos);
  const clave = claveGanadora(ganada);

  return (
    <>
      {ganada && clave && clave !== claveAlEntrar && (
        <CartelGanadora key={clave} etiqueta={ganada.label} nombre={ganada.last_winner_name ?? ""} segundos={cartelSegundos} />
      )}
      <ChatSala
        {...chat}
        hayCodigoActivo={Boolean(activo)}
        entreMedio={(ultimoReclamo) => (
          <>
            <ZonaCodigo ultimoReclamo={ultimoReclamo} activo={activo} codigos={codigos} />
            <PagosSala vivoId={chat.vivo.id} userId={chat.userId} codigos={codigos} tienda={tienda} entregas={entregas} />
          </>
        )}
      />
    </>
  );
}

/** El código con más reciente ganadora (aunque ya se haya cerrado, por si se agotó con ella). */
function ultimaGanada(codigos: Codigo[]): Codigo | null {
  return codigos.reduce<Codigo | null>(
    (mejor, c) => (c.last_winner_at && (!mejor?.last_winner_at || c.last_winner_at > mejor.last_winner_at) ? c : mejor),
    null,
  );
}

function ZonaCodigo({ ultimoReclamo, activo, codigos }: { ultimoReclamo: ResultadoReclamo | null; activo: Codigo | null; codigos: Codigo[] }) {
  // Cada respuesta nueva del servidor es un aviso nuevo (reinicia el tiempo). Se ajusta al dibujar, sin efectos.
  const [visto, setVisto] = useState<{ respuesta: ResultadoReclamo | null; numero: number; ganoCodigo: string | null }>({
    respuesta: ultimoReclamo, numero: 0, ganoCodigo: null,
  });
  if (ultimoReclamo !== visto.respuesta) {
    setVisto({
      respuesta: ultimoReclamo,
      numero: visto.numero + 1,
      // Se recuerda cuál código ganó, para avisarle si la feriante lo anula. El panel de pago lo mueven sus pedidos (PagosSala).
      ganoCodigo: ultimoReclamo?.estado === "ganaste" ? (activo?.id ?? null) : visto.ganoCodigo,
    });
  }

  const etiqueta = activo?.label ?? codigos.at(-1)?.label ?? null;
  const texto = ultimoReclamo ? textoAviso(ultimoReclamo, etiqueta) : null;
  const anulado = visto.ganoCodigo ? codigos.find((c) => c.id === visto.ganoCodigo && c.status === "anulado") : undefined;

  return (
    <>
      {activo && <TarjetaCodigo codigo={activo} />}
      {texto && <AvisoReclamo key={visto.numero} texto={texto} />}
      {anulado && <AvisoReclamo key={`anulado:${anulado.id}`} texto="La feriante anuló este código." />}
    </>
  );
}
