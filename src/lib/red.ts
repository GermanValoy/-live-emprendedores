export const NO_GUARDO = "No se pudo guardar. Revisá tu conexión y probá de nuevo.";

/**
 * Llama a una Server Action desde el navegador. Si se corta la conexión (algo común en la feria),
 * devuelve el aviso en castellano en vez de romper la pantalla, y lo escrito queda en el formulario.
 */
export async function alServidor<T>(accion: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await accion();
  } catch {
    return { ok: false, error: NO_GUARDO };
  }
}
