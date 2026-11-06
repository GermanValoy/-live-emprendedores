import "server-only";

// PRUEBA DESCARTABLE (rama prueba-voz): manda un audio corto a Whisper de Cloudflare y devuelve el texto.
// La clave (CLOUDFLARE_AI_API_TOKEN) solo la lee el servidor.

const MODELO = "@cf/openai/whisper-large-v3-turbo";
const MAXIMO_BYTES = 1_000_000; // unos 30 s de audio: una frase dura 3 o 4

export async function POST(request: Request) {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!id || !token) return Response.json({ error: "Falta configurar la clave de Cloudflare AI" }, { status: 500 });

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAXIMO_BYTES) {
    return Response.json({ error: `Audio de tamaño inválido (${audio.byteLength} bytes)` }, { status: 400 });
  }

  const inicio = Date.now();
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${MODELO}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: Buffer.from(audio).toString("base64"),
      language: "es",
      vad_filter: true, // sin voz no inventa texto (con silencio solo decía "Gracias.")
      initial_prompt: "Precio y código de una prenda en un vivo de ventas. Por ejemplo: ocho mil pesos, código rojo.",
    }),
  });
  const j = (await r.json().catch(() => null)) as { success?: boolean; result?: { text?: string }; errors?: { message: string }[] } | null;
  if (!r.ok || !j?.success) {
    const detalle = j?.errors?.map((e) => e.message).join("; ") ?? `HTTP ${r.status}`;
    return Response.json({ error: `Cloudflare: ${detalle}` }, { status: 502 });
  }
  return Response.json({ texto: j.result?.text?.trim() ?? "", ms: Date.now() - inicio, bytes: audio.byteLength });
}
