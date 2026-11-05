import { describe, expect, it } from "vitest";
import { largoVisible, limpiarTexto, moderar, normalizar } from "./moderar";

// Espeja la lista de la base: drizzle/0008_seguridad_chat.sql menos lo que borra
// drizzle/0012_chat_palabras_ajuste.sql (palabras que aparecen en ventas normales).
const PALABRAS: ReadonlySet<string> = new Set([
  "boludo", "boluda", "pelotudo", "pelotuda", "forro", "forra", "hijo de puta", "hijadeputa",
  "hdp", "puta", "puto", "mierda", "conchudo", "conchuda", "la concha de tu madre",
  "culiado", "culiada", "pija", "verga", "chupapija", "garca", "imbecil", "idiota",
  "estupido", "estupida", "mogolico", "mogolica", "trolo", "trola",
  "sorete", "cagon", "cagona", "mamarracho",
  "tarado", "tarada", "zorra",
  "cornudo", "hijo de mil puta", "andate a la mierda", "chupame", "chupamela", "ortiva", "ortiba",
  "cabeza de termo", "pajero", "pajera", "maricon", "negro de mierda", "villero de mierda",
]);

// Mensajes normales de vivos reales: nunca se frenan.
const NUNCA_FRENAR = [
  "holaa desde Yerba Buena 👋",
  "¿viene en 40?",
  "precio??",
  "¿hacés envíos a Tafí Viejo?",
  "me encanta 😍😍",
  "ROJO",
  "rojo!!",
  "$8.000",
  "18000",
  "talle 2 x 1",
  "15/11 a las 21",
  "lo quiero 🙋‍♀️",
  "¿aceptás mercado pago?",
  "qué lindo el saquito",
  "gracias mica!!",
  "Vñleta",
  "me lo reservás?",
  // cuidado con las palabras que contienen un insulto adentro
  "Hola. Me encanta",
  "gracias. me lo llevo",
  "dale.me lo guardas",
  "Listo. Co",
  "si. App",
  "ok. Ar",
  "la computadora y la gilada del barrio",
  "talle 40 42 44 46",
  "$1.800.000",
  // palabras de ventas normales que no son insulto
  "¿mi pedido viene retrasado?",
  "el envío viene retrasado",
  "collar para perra",
  "en color gris rata",
  "bolsas de basura",
  "un chorro de agua",
  "soy Ana Gil",
  "es inútil, no me anda",
  "la concha del mate",
  "no soy estafadora, mirá las reseñas",
];

const SIEMPRE_FRENAR: [string, "link" | "promocion" | "insulto"][] = [
  ["mirá www.ofertas.com", "link"],
  ["entrá a ofertas .com", "link"],
  ["ofertas punto com", "link"],
  ["bit.ly/abc", "link"],
  ["https://x.co", "link"],
  ["wsp 381 555 1234", "promocion"],
  ["381-555-1234", "promocion"],
  ["seguime en insta @ofertas_tuc", "promocion"],
  ["pasate por mi página", "promocion"],
  ["vendo ropa más barata", "promocion"],
  ["mirá mi perfil", "promocion"],
  ["hago envíos", "promocion"],
  ["sos un pelotudo", "insulto"],
  ["sos un p3lotudo", "insulto"],
  ["sos un b0ludo", "insulto"],
  ["sos un boludoo", "insulto"],
  ["PELOTUDOOO", "insulto"],
  ["hijo de puta", "insulto"],
  ["Hijo  de  PUUUTA!!", "insulto"],
  ["la concha de tu madre", "insulto"],
];

describe("moderar", () => {
  it.each(NUNCA_FRENAR)("deja pasar: %s", (texto) => {
    expect(moderar(texto, PALABRAS, false)).toBeNull();
  });

  it("no frena ningún mensaje normal", () => {
    for (const texto of NUNCA_FRENAR) {
      expect(moderar(texto, PALABRAS, false)).toBeNull();
    }
  });

  it.each(SIEMPRE_FRENAR)("frena %s", (texto, motivo) => {
    expect(moderar(texto, PALABRAS, false)).toBe(motivo);
  });

  it("la feriante pasa links y teléfonos pero no insultos", () => {
    expect(moderar("mirá www.ofertas.com", PALABRAS, true)).toBeNull();
    expect(moderar("wsp 381 555 1234", PALABRAS, true)).toBeNull();
    expect(moderar("hago envíos", PALABRAS, true)).toBeNull();
    expect(moderar("sos un pelotudo", PALABRAS, true)).toBe("insulto");
  });
});

describe("normalizar", () => {
  it("baja mayúsculas y reduce letras repetidas", () => {
    expect(normalizar("PeLoTuDooo")).toBe("pelotudo");
  });
  it("saca tildes pero conserva la ñ", () => {
    expect(normalizar("Ñandú")).toBe("ñandu");
  });
  it("no cambia dígitos a letras en números", () => {
    expect(normalizar("$8.000")).toBe("8 000");
    expect(normalizar("18000")).toBe("18000");
    expect(normalizar("40")).toBe("40");
  });
  it("cambia dígitos por letras dentro de palabras", () => {
    expect(normalizar("b0ludo")).toBe("boludo");
    expect(normalizar("p3lotudo")).toBe("pelotudo");
  });
  it("es determinista y deja ROJO como rojo", () => {
    expect(normalizar("ROJO!!")).toBe("rojo");
  });
});

describe("limpiarTexto", () => {
  it("recorta y une espacios", () => {
    expect(limpiarTexto("  hola   che  ")).toBe("hola che");
  });
  it("solo espacios queda vacío", () => {
    expect(limpiarTexto("   ")).toBe("");
  });
  it("saca caracteres de control", () => {
    expect(limpiarTexto("ho\u0000la\u0007")).toBe("hola");
  });
});

describe("largoVisible", () => {
  it("cuenta lo que ve la persona", () => {
    expect(largoVisible("😍".repeat(200))).toBe(200);
  });
});
