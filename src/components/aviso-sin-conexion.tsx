"use client";

import { useSyncExternalStore } from "react";

function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

export function AvisoSinConexion() {
  const conectado = useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true,
  );
  if (conectado) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-foreground px-4 py-2 text-center text-sm font-semibold text-background"
    >
      Sin conexión, revisá tu internet
    </div>
  );
}
