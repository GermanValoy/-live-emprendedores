// Saca el precio y el código de lo que dijo la feriante.

const UNIDADES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

const RELLENO = new Set(["es", "el", "la", "seria", "va", "con"]);

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Valor de una palabra que forma parte de un número, o null si no es parte de un número. */
function valor(token: string): number | "mil" | "y" | null {
  if (token === "mil") return "mil";
  if (token === "y") return "y";
  const u = UNIDADES[token]; if (u !== undefined) return u;
  const limpio = token.replace(/^\$/, "");
  // 8.000 · 8,000 · 8000 · 8,5 (con "mil" después)
  if (/^\d{1,3}([.,]\d{3})+$/.test(limpio)) return Number(limpio.replace(/[.,]/g, ""));
  if (/^\d+$/.test(limpio)) return Number(limpio);
  if (/^\d+[.,]\d{1,2}$/.test(limpio)) return Number(limpio.replace(",", "."));
  return null;
}

/** El número más grande que se dijo (así "un vestido de 8000" da 8000 y no 1). */
function precioEn(tokens: string[]): number | null {
  let mayor: number | null = null;
  let i = 0;
  while (i < tokens.length) {
    const primero = valor(tokens[i] ?? "");
    if (primero === null || primero === "y") { i++; continue; }
    let total = 0;
    let actual = 0;
    let hay = false;
    for (; i < tokens.length; i++) {
      const v = valor(tokens[i] ?? "");
      if (v === null) break;
      if (v === "y") continue;
      hay = true;
      if (v === "mil") { total += (actual || 1) * 1000; actual = 0; }
      else actual += v;
    }
    if (hay) {
      const precio = Math.round(total + actual);
      if (precio > 0 && (mayor === null || precio > mayor)) mayor = precio;
    }
  }
  return mayor;
}

export type Entendido = { precio: number | null; codigo: string | null };

export function entender(texto: string): Entendido {
  const tokens = normalizar(texto).replace(/[:;!?¡¿"]/g, " ").split(/\s+/).filter(Boolean);
  const pos = tokens.findIndex((t) => t === "codigo" || t === "codigo," || t === "clave");
  let codigo: string | null = null;
  if (pos >= 0) {
    const resto = tokens.slice(pos + 1).map((t) => t.replace(/[.,]+$/, "")).filter((t) => !RELLENO.has(t));
    if (resto[0]) codigo = resto[0].toUpperCase();
  }
  const antes = pos >= 0 ? tokens.slice(0, pos) : tokens;
  const precio = precioEn(antes.map((t) => t.replace(/[.,]+$/, (m) => (/\d[.,]\d/.test(t) ? m : "")))) ?? null;
  return { precio, codigo };
}
