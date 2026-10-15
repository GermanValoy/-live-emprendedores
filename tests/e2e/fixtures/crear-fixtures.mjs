// Genera las fotos de prueba. Uso: node tests/e2e/fixtures/crear-fixtures.mjs
import sharp from "sharp";

// 1600×1000 "acostada" con orientación EXIF 6: un celular la muestra parada (1000×1600).
await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 176, g: 19, b: 95 } } })
  .jpeg({ quality: 80 })
  .withMetadata({ orientation: 6 })
  .withExifMerge({ IFD0: { Copyright: "Foto de prueba Tu Feria Live" } })
  .toFile("tests/e2e/fixtures/foto-de-costado.jpg");

const meta = await sharp("tests/e2e/fixtures/foto-de-costado.jpg").metadata();
console.log({ ancho: meta.width, alto: meta.height, orientacion: meta.orientation, exif: Boolean(meta.exif) });
