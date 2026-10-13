// Genera los PNG de la app instalable a partir de assets/icono.svg.
// Uso: npm run iconos (correr de nuevo cuando cambie el logo).
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const tamanos = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

await mkdir("public/icons", { recursive: true });
for (const [nombre, lado] of tamanos) {
  await sharp("assets/icono.svg").resize(lado, lado).png().toFile(`public/icons/${nombre}`);
  console.log(`public/icons/${nombre}`);
}
