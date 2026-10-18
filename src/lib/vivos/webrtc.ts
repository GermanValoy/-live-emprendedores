/**
 * Transmitir (WHIP) y mirar (WHEP) con Cloudflare Stream desde el navegador.
 * Las dos negociaciones son iguales: el navegador manda su oferta SDP por POST
 * y Cloudflare contesta con la respuesta y la dirección del recurso (Location).
 */

export async function negociarSdp(
  url: string, ofertaSdp: string, f: typeof fetch = fetch,
): Promise<{ respuestaSdp: string; recurso: string | null }> {
  const respuesta = await f(url, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: ofertaSdp });
  if (!respuesta.ok) throw new Error(`La transmisión respondió ${respuesta.status}`);
  const location = respuesta.headers.get("Location");
  return { respuestaSdp: await respuesta.text(), recurso: location ? new URL(location, url).toString() : null };
}

export type ConexionVivo = { pc: RTCPeerConnection; cerrar(): Promise<void> };

function nuevaConexion(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" });
}

/** Espera a que el navegador junte sus candidatos de red, como mucho 2 segundos. */
function esperarCandidatos(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolver) => {
    const listo = () => {
      if (pc.iceGatheringState !== "complete") return;
      pc.removeEventListener("icegatheringstatechange", listo);
      resolver();
    };
    pc.addEventListener("icegatheringstatechange", listo);
    setTimeout(resolver, 2000);
  });
}

async function conectar(pc: RTCPeerConnection, url: string): Promise<ConexionVivo> {
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await esperarCandidatos(pc);
    const { respuestaSdp, recurso } = await negociarSdp(url, pc.localDescription!.sdp);
    await pc.setRemoteDescription({ type: "answer", sdp: respuestaSdp });
    return {
      pc,
      async cerrar() {
        pc.close();
        if (recurso) await fetch(recurso, { method: "DELETE" }).catch(() => undefined);
      },
    };
  } catch (error) {
    pc.close();
    throw error;
  }
}

export async function transmitir(urlTransmitir: string, stream: MediaStream): Promise<ConexionVivo> {
  const pc = nuevaConexion();
  for (const pista of stream.getTracks()) pc.addTransceiver(pista, { direction: "sendonly", streams: [stream] });
  return conectar(pc, urlTransmitir);
}

export async function mirar(urlMirar: string): Promise<ConexionVivo & { stream: MediaStream }> {
  const pc = nuevaConexion();
  const stream = new MediaStream();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.addEventListener("track", (e) => stream.addTrack(e.track));
  return { ...(await conectar(pc, urlMirar)), stream };
}
