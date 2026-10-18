import "server-only";
import { type CredencialesCloudflare, ErrorCloudflare } from "./cloudflare";

/** Credenciales de Cloudflare Stream. Solo en el servidor: la llave nunca va al navegador. */
export function credencialesCloudflare(): CredencialesCloudflare {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) {
    throw new ErrorCloudflare("Faltan CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_STREAM_API_TOKEN");
  }
  return { accountId, token };
}
