import { z } from "zod";

export const HANDLES_RESERVADOS = [
  "admin", "administrador", "api", "auth", "cuenta", "diseno", "invitacion", "soporte", "ayuda",
  "tuferia", "tuferialive", "tuferia.live", "oficial", "seguidos", "compras", "puesto", "tienda",
  "vivo", "envivo",
] as const;

const FORMATO_HANDLE = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

/** "@RoperiaDeMica " → "roperiademica". */
export function normalizarHandle(texto: string): string {
  return texto.trim().replace(/^@+/, "").toLowerCase();
}

/** El @usuario tal como llega en la dirección (/@usuario). Si viene mal codificado, null (= "no encontrado"). */
export function handleDeRuta(segmento: string): string | null {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return null;
  }
}

export function errorDeHandle(handle: string): string | null {
  if (handle.length < 3 || handle.length > 30 || !FORMATO_HANDLE.test(handle)) {
    return "Usá solo minúsculas, números y puntos (de 3 a 30).";
  }
  if ((HANDLES_RESERVADOS as readonly string[]).includes(handle)) {
    return "Ese @usuario no está disponible. Probá con otro.";
  }
  return null;
}

const PRECIO_MAXIMO = 100_000_000;

/**
 * Convierte lo que escribe una persona en centavos: "8.000" → 800000, "8.500,50" → 850050, "8,5" → 850.
 * "8.5" no se acepta: en Argentina puede querer decir $8,50 o $8.500, así que se pide escribirlo completo.
 * Devuelve null si no es un precio válido.
 */
export function parsearPrecio(texto: string): number | null {
  const limpio = texto.replace(/\$/g, "").replace(/\s/g, "");
  let entero: string;
  let decimales = "";
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpio)) {
    const [parteEntera, parteDecimal = ""] = limpio.split(",");
    entero = parteEntera!.replace(/\./g, "");
    decimales = parteDecimal;
  } else if (/^\d+(,\d{1,2})?$/.test(limpio)) {
    const [parteEntera, parteDecimal = ""] = limpio.split(",");
    entero = parteEntera!;
    decimales = parteDecimal;
  } else {
    return null;
  }
  const centavos = Number(entero) * 100 + Number(decimales.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > PRECIO_MAXIMO) return null;
  return centavos;
}

const textoEntre = (min: number, max: number, mensaje: string) =>
  z.string().trim().min(min, mensaje).max(max, mensaje);

const textoOpcional = (max: number, mensaje: string) => z.string().trim().max(max, mensaje);

export const datosTiendaSchema = z.object({
  name: textoEntre(2, 60, "El nombre tiene que tener entre 2 y 60 caracteres."),
  category: textoEntre(2, 40, "Contanos qué vendés (hasta 40 caracteres)."),
  zone: textoEntre(2, 40, "Escribí tu zona o barrio (hasta 40 caracteres)."),
});

export const datosTiendaExtraSchema = z.object({
  description: textoOpcional(300, "La descripción puede tener hasta 300 caracteres."),
  live_schedule_note: textoOpcional(80, "Este texto puede tener hasta 80 caracteres."),
});

export const datosCobroSchema = z.object({
  payment_alias: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.-]{6,20}$/, "El alias tiene entre 6 y 20 letras, números, puntos o guiones."),
  payment_holder: textoEntre(3, 80, "Escribí el nombre del titular (de 3 a 80 caracteres)."),
});

export const productoSchema = z.object({
  name: textoEntre(2, 60, "El nombre del producto tiene que tener entre 2 y 60 caracteres."),
  description: textoOpcional(200, "La descripción puede tener hasta 200 caracteres."),
  price_cents: z
    .number()
    .int()
    .positive("Escribí el precio completo, por ejemplo 8.500 u 8,50.")
    .max(PRECIO_MAXIMO, "El precio puede ser de hasta $1.000.000."),
  quantity: z.number().int().min(0, "La cantidad va de 0 a 999.").max(999, "La cantidad va de 0 a 999."),
  visible: z.boolean(),
});

export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos e intentá de nuevo.";
}
