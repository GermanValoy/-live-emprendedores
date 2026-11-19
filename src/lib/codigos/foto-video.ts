/** Saca una foto del cuadro que se está viendo en el video (la cámara de la feriante). Devuelve null si no se puede. */
export function fotoDelVideo(video: HTMLVideoElement): Promise<Blob | null> {
  const ancho = video.videoWidth;
  const alto = video.videoHeight;
  if (!ancho || !alto) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, ancho, alto);
  return new Promise((resolver) => canvas.toBlob(resolver, "image/jpeg", 0.9));
}
