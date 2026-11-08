import "server-only";

const MODELO = "@cf/openai/whisper-large-v3-turbo";

/** Manda un audio WAV a Whisper (Cloudflare Workers AI) y devuelve el texto. */
export async function transcribir(audio: ArrayBuffer): Promise<string> {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!id || !token) throw new Error("Falta configurar CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_AI_API_TOKEN");

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${MODELO}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: Buffer.from(audio).toString("base64"),
      language: "es",
      vad_filter: true, // sin voz no inventa texto
      initial_prompt: "Precio y código de una prenda en un vivo de ventas. Por ejemplo: ocho mil pesos, código rojo.",
    }),
  });
  const j = (await r.json().catch(() => null)) as
    | { success?: boolean; result?: { text?: string }; errors?: { message: string }[] }
    | null;
  if (!r.ok || !j?.success) {
    const detalle = j?.errors?.map((e) => e.message).join("; ") ?? `HTTP ${r.status}`;
    throw new Error(`Whisper de Cloudflare falló: ${detalle}`);
  }
  return j.result?.text?.trim() ?? "";
}
