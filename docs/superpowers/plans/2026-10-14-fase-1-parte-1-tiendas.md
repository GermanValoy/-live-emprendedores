# Fase 1 · Parte 1 – Tiendas y productos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una feriante invitada abra su tienda en un recorrido guiado de 4 pasos, cargue productos con fotos comprimidas en el celular, y que cualquiera vea su tienda en `/@usuario` y la siga; con una página `/admin` para crear invitaciones.

**Architecture:** Siete tablas nuevas en Postgres (Supabase) con RLS y permisos explícitos; las reglas sensibles (canje atómico de invitación, privacidad de alias y dirección, límite de cambio de @usuario) viven en funciones y políticas de la base. Las pantallas son Server Components que leen con el cliente de Supabase bajo RLS (envueltas en `<Suspense>` por Cache Components) y formularios cliente que llaman Server Actions validadas con zod. Las fotos se comprimen en el navegador (canvas → WebP/JPEG en 400 y 1200 px) y se suben directo a un bucket público de Supabase Storage protegido por carpeta de tienda.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`, Cache Components), React 19, TypeScript estricto, Tailwind 4 + shadcn (Base UI), Supabase (Postgres, Auth, Storage) con `@supabase/ssr` 0.12 y `@supabase/supabase-js` 2.117, Drizzle ORM 0.45 / drizzle-kit 0.31, zod 4, Vitest 5, Playwright 1.64, sharp (solo para fixtures de prueba), lucide-react.

**Spec:** [docs/superpowers/specs/2026-10-14-fase-1-parte-1-tiendas-design.md](../specs/2026-10-14-fase-1-parte-1-tiendas-design.md) (y la [Parte 0 – Pantallas](../specs/2026-10-14-fase-1-parte-0-pantallas-design.md))

## Global Constraints

- Interfaz y mensajes en español rioplatense (voseo); nunca errores técnicos ni en inglés. Mensajes de error exactamente como la tabla de la sección 6 del spec.
- TypeScript estricto (`strict` + `noUncheckedIndexedAccess`). Antes de usar una API, verificar contra la documentación (Next: `node_modules/next/dist/docs/`; Supabase y Drizzle: documentación oficial). Si este plan no coincide con la versión instalada, manda la documentación: ajustar y anotarlo en el registro.
- Montos en centavos enteros: `price_cents` > 0 y ≤ 100.000.000; `shipping_cost_cents` > 0 si es monto fijo. Mostrar con `formatARS`.
- RLS activado en todas las tablas nuevas con `grant` explícitos; `service_role` recibe permisos explícitos (el proyecto no da permisos automáticos).
- Alias, titular, dirección y horarios de retiro: **solo los lee la dueña** (`store_private_info`).
- `@usuario`: minúsculas, números y puntos; 3 a 30; sin punto al inicio, al final ni dos seguidos; no reservado (lista del spec, sección 6). Cambio como máximo una vez cada 30 días.
- Invitaciones: token aleatorio ≥ 32 caracteres URL-safe, un solo uso, vencen a los 7 días, canje atómico.
- Fotos: hasta 4 por producto; se comprimen en el navegador a 1200 y 400 px (lado mayor), WebP calidad 0,8 (JPEG 0,85 si el navegador no codifica WebP); sin metadatos EXIF; bucket `tienda-fotos`, carpeta `{store_id}/...`; archivos ≤ 1 MB.
- Largos: nombre de tienda 2–60, rubro ≤ 40, zona ≤ 40, descripción tienda ≤ 300, "suele estar en vivo" ≤ 80, nota de invitación ≤ 80, alias 6–20 (letras, números, puntos, guiones), titular 3–80, dirección 5–120, horarios ≤ 80, notas de entrega ≤ 80, nombre de producto 2–60, descripción de producto ≤ 200, cantidad 0–999.
- Todo lo que se toca mide al menos 44 px; contraste AA; voseo.
- Se trabaja en la rama `fase-1-parte-1`. Commits chicos en español; cada uno termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. En PowerShell, los mensajes con comillas se pasan con `git commit -F <archivo>`.
- Nunca imprimir `DATABASE_URL` ni claves: filtrar la salida de `npm run db:migrate` con `-replace 'postgres(ql)?://\S+','postgresql://[OCULTO]'`.

## Review Focus

1. **Foto sacada con el celular "de costado"** (EXIF de orientación): debe verse derecha en la tienda → prueba e2e de orientación en la Tarea 5.
2. **Doble toque en "Guardar producto"** con mala señal: debe crearse un solo producto → prueba e2e de doble clic en la Tarea 5.
3. **@usuario escrito "a mano"** ("@RoperiaDeMica ", con mayúscula, arroba o espacios): debe normalizarse, no rechazarse → pruebas unitarias de `normalizarHandle` en la Tarea 1.
4. **Precio escrito como lo escribe una persona** ("8.000", "$ 8.000", "8000", "8.500,50", "8,5"): debe entenderse bien y "8.5" no debe convertirse en 85 pesos por error de miles → pruebas unitarias de `parsearPrecio` en la Tarea 1.
5. **Tienda a medio armar** (sin alias ni entregas): no debe aparecer en el Inicio ni permitir que la compren → prueba e2e en la Tarea 8 (la tienda pública sí existe, pero el Inicio solo lista puestos completos).

---

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/lib/tiendas/tipos.ts` | Tipos compartidos de tiendas, entregas, productos | 1 |
| `src/lib/tiendas/validacion.ts` (+ test) | `normalizarHandle`, `errorDeHandle`, `parsearPrecio`, esquemas zod | 1 |
| `src/lib/tiendas/entrega.ts` (+ test) | `validarEntregas`, `resumenEntregas` | 1 |
| `src/lib/fotos/rutas.ts` (+ test) | Tamaños, `medidasEscaladas`, rutas de variantes, `urlFoto` | 1 |
| `src/db/schema.ts` | Tablas nuevas en Drizzle | 2 |
| `drizzle/0002_*.sql` (generada), `drizzle/0003_seguridad_tiendas.sql` | Tablas; RLS, permisos, funciones, Storage | 2 |
| `tests/helpers/tiendas-prueba.ts` | Admin, invitaciones y tiendas de prueba; limpieza de fotos | 2 |
| `tests/integracion/tiendas.test.ts` | Reglas de seguridad en la base | 2 |
| `src/lib/auth/sesion.ts` | `obtenerUsuarioId` | 3 |
| `src/lib/tiendas/datos.ts` | Lecturas de tiendas, productos, seguidores | 3 |
| `src/components/navegacion/barra-inferior.tsx`, `barra-segun-sesion.tsx` | Barra de abajo por rol | 3 |
| `src/app/layout.tsx`, `src/proxy`/`src/lib/supabase/proxy.ts` | Barra global; `/mi-puesto` protegida | 3 |
| `src/app/auth/acciones.ts` | `entrarConGoogle` con destino (`next`) | 3 |
| `src/app/mis-compras/page.tsx`, `src/app/seguidos/page.tsx`, `src/app/mi-puesto/page.tsx` | Pantallas base | 3 (8 completa Seguidos) |
| `src/app/admin/page.tsx`, `acciones.ts`, `panel-invitaciones.tsx` | Invitaciones | 4 |
| `src/lib/supabase/client.ts` | Cliente de Supabase en el navegador | 5 |
| `src/lib/fotos/comprimir.ts`, `subir.ts` | Compresión y subida en el navegador | 5 |
| `src/components/fotos/selector-fotos.tsx`, `src/components/fotos/foto.tsx` | Elegir fotos; mostrar fotos | 5 |
| `src/components/tiendas/formulario-producto.tsx` | Alta y edición de producto | 5 |
| `src/app/mi-puesto/acciones.ts` | Server Actions de la feriante | 5, 6 |
| `src/app/mi-puesto/productos/**` | Mis productos | 5 |
| `src/components/tiendas/campos-tienda.tsx`, `formulario-datos-tienda.tsx`, `formulario-cobro.tsx`, `formulario-entregas.tsx` | Formularios de tienda | 6 |
| `src/app/mi-puesto/tienda/page.tsx` | Mi tienda | 6 |
| `src/app/invitacion/[token]/**`, `src/app/mi-puesto/armar/**` | Recorrido guiado | 7 |
| `next.config.ts` | Reescritura `/@usuario` → `/tienda/usuario` | 8 |
| `src/app/tienda/[handle]/**`, `src/app/tienda/acciones.ts`, `src/components/tiendas/boton-seguir.tsx`, `tarjeta-puesto.tsx` | Tienda pública, producto, Seguir | 8 |
| `src/app/page.tsx` | Inicio con Puestos | 8 |
| `tests/e2e/fixtures/*` | Imágenes de prueba | 5 |
| `tests/e2e/*.spec.ts` | Pruebas punta a punta | 3–8 |

---

### Task 1: Validaciones, entregas y rutas de fotos

**Files:**
- Create: `src/lib/tiendas/tipos.ts`, `src/lib/tiendas/validacion.ts`, `src/lib/tiendas/validacion.test.ts`, `src/lib/tiendas/entrega.ts`, `src/lib/tiendas/entrega.test.ts`, `src/lib/fotos/rutas.ts`, `src/lib/fotos/rutas.test.ts`
- Modify: `package.json` (zod)

**Interfaces:**
- Consumes: `formatARS(centavos: number): string` de `@/lib/format/plata`.
- Produces:
  - Tipos (`@/lib/tiendas/tipos`): `TipoEntrega`, `ModoEnvio`, `OpcionEntrega`, `EntregasEntrada`, `Tienda`, `DatosPrivados`, `FotoProducto`, `Producto`, `PuestoResumen`, `Resultado`.
  - `HANDLES_RESERVADOS: readonly string[]`, `normalizarHandle(texto: string): string`, `errorDeHandle(handle: string): string | null`, `parsearPrecio(texto: string): number | null`, `datosTiendaSchema`, `datosCobroSchema`, `productoSchema`, `primerError(error: z.ZodError): string`.
  - `validarEntregas(entrada: EntregasEntrada): { ok: true; opciones: OpcionEntrega[]; pickupAddress: string | null; pickupHours: string | null } | { ok: false; error: string }`, `resumenEntregas(opciones: OpcionEntrega[], zona: string): string[]`.
  - `TAMANOS_FOTO = { chica: 400, grande: 1200 }`, `type TamanoFoto = "chica" | "grande"`, `BUCKET_FOTOS = "tienda-fotos"`, `type CarpetaFoto = "perfil" | "portada" | "productos"`, `medidasEscaladas(ancho, alto, maximo): { ancho: number; alto: number }`, `rutaVariante(path, tamano): string`, `nuevaRutaFoto(storeId, carpeta, ext: "webp" | "jpg"): string`, `rutaEsDeTienda(path, storeId, carpeta): boolean`, `urlFoto(path, tamano): string`.

- [ ] **Step 1: Crear la rama e instalar zod**

```powershell
git switch main; git pull --ff-only; git switch -c fase-1-parte-1
npm install zod
```

- [ ] **Step 2: Tipos compartidos**

`src/lib/tiendas/tipos.ts`:

```ts
export type TipoEntrega = "pickup" | "shipping" | "meetup";
export type ModoEnvio = "free" | "fixed" | "arrange";

export type OpcionEntrega = {
  kind: TipoEntrega;
  enabled: boolean;
  shipping_mode: ModoEnvio | null;
  shipping_cost_cents: number | null;
  note: string | null;
};

/** Lo que manda el formulario de entregas (textos crudos, se validan en el servidor). */
export type EntregasEntrada = {
  pickup: { enabled: boolean; address: string; hours: string };
  shipping: { enabled: boolean; mode: ModoEnvio; cost: string; note: string };
  meetup: { enabled: boolean; note: string };
};

export type Tienda = {
  id: string;
  owner_id: string;
  handle: string;
  name: string;
  category: string;
  zone: string;
  description: string | null;
  live_schedule_note: string | null;
  avatar_path: string | null;
  cover_path: string | null;
  onboarding_step: number;
  handle_changed_at: string | null;
};

export type DatosPrivados = {
  payment_alias: string | null;
  payment_holder: string | null;
  pickup_address: string | null;
  pickup_hours: string | null;
};

export type FotoProducto = { id: string; path: string; position: number };

export type Producto = {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  quantity: number;
  visible: boolean;
  fotos: FotoProducto[];
};

export type PuestoResumen = Pick<Tienda, "id" | "handle" | "name" | "category" | "zone" | "avatar_path"> & {
  productos: { id: string; price_cents: number; foto: string | null }[];
};

export type Resultado = { ok: true } | { ok: false; error: string };
```

- [ ] **Step 3: Escribir las pruebas de validación (fallan)**

`src/lib/tiendas/validacion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  datosCobroSchema,
  datosTiendaSchema,
  errorDeHandle,
  normalizarHandle,
  parsearPrecio,
  primerError,
  productoSchema,
} from "./validacion";

describe("normalizarHandle", () => {
  it("saca arrobas, espacios y mayúsculas", () => {
    expect(normalizarHandle(" @RoperiaDeMica ")).toBe("roperiademica");
    expect(normalizarHandle("@@mica.ropa")).toBe("mica.ropa");
  });
});

describe("errorDeHandle", () => {
  it("acepta minúsculas, números y puntos", () => {
    expect(errorDeHandle("roperiademica")).toBeNull();
    expect(errorDeHandle("mica.ropa.2")).toBeNull();
  });

  it("rechaza largos fuera de 3 a 30", () => {
    expect(errorDeHandle("ab")).toBe("Usá solo minúsculas, números y puntos (de 3 a 30).");
    expect(errorDeHandle("a".repeat(31))).toBe("Usá solo minúsculas, números y puntos (de 3 a 30).");
  });

  it("rechaza puntos al inicio, al final o seguidos, y otros caracteres", () => {
    for (const malo of [".mica", "mica.", "mi..ca", "mica_ropa", "micá", "mi ca"]) {
      expect(errorDeHandle(malo)).toBe("Usá solo minúsculas, números y puntos (de 3 a 30).");
    }
  });

  it("rechaza los nombres reservados", () => {
    expect(errorDeHandle("admin")).toBe("Ese @usuario no está disponible. Probá con otro.");
    expect(errorDeHandle("tuferialive")).toBe("Ese @usuario no está disponible. Probá con otro.");
  });
});

describe("parsearPrecio", () => {
  it("entiende miles con punto y centavos con coma", () => {
    expect(parsearPrecio("8.000")).toBe(800000);
    expect(parsearPrecio("$ 8.000")).toBe(800000);
    expect(parsearPrecio("8000")).toBe(800000);
    expect(parsearPrecio("8.500,50")).toBe(850050);
    expect(parsearPrecio("1.234.567")).toBe(123456700);
  });

  it("entiende decimales cortos con coma o punto", () => {
    expect(parsearPrecio("8,5")).toBe(850);
    expect(parsearPrecio("8.5")).toBe(850);
    expect(parsearPrecio("8.50")).toBe(850);
  });

  it("rechaza vacíos, cero, negativos, letras y montos absurdos", () => {
    for (const malo of ["", "  ", "0", "-5", "abc", "8.0000", "1.000.000,001", "1000000,01"]) {
      expect(parsearPrecio(malo), malo).toBeNull();
    }
  });
});

describe("esquemas", () => {
  it("valida los datos de la tienda", () => {
    const ok = datosTiendaSchema.safeParse({ name: "La Ropería de Mica", category: "Ropa usada", zone: "Yerba Buena" });
    expect(ok.success).toBe(true);
    const malo = datosTiendaSchema.safeParse({ name: "A", category: "Ropa", zone: "YB" });
    expect(malo.success).toBe(false);
    if (!malo.success) expect(primerError(malo.error)).toBe("El nombre tiene que tener entre 2 y 60 caracteres.");
  });

  it("valida alias y titular", () => {
    expect(datosCobroSchema.safeParse({ payment_alias: "mica.ropa.yb", payment_holder: "Micaela Díaz" }).success).toBe(true);
    const malo = datosCobroSchema.safeParse({ payment_alias: "mi ca", payment_holder: "Micaela Díaz" });
    expect(malo.success).toBe(false);
    if (!malo.success) {
      expect(primerError(malo.error)).toBe("El alias tiene entre 6 y 20 letras, números, puntos o guiones.");
    }
  });

  it("valida el producto", () => {
    const ok = productoSchema.safeParse({ name: "Vestido azul", description: "Talle M", price_cents: 800000, quantity: 1, visible: true });
    expect(ok.success).toBe(true);
    const sinPrecio = productoSchema.safeParse({ name: "Vestido", description: "", price_cents: 0, quantity: 1, visible: true });
    expect(sinPrecio.success).toBe(false);
    if (!sinPrecio.success) expect(primerError(sinPrecio.error)).toBe("Escribí un precio válido.");
    const mucho = productoSchema.safeParse({ name: "Vestido", description: "", price_cents: 100, quantity: 1000, visible: true });
    expect(mucho.success).toBe(false);
  });
});
```

- [ ] **Step 4: Correr y ver que falla**

```powershell
npm test -- src/lib/tiendas/validacion.test.ts
```

Expected: FAIL, no encuentra `./validacion`.

- [ ] **Step 5: Implementar `validacion.ts`**

`src/lib/tiendas/validacion.ts`:

```ts
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
 * Convierte lo que escribe una persona en centavos: "8.000" → 800000, "8.500,50" → 850050,
 * "8,5" o "8.5" → 850. Devuelve null si no es un precio válido.
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
  } else if (/^\d+\.\d{1,2}$/.test(limpio)) {
    const [parteEntera, parteDecimal = ""] = limpio.split(".");
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
  price_cents: z.number().int().positive("Escribí un precio válido.").max(PRECIO_MAXIMO, "Escribí un precio válido."),
  quantity: z.number().int().min(0, "La cantidad va de 0 a 999.").max(999, "La cantidad va de 0 a 999."),
  visible: z.boolean(),
});

export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos e intentá de nuevo.";
}
```

- [ ] **Step 6: Correr y ver que pasa**

```powershell
npm test -- src/lib/tiendas/validacion.test.ts
```

Expected: PASS.

- [ ] **Step 7: Escribir las pruebas de entregas (fallan)**

`src/lib/tiendas/entrega.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EntregasEntrada, OpcionEntrega } from "./tipos";
import { resumenEntregas, validarEntregas } from "./entrega";

const base: EntregasEntrada = {
  pickup: { enabled: false, address: "", hours: "" },
  shipping: { enabled: false, mode: "fixed", cost: "", note: "" },
  meetup: { enabled: false, note: "" },
};

describe("validarEntregas", () => {
  it("exige al menos una forma de entrega", () => {
    expect(validarEntregas(base)).toEqual({ ok: false, error: "Elegí al menos una forma de entrega." });
  });

  it("exige la dirección si hay retiro en domicilio", () => {
    const r = validarEntregas({ ...base, pickup: { enabled: true, address: "", hours: "" } });
    expect(r).toEqual({ ok: false, error: "Escribí la dirección para el retiro." });
  });

  it("exige el costo si el envío es con monto fijo", () => {
    const r = validarEntregas({ ...base, shipping: { enabled: true, mode: "fixed", cost: "abc", note: "" } });
    expect(r).toEqual({ ok: false, error: "Escribí el costo del envío." });
  });

  it("arma las opciones y separa los datos privados del retiro", () => {
    const r = validarEntregas({
      pickup: { enabled: true, address: "  Av. Aconquija 1234  ", hours: "Lun a vie 17 a 20 h" },
      shipping: { enabled: true, mode: "fixed", cost: "2.500", note: "Solo Gran San Miguel" },
      meetup: { enabled: false, note: "" },
    });
    expect(r).toEqual({
      ok: true,
      pickupAddress: "Av. Aconquija 1234",
      pickupHours: "Lun a vie 17 a 20 h",
      opciones: [
        { kind: "pickup", enabled: true, shipping_mode: null, shipping_cost_cents: null, note: null },
        { kind: "shipping", enabled: true, shipping_mode: "fixed", shipping_cost_cents: 250000, note: "Solo Gran San Miguel" },
        { kind: "meetup", enabled: false, shipping_mode: null, shipping_cost_cents: null, note: null },
      ],
    });
  });

  it("el envío gratis o a coordinar no lleva costo", () => {
    const r = validarEntregas({ ...base, shipping: { enabled: true, mode: "free", cost: "999", note: "" } });
    expect(r.ok && r.opciones[1]).toEqual({
      kind: "shipping", enabled: true, shipping_mode: "free", shipping_cost_cents: null, note: null,
    });
  });
});

describe("resumenEntregas", () => {
  const op = (o: Partial<OpcionEntrega> & Pick<OpcionEntrega, "kind">): OpcionEntrega => ({
    enabled: true, shipping_mode: null, shipping_cost_cents: null, note: null, ...o,
  });

  it("describe cada forma habilitada en orden", () => {
    expect(
      resumenEntregas(
        [op({ kind: "meetup" }), op({ kind: "shipping", shipping_mode: "fixed", shipping_cost_cents: 250000 }), op({ kind: "pickup" })],
        "Yerba Buena",
      ),
    ).toEqual(["Retiro en Yerba Buena", "Envío $2.500", "Punto de encuentro"]);
  });

  it("describe el envío gratis y a coordinar, y omite las deshabilitadas", () => {
    expect(resumenEntregas([op({ kind: "shipping", shipping_mode: "free" })], "X")).toEqual(["Envío gratis"]);
    expect(resumenEntregas([op({ kind: "shipping", shipping_mode: "arrange" })], "X")).toEqual(["Envío a coordinar"]);
    expect(resumenEntregas([op({ kind: "pickup", enabled: false })], "X")).toEqual([]);
  });
});
```

- [ ] **Step 8: Correr y ver que falla**

```powershell
npm test -- src/lib/tiendas/entrega.test.ts
```

Expected: FAIL, no encuentra `./entrega`.

- [ ] **Step 9: Implementar `entrega.ts`**

`src/lib/tiendas/entrega.ts`:

```ts
import { formatARS } from "@/lib/format/plata";
import type { EntregasEntrada, OpcionEntrega, TipoEntrega } from "./tipos";
import { parsearPrecio } from "./validacion";

const ORDEN: TipoEntrega[] = ["pickup", "shipping", "meetup"];

type ResultadoEntregas =
  | { ok: true; opciones: OpcionEntrega[]; pickupAddress: string | null; pickupHours: string | null }
  | { ok: false; error: string };

const nota = (texto: string): string | null => {
  const limpio = texto.trim();
  return limpio ? limpio : null;
};

export function validarEntregas(entrada: EntregasEntrada): ResultadoEntregas {
  const { pickup, shipping, meetup } = entrada;
  if (!pickup.enabled && !shipping.enabled && !meetup.enabled) {
    return { ok: false, error: "Elegí al menos una forma de entrega." };
  }
  const direccion = pickup.address.trim();
  if (pickup.enabled && (direccion.length < 5 || direccion.length > 120)) {
    return { ok: false, error: "Escribí la dirección para el retiro." };
  }
  if ([pickup.hours, shipping.note, meetup.note].some((t) => t.trim().length > 80)) {
    return { ok: false, error: "Las aclaraciones pueden tener hasta 80 caracteres." };
  }
  let costo: number | null = null;
  if (shipping.enabled && shipping.mode === "fixed") {
    costo = parsearPrecio(shipping.cost);
    if (costo === null) return { ok: false, error: "Escribí el costo del envío." };
  }
  return {
    ok: true,
    pickupAddress: pickup.enabled ? direccion : null,
    pickupHours: pickup.enabled ? nota(pickup.hours) : null,
    opciones: [
      { kind: "pickup", enabled: pickup.enabled, shipping_mode: null, shipping_cost_cents: null, note: null },
      {
        kind: "shipping",
        enabled: shipping.enabled,
        shipping_mode: shipping.enabled ? shipping.mode : null,
        shipping_cost_cents: costo,
        note: shipping.enabled ? nota(shipping.note) : null,
      },
      { kind: "meetup", enabled: meetup.enabled, shipping_mode: null, shipping_cost_cents: null, note: meetup.enabled ? nota(meetup.note) : null },
    ],
  };
}

/** Texto público de cada forma de entrega habilitada: "Retiro en Yerba Buena", "Envío $2.500"… */
export function resumenEntregas(opciones: OpcionEntrega[], zona: string): string[] {
  return [...opciones]
    .filter((o) => o.enabled)
    .sort((a, b) => ORDEN.indexOf(a.kind) - ORDEN.indexOf(b.kind))
    .map((o) => {
      if (o.kind === "pickup") return `Retiro en ${zona}`;
      if (o.kind === "meetup") return "Punto de encuentro";
      if (o.shipping_mode === "free") return "Envío gratis";
      if (o.shipping_mode === "fixed" && o.shipping_cost_cents) return `Envío ${formatARS(o.shipping_cost_cents)}`;
      return "Envío a coordinar";
    });
}
```

- [ ] **Step 10: Correr y ver que pasa**

```powershell
npm test -- src/lib/tiendas
```

Expected: PASS.

- [ ] **Step 11: Escribir las pruebas de rutas de fotos (fallan)**

`src/lib/fotos/rutas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { medidasEscaladas, nuevaRutaFoto, rutaEsDeTienda, rutaVariante, urlFoto } from "./rutas";

const TIENDA = "3f1c2a9e-1111-4222-8333-444455556666";

describe("medidasEscaladas", () => {
  it("achica respetando la proporción por el lado mayor", () => {
    expect(medidasEscaladas(4000, 3000, 1200)).toEqual({ ancho: 1200, alto: 900 });
    expect(medidasEscaladas(3000, 4000, 400)).toEqual({ ancho: 300, alto: 400 });
  });

  it("nunca agranda una foto chica", () => {
    expect(medidasEscaladas(300, 200, 1200)).toEqual({ ancho: 300, alto: 200 });
  });
});

describe("rutas", () => {
  it("arma la ruta de cada tamaño", () => {
    expect(rutaVariante(`${TIENDA}/productos/abc.webp`, "chica")).toBe(`${TIENDA}/productos/abc-400.webp`);
    expect(rutaVariante(`${TIENDA}/perfil/abc.jpg`, "grande")).toBe(`${TIENDA}/perfil/abc-1200.jpg`);
  });

  it("crea rutas nuevas dentro de la carpeta de la tienda", () => {
    const ruta = nuevaRutaFoto(TIENDA, "productos", "webp");
    expect(rutaEsDeTienda(ruta, TIENDA, "productos")).toBe(true);
  });

  it("rechaza rutas de otra tienda, otra carpeta o con trucos", () => {
    const ruta = nuevaRutaFoto(TIENDA, "productos", "webp");
    expect(rutaEsDeTienda(ruta, "otra-tienda", "productos")).toBe(false);
    expect(rutaEsDeTienda(ruta, TIENDA, "perfil")).toBe(false);
    expect(rutaEsDeTienda(`${TIENDA}/productos/../../x.webp`, TIENDA, "productos")).toBe(false);
  });

  it("arma la dirección pública", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co";
    expect(urlFoto(`${TIENDA}/perfil/abc.webp`, "chica")).toBe(
      `https://ejemplo.supabase.co/storage/v1/object/public/tienda-fotos/${TIENDA}/perfil/abc-400.webp`,
    );
  });
});
```

- [ ] **Step 12: Correr y ver que falla**

```powershell
npm test -- src/lib/fotos
```

Expected: FAIL, no encuentra `./rutas`.

- [ ] **Step 13: Implementar `rutas.ts`**

`src/lib/fotos/rutas.ts`:

```ts
export const TAMANOS_FOTO = { chica: 400, grande: 1200 } as const;
export type TamanoFoto = keyof typeof TAMANOS_FOTO;
export type CarpetaFoto = "perfil" | "portada" | "productos";
export const BUCKET_FOTOS = "tienda-fotos";

/** Achica (nunca agranda) para que el lado mayor no pase de `maximo`. */
export function medidasEscaladas(ancho: number, alto: number, maximo: number): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/** "tienda/productos/abc.webp" → "tienda/productos/abc-400.webp". */
export function rutaVariante(path: string, tamano: TamanoFoto): string {
  const punto = path.lastIndexOf(".");
  return `${path.slice(0, punto)}-${TAMANOS_FOTO[tamano]}${path.slice(punto)}`;
}

export function nuevaRutaFoto(storeId: string, carpeta: CarpetaFoto, ext: "webp" | "jpg"): string {
  return `${storeId}/${carpeta}/${crypto.randomUUID()}.${ext}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** La ruta pertenece a esa tienda y carpeta, con el formato que genera `nuevaRutaFoto`. */
export function rutaEsDeTienda(path: string, storeId: string, carpeta: CarpetaFoto): boolean {
  return new RegExp(`^${storeId}/${carpeta}/${UUID}\\.(webp|jpg)$`).test(path);
}

export function urlFoto(path: string, tamano: TamanoFoto): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/${rutaVariante(path, tamano)}`;
}
```

- [ ] **Step 14: Correr todo, tipos y estilo**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }
```

Expected: todas PASS (16 anteriores + las nuevas), sin errores.

- [ ] **Step 15: Commit**

```powershell
git add -A
git commit -m "Agregar validaciones de tiendas, entregas y rutas de fotos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Base de datos de tiendas con sus reglas de seguridad

**Files:**
- Modify: `src/db/schema.ts`, `tests/helpers/usuario-prueba.ts` (sin cambios de firma), `package.json` (nada)
- Create: `drizzle/0002_*.sql` (generada), `drizzle/0003_seguridad_tiendas.sql`, `tests/helpers/tiendas-prueba.ts`, `tests/integracion/tiendas.test.ts`

**Interfaces:**
- Consumes: `users` (Drizzle), `crearUsuarioPrueba`, `borrarUsuarioPrueba`, `clienteAdmin`, `clienteAnonimo`, `UsuarioPrueba` (de `tests/helpers/usuario-prueba.ts`).
- Produces:
  - Tablas `platform_admins`, `invitations`, `stores`, `store_private_info`, `store_delivery_options`, `products`, `product_photos`, `follows`; enums `delivery_kind`, `shipping_mode`; bucket `tienda-fotos`.
  - Funciones SQL (RPC): `es_admin() → boolean`, `es_duena_de(p_store uuid) → boolean`, `estado_invitacion(p_token text) → text` (`valida` | `vencida` | `usada` | `invalida`), `canjear_invitacion(p_token text, p_handle text, p_name text, p_category text, p_zone text) → uuid` (errores `P0001` con mensaje `sin_sesion` | `invitacion_invalida` | `invitacion_usada` | `invitacion_vencida` | `ya_tiene_tienda` | `handle_tomado` | `handle_invalido`), `contar_seguidores(p_store uuid) → integer`. Trigger que lanza `handle_cambio_reciente` (P0001).
  - Helpers de prueba (`tests/helpers/tiendas-prueba.ts`): `hacerAdmin(userId: string): Promise<void>`, `crearInvitacionPrueba(adminId: string, opciones?: { venceEnDias?: number }): Promise<string>` (devuelve el token), `crearTiendaPrueba(usuario: UsuarioPrueba, datos?: { handle?: string; completa?: boolean; conProducto?: boolean }): Promise<{ id: string; handle: string }>`, `borrarFotosDeTienda(storeId: string): Promise<void>`, `handleAleatorio(prefijo?: string): string`.

- [ ] **Step 1: Agregar las tablas al esquema**

Agregar al final de `src/db/schema.ts` (y sumar `boolean, integer, pgEnum, primaryKey, unique, index` al import de `drizzle-orm/pg-core`):

```ts
export const deliveryKind = pgEnum("delivery_kind", ["pickup", "shipping", "meetup"]);
export const shippingMode = pgEnum("shipping_mode", ["free", "fixed", "arrange"]);

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  note: text("note"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(),
  handleChangedAt: timestamp("handle_changed_at", { withTimezone: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  zone: text("zone").notNull(),
  description: text("description"),
  liveScheduleNote: text("live_schedule_note"),
  avatarPath: text("avatar_path"),
  coverPath: text("cover_path"),
  onboardingStep: integer("onboarding_step").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storePrivateInfo = pgTable("store_private_info", {
  storeId: uuid("store_id").primaryKey().references(() => stores.id, { onDelete: "cascade" }),
  paymentAlias: text("payment_alias"),
  paymentHolder: text("payment_holder"),
  pickupAddress: text("pickup_address"),
  pickupHours: text("pickup_hours"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeDeliveryOptions = pgTable(
  "store_delivery_options",
  {
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    kind: deliveryKind("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    shippingMode: shippingMode("shipping_mode"),
    shippingCostCents: integer("shipping_cost_cents"),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.kind] })],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_store_id_idx").on(t.storeId)],
);

export const productPhotos = pgTable(
  "product_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [unique("product_photos_product_position_unique").on(t.productId, t.position)],
);

export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storeId] }), index("follows_store_id_idx").on(t.storeId)],
);
```

- [ ] **Step 2: Generar la migración de tablas**

```powershell
npm run db:generate 2>&1 | ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' }
```

Expected: aparece `drizzle/0002_<nombre>.sql` con los `CREATE TYPE`, los 8 `CREATE TABLE` y sus claves foráneas. Revisar que no toque `users` ni el esquema `auth`, y que las restricciones únicas se llamen `stores_owner_id_unique` y `stores_handle_unique` (las usa la función de canje; si drizzle-kit les pone otro nombre, usar el que generó en el Step 3 y anotarlo).

- [ ] **Step 3: Migración de seguridad**

```powershell
npx drizzle-kit generate --custom --name=seguridad_tiendas
```

Completar `drizzle/0003_seguridad_tiendas.sql`:

```sql
-- ===== Restricciones de datos =====
ALTER TABLE public.stores
  ADD CONSTRAINT stores_handle_formato CHECK (
    char_length(handle) BETWEEN 3 AND 30
    AND handle ~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
    AND handle <> ALL (ARRAY['admin','administrador','api','auth','cuenta','diseno','invitacion','soporte','ayuda','tuferia','tuferialive','tuferia.live','oficial','seguidos','compras','puesto','tienda','vivo','envivo'])
  ),
  ADD CONSTRAINT stores_textos CHECK (
    char_length(btrim(name)) BETWEEN 2 AND 60
    AND char_length(category) <= 40 AND char_length(zone) <= 40
    AND char_length(coalesce(description, '')) <= 300
    AND char_length(coalesce(live_schedule_note, '')) <= 80
  ),
  ADD CONSTRAINT stores_paso CHECK (onboarding_step BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE public.invitations ADD CONSTRAINT invitations_textos CHECK (
  char_length(token) >= 32 AND char_length(coalesce(note, '')) <= 80
);
--> statement-breakpoint
ALTER TABLE public.store_private_info ADD CONSTRAINT store_private_info_textos CHECK (
  (payment_alias IS NULL OR payment_alias ~ '^[A-Za-z0-9.-]{6,20}$')
  AND (payment_holder IS NULL OR char_length(btrim(payment_holder)) BETWEEN 3 AND 80)
  AND (pickup_address IS NULL OR char_length(pickup_address) BETWEEN 5 AND 120)
  AND char_length(coalesce(pickup_hours, '')) <= 80
);
--> statement-breakpoint
ALTER TABLE public.store_delivery_options ADD CONSTRAINT store_delivery_options_reglas CHECK (
  char_length(coalesce(note, '')) <= 80
  AND (kind = 'shipping' OR (shipping_mode IS NULL AND shipping_cost_cents IS NULL))
  AND (shipping_mode IS DISTINCT FROM 'fixed' OR shipping_cost_cents > 0)
  AND (shipping_mode = 'fixed' OR shipping_cost_cents IS NULL)
);
--> statement-breakpoint
ALTER TABLE public.products ADD CONSTRAINT products_reglas CHECK (
  char_length(btrim(name)) BETWEEN 2 AND 60
  AND char_length(coalesce(description, '')) <= 200
  AND price_cents > 0 AND price_cents <= 100000000
  AND quantity BETWEEN 0 AND 999
);
--> statement-breakpoint
ALTER TABLE public.product_photos ADD CONSTRAINT product_photos_posicion CHECK (position BETWEEN 0 AND 3);
--> statement-breakpoint

-- ===== Funciones de ayuda (SECURITY DEFINER, search_path vacío) =====
CREATE FUNCTION public.es_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()));
$$;
--> statement-breakpoint
CREATE FUNCTION public.es_duena_de(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = (SELECT auth.uid()));
$$;
--> statement-breakpoint
CREATE FUNCTION public.contar_seguidores(p_store uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.follows WHERE store_id = p_store;
$$;
--> statement-breakpoint
CREATE FUNCTION public.estado_invitacion(p_token text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN i.id IS NULL OR i.revoked_at IS NOT NULL THEN 'invalida'
    WHEN i.used_at IS NOT NULL THEN 'usada'
    WHEN i.expires_at < now() THEN 'vencida'
    ELSE 'valida'
  END
  FROM (SELECT 1) AS uno LEFT JOIN public.invitations i ON i.token = p_token;
$$;
--> statement-breakpoint
CREATE FUNCTION public.canjear_invitacion(
  p_token text, p_handle text, p_name text, p_category text, p_zone text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.invitations%ROWTYPE;
  v_store uuid;
  v_restriccion text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sin_sesion' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_inv FROM public.invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR v_inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invitacion_invalida' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.used_at IS NOT NULL THEN RAISE EXCEPTION 'invitacion_usada' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'invitacion_vencida' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.stores WHERE owner_id = v_uid) THEN
    RAISE EXCEPTION 'ya_tiene_tienda' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    INSERT INTO public.stores (owner_id, handle, name, category, zone, onboarding_step)
    VALUES (v_uid, lower(btrim(p_handle)), btrim(p_name), btrim(p_category), btrim(p_zone), 2)
    RETURNING id INTO v_store;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
      IF v_restriccion = 'stores_owner_id_unique' THEN
        RAISE EXCEPTION 'ya_tiene_tienda' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'handle_tomado' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'handle_invalido' USING ERRCODE = 'P0001';
  END;
  INSERT INTO public.store_private_info (store_id) VALUES (v_store);
  UPDATE public.invitations SET used_by = v_uid, used_at = now() WHERE id = v_inv.id;
  RETURN v_store;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.controlar_cambio_tienda() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.handle IS DISTINCT FROM OLD.handle THEN
    IF OLD.handle_changed_at IS NOT NULL AND OLD.handle_changed_at > now() - interval '30 days' THEN
      RAISE EXCEPTION 'handle_cambio_reciente' USING ERRCODE = 'P0001';
    END IF;
    NEW.handle_changed_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER al_cambiar_tienda BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.controlar_cambio_tienda();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.es_admin(), public.es_duena_de(uuid), public.contar_seguidores(uuid),
  public.estado_invitacion(text), public.canjear_invitacion(text, text, text, text, text),
  public.controlar_cambio_tienda() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.contar_seguidores(uuid), public.estado_invitacion(text) TO anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.es_admin(), public.es_duena_de(uuid),
  public.canjear_invitacion(text, text, text, text, text) TO authenticated;
--> statement-breakpoint

-- ===== RLS y permisos por tabla =====
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_private_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_delivery_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.platform_admins, public.invitations, public.stores, public.store_private_info,
  public.store_delivery_options, public.products, public.product_photos, public.follows FROM anon, authenticated;
--> statement-breakpoint
-- service_role (solo servidor y pruebas) necesita permisos explícitos en este proyecto
GRANT ALL ON public.platform_admins, public.invitations, public.stores, public.store_private_info,
  public.store_delivery_options, public.products, public.product_photos, public.follows TO service_role;
--> statement-breakpoint
GRANT SELECT ON public.platform_admins TO authenticated;
CREATE POLICY "Cada admin se ve a sí mismo" ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (revoked_at) ON public.invitations TO authenticated;
CREATE POLICY "Admins leen invitaciones" ON public.invitations FOR SELECT TO authenticated USING ((SELECT public.es_admin()));
CREATE POLICY "Admins crean invitaciones" ON public.invitations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_admin()) AND created_by = (SELECT auth.uid()));
CREATE POLICY "Admins anulan invitaciones" ON public.invitations FOR UPDATE TO authenticated
  USING ((SELECT public.es_admin())) WITH CHECK ((SELECT public.es_admin()));
--> statement-breakpoint
GRANT SELECT ON public.stores TO anon, authenticated;
GRANT UPDATE (handle, name, category, zone, description, live_schedule_note, avatar_path, cover_path, onboarding_step)
  ON public.stores TO authenticated;
CREATE POLICY "Tiendas públicas" ON public.stores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "La dueña edita su tienda" ON public.stores FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.store_private_info TO authenticated;
CREATE POLICY "Solo la dueña ve sus datos privados" ON public.store_private_info FOR SELECT TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "Solo la dueña crea sus datos privados" ON public.store_private_info FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "Solo la dueña edita sus datos privados" ON public.store_private_info FOR UPDATE TO authenticated
  USING ((SELECT public.es_duena_de(store_id))) WITH CHECK ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
GRANT SELECT ON public.store_delivery_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_delivery_options TO authenticated;
CREATE POLICY "Entregas públicas" ON public.store_delivery_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "La dueña crea entregas" ON public.store_delivery_options FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña edita entregas" ON public.store_delivery_options FOR UPDATE TO authenticated
  USING ((SELECT public.es_duena_de(store_id))) WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña borra entregas" ON public.store_delivery_options FOR DELETE TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
CREATE POLICY "Productos visibles para todos" ON public.products FOR SELECT TO anon, authenticated
  USING (visible OR (SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña crea productos" ON public.products FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña edita productos" ON public.products FOR UPDATE TO authenticated
  USING ((SELECT public.es_duena_de(store_id))) WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña borra productos" ON public.products FOR DELETE TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
GRANT SELECT ON public.product_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_photos TO authenticated;
CREATE POLICY "Fotos de productos visibles" ON public.product_photos FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY "La dueña agrega fotos" ON public.product_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (SELECT public.es_duena_de(p.store_id))));
CREATE POLICY "La dueña edita fotos" ON public.product_photos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (SELECT public.es_duena_de(p.store_id))));
CREATE POLICY "La dueña borra fotos" ON public.product_photos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (SELECT public.es_duena_de(p.store_id))));
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
CREATE POLICY "Cada persona ve a quién sigue" ON public.follows FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Cada persona sigue por sí misma" ON public.follows FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Cada persona deja de seguir por sí misma" ON public.follows FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint

-- ===== Fotos (Supabase Storage) =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tienda-fotos', 'tienda-fotos', true, 1048576, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE POLICY "La dueña ve los archivos de su tienda" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tienda-fotos' AND (SELECT public.es_duena_de(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "La dueña sube a su carpeta" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tienda-fotos' AND (SELECT public.es_duena_de(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "La dueña borra de su carpeta" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tienda-fotos' AND (SELECT public.es_duena_de(((storage.foldername(name))[1])::uuid)));
```

Nota: el bucket es público, así que las fotos se leen por su dirección pública sin política de lectura; la política de lectura de la dueña hace falta para que pueda borrar.

- [ ] **Step 4: Helpers de prueba**

`tests/helpers/tiendas-prueba.ts`:

```ts
import { randomBytes } from "node:crypto";
import { clienteAdmin, type UsuarioPrueba } from "./usuario-prueba";

export function handleAleatorio(prefijo = "prueba"): string {
  return `${prefijo}.${randomBytes(4).toString("hex")}`;
}

export async function hacerAdmin(userId: string): Promise<void> {
  const { error } = await clienteAdmin().from("platform_admins").insert({ user_id: userId });
  if (error) throw error;
}

export async function crearInvitacionPrueba(adminId: string, opciones: { venceEnDias?: number } = {}): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const vence = new Date(Date.now() + (opciones.venceEnDias ?? 7) * 86_400_000).toISOString();
  const { error } = await clienteAdmin()
    .from("invitations")
    .insert({ token, created_by: adminId, expires_at: vence, note: "Prueba" });
  if (error) throw error;
  return token;
}

/** Crea una tienda directamente (sin invitación) para preparar pruebas. */
export async function crearTiendaPrueba(
  usuario: UsuarioPrueba,
  datos: { handle?: string; completa?: boolean; conProducto?: boolean } = {},
): Promise<{ id: string; handle: string }> {
  const admin = clienteAdmin();
  const handle = datos.handle ?? handleAleatorio();
  const completa = datos.completa ?? true;
  const { data, error } = await admin
    .from("stores")
    .insert({
      owner_id: usuario.id, handle, name: "Puesto de Prueba", category: "Ropa usada", zone: "Yerba Buena",
      onboarding_step: completa ? 5 : 2,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  await admin.from("store_private_info").insert({
    store_id: id,
    payment_alias: completa ? "prueba.alias" : null,
    payment_holder: completa ? "Titular Prueba" : null,
    pickup_address: completa ? "Calle Falsa 123" : null,
  });
  if (completa) {
    await admin.from("store_delivery_options").insert({ store_id: id, kind: "pickup", enabled: true });
  }
  if (datos.conProducto) {
    await admin.from("products").insert({ store_id: id, name: "Vestido de prueba", price_cents: 800000, quantity: 1 });
  }
  return { id, handle };
}

export async function borrarFotosDeTienda(storeId: string): Promise<void> {
  const bucket = clienteAdmin().storage.from("tienda-fotos");
  for (const carpeta of ["perfil", "portada", "productos"]) {
    const { data } = await bucket.list(`${storeId}/${carpeta}`, { limit: 1000 });
    const rutas = (data ?? []).map((f) => `${storeId}/${carpeta}/${f.name}`);
    if (rutas.length) await bucket.remove(rutas);
  }
}
```

- [ ] **Step 5: Escribir las pruebas de integración (fallan)**

`tests/integracion/tiendas.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarFotosDeTienda, crearInvitacionPrueba, crearTiendaPrueba, handleAleatorio, hacerAdmin,
} from "../helpers/tiendas-prueba";

describe("tiendas, invitaciones y seguridad", () => {
  let admin: UsuarioPrueba;
  let mica: UsuarioPrueba;
  let compradora: UsuarioPrueba;
  let tiendaMica: { id: string; handle: string };

  beforeAll(async () => {
    [admin, mica, compradora] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Admin Prueba" }),
      crearUsuarioPrueba({ nombre: "Mica Prueba" }),
      crearUsuarioPrueba({ nombre: "Compradora Prueba" }),
    ]);
    await hacerAdmin(admin.id);
    tiendaMica = await crearTiendaPrueba(mica, { conProducto: true });
  });

  afterAll(async () => {
    if (tiendaMica) await borrarFotosDeTienda(tiendaMica.id);
    await Promise.all([admin, mica, compradora].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

  describe("datos privados", () => {
    it("la dueña ve su alias", async () => {
      const { data } = await mica.cliente.from("store_private_info").select("payment_alias").eq("store_id", tiendaMica.id).single();
      expect(data?.payment_alias).toBe("prueba.alias");
    });

    it("una compradora no ve alias, titular ni dirección", async () => {
      const { data } = await compradora.cliente.from("store_private_info").select("*").eq("store_id", tiendaMica.id);
      expect(data ?? []).toEqual([]);
    });

    it("una visitante sin sesión tampoco", async () => {
      const { data, error } = await clienteAnonimo().from("store_private_info").select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  });

  describe("tiendas y productos", () => {
    it("cualquiera ve la tienda y sus entregas", async () => {
      const { data } = await clienteAnonimo().from("stores").select("handle").eq("id", tiendaMica.id).single();
      expect(data?.handle).toBe(tiendaMica.handle);
      const { data: entregas } = await clienteAnonimo().from("store_delivery_options").select("kind").eq("store_id", tiendaMica.id);
      expect(entregas).toEqual([{ kind: "pickup" }]);
    });

    it("otra persona no puede editar la tienda ni sus productos", async () => {
      const { data } = await compradora.cliente.from("stores").update({ name: "Hackeada" }).eq("id", tiendaMica.id).select();
      expect(data).toEqual([]);
      const { data: prod } = await compradora.cliente.from("products").update({ price_cents: 1 }).eq("store_id", tiendaMica.id).select();
      expect(prod).toEqual([]);
      const { error } = await compradora.cliente.from("products").insert({ store_id: tiendaMica.id, name: "Intruso", price_cents: 100 });
      expect(error).not.toBeNull();
    });

    it("los productos ocultos solo los ve la dueña", async () => {
      const { data: oculto } = await mica.cliente
        .from("products").insert({ store_id: tiendaMica.id, name: "Oculto", price_cents: 100, visible: false })
        .select("id").single();
      const { data: paraOtra } = await compradora.cliente.from("products").select("id").eq("id", oculto!.id);
      expect(paraOtra).toEqual([]);
      const { data: paraElla } = await mica.cliente.from("products").select("id").eq("id", oculto!.id);
      expect(paraElla).toHaveLength(1);
    });

    it("un producto admite como máximo 4 fotos (posiciones 0 a 3)", async () => {
      const { data: p } = await mica.cliente.from("products").insert({ store_id: tiendaMica.id, name: "Con fotos", price_cents: 100 }).select("id").single();
      const fotos = [0, 1, 2, 3].map((position) => ({ product_id: p!.id, path: `${tiendaMica.id}/productos/x${position}.webp`, position }));
      expect((await mica.cliente.from("product_photos").insert(fotos)).error).toBeNull();
      const quinta = await mica.cliente.from("product_photos").insert({ product_id: p!.id, path: "x", position: 4 });
      expect(quinta.error).not.toBeNull();
    });

    it("el @usuario se cambia como máximo una vez cada 30 días", async () => {
      const nuevo = handleAleatorio("cambio");
      expect((await mica.cliente.from("stores").update({ handle: nuevo }).eq("id", tiendaMica.id)).error).toBeNull();
      const segundo = await mica.cliente.from("stores").update({ handle: handleAleatorio("otro") }).eq("id", tiendaMica.id);
      expect(segundo.error?.message).toBe("handle_cambio_reciente");
      tiendaMica.handle = nuevo;
    });

    it("rechaza @usuario reservados o mal formados", async () => {
      const malo = await crearUsuarioPrueba();
      try {
        const token = await crearInvitacionPrueba(admin.id);
        const { error } = await malo.cliente.rpc("canjear_invitacion", {
          p_token: token, p_handle: "admin", p_name: "Tienda", p_category: "Ropa", p_zone: "Centro",
        });
        expect(error?.message).toBe("handle_invalido");
      } finally {
        await borrarUsuarioPrueba(malo.id);
      }
    });
  });

  describe("invitaciones", () => {
    it("solo un admin crea y lee invitaciones", async () => {
      const intento = await compradora.cliente.from("invitations").insert({
        token: "x".repeat(32), created_by: compradora.id, expires_at: new Date(Date.now() + 1e6).toISOString(),
      });
      expect(intento.error).not.toBeNull();
      const { data } = await compradora.cliente.from("invitations").select("id");
      expect(data ?? []).toEqual([]);
      const propia = await admin.cliente.from("invitations").insert({
        token: "y".repeat(40), created_by: admin.id, expires_at: new Date(Date.now() + 1e6).toISOString(),
      });
      expect(propia.error).toBeNull();
    });

    it("informa el estado sin revelar datos", async () => {
      const token = await crearInvitacionPrueba(admin.id);
      expect((await clienteAnonimo().rpc("estado_invitacion", { p_token: token })).data).toBe("valida");
      expect((await clienteAnonimo().rpc("estado_invitacion", { p_token: "no-existe" })).data).toBe("invalida");
      const vencida = await crearInvitacionPrueba(admin.id, { venceEnDias: -1 });
      expect((await clienteAnonimo().rpc("estado_invitacion", { p_token: vencida })).data).toBe("vencida");
    });

    it("se canjea una sola vez aunque dos personas lo intenten a la vez", async () => {
      const [ana, beto] = await Promise.all([crearUsuarioPrueba(), crearUsuarioPrueba()]);
      try {
        const token = await crearInvitacionPrueba(admin.id);
        const canjear = (u: UsuarioPrueba) =>
          u.cliente.rpc("canjear_invitacion", {
            p_token: token, p_handle: handleAleatorio("canje"), p_name: "Tienda", p_category: "Ropa", p_zone: "Centro",
          });
        const resultados = await Promise.all([canjear(ana), canjear(beto)]);
        expect(resultados.filter((r) => r.error === null)).toHaveLength(1);
        expect(resultados.find((r) => r.error)?.error?.message).toBe("invitacion_usada");
      } finally {
        await Promise.all([borrarUsuarioPrueba(ana.id), borrarUsuarioPrueba(beto.id)]);
      }
    });

    it("no se canjea vencida, ni si ya tenés tienda, ni con @usuario tomado", async () => {
      const vencida = await crearInvitacionPrueba(admin.id, { venceEnDias: -1 });
      const nueva = await crearUsuarioPrueba();
      try {
        const args = (token: string, handle: string) => ({
          p_token: token, p_handle: handle, p_name: "Tienda", p_category: "Ropa", p_zone: "Centro",
        });
        expect((await nueva.cliente.rpc("canjear_invitacion", args(vencida, handleAleatorio()))).error?.message).toBe("invitacion_vencida");
        const valida = await crearInvitacionPrueba(admin.id);
        expect((await nueva.cliente.rpc("canjear_invitacion", args(valida, tiendaMica.handle))).error?.message).toBe("handle_tomado");
        const otra = await crearInvitacionPrueba(admin.id);
        expect((await mica.cliente.rpc("canjear_invitacion", args(otra, handleAleatorio()))).error?.message).toBe("ya_tiene_tienda");
      } finally {
        await borrarUsuarioPrueba(nueva.id);
      }
    });
  });

  describe("seguir", () => {
    it("cada persona ve solo a quién sigue y el conteo es público", async () => {
      expect((await compradora.cliente.from("follows").insert({ user_id: compradora.id, store_id: tiendaMica.id })).error).toBeNull();
      const { data: deMica } = await mica.cliente.from("follows").select("*");
      expect(deMica ?? []).toEqual([]);
      const { data: conteo } = await clienteAnonimo().rpc("contar_seguidores", { p_store: tiendaMica.id });
      expect(conteo).toBe(1);
      const ajeno = await compradora.cliente.from("follows").insert({ user_id: mica.id, store_id: tiendaMica.id });
      expect(ajeno.error).not.toBeNull();
    });
  });

  describe("fotos", () => {
    const archivo = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

    it("la dueña sube a su carpeta y otra persona no", async () => {
      const ruta = `${tiendaMica.id}/productos/${crypto.randomUUID()}-400.jpg`;
      const propia = await mica.cliente.storage.from("tienda-fotos").upload(ruta, archivo(), { contentType: "image/jpeg" });
      expect(propia.error).toBeNull();
      const ajena = await compradora.cliente.storage
        .from("tienda-fotos").upload(`${tiendaMica.id}/productos/${crypto.randomUUID()}-400.jpg`, archivo(), { contentType: "image/jpeg" });
      expect(ajena.error).not.toBeNull();
    });
  });
});
```

- [ ] **Step 6: Correr y ver que falla**

```powershell
npm run test:integracion -- tests/integracion/tiendas.test.ts
```

Expected: FAIL (las tablas no existen: `Could not find the table 'public.platform_admins'`).

- [ ] **Step 7: Aplicar las migraciones (salida filtrada)**

```powershell
npm run db:migrate 2>&1 | ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' } | Select-Object -Last 4
```

Expected: `migrations applied successfully!`. Si falla la parte de `storage` con "must be owner", aplicar el bloque "Fotos" desde el editor SQL de Supabase (pedírselo al dueño con instrucciones) y registrar el ruling.

- [ ] **Step 8: Correr y ver que pasa**

```powershell
npm run test:integracion
```

Expected: PASS (las 7 de `usuarios` + las de `tiendas`).

- [ ] **Step 9: Verificar y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }
git add -A
git commit -m "Crear las tablas de tiendas, productos e invitaciones con sus reglas de seguridad" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Barra de navegación, sesión y pantallas base

**Files:**
- Create: `src/lib/auth/sesion.ts`, `src/lib/tiendas/datos.ts`, `src/components/navegacion/barra-inferior.tsx`, `src/components/navegacion/barra-segun-sesion.tsx`, `src/components/estado-vacio.tsx`, `src/app/mis-compras/page.tsx`, `src/app/seguidos/page.tsx`, `src/app/mi-puesto/page.tsx`, `tests/e2e/navegacion.spec.ts`
- Modify: `src/app/layout.tsx`, `src/app/auth/acciones.ts`, `src/lib/supabase/proxy.ts`

**Interfaces:**
- Consumes: `createClient()` (servidor), `rutaSegura`, tipos de la Tarea 1, `crearTiendaPrueba` y helpers de sesión de prueba.
- Produces:
  - `obtenerUsuarioId(supabase: SupabaseClient): Promise<string | null>` (`@/lib/auth/sesion`).
  - `@/lib/tiendas/datos`: `CAMPOS_TIENDA`, `obtenerMiTienda(supabase, userId): Promise<Tienda | null>`, `obtenerTiendaPorHandle(supabase, handle): Promise<Tienda | null>`, `obtenerEntregas(supabase, storeId): Promise<OpcionEntrega[]>`, `obtenerDatosPrivados(supabase, storeId): Promise<DatosPrivados | null>`, `listarProductos(supabase, storeId): Promise<Producto[]>`, `obtenerProducto(supabase, storeId, productId): Promise<Producto | null>`, `contarSeguidores(supabase, storeId): Promise<number>`, `listarPuestos(supabase): Promise<PuestoResumen[]>`, `listarSeguidos(supabase, userId): Promise<PuestoResumen[]>`, `idsSeguidos(supabase, userId): Promise<Set<string>>`.
  - `<BarraInferior esFeriante={boolean} />`, `<EstadoVacio titulo texto accion? />`.
  - `entrarConGoogle(formData: FormData)`: lee el campo `next` (validado con `rutaSegura`) y vuelve ahí tras el login.

- [ ] **Step 1: Escribir las pruebas e2e (fallan)**

`tests/e2e/navegacion.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

test("una compradora ve Inicio, Seguidos, Mis compras y Cuenta", async ({ page }) => {
  await page.goto("/mis-compras");
  const barra = page.getByRole("navigation", { name: "Navegación principal" });
  for (const texto of ["Inicio", "Seguidos", "Mis compras", "Cuenta"]) {
    await expect(barra.getByRole("link", { name: texto })).toBeVisible();
  }
  await expect(barra.getByRole("link", { name: "Mis compras" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Cuando ganes un código, lo vas a ver acá.")).toBeVisible();
});

test("Seguidos sin sesión invita a entrar y vuelve a Seguidos", async ({ page }) => {
  await page.goto("/seguidos");
  const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
  await page.getByRole("button", { name: "Entrar con Google" }).click();
  const url = decodeURIComponent((await pedido).url());
  expect(url).toContain("next=/seguidos");
});

test("Mi puesto sin sesión manda al inicio", async ({ page }) => {
  await page.goto("/mi-puesto");
  await expect(page).toHaveURL("/");
});

test.describe("con sesión", () => {
  let compradora: UsuarioPrueba;
  let feriante: UsuarioPrueba;

  test.beforeAll(async () => {
    [compradora, feriante] = await Promise.all([crearUsuarioPrueba({ nombre: "Compra Nav" }), crearUsuarioPrueba({ nombre: "Feria Nav" })]);
    await crearTiendaPrueba(feriante);
  });

  test.afterAll(async () => {
    await Promise.all([compradora, feriante].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

  test("la feriante ve Mi puesto en lugar de Seguidos", async ({ page, context }) => {
    await context.addCookies(await cookiesDeSesion(feriante.sesion));
    await page.goto("/");
    const barra = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(barra.getByRole("link", { name: "Mi puesto" })).toBeVisible();
    await expect(barra.getByRole("link", { name: "Seguidos" })).toHaveCount(0);
    await barra.getByRole("link", { name: "Mi puesto" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Puesto de Prueba" })).toBeVisible();
  });

  test("una compradora sin tienda que entra a Mi puesto ve cómo pedir una invitación", async ({ page, context }) => {
    await context.addCookies(await cookiesDeSesion(compradora.sesion));
    await page.goto("/mi-puesto");
    await expect(page.getByText("Todavía no tenés un puesto.")).toBeVisible();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

```powershell
npm run test:e2e -- tests/e2e/navegacion.spec.ts
```

Expected: FAIL (no existen las páginas ni la barra).

- [ ] **Step 3: Sesión y lecturas de datos**

`src/lib/auth/sesion.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Id de la persona con sesión, o null (también si la cookie está vencida o rota). */
export async function obtenerUsuarioId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    return data?.claims?.sub ?? null;
  } catch {
    return null;
  }
}
```

`src/lib/tiendas/datos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosPrivados, OpcionEntrega, Producto, PuestoResumen, Tienda } from "./tipos";

export const CAMPOS_TIENDA =
  "id, owner_id, handle, name, category, zone, description, live_schedule_note, avatar_path, cover_path, onboarding_step, handle_changed_at";

const CAMPOS_PRODUCTO = "id, store_id, name, description, price_cents, quantity, visible, product_photos(id, path, position)";

type FilaProducto = Omit<Producto, "fotos"> & { product_photos: Producto["fotos"] };

const aProducto = ({ product_photos, ...resto }: FilaProducto): Producto => ({
  ...resto,
  fotos: [...(product_photos ?? [])].sort((a, b) => a.position - b.position),
});

export async function obtenerMiTienda(supabase: SupabaseClient, userId: string): Promise<Tienda | null> {
  const { data } = await supabase.from("stores").select(CAMPOS_TIENDA).eq("owner_id", userId).maybeSingle();
  return (data as Tienda | null) ?? null;
}

export async function obtenerTiendaPorHandle(supabase: SupabaseClient, handle: string): Promise<Tienda | null> {
  const { data } = await supabase.from("stores").select(CAMPOS_TIENDA).eq("handle", handle.toLowerCase()).maybeSingle();
  return (data as Tienda | null) ?? null;
}

export async function obtenerEntregas(supabase: SupabaseClient, storeId: string): Promise<OpcionEntrega[]> {
  const { data } = await supabase
    .from("store_delivery_options")
    .select("kind, enabled, shipping_mode, shipping_cost_cents, note")
    .eq("store_id", storeId);
  return (data as OpcionEntrega[] | null) ?? [];
}

export async function obtenerDatosPrivados(supabase: SupabaseClient, storeId: string): Promise<DatosPrivados | null> {
  const { data } = await supabase
    .from("store_private_info")
    .select("payment_alias, payment_holder, pickup_address, pickup_hours")
    .eq("store_id", storeId)
    .maybeSingle();
  return (data as DatosPrivados | null) ?? null;
}

export async function listarProductos(supabase: SupabaseClient, storeId: string): Promise<Producto[]> {
  const { data } = await supabase.from("products").select(CAMPOS_PRODUCTO).eq("store_id", storeId).order("created_at", { ascending: false });
  return ((data as FilaProducto[] | null) ?? []).map(aProducto);
}

export async function obtenerProducto(supabase: SupabaseClient, storeId: string, productId: string): Promise<Producto | null> {
  const { data } = await supabase.from("products").select(CAMPOS_PRODUCTO).eq("store_id", storeId).eq("id", productId).maybeSingle();
  return data ? aProducto(data as FilaProducto) : null;
}

export async function contarSeguidores(supabase: SupabaseClient, storeId: string): Promise<number> {
  const { data } = await supabase.rpc("contar_seguidores", { p_store: storeId });
  return typeof data === "number" ? data : 0;
}

const CAMPOS_PUESTO =
  "id, handle, name, category, zone, avatar_path, created_at, products(id, price_cents, visible, created_at, product_photos(path, position))";

type FilaPuesto = Omit<PuestoResumen, "productos"> & {
  products: { id: string; price_cents: number; visible: boolean; product_photos: { path: string; position: number }[] }[];
};

const aPuesto = ({ products, ...tienda }: FilaPuesto): PuestoResumen => ({
  ...tienda,
  productos: (products ?? [])
    .filter((p) => p.visible)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      price_cents: p.price_cents,
      foto: [...(p.product_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.path ?? null,
    })),
});

/** Puestos completos (paso 5) para el Inicio: primero los que tienen productos. */
export async function listarPuestos(supabase: SupabaseClient): Promise<PuestoResumen[]> {
  const { data } = await supabase
    .from("stores")
    .select(CAMPOS_PUESTO)
    .eq("onboarding_step", 5)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "products", ascending: false })
    .limit(50);
  const puestos = ((data as FilaPuesto[] | null) ?? []).map(aPuesto);
  return puestos.sort((a, b) => Number(b.productos.length > 0) - Number(a.productos.length > 0));
}

export async function listarSeguidos(supabase: SupabaseClient, userId: string): Promise<PuestoResumen[]> {
  const { data } = await supabase
    .from("follows")
    .select(`stores(${CAMPOS_PUESTO})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data as { stores: FilaPuesto | null }[] | null) ?? [])
    .flatMap((f) => (f.stores ? [aPuesto(f.stores)] : []));
}

export async function idsSeguidos(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("follows").select("store_id").eq("user_id", userId);
  return new Set(((data as { store_id: string }[] | null) ?? []).map((f) => f.store_id));
}
```

- [ ] **Step 4: Barra inferior y estado vacío**

`src/components/navegacion/barra-inferior.tsx`:

```tsx
"use client";

import { Heart, Home, ShoppingBag, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BarraInferior({ esFeriante }: { esFeriante: boolean }) {
  const ruta = usePathname();
  const items = [
    { href: "/", texto: "Inicio", Icono: Home },
    esFeriante
      ? { href: "/mi-puesto", texto: "Mi puesto", Icono: Store }
      : { href: "/seguidos", texto: "Seguidos", Icono: Heart },
    { href: "/mis-compras", texto: "Mis compras", Icono: ShoppingBag },
    { href: "/cuenta", texto: "Cuenta", Icono: User },
  ];
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map(({ href, texto, Icono }) => {
          const activo = href === "/" ? ruta === "/" : ruta.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  activo ? "font-bold text-primary" : "text-muted-foreground"
                }`}
              >
                <Icono aria-hidden="true" className="size-5" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`src/components/navegacion/barra-segun-sesion.tsx`:

```tsx
import { connection } from "next/server";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import { BarraInferior } from "./barra-inferior";

export async function BarraSegunSesion() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const esFeriante = userId ? (await obtenerMiTienda(supabase, userId)) !== null : false;
  return <BarraInferior esFeriante={esFeriante} />;
}
```

`src/components/estado-vacio.tsx`:

```tsx
import type { ReactNode } from "react";

export function EstadoVacio({ titulo, texto, accion }: { titulo?: string; texto: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
      {titulo && <p className="text-lg font-bold">{titulo}</p>}
      <p className="text-muted-foreground">{texto}</p>
      {accion}
    </div>
  );
}
```

- [ ] **Step 5: Barra en el layout**

En `src/app/layout.tsx`: importar `Suspense` de `react`, `BarraInferior` y `BarraSegunSesion`; reemplazar el contenido de `<body>` por:

```tsx
      <body>
        <AvisoSinConexion />
        <div className="pb-20">{children}</div>
        <Suspense fallback={<BarraInferior esFeriante={false} />}>
          <BarraSegunSesion />
        </Suspense>
        <Toaster position="top-center" />
      </body>
```

- [ ] **Step 6: Login con destino**

Reemplazar `entrarConGoogle` en `src/app/auth/acciones.ts`:

```ts
export async function entrarConGoogle(formData: FormData) {
  const origin = (await headers()).get("origin");
  if (!origin) redirect("/?error=login");
  const destino = rutaSegura(typeof formData.get("next") === "string" ? (formData.get("next") as string) : null);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destino)}` },
  });
  if (error || !data.url) redirect("/?error=login");
  redirect(data.url);
}
```

Agregar `import { rutaSegura } from "@/lib/auth/ruta-segura";` arriba.

- [ ] **Step 7: Proteger Mi puesto**

En `src/lib/supabase/proxy.ts`, cambiar `const RUTAS_PROTEGIDAS = ["/cuenta"];` por:

```ts
const RUTAS_PROTEGIDAS = ["/cuenta", "/mi-puesto"];
```

- [ ] **Step 8: Pantallas base**

`src/app/mis-compras/page.tsx`:

```tsx
import { EstadoVacio } from "@/components/estado-vacio";

export default function MisComprasPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Mis compras</h1>
      <EstadoVacio texto="Cuando ganes un código, lo vas a ver acá." />
    </main>
  );
}
```

`src/app/seguidos/page.tsx` (la Tarea 8 completa la lista):

```tsx
import { connection } from "next/server";
import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";

async function ContenidoSeguidos() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) {
    return (
      <EstadoVacio
        texto="Entrá con Google para ver los puestos que seguís."
        accion={
          <form action={entrarConGoogle}>
            <input type="hidden" name="next" value="/seguidos" />
            <Button type="submit">Entrar con Google</Button>
          </form>
        }
      />
    );
  }
  return <EstadoVacio texto="Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten." />;
}

export default function SeguidosPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Seguidos</h1>
      <Suspense>
        <ContenidoSeguidos />
      </Suspense>
    </main>
  );
}
```

`src/app/mi-puesto/page.tsx` (las Tareas 5 a 7 suman accesos):

```tsx
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";

async function ContenidoMiPuesto({ searchParams }: { searchParams: Promise<{ listo?: string }> }) {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) redirect("/");
  const tienda = await obtenerMiTienda(supabase, userId);
  if (!tienda) {
    return (
      <EstadoVacio
        titulo="Todavía no tenés un puesto."
        texto="Si querés vender en Tu Feria Live, pedí una invitación."
        accion={<Button render={<Link href="/" />}>Ir al inicio</Button>}
      />
    );
  }
  const { listo } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-extrabold">Hola, {tienda.name}</h1>
      {listo === "1" && (
        <p role="status" className="rounded-2xl bg-accent p-4 font-semibold">
          ¡Tu puesto está listo!
        </p>
      )}
      {tienda.onboarding_step < 5 && (
        <div className="flex flex-col gap-2 rounded-2xl border p-4">
          <p className="font-semibold">Te falta terminar de armar tu puesto.</p>
          <Button render={<Link href="/mi-puesto/armar" />}>Seguir armando</Button>
        </div>
      )}
      <nav aria-label="Opciones del puesto" className="grid gap-2">
        <Button variant="secondary" render={<Link href="/mi-puesto/productos" />}>Mis productos</Button>
        <Button variant="secondary" render={<Link href="/mi-puesto/tienda" />}>Mi tienda</Button>
        <Button variant="ghost" render={<Link href={`/@${tienda.handle}`} />}>Ver mi tienda como la ven las demás</Button>
      </nav>
    </>
  );
}

export default function MiPuestoPage({ searchParams }: PageProps<"/mi-puesto">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <ContenidoMiPuesto searchParams={searchParams as Promise<{ listo?: string }>} />
      </Suspense>
    </main>
  );
}
```

Nota: `Button` de shadcn con Base UI acepta la prop `render` para dibujarse como un `Link`. Verificar en `src/components/ui/button.tsx`/documentación de Base UI; si la versión instalada no la admite, usar `buttonVariants()` sobre `<Link className={buttonVariants({ variant })}>` y anotarlo.

El saludo usa el nombre del puesto (en las pruebas, `crearTiendaPrueba` lo llama "Puesto de Prueba").

- [ ] **Step 9: Correr las pruebas**

```powershell
npm run test:e2e -- tests/e2e/navegacion.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Suite completa, tipos, estilo y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }; if ($?) { npm run test:e2e }
git add -A
git commit -m "Agregar la barra de navegación y las pantallas base de la Parte 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: todo PASS (las pruebas de Fase 0 siguen pasando: el inicio mantiene título, eslogan y botón).

---

### Task 4: Página de administración con invitaciones

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/acciones.ts`, `src/app/admin/panel-invitaciones.tsx`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `obtenerUsuarioId`, `createClient`, `hacerAdmin`, `crearInvitacionPrueba`, `cookiesDeSesion`.
- Produces: `crearInvitacion(nota: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>`, `anularInvitacion(id: string): Promise<Resultado>`; ruta `/admin`.

- [ ] **Step 1: Escribir las pruebas e2e (fallan)**

`tests/e2e/admin.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { hacerAdmin } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let admin: UsuarioPrueba;
let comun: UsuarioPrueba;

test.beforeAll(async () => {
  [admin, comun] = await Promise.all([crearUsuarioPrueba({ nombre: "Admin E2E" }), crearUsuarioPrueba({ nombre: "Comun E2E" })]);
  await hacerAdmin(admin.id);
});

test.afterAll(async () => {
  await Promise.all([admin, comun].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test("sin sesión /admin no existe", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

test("una persona que no es admin ve que no existe", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(comun.sesion));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Invitaciones" })).toHaveCount(0);
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

test("la admin crea una invitación, la copia y la anula", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(admin.sesion));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin");
  await page.getByLabel("¿Para quién es? (opcional)").fill("Mica, ropa usada");
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const link = page.getByTestId("link-invitacion");
  await expect(link).toContainText("/invitacion/");
  await page.getByRole("button", { name: "Copiar link" }).click();
  await expect(page.getByText("Link copiado")).toBeVisible();
  const fila = page.getByRole("listitem").filter({ hasText: "Mica, ropa usada" });
  await expect(fila.getByText("Pendiente")).toBeVisible();
  await fila.getByRole("button", { name: "Anular" }).click();
  await expect(fila.getByText("Anulada")).toBeVisible();
});
```

- [ ] **Step 2: Página "no encontrada" en español**

Crear `src/app/not-found.tsx` (lo usa `notFound()` en toda la app):

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-extrabold">No encontramos esta página</h1>
      <Button render={<Link href="/" />}>Ir al inicio</Button>
    </main>
  );
}
```

- [ ] **Step 3: Correr y ver que falla**

```powershell
npm run test:e2e -- tests/e2e/admin.spec.ts
```

Expected: FAIL en la prueba de la admin (no existe la página `/admin`).

- [ ] **Step 4: Acciones**

`src/app/admin/acciones.ts`:

```ts
"use server";

import { randomBytes } from "node:crypto";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tiendas/tipos";

const SIN_PERMISO = "No tenés permiso para hacer esto.";

async function adminActual() {
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) return null;
  const { data } = await supabase.rpc("es_admin");
  return data === true ? { supabase, userId } : null;
}

export async function crearInvitacion(nota: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const texto = nota.trim();
  if (texto.length > 80) return { ok: false, error: "La nota puede tener hasta 80 caracteres." };
  const token = randomBytes(24).toString("base64url");
  const { error } = await sesion.supabase.from("invitations").insert({
    token,
    created_by: sesion.userId,
    note: texto || null,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  if (error) return { ok: false, error: "No se pudo crear la invitación. Probá de nuevo." };
  return { ok: true, token };
}

export async function anularInvitacion(id: string): Promise<Resultado> {
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const { error } = await sesion.supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null);
  return error ? { ok: false, error: "No se pudo anular. Probá de nuevo." } : { ok: true };
}
```

- [ ] **Step 5: Página y panel**

`src/app/admin/panel-invitaciones.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anularInvitacion, crearInvitacion } from "./acciones";

export type FilaInvitacion = {
  id: string;
  note: string | null;
  estado: "Pendiente" | "Usada" | "Vencida" | "Anulada";
  usadaPor: string | null;
  creada: string;
};

export function PanelInvitaciones({ filas }: { filas: FilaInvitacion[] }) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const crear = () =>
    iniciar(async () => {
      setError(null);
      const r = await crearInvitacion(nota);
      if (!r.ok) return setError(r.error);
      setLink(`${window.location.origin}/invitacion/${r.token}`);
      setNota("");
      router.refresh();
    });

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border p-4">
        <label htmlFor="nota" className="font-semibold">¿Para quién es? (opcional)</label>
        <Input id="nota" value={nota} maxLength={80} onChange={(e) => setNota(e.target.value)} placeholder="Mica, ropa usada" />
        <Button onClick={crear} disabled={pendiente}>Crear invitación</Button>
        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
        {link && (
          <div className="flex flex-col gap-2 rounded-xl bg-accent p-3">
            <p data-testid="link-invitacion" className="break-all text-sm">{link}</p>
            <Button variant="secondary" onClick={copiar}>Copiar link</Button>
            <p className="text-xs text-muted-foreground">Sirve una sola vez y vence en 7 días.</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Invitaciones creadas</h2>
        <ul className="flex flex-col gap-2">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="flex-1">
                <p className="font-semibold">{f.note ?? "Sin nota"}</p>
                <p className="text-xs text-muted-foreground">
                  {f.creada} · {f.estado}
                  {f.usadaPor ? ` por @${f.usadaPor}` : ""}
                </p>
              </div>
              {f.estado === "Pendiente" && (
                <Button
                  variant="ghost"
                  disabled={pendiente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await anularInvitacion(f.id);
                      if (!r.ok) toast.error(r.error);
                      router.refresh();
                    })
                  }
                >
                  Anular
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

`src/app/admin/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { formatFechaTucuman } from "@/lib/format/fecha";
import { createClient } from "@/lib/supabase/server";
import { type FilaInvitacion, PanelInvitaciones } from "./panel-invitaciones";

export const metadata: Metadata = { title: "Administración · Tu Feria Live", robots: { index: false, follow: false } };

type Fila = {
  id: string; note: string | null; created_at: string; expires_at: string;
  used_at: string | null; revoked_at: string | null; used_by: string | null;
};

function estadoDe(f: Fila): FilaInvitacion["estado"] {
  if (f.revoked_at) return "Anulada";
  if (f.used_at) return "Usada";
  if (new Date(f.expires_at) < new Date()) return "Vencida";
  return "Pendiente";
}

async function ContenidoAdmin() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) notFound();
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (esAdmin !== true) notFound();

  const { data } = await supabase
    .from("invitations")
    .select("id, note, created_at, expires_at, used_at, revoked_at, used_by")
    .order("created_at", { ascending: false })
    .limit(100);
  const invitaciones = (data as Fila[] | null) ?? [];
  const usuarias = invitaciones.flatMap((f) => (f.used_by ? [f.used_by] : []));
  const { data: tiendas } = usuarias.length
    ? await supabase.from("stores").select("owner_id, handle").in("owner_id", usuarias)
    : { data: [] };
  const handlePorDuena = new Map(((tiendas as { owner_id: string; handle: string }[] | null) ?? []).map((t) => [t.owner_id, t.handle]));

  const filas: FilaInvitacion[] = invitaciones.map((f) => ({
    id: f.id,
    note: f.note,
    estado: estadoDe(f),
    usadaPor: f.used_by ? (handlePorDuena.get(f.used_by) ?? null) : null,
    creada: formatFechaTucuman(f.created_at),
  }));

  return (
    <>
      <h1 className="text-2xl font-extrabold">Invitaciones</h1>
      <PanelInvitaciones filas={filas} />
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <ContenidoAdmin />
      </Suspense>
    </main>
  );
}
```

La fecha se formatea en el servidor (`page.tsx`) y llega como texto al panel.

- [ ] **Step 6: Correr y ver que pasa**

```powershell
npm run test:e2e -- tests/e2e/admin.spec.ts
```

Expected: PASS (3 pruebas). Si `notFound()` dentro de `<Suspense>` muestra la página de Next en inglés en lugar de `src/app/not-found.tsx`, revisar la documentación de `not-found` en `node_modules/next/dist/docs/` y ajustar.

- [ ] **Step 7: Suite, tipos, estilo y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }
git add -A
git commit -m "Agregar la página de administración con invitaciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fotos en el navegador y Mis productos

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/fotos/comprimir.ts`, `src/lib/fotos/subir.ts`, `src/components/fotos/foto.tsx`, `src/components/fotos/selector-fotos.tsx`, `src/components/tiendas/formulario-producto.tsx`, `src/app/mi-puesto/acciones.ts`, `src/app/mi-puesto/productos/page.tsx`, `src/app/mi-puesto/productos/nuevo/page.tsx`, `src/app/mi-puesto/productos/[id]/page.tsx`, `src/app/mi-puesto/productos/[id]/acciones-producto.tsx`, `tests/e2e/fixtures/crear-fixtures.mjs`, `tests/e2e/fixtures/foto-de-costado.jpg`, `tests/e2e/productos.spec.ts`

**Interfaces:**
- Consumes: `rutas.ts`, `validacion.ts`, `datos.ts`, `obtenerUsuarioId`, `crearTiendaPrueba`, `borrarFotosDeTienda`.
- Produces:
  - `createClient()` del navegador (`@/lib/supabase/client`).
  - `class ErrorDeFoto extends Error`; `comprimirFoto(archivo: File): Promise<{ ext: "webp" | "jpg"; tipo: "image/webp" | "image/jpeg"; chica: Blob; grande: Blob }>`.
  - `subirFoto(storeId: string, carpeta: CarpetaFoto, archivo: File): Promise<string>` (devuelve la ruta base).
  - `<Foto path tamano alt className? />`; `<SelectorFotos inicial: string[] maximo: number alCambiar(items: ItemFoto[]) />` con `type ItemFoto = { tipo: "existente"; path: string } | { tipo: "nueva"; archivo: File; vista: string }`.
  - `<FormularioProducto storeId producto? avanzarA? alGuardar(): void textoBoton />`.
  - Server Actions (`@/app/mi-puesto/acciones`): `crearProducto(datos: DatosProductoEntrada, fotos: string[], avanzarA?: number): Promise<Resultado>`, `actualizarProducto(id: string, datos: DatosProductoEntrada, fotos: string[]): Promise<Resultado>`, `cambiarVisibilidad(id: string, visible: boolean): Promise<Resultado>`, `borrarProducto(id: string): Promise<Resultado>`, con `type DatosProductoEntrada = { name: string; description: string; price: string; quantity: string; visible: boolean }`; helper interno `duenaActual()`.

- [ ] **Step 1: Crear la foto de prueba**

`tests/e2e/fixtures/crear-fixtures.mjs`:

```js
// Genera las fotos de prueba. Uso: node tests/e2e/fixtures/crear-fixtures.mjs
import sharp from "sharp";

// 1600×1000 "acostada" con orientación EXIF 6: un celular la muestra parada (1000×1600).
await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 176, g: 19, b: 95 } } })
  .jpeg({ quality: 80 })
  .withExif({ IFD0: { Copyright: "Foto de prueba Tu Feria Live", Orientation: "6" } })
  .toFile("tests/e2e/fixtures/foto-de-costado.jpg");

const meta = await sharp("tests/e2e/fixtures/foto-de-costado.jpg").metadata();
console.log({ ancho: meta.width, alto: meta.height, orientacion: meta.orientation, exif: Boolean(meta.exif) });
```

```powershell
node tests/e2e/fixtures/crear-fixtures.mjs
```

Expected: `{ ancho: 1600, alto: 1000, orientacion: 6, exif: true }`. Si `withExif` no fija la orientación en la versión instalada de sharp, usar `.withMetadata({ orientation: 6 })` y volver a verificar.

- [ ] **Step 2: Escribir las pruebas e2e (fallan)**

`tests/e2e/productos.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

const FOTO = "tests/e2e/fixtures/foto-de-costado.jpg";
let feriante: UsuarioPrueba;
let tienda: { id: string; handle: string };

test.beforeAll(async () => {
  feriante = await crearUsuarioPrueba({ nombre: "Mica Productos" });
  tienda = await crearTiendaPrueba(feriante);
});

test.afterAll(async () => {
  if (tienda) await borrarFotosDeTienda(tienda.id);
  if (feriante) await borrarUsuarioPrueba(feriante.id);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(await cookiesDeSesion(feriante.sesion));
});

test("carga un producto con foto: queda derecha, sin datos ocultos y en dos tamaños", async ({ page, request }) => {
  await page.goto("/mi-puesto/productos");
  await page.getByRole("link", { name: "＋ Producto" }).click();
  await page.getByLabel("Fotos").setInputFiles(FOTO);
  await expect(page.getByRole("img", { name: "Foto 1" })).toBeVisible();
  await page.getByLabel("Nombre").fill("Vestido azul");
  await page.getByLabel("Precio").fill("8.000");
  await page.getByLabel("Descripción").fill("Talle M, impecable");
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await expect(page).toHaveURL("/mi-puesto/productos");
  const tarjeta = page.getByRole("listitem").filter({ hasText: "Vestido azul" });
  await expect(tarjeta.getByText("$8.000")).toBeVisible();

  const src = await tarjeta.getByRole("img").getAttribute("src");
  expect(src).toMatch(/-400\.(webp|jpg)$/);
  const grande = src!.replace(/-400\.(webp|jpg)$/, "-1200.$1");
  const respuesta = await request.get(grande);
  expect(respuesta.ok()).toBe(true);
  const bytes = await respuesta.body();
  expect(bytes.length).toBeLessThan(1_048_576);
  expect(bytes.includes(Buffer.from("Exif"))).toBe(false);

  const medidas = await page.evaluate(async (url) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    return { ancho: bmp.width, alto: bmp.height };
  }, grande);
  expect(medidas).toEqual({ ancho: 750, alto: 1200 });
});

test("un doble toque en Guardar crea un solo producto", async ({ page }) => {
  await page.goto("/mi-puesto/productos/nuevo");
  await page.getByLabel("Nombre").fill("Bolso tejido");
  await page.getByLabel("Precio").fill("9000");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar producto" }).dblclick();
  await expect(page).toHaveURL("/mi-puesto/productos");
  await expect(page.getByRole("listitem").filter({ hasText: "Bolso tejido" })).toHaveCount(1);
});

test("avisa si el precio no es válido", async ({ page }) => {
  await page.goto("/mi-puesto/productos/nuevo");
  await page.getByLabel("Nombre").fill("Remera");
  await page.getByLabel("Precio").fill("gratis");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("alert")).toHaveText("Escribí un precio válido.");
});

test("oculta, edita y borra un producto", async ({ page }) => {
  await page.goto("/mi-puesto/productos/nuevo");
  await page.getByLabel("Nombre").fill("Saco lila");
  await page.getByLabel("Precio").fill("15000");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByRole("link").click();

  await page.getByRole("button", { name: "Ocultar de la tienda" }).click();
  await expect(page.getByRole("button", { name: "Mostrar en la tienda" })).toBeVisible();
  await page.getByLabel("Precio").fill("14.500");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByText("$14.500")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByText("Oculto")).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByRole("link").click();
  await page.getByRole("button", { name: "Borrar producto" }).click();
  await page.getByRole("button", { name: "Sí, borrar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Saco lila" })).toHaveCount(0);
});
```

- [ ] **Step 3: Correr y ver que falla**

```powershell
npm run test:e2e -- tests/e2e/productos.spec.ts
```

Expected: FAIL (no existe `/mi-puesto/productos`).

- [ ] **Step 4: Cliente del navegador, compresión y subida**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Cliente de Supabase en el navegador (usa la sesión de las cookies). */
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient(url, publishableKey);
}
```

`src/lib/fotos/comprimir.ts`:

```ts
import { medidasEscaladas, TAMANOS_FOTO } from "./rutas";

export class ErrorDeFoto extends Error {}

export type FotoComprimida = {
  ext: "webp" | "jpg";
  tipo: "image/webp" | "image/jpeg";
  chica: Blob;
  grande: Blob;
};

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolver) => canvas.toBlob(resolver, tipo, calidad));
}

async function dibujar(bitmap: ImageBitmap, maximo: number): Promise<HTMLCanvasElement> {
  const { ancho, alto } = medidasEscaladas(bitmap.width, bitmap.height, maximo);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErrorDeFoto("No pudimos usar esta foto. Probá con otra.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  return canvas;
}

/**
 * Endereza la foto según su orientación, la achica a 1200 y 400 px y la vuelve a codificar
 * (WebP si el navegador puede, si no JPEG). Al recodificar se pierden los datos EXIF (incluida la ubicación).
 */
export async function comprimirFoto(archivo: File): Promise<FotoComprimida> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorDeFoto("No pudimos usar esta foto. Probá con otra.");
  }
  try {
    const lienzoGrande = await dibujar(bitmap, TAMANOS_FOTO.grande);
    const lienzoChico = await dibujar(bitmap, TAMANOS_FOTO.chica);
    const webp = await aBlob(lienzoGrande, "image/webp", 0.8);
    if (webp && webp.type === "image/webp") {
      const chica = await aBlob(lienzoChico, "image/webp", 0.8);
      if (chica) return { ext: "webp", tipo: "image/webp", grande: webp, chica };
    }
    const grande = await aBlob(lienzoGrande, "image/jpeg", 0.85);
    const chica = await aBlob(lienzoChico, "image/jpeg", 0.85);
    if (!grande || !chica) throw new ErrorDeFoto("No pudimos usar esta foto. Probá con otra.");
    return { ext: "jpg", tipo: "image/jpeg", grande, chica };
  } finally {
    bitmap.close();
  }
}
```

`src/lib/fotos/subir.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import { comprimirFoto, ErrorDeFoto } from "./comprimir";
import { BUCKET_FOTOS, type CarpetaFoto, nuevaRutaFoto, rutaVariante } from "./rutas";

/** Comprime y sube los dos tamaños; devuelve la ruta base para guardar en la base de datos. */
export async function subirFoto(storeId: string, carpeta: CarpetaFoto, archivo: File): Promise<string> {
  const foto = await comprimirFoto(archivo);
  const path = nuevaRutaFoto(storeId, carpeta, foto.ext);
  const bucket = createClient().storage.from(BUCKET_FOTOS);
  for (const [tamano, blob] of [["grande", foto.grande], ["chica", foto.chica]] as const) {
    const { error } = await bucket.upload(rutaVariante(path, tamano), blob, {
      contentType: foto.tipo,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new ErrorDeFoto("No se pudo subir la foto. Revisá tu conexión y probá de nuevo.");
  }
  return path;
}
```

- [ ] **Step 5: Componentes de fotos**

`src/components/fotos/foto.tsx`:

```tsx
import { type TamanoFoto, TAMANOS_FOTO, urlFoto } from "@/lib/fotos/rutas";

/** Las fotos ya vienen achicadas desde el celular: se muestran directo, sin optimizador de imágenes. */
export function Foto({ path, tamano, alt, className }: { path: string; tamano: TamanoFoto; alt: string; className?: string }) {
  const lado = TAMANOS_FOTO[tamano];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={urlFoto(path, tamano)} alt={alt} width={lado} height={lado} loading="lazy" decoding="async" className={className} />
  );
}
```

`src/components/fotos/selector-fotos.tsx`:

```tsx
"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { urlFoto } from "@/lib/fotos/rutas";

export type ItemFoto = { tipo: "existente"; path: string } | { tipo: "nueva"; archivo: File; vista: string };

export function SelectorFotos({
  inicial, maximo, alCambiar, etiqueta = "Fotos",
}: { inicial: string[]; maximo: number; alCambiar: (items: ItemFoto[]) => void; etiqueta?: string }) {
  const [items, setItems] = useState<ItemFoto[]>(inicial.map((path) => ({ tipo: "existente", path })));
  const [aviso, setAviso] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => alCambiar(items), [items, alCambiar]);

  const agregar = (archivos: FileList | null) => {
    if (!archivos) return;
    const nuevas = Array.from(archivos).map((archivo) => ({ tipo: "nueva" as const, archivo, vista: URL.createObjectURL(archivo) }));
    setItems((actuales) => {
      if (actuales.length + nuevas.length > maximo) setAviso(`Podés subir hasta ${maximo} fotos por producto.`);
      else setAviso(null);
      return [...actuales, ...nuevas].slice(0, maximo);
    });
    if (input.current) input.current.value = "";
  };

  const mover = (i: number) =>
    setItems((a) => {
      const copia = [...a];
      [copia[i - 1], copia[i]] = [copia[i]!, copia[i - 1]!];
      return copia;
    });

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="fotos" className="font-semibold">{etiqueta}</label>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, i) => (
          <div key={item.tipo === "existente" ? item.path : item.vista} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.tipo === "existente" ? urlFoto(item.path, "chica") : item.vista} alt={`Foto ${i + 1}`} className="size-full object-cover" />
            <button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => setItems((a) => a.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-foreground/70 text-background">
              <X className="size-4" />
            </button>
            {i > 0 && (
              <button type="button" aria-label={`Mover foto ${i + 1} antes`} onClick={() => mover(i)}
                className="absolute bottom-1 left-1 grid size-7 place-items-center rounded-full bg-foreground/70 text-background">
                <ArrowLeft className="size-4" />
              </button>
            )}
          </div>
        ))}
        {items.length < maximo && (
          <button type="button" onClick={() => input.current?.click()}
            className="grid aspect-square min-h-11 place-items-center rounded-xl border-2 border-dashed text-2xl text-muted-foreground">
            ＋
          </button>
        )}
      </div>
      <input ref={input} id="fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple={maximo > 1}
        className="sr-only" onChange={(e) => agregar(e.target.files)} />
      {aviso && <p role="alert" className="text-sm font-semibold text-destructive">{aviso}</p>}
    </div>
  );
}
```

Nota: `accept` sin HEIC hace que el iPhone convierta solo sus fotos HEIC a JPEG al elegirlas; si alguna no se puede leer, `comprimirFoto` da el mensaje de foto ilegible (ver ruling en el registro: no se agrega librería de HEIC).

- [ ] **Step 6: Server Actions de productos**

`src/app/mi-puesto/acciones.ts`:

```ts
"use server";

import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { BUCKET_FOTOS, rutaEsDeTienda, rutaVariante } from "@/lib/fotos/rutas";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import type { Resultado, Tienda } from "@/lib/tiendas/tipos";
import { parsearPrecio, primerError, productoSchema } from "@/lib/tiendas/validacion";

const NO_GUARDO = "No se pudo guardar. Revisá tu conexión y probá de nuevo.";

export type DatosProductoEntrada = { name: string; description: string; price: string; quantity: string; visible: boolean };

async function duenaActual() {
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  return tienda ? { supabase, tienda } : null;
}

async function avanzarPaso(supabase: Awaited<ReturnType<typeof createClient>>, tienda: Tienda, avanzarA?: number) {
  if (avanzarA && tienda.onboarding_step < avanzarA) {
    await supabase.from("stores").update({ onboarding_step: avanzarA }).eq("id", tienda.id);
  }
}

async function borrarArchivos(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  if (!paths.length) return;
  await supabase.storage.from(BUCKET_FOTOS).remove(paths.flatMap((p) => [rutaVariante(p, "chica"), rutaVariante(p, "grande")]));
}

function validarProducto(datos: DatosProductoEntrada) {
  const precio = parsearPrecio(datos.price);
  const cantidad = /^\d{1,3}$/.test(datos.quantity.trim()) ? Number(datos.quantity) : -1;
  return productoSchema.safeParse({
    name: datos.name,
    description: datos.description,
    price_cents: precio ?? 0,
    quantity: cantidad,
    visible: datos.visible,
  });
}

export async function crearProducto(datos: DatosProductoEntrada, fotos: string[], avanzarA?: number): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const r = validarProducto(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (fotos.length > 4) return { ok: false, error: "Podés subir hasta 4 fotos por producto." };
  if (!fotos.every((p) => rutaEsDeTienda(p, tienda.id, "productos"))) return { ok: false, error: NO_GUARDO };

  const { data: producto, error } = await supabase
    .from("products")
    .insert({ store_id: tienda.id, ...r.data, description: r.data.description || null })
    .select("id")
    .single();
  if (error || !producto) return { ok: false, error: NO_GUARDO };
  if (fotos.length) {
    const { error: errorFotos } = await supabase
      .from("product_photos")
      .insert(fotos.map((path, position) => ({ product_id: producto.id, path, position })));
    if (errorFotos) return { ok: false, error: NO_GUARDO };
  }
  await avanzarPaso(supabase, tienda, avanzarA);
  return { ok: true };
}

export async function actualizarProducto(id: string, datos: DatosProductoEntrada, fotos: string[]): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const r = validarProducto(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (fotos.length > 4) return { ok: false, error: "Podés subir hasta 4 fotos por producto." };
  if (!fotos.every((p) => rutaEsDeTienda(p, tienda.id, "productos"))) return { ok: false, error: NO_GUARDO };

  const { data: anteriores } = await supabase.from("product_photos").select("path").eq("product_id", id);
  const { error } = await supabase
    .from("products")
    .update({ ...r.data, description: r.data.description || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_id", tienda.id);
  if (error) return { ok: false, error: NO_GUARDO };
  await supabase.from("product_photos").delete().eq("product_id", id);
  if (fotos.length) {
    const { error: errorFotos } = await supabase
      .from("product_photos")
      .insert(fotos.map((path, position) => ({ product_id: id, path, position })));
    if (errorFotos) return { ok: false, error: NO_GUARDO };
  }
  const quitadas = ((anteriores as { path: string }[] | null) ?? []).map((f) => f.path).filter((p) => !fotos.includes(p));
  await borrarArchivos(supabase, quitadas);
  return { ok: true };
}

export async function cambiarVisibilidad(id: string, visible: boolean): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { error } = await sesion.supabase.from("products").update({ visible }).eq("id", id).eq("store_id", sesion.tienda.id);
  return error ? { ok: false, error: NO_GUARDO } : { ok: true };
}

export async function borrarProducto(id: string): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const { data: fotos } = await supabase.from("product_photos").select("path").eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id).eq("store_id", tienda.id);
  if (error) return { ok: false, error: NO_GUARDO };
  await borrarArchivos(supabase, ((fotos as { path: string }[] | null) ?? []).map((f) => f.path));
  return { ok: true };
}
```

- [ ] **Step 7: Formulario de producto**

`src/components/tiendas/formulario-producto.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { type ItemFoto, SelectorFotos } from "@/components/fotos/selector-fotos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actualizarProducto, crearProducto, type DatosProductoEntrada } from "@/app/mi-puesto/acciones";
import { ErrorDeFoto } from "@/lib/fotos/comprimir";
import { subirFoto } from "@/lib/fotos/subir";
import { formatARS } from "@/lib/format/plata";
import type { Producto } from "@/lib/tiendas/tipos";

type Props = {
  storeId: string;
  producto?: Producto;
  avanzarA?: number;
  textoBoton: string;
  alGuardar: () => void;
};

export function FormularioProducto({ storeId, producto, avanzarA, textoBoton, alGuardar }: Props) {
  const [fotos, setFotos] = useState<ItemFoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviando = useRef(false);
  const alCambiarFotos = useCallback((items: ItemFoto[]) => setFotos(items), []);

  const enviar = (formulario: HTMLFormElement) => {
    if (enviando.current) return; // un doble toque no crea dos productos
    enviando.current = true;
    const fd = new FormData(formulario);
    const datos: DatosProductoEntrada = {
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      price: String(fd.get("price") ?? ""),
      quantity: String(fd.get("quantity") ?? ""),
      visible: producto?.visible ?? true,
    };
    iniciar(async () => {
      setError(null);
      try {
        const paths: string[] = [];
        for (const [i, item] of fotos.entries()) {
          if (item.tipo === "existente") paths.push(item.path);
          else {
            setEstado(`Preparando foto ${i + 1}…`);
            paths.push(await subirFoto(storeId, "productos", item.archivo));
          }
        }
        setEstado(null);
        const r = producto ? await actualizarProducto(producto.id, datos, paths) : await crearProducto(datos, paths, avanzarA);
        if (!r.ok) {
          setError(r.error);
          enviando.current = false;
          return;
        }
        alGuardar();
      } catch (e) {
        setEstado(null);
        setError(e instanceof ErrorDeFoto ? e.message : "No se pudo guardar. Revisá tu conexión y probá de nuevo.");
        enviando.current = false;
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(e.currentTarget);
      }}
    >
      <SelectorFotos inicial={producto?.fotos.map((f) => f.path) ?? []} maximo={4} alCambiar={alCambiarFotos} />
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="font-semibold">Nombre</label>
        <Input id="name" name="name" required minLength={2} maxLength={60} defaultValue={producto?.name} placeholder="Vestido azul" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="price" className="font-semibold">Precio</label>
        <Input id="price" name="price" inputMode="decimal" required defaultValue={producto ? formatARS(producto.price_cents).replace("$", "") : ""} placeholder="8.000" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="font-semibold">Descripción</label>
        <Input id="description" name="description" maxLength={200} defaultValue={producto?.description ?? ""} placeholder="Talle M, impecable" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="quantity" className="font-semibold">Cantidad</label>
        <Input id="quantity" name="quantity" inputMode="numeric" required defaultValue={producto?.quantity ?? 1} />
      </div>
      {estado && <p role="status" className="text-sm text-muted-foreground">{estado}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pendiente}>{textoBoton}</Button>
    </form>
  );
}
```

- [ ] **Step 8: Páginas de Mis productos**

`src/app/mi-puesto/productos/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { Foto } from "@/components/fotos/foto";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/server";
import { listarProductos, obtenerMiTienda } from "@/lib/tiendas/datos";

async function ListaProductos() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  const productos = await listarProductos(supabase, tienda.id);
  if (!productos.length) return <EstadoVacio texto="Todavía no cargaste productos." />;
  return (
    <ul className="grid grid-cols-2 gap-3">
      {productos.map((p) => (
        <li key={p.id}>
          <Link href={`/mi-puesto/productos/${p.id}`} className="flex flex-col overflow-hidden rounded-xl border">
            {p.fotos[0] ? (
              <Foto path={p.fotos[0].path} tamano="chica" alt={p.name} className="aspect-square w-full object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center bg-muted text-sm text-muted-foreground">Sin foto</div>
            )}
            <div className="flex flex-col p-2 text-sm">
              <span className="font-bold tabular-nums">{formatARS(p.price_cents)}</span>
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.visible ? `Quedan ${p.quantity}` : "Oculto"}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function MisProductosPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Mis productos</h1>
        <Button render={<Link href="/mi-puesto/productos/nuevo" />}>＋ Producto</Button>
      </div>
      <Suspense>
        <ListaProductos />
      </Suspense>
    </main>
  );
}
```

`src/app/mi-puesto/productos/nuevo/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import { NuevoProducto } from "./nuevo-producto";

async function Contenido() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  return <NuevoProducto storeId={tienda.id} />;
}

export default function NuevoProductoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Nuevo producto</h1>
      <Suspense>
        <Contenido />
      </Suspense>
    </main>
  );
}
```

`src/app/mi-puesto/productos/nuevo/nuevo-producto.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { FormularioProducto } from "@/components/tiendas/formulario-producto";

export function NuevoProducto({ storeId }: { storeId: string }) {
  const router = useRouter();
  return (
    <FormularioProducto
      storeId={storeId}
      textoBoton="Guardar producto"
      alGuardar={() => {
        router.push("/mi-puesto/productos");
        router.refresh();
      }}
    />
  );
}
```

`src/app/mi-puesto/productos/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda, obtenerProducto } from "@/lib/tiendas/datos";
import { AccionesProducto } from "./acciones-producto";

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  const producto = await obtenerProducto(supabase, tienda.id, id);
  if (!producto) notFound();
  return <AccionesProducto storeId={tienda.id} producto={producto} />;
}

export default function EditarProductoPage({ params }: PageProps<"/mi-puesto/productos/[id]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-extrabold">Editar producto</h1>
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
```

`src/app/mi-puesto/productos/[id]/acciones-producto.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormularioProducto } from "@/components/tiendas/formulario-producto";
import { Button } from "@/components/ui/button";
import { borrarProducto, cambiarVisibilidad } from "@/app/mi-puesto/acciones";
import type { Producto } from "@/lib/tiendas/tipos";

export function AccionesProducto({ storeId, producto }: { storeId: string; producto: Producto }) {
  const router = useRouter();
  const [visible, setVisible] = useState(producto.visible);
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const volver = () => {
    router.push("/mi-puesto/productos");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <FormularioProducto storeId={storeId} producto={{ ...producto, visible }} textoBoton="Guardar cambios" alGuardar={volver} />
      <Button
        variant="secondary"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await cambiarVisibilidad(producto.id, !visible);
            if (r.ok) setVisible(!visible);
            else toast.error(r.error);
          })
        }
      >
        {visible ? "Ocultar de la tienda" : "Mostrar en la tienda"}
      </Button>
      {!confirmando ? (
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmando(true)}>Borrar producto</Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive p-3">
          <p className="font-semibold">¿Borrar "{producto.name}"? No se puede deshacer.</p>
          <Button
            variant="destructive"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await borrarProducto(producto.id);
                if (r.ok) volver();
                else toast.error(r.error);
              })
            }
          >
            Sí, borrar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Correr y ver que pasa**

```powershell
npm run test:e2e -- tests/e2e/productos.spec.ts
```

Expected: PASS (4 pruebas). Si la de orientación da 1200×750, revisar `imageOrientation: "from-image"` contra la documentación de `createImageBitmap` del navegador; no relajar la prueba.

- [ ] **Step 10: Suite, tipos, estilo y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }; if ($?) { npm run test:integracion }
git add -A
git commit -m "Agregar Mis productos con fotos comprimidas en el celular" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mi tienda (datos, fotos, cobro y entregas)

**Files:**
- Create: `src/components/tiendas/campos-tienda.tsx`, `src/components/tiendas/formulario-datos-tienda.tsx`, `src/components/tiendas/formulario-cobro.tsx`, `src/components/tiendas/formulario-entregas.tsx`, `src/app/mi-puesto/tienda/page.tsx`, `tests/e2e/mi-tienda.spec.ts`
- Modify: `src/app/mi-puesto/acciones.ts`

**Interfaces:**
- Consumes: `duenaActual`, `avanzarPaso`, `borrarArchivos` (internos de `acciones.ts`), `validarEntregas`, esquemas, `subirFoto`, `<Foto>`.
- Produces:
  - Server Actions: `verificarHandle(texto: string): Promise<{ disponible: boolean; mensaje: string | null }>`, `guardarDatosTienda(datos: { name: string; handle: string; category: string; zone: string; description: string; live_schedule_note: string }): Promise<Resultado>`, `guardarFotoTienda(tipo: "avatar" | "cover", path: string | null): Promise<Resultado>`, `guardarCobro(datos: { payment_alias: string; payment_holder: string }, avanzarA?: number): Promise<Resultado>`, `guardarEntregas(entrada: EntregasEntrada, avanzarA?: number): Promise<Resultado>`.
  - Componentes: `<CamposTienda inicial? />` (inputs `name`, `handle`, `category`, `zone` con verificación del @usuario), `<FormularioDatosTienda tienda />`, `<FormularioCobro inicial? avanzarA? textoBoton alGuardar />`, `<FormularioEntregas zona opciones privados avanzarA? textoBoton alGuardar />`.

- [ ] **Step 1: Escribir las pruebas e2e (fallan)**

`tests/e2e/mi-tienda.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearTiendaPrueba, handleAleatorio } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let feriante: UsuarioPrueba;
let otra: UsuarioPrueba;
let tienda: { id: string; handle: string };
let tiendaOtra: { id: string; handle: string };

test.beforeAll(async () => {
  [feriante, otra] = await Promise.all([crearUsuarioPrueba({ nombre: "Mica Tienda" }), crearUsuarioPrueba({ nombre: "Otra Tienda" })]);
  [tienda, tiendaOtra] = await Promise.all([crearTiendaPrueba(feriante), crearTiendaPrueba(otra)]);
});

test.afterAll(async () => {
  if (tienda) await borrarFotosDeTienda(tienda.id);
  await Promise.all([feriante, otra].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(await cookiesDeSesion(feriante.sesion));
});

test("edita los datos de la tienda y avisa si el @usuario está tomado", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("@usuario").fill(tiendaOtra.handle);
  await expect(page.getByText(`@${tiendaOtra.handle} ya está en uso. Probá con otro.`)).toBeVisible();
  const nuevo = handleAleatorio("nuevo");
  await page.getByLabel("@usuario").fill(`@${nuevo.toUpperCase()}`);
  await page.getByLabel("Nombre del puesto").fill("La Ropería de Mica");
  await page.getByLabel("Suele estar en vivo…").fill("Mar. y jue. 20 h");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos guardados")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("@usuario")).toHaveValue(nuevo);
  await page.getByLabel("@usuario").fill(handleAleatorio("otro"));
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByRole("alert")).toContainText("Podés cambiar tu @usuario de nuevo el");
});

test("guarda el cobro y las entregas", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("Alias").fill("mica.ropa.yb");
  await page.getByLabel("Titular").fill("Micaela Díaz");
  await page.getByRole("button", { name: "Guardar cobro" }).click();
  await expect(page.getByText("Datos de cobro guardados")).toBeVisible();

  await page.getByLabel("Envío").check();
  await page.getByLabel("Con costo fijo").check();
  await page.getByLabel("Costo del envío").fill("2.500");
  await page.getByRole("button", { name: "Guardar entregas" }).click();
  await expect(page.getByText("Formas de entrega guardadas")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Costo del envío")).toHaveValue("2.500");
  await expect(page.getByLabel("Alias")).toHaveValue("mica.ropa.yb");
});

test("sube la foto de perfil", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("Foto del puesto").setInputFiles("tests/e2e/fixtures/foto-de-costado.jpg");
  await expect(page.getByText("Foto guardada")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "Foto del puesto" })).toHaveAttribute("src", /\/perfil\/.+-400\.(webp|jpg)$/);
});
```

- [ ] **Step 2: Correr y ver que falla**

```powershell
npm run test:e2e -- tests/e2e/mi-tienda.spec.ts
```

Expected: FAIL (no existe `/mi-puesto/tienda`).

- [ ] **Step 3: Acciones de la tienda**

Agregar a `src/app/mi-puesto/acciones.ts` (y sumar a los imports `datosCobroSchema`, `datosTiendaExtraSchema`, `datosTiendaSchema`, `errorDeHandle`, `normalizarHandle` de validación, `validarEntregas` de `@/lib/tiendas/entrega`, `EntregasEntrada` de tipos, y `formatFechaTucuman`):

```ts
export async function verificarHandle(texto: string): Promise<{ disponible: boolean; mensaje: string | null }> {
  const handle = normalizarHandle(texto);
  const error = errorDeHandle(handle);
  if (error) return { disponible: false, mensaje: error };
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const { data } = await supabase.from("stores").select("owner_id").eq("handle", handle).maybeSingle();
  if (data && data.owner_id !== userId) return { disponible: false, mensaje: `@${handle} ya está en uso. Probá con otro.` };
  return { disponible: true, mensaje: null };
}

export async function guardarDatosTienda(datos: {
  name: string; handle: string; category: string; zone: string; description: string; live_schedule_note: string;
}): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const handle = normalizarHandle(datos.handle);
  const errorHandle = errorDeHandle(handle);
  if (errorHandle) return { ok: false, error: errorHandle };
  const basicos = datosTiendaSchema.safeParse(datos);
  if (!basicos.success) return { ok: false, error: primerError(basicos.error) };
  const extra = datosTiendaExtraSchema.safeParse(datos);
  if (!extra.success) return { ok: false, error: primerError(extra.error) };
  const { error } = await supabase
    .from("stores")
    .update({
      ...basicos.data,
      handle,
      description: extra.data.description || null,
      live_schedule_note: extra.data.live_schedule_note || null,
    })
    .eq("id", tienda.id);
  if (!error) return { ok: true };
  if (error.message === "handle_cambio_reciente" && tienda.handle_changed_at) {
    const proxima = new Date(new Date(tienda.handle_changed_at).getTime() + 30 * 86_400_000);
    return { ok: false, error: `Podés cambiar tu @usuario de nuevo el ${formatFechaTucuman(proxima).slice(0, 10)}.` };
  }
  if (error.code === "23505") return { ok: false, error: `@${handle} ya está en uso. Probá con otro.` };
  return { ok: false, error: NO_GUARDO };
}

export async function guardarFotoTienda(tipo: "avatar" | "cover", path: string | null): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const carpeta = tipo === "avatar" ? "perfil" : "portada";
  if (path !== null && !rutaEsDeTienda(path, tienda.id, carpeta)) return { ok: false, error: NO_GUARDO };
  const columna = tipo === "avatar" ? "avatar_path" : "cover_path";
  const anterior = tienda[columna];
  const { error } = await supabase.from("stores").update({ [columna]: path }).eq("id", tienda.id);
  if (error) return { ok: false, error: NO_GUARDO };
  if (anterior && anterior !== path) await borrarArchivos(supabase, [anterior]);
  return { ok: true };
}

export async function guardarCobro(datos: { payment_alias: string; payment_holder: string }, avanzarA?: number): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const r = datosCobroSchema.safeParse(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  const { supabase, tienda } = sesion;
  const { error } = await supabase
    .from("store_private_info")
    .upsert({ store_id: tienda.id, ...r.data, updated_at: new Date().toISOString() }, { onConflict: "store_id" });
  if (error) return { ok: false, error: NO_GUARDO };
  await avanzarPaso(supabase, tienda, avanzarA);
  return { ok: true };
}

export async function guardarEntregas(entrada: EntregasEntrada, avanzarA?: number): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const r = validarEntregas(entrada);
  if (!r.ok) return { ok: false, error: r.error };
  const { supabase, tienda } = sesion;
  const { error } = await supabase
    .from("store_delivery_options")
    .upsert(r.opciones.map((o) => ({ store_id: tienda.id, ...o })), { onConflict: "store_id,kind" });
  if (error) return { ok: false, error: NO_GUARDO };
  const { error: errorPrivado } = await supabase
    .from("store_private_info")
    .upsert(
      { store_id: tienda.id, pickup_address: r.pickupAddress, pickup_hours: r.pickupHours, updated_at: new Date().toISOString() },
      { onConflict: "store_id" },
    );
  if (errorPrivado) return { ok: false, error: NO_GUARDO };
  await avanzarPaso(supabase, tienda, avanzarA);
  return { ok: true };
}
```

- [ ] **Step 4: Componentes de formularios**

`src/components/tiendas/campos-tienda.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { verificarHandle } from "@/app/mi-puesto/acciones";
import { normalizarHandle } from "@/lib/tiendas/validacion";

type Inicial = { name?: string; handle?: string; category?: string; zone?: string };

/** Campos básicos del puesto. El @usuario se normaliza y se verifica mientras se escribe. */
export function CamposTienda({ inicial = {} }: { inicial?: Inicial }) {
  const [handle, setHandle] = useState(inicial.handle ?? "");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const normal = normalizarHandle(handle);
    if (!normal || normal === inicial.handle) return setAviso(null);
    const t = setTimeout(async () => setAviso((await verificarHandle(normal)).mensaje), 400);
    return () => clearTimeout(t);
  }, [handle, inicial.handle]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="font-semibold">Nombre del puesto</label>
        <Input id="name" name="name" required minLength={2} maxLength={60} defaultValue={inicial.name} placeholder="La Ropería de Mica" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="handle" className="font-semibold">@usuario</label>
        <Input
          id="handle" name="handle" required autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={handle} onChange={(e) => setHandle(normalizarHandle(e.target.value))} placeholder="roperiademica"
        />
        <p className="text-xs text-muted-foreground">Tu link: tuferialive.vercel.app/@{normalizarHandle(handle) || "usuario"}</p>
        {aviso && <p className="text-sm font-semibold text-destructive">{aviso}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="font-semibold">¿Qué vendés?</label>
        <Input id="category" name="category" required maxLength={40} defaultValue={inicial.category} placeholder="Ropa usada" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="zone" className="font-semibold">Zona o barrio</label>
        <Input id="zone" name="zone" required maxLength={40} defaultValue={inicial.zone} placeholder="Yerba Buena" />
      </div>
    </>
  );
}
```

`src/components/tiendas/formulario-datos-tienda.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Foto } from "@/components/fotos/foto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarDatosTienda, guardarFotoTienda } from "@/app/mi-puesto/acciones";
import { ErrorDeFoto } from "@/lib/fotos/comprimir";
import { subirFoto } from "@/lib/fotos/subir";
import type { Tienda } from "@/lib/tiendas/tipos";
import { CamposTienda } from "./campos-tienda";

function SubirFotoTienda({ tienda, tipo }: { tienda: Tienda; tipo: "avatar" | "cover" }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const etiqueta = tipo === "avatar" ? "Foto del puesto" : "Portada (opcional)";
  const actual = tipo === "avatar" ? tienda.avatar_path : tienda.cover_path;
  const id = `foto-${tipo}`;
  return (
    <div className="flex items-center gap-3">
      {actual ? (
        <Foto path={actual} tamano="chica" alt={etiqueta} className={tipo === "avatar" ? "size-16 rounded-full object-cover" : "h-16 w-28 rounded-xl object-cover"} />
      ) : (
        <div className={tipo === "avatar" ? "size-16 rounded-full bg-muted" : "h-16 w-28 rounded-xl bg-muted"} />
      )}
      <label htmlFor={id} className="font-semibold">{etiqueta}</label>
      <input
        id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={pendiente}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (!archivo) return;
          iniciar(async () => {
            try {
              const path = await subirFoto(tienda.id, tipo === "avatar" ? "perfil" : "portada", archivo);
              const r = await guardarFotoTienda(tipo, path);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Foto guardada");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof ErrorDeFoto ? err.message : "No se pudo subir la foto. Probá con otra o revisá tu conexión.");
            }
          });
        }}
      />
      <Button variant="secondary" type="button" disabled={pendiente} onClick={() => document.getElementById(id)?.click()}>
        {pendiente ? "Preparando foto…" : "Cambiar"}
      </Button>
    </div>
  );
}

export function FormularioDatosTienda({ tienda }: { tienda: Tienda }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <SubirFotoTienda tienda={tienda} tipo="avatar" />
      <SubirFotoTienda tienda={tienda} tipo="cover" />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const valor = (k: string) => String(fd.get(k) ?? "");
          iniciar(async () => {
            setError(null);
            const r = await guardarDatosTienda({
              name: valor("name"), handle: valor("handle"), category: valor("category"), zone: valor("zone"),
              description: valor("description"), live_schedule_note: valor("live_schedule_note"),
            });
            if (!r.ok) return setError(r.error);
            toast.success("Datos guardados");
            router.refresh();
          });
        }}
      >
        <CamposTienda inicial={tienda} />
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="font-semibold">Descripción (opcional)</label>
          <Input id="description" name="description" maxLength={300} defaultValue={tienda.description ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="live_schedule_note" className="font-semibold">Suele estar en vivo…</label>
          <Input id="live_schedule_note" name="live_schedule_note" maxLength={80} defaultValue={tienda.live_schedule_note ?? ""} placeholder="Mar. y jue. 20 h" />
        </div>
        <p className="text-xs text-muted-foreground">Si cambiás tu @usuario, el link anterior deja de funcionar. Se puede cambiar una vez cada 30 días.</p>
        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
        <Button type="submit" disabled={pendiente}>Guardar datos</Button>
      </form>
    </div>
  );
}
```

`src/components/tiendas/formulario-cobro.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarCobro } from "@/app/mi-puesto/acciones";

type Props = {
  inicial?: { payment_alias: string | null; payment_holder: string | null };
  avanzarA?: number;
  textoBoton: string;
  alGuardar: () => void;
};

export function FormularioCobro({ inicial, avanzarA, textoBoton, alGuardar }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          setError(null);
          const r = await guardarCobro(
            { payment_alias: String(fd.get("payment_alias") ?? ""), payment_holder: String(fd.get("payment_holder") ?? "") },
            avanzarA,
          );
          if (!r.ok) return setError(r.error);
          alGuardar();
        });
      }}
    >
      <p className="rounded-xl bg-accent p-3 text-sm">🔒 Solo lo ve quien te compra.</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="payment_alias" className="font-semibold">Alias</label>
        <Input id="payment_alias" name="payment_alias" required autoCapitalize="none" defaultValue={inicial?.payment_alias ?? ""} placeholder="mica.ropa.yb" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="payment_holder" className="font-semibold">Titular</label>
        <Input id="payment_holder" name="payment_holder" required defaultValue={inicial?.payment_holder ?? ""} placeholder="Micaela Díaz" />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={pendiente}>{textoBoton}</Button>
    </form>
  );
}
```

`src/components/tiendas/formulario-entregas.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarEntregas } from "@/app/mi-puesto/acciones";
import { formatARS } from "@/lib/format/plata";
import type { DatosPrivados, EntregasEntrada, ModoEnvio, OpcionEntrega } from "@/lib/tiendas/tipos";

type Props = {
  zona: string;
  opciones: OpcionEntrega[];
  privados: DatosPrivados | null;
  avanzarA?: number;
  textoBoton: string;
  alGuardar: () => void;
};

export function FormularioEntregas({ zona, opciones, privados, avanzarA, textoBoton, alGuardar }: Props) {
  const de = (kind: OpcionEntrega["kind"]) => opciones.find((o) => o.kind === kind);
  const envio = de("shipping");
  const [entrada, setEntrada] = useState<EntregasEntrada>({
    pickup: { enabled: de("pickup")?.enabled ?? false, address: privados?.pickup_address ?? "", hours: privados?.pickup_hours ?? "" },
    shipping: {
      enabled: envio?.enabled ?? false,
      mode: envio?.shipping_mode ?? "fixed",
      cost: envio?.shipping_cost_cents ? formatARS(envio.shipping_cost_cents).replace("$", "") : "",
      note: envio?.note ?? "",
    },
    meetup: { enabled: de("meetup")?.enabled ?? false, note: de("meetup")?.note ?? "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambiar = <K extends keyof EntregasEntrada>(k: K, v: Partial<EntregasEntrada[K]>) =>
    setEntrada((e) => ({ ...e, [k]: { ...e[k], ...v } }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          setError(null);
          const r = await guardarEntregas(entrada, avanzarA);
          if (!r.ok) return setError(r.error);
          alGuardar();
        });
      }}
    >
      <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5" checked={entrada.pickup.enabled} onChange={(e) => cambiar("pickup", { enabled: e.target.checked })} />
          Retiro en mi domicilio
        </label>
        {entrada.pickup.enabled && (
          <>
            <p className="text-xs text-muted-foreground">En tu tienda se ve "Retiro en {zona}". 🔒 La dirección solo la ve quien ya pagó.</p>
            <label htmlFor="pickup_address" className="text-sm font-semibold">Dirección</label>
            <Input id="pickup_address" value={entrada.pickup.address} maxLength={120} onChange={(e) => cambiar("pickup", { address: e.target.value })} />
            <label htmlFor="pickup_hours" className="text-sm font-semibold">Horarios (opcional)</label>
            <Input id="pickup_hours" value={entrada.pickup.hours} maxLength={80} placeholder="Lun. a vie. de 17 a 20 h" onChange={(e) => cambiar("pickup", { hours: e.target.value })} />
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5" checked={entrada.shipping.enabled} onChange={(e) => cambiar("shipping", { enabled: e.target.checked })} />
          Envío
        </label>
        {entrada.shipping.enabled && (
          <>
            {(
              [
                ["fixed", "Con costo fijo"],
                ["free", "Gratis"],
                ["arrange", "A coordinar"],
              ] as [ModoEnvio, string][]
            ).map(([modo, texto]) => (
              <label key={modo} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="shipping_mode" className="size-5" checked={entrada.shipping.mode === modo} onChange={() => cambiar("shipping", { mode: modo })} />
                {texto}
              </label>
            ))}
            {entrada.shipping.mode === "fixed" && (
              <>
                <label htmlFor="shipping_cost" className="text-sm font-semibold">Costo del envío</label>
                <Input id="shipping_cost" inputMode="decimal" value={entrada.shipping.cost} placeholder="2.500" onChange={(e) => cambiar("shipping", { cost: e.target.value })} />
              </>
            )}
            <label htmlFor="shipping_note" className="text-sm font-semibold">Aclaración (opcional)</label>
            <Input id="shipping_note" value={entrada.shipping.note} maxLength={80} placeholder="Solo Gran San Miguel" onChange={(e) => cambiar("shipping", { note: e.target.value })} />
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5" checked={entrada.meetup.enabled} onChange={(e) => cambiar("meetup", { enabled: e.target.checked })} />
          Punto de encuentro
        </label>
        {entrada.meetup.enabled && (
          <>
            <label htmlFor="meetup_note" className="text-sm font-semibold">¿Dónde?</label>
            <Input id="meetup_note" value={entrada.meetup.note} maxLength={80} placeholder="Plaza Independencia, a coordinar" onChange={(e) => cambiar("meetup", { note: e.target.value })} />
          </>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={pendiente}>{textoBoton}</Button>
    </form>
  );
}
```

- [ ] **Step 5: Página Mi tienda**

`src/app/mi-puesto/tienda/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerDatosPrivados, obtenerEntregas, obtenerMiTienda } from "@/lib/tiendas/datos";
import { SeccionesMiTienda } from "./secciones";

async function Contenido() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  const [privados, opciones] = await Promise.all([obtenerDatosPrivados(supabase, tienda.id), obtenerEntregas(supabase, tienda.id)]);
  return <SeccionesMiTienda tienda={tienda} privados={privados} opciones={opciones} />;
}

export default function MiTiendaPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <h1 className="text-2xl font-extrabold">Mi tienda</h1>
      <Suspense>
        <Contenido />
      </Suspense>
    </main>
  );
}
```

`src/app/mi-puesto/tienda/secciones.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormularioCobro } from "@/components/tiendas/formulario-cobro";
import { FormularioDatosTienda } from "@/components/tiendas/formulario-datos-tienda";
import { FormularioEntregas } from "@/components/tiendas/formulario-entregas";
import type { DatosPrivados, OpcionEntrega, Tienda } from "@/lib/tiendas/tipos";

export function SeccionesMiTienda({ tienda, privados, opciones }: { tienda: Tienda; privados: DatosPrivados | null; opciones: OpcionEntrega[] }) {
  const router = useRouter();
  const listo = (mensaje: string) => () => {
    toast.success(mensaje);
    router.refresh();
  };
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Tu puesto</h2>
        <FormularioDatosTienda tienda={tienda} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Cómo cobrás</h2>
        <FormularioCobro inicial={privados ?? undefined} textoBoton="Guardar cobro" alGuardar={listo("Datos de cobro guardados")} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Cómo entregás</h2>
        <FormularioEntregas zona={tienda.zone} opciones={opciones} privados={privados} textoBoton="Guardar entregas" alGuardar={listo("Formas de entrega guardadas")} />
      </section>
    </>
  );
}
```

- [ ] **Step 6: Correr y ver que pasa**

```powershell
npm run test:e2e -- tests/e2e/mi-tienda.spec.ts
```

Expected: PASS (3 pruebas).

- [ ] **Step 7: Suite, tipos, estilo y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }; if ($?) { npm run test:e2e }
git add -A
git commit -m "Agregar Mi tienda con datos, fotos, cobro y formas de entrega" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Abrir el puesto con la invitación (recorrido de 4 pasos)

**Files:**
- Create: `src/app/invitacion/[token]/page.tsx`, `src/app/invitacion/[token]/acciones.ts`, `src/app/invitacion/[token]/paso-tu-puesto.tsx`, `src/app/mi-puesto/armar/page.tsx`, `src/app/mi-puesto/armar/pasos.tsx`, `tests/e2e/abrir-puesto.spec.ts`

**Interfaces:**
- Consumes: `CamposTienda`, `FormularioCobro`, `FormularioEntregas`, `FormularioProducto`, `subirFoto`, `guardarFotoTienda`, `entrarConGoogle`, `crearInvitacionPrueba`, `hacerAdmin`.
- Produces: `abrirPuesto(token: string, datos: { name: string; handle: string; category: string; zone: string }): Promise<{ ok: true; storeId: string } | { ok: false; error: string }>`; `marcarPuestoListo(): Promise<Resultado>`; rutas `/invitacion/[token]` y `/mi-puesto/armar`.

- [ ] **Step 1: Escribir las pruebas e2e (fallan)**

`tests/e2e/abrir-puesto.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearInvitacionPrueba, handleAleatorio, hacerAdmin } from "../helpers/tiendas-prueba";
import { clienteAdmin } from "../helpers/usuario-prueba";
import { cookiesDeSesion } from "./sesion";

let admin: UsuarioPrueba;
const creadas: UsuarioPrueba[] = [];

test.beforeAll(async () => {
  admin = await crearUsuarioPrueba({ nombre: "Admin Abrir" });
  await hacerAdmin(admin.id);
});

test.afterAll(async () => {
  for (const u of creadas) {
    const { data } = await clienteAdmin().from("stores").select("id").eq("owner_id", u.id).maybeSingle();
    if (data) await borrarFotosDeTienda(data.id);
    await borrarUsuarioPrueba(u.id);
  }
  if (admin) await borrarUsuarioPrueba(admin.id);
});

async function nuevaFeriante(nombre: string) {
  const u = await crearUsuarioPrueba({ nombre });
  creadas.push(u);
  return u;
}

async function completarPaso1(page: import("@playwright/test").Page, handle: string) {
  await page.getByLabel("Nombre del puesto").fill("La Ropería de Mica");
  await page.getByLabel("@usuario").fill(handle);
  await page.getByLabel("¿Qué vendés?").fill("Ropa usada");
  await page.getByLabel("Zona o barrio").fill("Yerba Buena");
  await page.getByRole("button", { name: "Seguir" }).click();
}

test("sin sesión invita a entrar y vuelve al mismo link", async ({ page }) => {
  const token = await crearInvitacionPrueba(admin.id);
  await page.goto(`/invitacion/${token}`);
  await expect(page.getByText("Te invitaron a abrir tu puesto en Tu Feria Live")).toBeVisible();
  const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
  await page.getByRole("button", { name: "Entrar con Google" }).click();
  expect(decodeURIComponent((await pedido).url())).toContain(`next=/invitacion/${token}`);
});

test("recorrido completo: 4 pasos y la tienda queda lista y pública", async ({ page, context }) => {
  const mica = await nuevaFeriante("Mica Abre");
  const token = await crearInvitacionPrueba(admin.id);
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto(`/invitacion/${token}`);
  const handle = handleAleatorio("mica");

  await expect(page.getByText("Paso 1 de 4")).toBeVisible();
  await page.getByLabel("Foto del puesto").setInputFiles("tests/e2e/fixtures/foto-de-costado.jpg");
  await completarPaso1(page, handle);

  await expect(page.getByText("Paso 2 de 4")).toBeVisible();
  await page.getByLabel("Alias").fill("mica.ropa.yb");
  await page.getByLabel("Titular").fill("Micaela Díaz");
  await page.getByRole("button", { name: "Seguir" }).click();

  await expect(page.getByText("Paso 3 de 4")).toBeVisible();
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByRole("alert")).toHaveText("Elegí al menos una forma de entrega.");
  await page.getByLabel("Retiro en mi domicilio").check();
  await page.getByLabel("Dirección").fill("Av. Aconquija 1234");
  await page.getByRole("button", { name: "Seguir" }).click();

  await expect(page.getByText("Paso 4 de 4")).toBeVisible();
  await page.getByLabel("Nombre").fill("Vestido azul");
  await page.getByLabel("Precio").fill("8.000");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar y terminar" }).click();

  await expect(page).toHaveURL("/mi-puesto?listo=1");
  await expect(page.getByText("¡Tu puesto está listo!")).toBeVisible();

  await page.goto(`/invitacion/${token}`);
  await expect(page.getByText("Ya tenés tu puesto.")).toBeVisible();
});

test("si cierra en el paso 3, al volver retoma ahí", async ({ page, context }) => {
  const ana = await nuevaFeriante("Ana Retoma");
  const token = await crearInvitacionPrueba(admin.id);
  await context.addCookies(await cookiesDeSesion(ana.sesion));
  await page.goto(`/invitacion/${token}`);
  await completarPaso1(page, handleAleatorio("ana"));
  await page.getByLabel("Alias").fill("ana.dulces");
  await page.getByLabel("Titular").fill("Ana Pérez");
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByText("Paso 3 de 4")).toBeVisible();

  await page.goto("/mi-puesto");
  await page.getByRole("link", { name: "Seguir armando" }).click();
  await expect(page.getByText("Paso 3 de 4")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lo cargo después" })).toHaveCount(0);
});

test("mensajes de invitación vencida, usada, inválida y @usuario tomado", async ({ page, context }) => {
  const beto = await nuevaFeriante("Beto Mensajes");
  await context.addCookies(await cookiesDeSesion(beto.sesion));
  await page.goto(`/invitacion/${await crearInvitacionPrueba(admin.id, { venceEnDias: -1 })}`);
  await expect(page.getByText("Esta invitación venció. Pedile una nueva a Tu Feria Live.")).toBeVisible();
  await page.goto("/invitacion/no-existe-este-link-de-invitacion-xx");
  await expect(page.getByText("Esta invitación no es válida.")).toBeVisible();

  const tomado = handleAleatorio("tomado");
  const otra = await nuevaFeriante("Otra Tomado");
  const tokenOtra = await crearInvitacionPrueba(admin.id);
  await otra.cliente.rpc("canjear_invitacion", { p_token: tokenOtra, p_handle: tomado, p_name: "Otra", p_category: "Ropa", p_zone: "Centro" });

  const token = await crearInvitacionPrueba(admin.id);
  await page.goto(`/invitacion/${token}`);
  await completarPaso1(page, tomado);
  await expect(page.getByRole("alert")).toHaveText(`@${tomado} ya está en uso. Probá con otro.`);

  await page.goto(`/invitacion/${tokenOtra}`);
  await expect(page.getByText("Esta invitación ya se usó.")).toBeVisible();
});
```

- [ ] **Step 2: Correr y ver que falla**

```powershell
npm run test:e2e -- tests/e2e/abrir-puesto.spec.ts
```

Expected: FAIL (no existe `/invitacion/...`).

- [ ] **Step 3: Acciones del recorrido**

`src/app/invitacion/[token]/acciones.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { datosTiendaSchema, errorDeHandle, normalizarHandle, primerError } from "@/lib/tiendas/validacion";

const MENSAJES: Record<string, string> = {
  invitacion_vencida: "Esta invitación venció. Pedile una nueva a Tu Feria Live.",
  invitacion_usada: "Esta invitación ya se usó.",
  invitacion_invalida: "Esta invitación no es válida.",
  ya_tiene_tienda: "Ya tenés tu puesto.",
  handle_invalido: "Usá solo minúsculas, números y puntos (de 3 a 30).",
  sin_sesion: "Entrá con Google para abrir tu puesto.",
};

export async function abrirPuesto(
  token: string,
  datos: { name: string; handle: string; category: string; zone: string },
): Promise<{ ok: true; storeId: string } | { ok: false; error: string }> {
  const handle = normalizarHandle(datos.handle);
  const errorHandle = errorDeHandle(handle);
  if (errorHandle) return { ok: false, error: errorHandle };
  const r = datosTiendaSchema.safeParse(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("canjear_invitacion", {
    p_token: token, p_handle: handle, p_name: r.data.name, p_category: r.data.category, p_zone: r.data.zone,
  });
  if (error) {
    if (error.message === "handle_tomado") return { ok: false, error: `@${handle} ya está en uso. Probá con otro.` };
    return { ok: false, error: MENSAJES[error.message] ?? "No se pudo guardar. Revisá tu conexión y probá de nuevo." };
  }
  return { ok: true, storeId: data as string };
}
```

Agregar a `src/app/mi-puesto/acciones.ts`:

```ts
export async function marcarPuestoListo(): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  await avanzarPaso(sesion.supabase, sesion.tienda, 5);
  return { ok: true };
}
```

- [ ] **Step 4: Página de la invitación y paso 1**

`src/app/invitacion/[token]/paso-tu-puesto.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CamposTienda } from "@/components/tiendas/campos-tienda";
import { Button } from "@/components/ui/button";
import { guardarFotoTienda } from "@/app/mi-puesto/acciones";
import { subirFoto } from "@/lib/fotos/subir";
import { abrirPuesto } from "./acciones";

export function PasoTuPuesto({ token }: { token: string }) {
  const router = useRouter();
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (k: string) => String(fd.get(k) ?? "");
        iniciar(async () => {
          setError(null);
          const r = await abrirPuesto(token, { name: v("name"), handle: v("handle"), category: v("category"), zone: v("zone") });
          if (!r.ok) return setError(r.error);
          if (foto) {
            try {
              await guardarFotoTienda("avatar", await subirFoto(r.storeId, "perfil", foto));
            } catch {
              toast.error("Tu puesto se creó, pero la foto no se pudo subir. Cargala después desde Mi tienda.");
            }
          }
          router.push("/mi-puesto/armar");
        });
      }}
    >
      <p className="text-sm font-semibold text-primary">Paso 1 de 4</p>
      <h1 className="text-2xl font-extrabold">Tu puesto</h1>
      <div className="flex flex-col gap-1">
        <label htmlFor="foto-avatar" className="font-semibold">Foto del puesto</label>
        <input id="foto-avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
      </div>
      <CamposTienda />
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pendiente}>{pendiente ? "Guardando…" : "Seguir"}</Button>
    </form>
  );
}
```

`src/app/invitacion/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import { PasoTuPuesto } from "./paso-tu-puesto";

const MENSAJES: Record<string, string> = {
  vencida: "Esta invitación venció. Pedile una nueva a Tu Feria Live.",
  usada: "Esta invitación ya se usó.",
  invalida: "Esta invitación no es válida.",
};

function Mensaje({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-lg font-bold">{texto}</p>
      {children}
    </div>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) {
    return (
      <Mensaje texto="Te invitaron a abrir tu puesto en Tu Feria Live">
        <p className="text-muted-foreground">Entrá con tu cuenta de Google para empezar.</p>
        <form action={entrarConGoogle}>
          <input type="hidden" name="next" value={`/invitacion/${token}`} />
          <Button type="submit" size="lg">Entrar con Google</Button>
        </form>
      </Mensaje>
    );
  }
  if (await obtenerMiTienda(supabase, userId)) {
    return (
      <Mensaje texto="Ya tenés tu puesto.">
        <Button render={<Link href="/mi-puesto" />}>Ir a Mi puesto</Button>
      </Mensaje>
    );
  }
  const { data: estado } = await supabase.rpc("estado_invitacion", { p_token: token });
  if (estado !== "valida") return <Mensaje texto={MENSAJES[String(estado)] ?? MENSAJES.invalida!} />;
  return <PasoTuPuesto token={token} />;
}

export default function InvitacionPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 5: Pasos 2 a 4**

`src/app/mi-puesto/armar/pasos.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormularioCobro } from "@/components/tiendas/formulario-cobro";
import { FormularioEntregas } from "@/components/tiendas/formulario-entregas";
import { FormularioProducto } from "@/components/tiendas/formulario-producto";
import { Button } from "@/components/ui/button";
import { marcarPuestoListo } from "@/app/mi-puesto/acciones";
import type { DatosPrivados, OpcionEntrega, Tienda } from "@/lib/tiendas/tipos";

type Props = { tienda: Tienda; privados: DatosPrivados | null; opciones: OpcionEntrega[] };

export function Pasos({ tienda, privados, opciones }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const refrescar = () => router.refresh();
  const terminar = () => {
    router.push("/mi-puesto?listo=1");
    router.refresh();
  };
  const paso = tienda.onboarding_step;

  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary motion-safe:transition-[width]" style={{ width: `${(paso / 4) * 100}%` }} />
      </div>
      <p className="text-sm font-semibold text-primary">Paso {paso} de 4</p>
      {paso === 2 && (
        <>
          <h1 className="text-2xl font-extrabold">Cómo cobrás</h1>
          <FormularioCobro inicial={privados ?? undefined} avanzarA={3} textoBoton="Seguir" alGuardar={refrescar} />
        </>
      )}
      {paso === 3 && (
        <>
          <h1 className="text-2xl font-extrabold">Cómo entregás</h1>
          <FormularioEntregas zona={tienda.zone} opciones={opciones} privados={privados} avanzarA={4} textoBoton="Seguir" alGuardar={refrescar} />
        </>
      )}
      {paso === 4 && (
        <>
          <h1 className="text-2xl font-extrabold">Tu primer producto</h1>
          <FormularioProducto storeId={tienda.id} avanzarA={5} textoBoton="Guardar y terminar" alGuardar={terminar} />
          <Button
            variant="ghost"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await marcarPuestoListo();
                if (r.ok) terminar();
              })
            }
          >
            Lo cargo después
          </Button>
        </>
      )}
    </div>
  );
}
```

`src/app/mi-puesto/armar/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerDatosPrivados, obtenerEntregas, obtenerMiTienda } from "@/lib/tiendas/datos";
import { Pasos } from "./pasos";

async function Contenido() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) redirect("/mi-puesto");
  if (tienda.onboarding_step >= 5) redirect("/mi-puesto");
  const [privados, opciones] = await Promise.all([obtenerDatosPrivados(supabase, tienda.id), obtenerEntregas(supabase, tienda.id)]);
  return <Pasos tienda={tienda} privados={privados} opciones={opciones} />;
}

export default function ArmarPuestoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido />
      </Suspense>
    </main>
  );
}
```

Nota: `/mi-puesto/armar` ya queda protegida por el proxy (`/mi-puesto`).

- [ ] **Step 6: Correr y ver que pasa**

```powershell
npm run test:e2e -- tests/e2e/abrir-puesto.spec.ts
```

Expected: PASS (4 pruebas).

Nota de alcance: en el paso 1 se carga la foto del puesto; la portada (opcional según el spec) se carga desde Mi tienda, para que el primer paso sea corto. Registrar como ruling.

- [ ] **Step 7: Suite, tipos, estilo y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }; if ($?) { npm run test:e2e }
git add -A
git commit -m "Agregar el recorrido guiado para abrir el puesto con una invitación" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tienda pública, Inicio con Puestos, Seguir y Seguidos

**Files:**
- Create: `src/app/tienda/[handle]/page.tsx`, `src/app/tienda/[handle]/p/[id]/page.tsx`, `src/app/tienda/acciones.ts`, `src/components/tiendas/boton-seguir.tsx`, `src/components/tiendas/tarjeta-puesto.tsx`, `tests/e2e/tienda-publica.spec.ts`
- Modify: `next.config.ts`, `src/app/page.tsx`, `src/app/seguidos/page.tsx`

**Interfaces:**
- Consumes: `datos.ts`, `resumenEntregas`, `<Foto>`, `entrarConGoogle`, `obtenerUsuarioId`, `formatARS`, helpers de prueba.
- Produces: `alternarSeguir(storeId: string, seguir: boolean): Promise<Resultado>`; `<BotonSeguir storeId handle siguiendo conSesion />`; `<TarjetaPuesto puesto siguiendo conSesion />`; rutas `/@usuario` y `/@usuario/p/[id]`.

- [ ] **Step 1: Escribir las pruebas e2e (fallan)**

`tests/e2e/tienda-publica.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let feriante: UsuarioPrueba;
let aMedias: UsuarioPrueba;
let compradora: UsuarioPrueba;
let tienda: { id: string; handle: string };
let incompleta: { id: string; handle: string };

test.beforeAll(async () => {
  [feriante, aMedias, compradora] = await Promise.all([
    crearUsuarioPrueba({ nombre: "Mica Pública" }),
    crearUsuarioPrueba({ nombre: "A Medias" }),
    crearUsuarioPrueba({ nombre: "Sofi Compradora" }),
  ]);
  tienda = await crearTiendaPrueba(feriante, { conProducto: true });
  await clienteAdmin().from("stores").update({ name: "La Ropería de Mica", live_schedule_note: "Mar. y jue. 20 h" }).eq("id", tienda.id);
  await clienteAdmin().from("store_delivery_options").insert({ store_id: tienda.id, kind: "shipping", enabled: true, shipping_mode: "fixed", shipping_cost_cents: 250000 });
  incompleta = await crearTiendaPrueba(aMedias, { completa: false, conProducto: true });
  await clienteAdmin().from("stores").update({ name: "Puesto A Medias" }).eq("id", incompleta.id);
});

test.afterAll(async () => {
  await Promise.all([feriante, aMedias, compradora].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test("la tienda pública muestra datos, entregas y productos, sin datos privados", async ({ page }) => {
  await page.goto(`/@${tienda.handle}`);
  await expect(page.getByRole("heading", { name: "La Ropería de Mica" })).toBeVisible();
  await expect(page.getByText("Mar. y jue. 20 h")).toBeVisible();
  await expect(page.getByText("Retiro en Yerba Buena")).toBeVisible();
  await expect(page.getByText("Envío $2.500")).toBeVisible();
  await expect(page.getByText("Vestido de prueba")).toBeVisible();
  await expect(page.getByText("prueba.alias")).toHaveCount(0);
  await expect(page.getByText("Calle Falsa 123")).toHaveCount(0);
  await page.getByRole("link", { name: /Vestido de prueba/ }).click();
  await expect(page).toHaveURL(new RegExp(`/@${tienda.handle.replace(".", "\\.")}/p/`));
  await expect(page.getByText("$8.000")).toBeVisible();
});

test("una tienda que no existe muestra su mensaje", async ({ page }) => {
  await page.goto("/@no.existe.este.puesto");
  await expect(page.getByText("No encontramos este puesto.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ir al inicio" })).toBeVisible();
});

test("el Inicio lista los puestos completos y no los que están a medio armar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Puestos" })).toBeVisible();
  await expect(page.getByRole("link", { name: /La Ropería de Mica/ })).toBeVisible();
  await expect(page.getByText("Puesto A Medias")).toHaveCount(0);
});

test("seguir un puesto y verlo en Seguidos; dejar de seguir", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(compradora.sesion));
  await page.goto(`/@${tienda.handle}`);
  await expect(page.getByText("0 seguidores")).toBeVisible();
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByRole("button", { name: "Siguiendo" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 seguidor")).toBeVisible();
  await page.goto("/seguidos");
  await expect(page.getByRole("link", { name: /La Ropería de Mica/ })).toBeVisible();
  await page.getByRole("button", { name: "Siguiendo" }).click();
  await page.reload();
  await expect(page.getByText("Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten.")).toBeVisible();
});

test("Seguir sin sesión pide entrar y vuelve a la tienda", async ({ page }) => {
  await page.goto(`/@${tienda.handle}`);
  const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
  await page.getByRole("button", { name: "Seguir" }).click();
  expect(decodeURIComponent((await pedido).url())).toContain(`next=/@${tienda.handle}`);
});
```

- [ ] **Step 2: Correr y ver que falla**

```powershell
npm run test:e2e -- tests/e2e/tienda-publica.spec.ts
```

Expected: FAIL (`/@...` da "no encontrada").

- [ ] **Step 3: Reescritura de direcciones**

En `next.config.ts`, dentro de `nextConfig`, agregar:

```ts
  async rewrites() {
    return [
      { source: "/@:handle", destination: "/tienda/:handle" },
      { source: "/@:handle/p/:id", destination: "/tienda/:handle/p/:id" },
    ];
  },
```

(Verificar en `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md` que un `source` con `@` literal funciona en la versión instalada; las carpetas con `@` se reservan para rutas paralelas, por eso la tienda vive en `/tienda/[handle]`.)

- [ ] **Step 4: Acción y botón de Seguir**

`src/app/tienda/acciones.ts`:

```ts
"use server";

import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tiendas/tipos";

export async function alternarSeguir(storeId: string, seguir: boolean): Promise<Resultado> {
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) return { ok: false, error: "Entrá con Google para seguir puestos." };
  const { error } = seguir
    ? await supabase.from("follows").upsert({ user_id: userId, store_id: storeId }, { onConflict: "user_id,store_id", ignoreDuplicates: true })
    : await supabase.from("follows").delete().eq("user_id", userId).eq("store_id", storeId);
  return error ? { ok: false, error: "No se pudo guardar. Revisá tu conexión y probá de nuevo." } : { ok: true };
}
```

`src/components/tiendas/boton-seguir.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { entrarConGoogle } from "@/app/auth/acciones";
import { alternarSeguir } from "@/app/tienda/acciones";
import { Button } from "@/components/ui/button";

type Props = { storeId: string; handle: string; siguiendo: boolean; conSesion: boolean };

export function BotonSeguir({ storeId, handle, siguiendo, conSesion }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useOptimistic(siguiendo);
  const [, iniciar] = useTransition();

  if (!conSesion) {
    return (
      <form action={entrarConGoogle}>
        <input type="hidden" name="next" value={`/@${handle}`} />
        <Button type="submit">Seguir</Button>
      </form>
    );
  }
  return (
    <Button
      variant={estado ? "secondary" : "default"}
      aria-pressed={estado}
      onClick={() =>
        iniciar(async () => {
          setEstado(!estado);
          const r = await alternarSeguir(storeId, !estado);
          if (!r.ok) toast.error(r.error);
          router.refresh();
        })
      }
    >
      {estado ? "Siguiendo" : "Seguir"}
    </Button>
  );
}
```

- [ ] **Step 5: Tarjeta de puesto**

`src/components/tiendas/tarjeta-puesto.tsx`:

```tsx
import Link from "next/link";
import { Foto } from "@/components/fotos/foto";
import { formatARS } from "@/lib/format/plata";
import type { PuestoResumen } from "@/lib/tiendas/tipos";
import { BotonSeguir } from "./boton-seguir";

export function TarjetaPuesto({ puesto, siguiendo, conSesion }: { puesto: PuestoResumen; siguiendo: boolean; conSesion: boolean }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border p-3">
      <div className="flex items-center gap-3">
        <Link href={`/@${puesto.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
          {puesto.avatar_path ? (
            <Foto path={puesto.avatar_path} tamano="chica" alt="" className="size-11 shrink-0 rounded-full object-cover" />
          ) : (
            <div aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-primary">
              {puesto.name.charAt(0)}
            </div>
          )}
          <span className="min-w-0">
            <span className="block truncate font-bold">{puesto.name}</span>
            <span className="block truncate text-sm text-muted-foreground">{puesto.category} · {puesto.zone}</span>
          </span>
        </Link>
        <BotonSeguir storeId={puesto.id} handle={puesto.handle} siguiendo={siguiendo} conSesion={conSesion} />
      </div>
      {puesto.productos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {puesto.productos.map((p) => (
            <Link key={p.id} href={`/@${puesto.handle}/p/${p.id}`} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              {p.foto && <Foto path={p.foto} tamano="chica" alt="" className="size-full object-cover" />}
              <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-xs font-bold tabular-nums">{formatARS(p.price_cents)}</span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 6: Tienda pública y producto**

`src/app/tienda/[handle]/page.tsx`:

```tsx
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Foto } from "@/components/fotos/foto";
import { EstadoVacio } from "@/components/estado-vacio";
import { BotonSeguir } from "@/components/tiendas/boton-seguir";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/server";
import { contarSeguidores, idsSeguidos, listarProductos, obtenerEntregas, obtenerTiendaPorHandle } from "@/lib/tiendas/datos";
import { resumenEntregas } from "@/lib/tiendas/entrega";

function NoEncontrado() {
  return (
    <EstadoVacio texto="No encontramos este puesto." accion={<Button render={<Link href="/" />}>Ir al inicio</Button>} />
  );
}

async function Contenido({ params }: { params: Promise<{ handle: string }> }) {
  await connection();
  const { handle } = await params;
  const supabase = await createClient();
  const tienda = await obtenerTiendaPorHandle(supabase, decodeURIComponent(handle));
  if (!tienda) return <NoEncontrado />;
  const userId = await obtenerUsuarioId(supabase);
  const [productos, opciones, seguidores, seguidos] = await Promise.all([
    listarProductos(supabase, tienda.id),
    obtenerEntregas(supabase, tienda.id),
    contarSeguidores(supabase, tienda.id),
    userId ? idsSeguidos(supabase, userId) : Promise.resolve(new Set<string>()),
  ]);
  const visibles = productos.filter((p) => p.visible);

  return (
    <>
      <div className="relative -mx-4 -mt-4 h-28 bg-gradient-to-br from-accent to-primary">
        {tienda.cover_path && <Foto path={tienda.cover_path} tamano="grande" alt="" className="size-full object-cover" />}
      </div>
      <div className="-mt-10 flex items-end justify-between gap-3">
        {tienda.avatar_path ? (
          <Foto path={tienda.avatar_path} tamano="chica" alt={`Foto de ${tienda.name}`} className="size-20 rounded-full border-4 border-background object-cover" />
        ) : (
          <div aria-hidden="true" className="grid size-20 place-items-center rounded-full border-4 border-background bg-accent text-3xl font-extrabold text-primary">
            {tienda.name.charAt(0)}
          </div>
        )}
        <BotonSeguir storeId={tienda.id} handle={tienda.handle} siguiendo={seguidos.has(tienda.id)} conSesion={Boolean(userId)} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">{tienda.name}</h1>
        <p className="text-sm text-muted-foreground">
          {tienda.category} · {tienda.zone} · {seguidores === 1 ? "1 seguidor" : `${seguidores} seguidores`}
        </p>
        {tienda.description && <p>{tienda.description}</p>}
      </div>
      {tienda.live_schedule_note && (
        <p className="rounded-xl bg-codigo/30 p-3 text-sm">📅 Suele estar en vivo <b>{tienda.live_schedule_note}</b></p>
      )}
      <ul aria-label="Formas de entrega" className="flex flex-wrap gap-2">
        {resumenEntregas(opciones, tienda.zone).map((t) => (
          <li key={t} className="rounded-full bg-secondary px-3 py-1 text-sm">{t}</li>
        ))}
      </ul>
      <h2 className="text-lg font-bold">Productos</h2>
      {visibles.length === 0 ? (
        <EstadoVacio texto="Todavía no cargó productos. Mirala en su próximo vivo." />
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {visibles.map((p) => (
            <li key={p.id}>
              <Link href={`/@${tienda.handle}/p/${p.id}`} className="flex flex-col overflow-hidden rounded-xl border">
                {p.fotos[0] ? (
                  <Foto path={p.fotos[0].path} tamano="chica" alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square bg-muted" />
                )}
                <span className="p-2 text-sm">
                  <b className="block tabular-nums">{formatARS(p.price_cents)}</b>
                  {p.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TiendaPage({ params }: PageProps<"/tienda/[handle]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
```

La página muestra su propio "No encontramos este puesto." (sin `notFound()`), con el botón al Inicio que pide el spec.

`src/app/tienda/[handle]/p/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { Foto } from "@/components/fotos/foto";
import { Button } from "@/components/ui/button";
import { formatARS } from "@/lib/format/plata";
import { createClient } from "@/lib/supabase/server";
import { obtenerProducto, obtenerTiendaPorHandle } from "@/lib/tiendas/datos";

async function Contenido({ params }: { params: Promise<{ handle: string; id: string }> }) {
  await connection();
  const { handle, id } = await params;
  const supabase = await createClient();
  const tienda = await obtenerTiendaPorHandle(supabase, decodeURIComponent(handle));
  const producto = tienda ? await obtenerProducto(supabase, tienda.id, id) : null;
  if (!tienda || !producto || !producto.visible) {
    return <EstadoVacio texto="No encontramos este producto." accion={<Button render={<Link href="/" />}>Ir al inicio</Button>} />;
  }
  return (
    <>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
        {producto.fotos.length ? (
          producto.fotos.map((f, i) => (
            <Foto key={f.id} path={f.path} tamano="grande" alt={`${producto.name}, foto ${i + 1}`} className="aspect-[3/4] w-[85%] shrink-0 snap-center rounded-2xl object-cover" />
          ))
        ) : (
          <div className="aspect-[3/4] w-full rounded-2xl bg-muted" />
        )}
      </div>
      <h1 className="text-2xl font-extrabold">{producto.name}</h1>
      <p className="text-2xl font-extrabold tabular-nums">{formatARS(producto.price_cents)}</p>
      {producto.description && <p>{producto.description}</p>}
      <p className="text-sm text-muted-foreground">{producto.quantity > 0 ? `Quedan ${producto.quantity}` : "Agotado"}</p>
      <p className="rounded-xl bg-accent p-3 text-sm">Se compra en los vivos de {tienda.name}, con el código que dice en el momento.</p>
      <Button variant="secondary" render={<Link href={`/@${tienda.handle}`} />}>Ver el puesto</Button>
    </>
  );
}

export default function ProductoPage({ params }: PageProps<"/tienda/[handle]/p/[id]">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 7: Inicio con Puestos**

Reemplazar `src/app/page.tsx`:

```tsx
import { connection } from "next/server";
import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { EstadoVacio } from "@/components/estado-vacio";
import { TarjetaPuesto } from "@/components/tiendas/tarjeta-puesto";
import { Button } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { idsSeguidos, listarPuestos } from "@/lib/tiendas/datos";

type Props = { searchParams: Promise<{ error?: string }> };

async function MensajeDeError({ searchParams }: Props) {
  const { error } = await searchParams;
  if (error !== "login") return null;
  return (
    <p role="alert" className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground">
      No pudimos hacerte entrar. Probá de nuevo.
    </p>
  );
}

async function Puestos() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const [puestos, seguidos] = await Promise.all([
    listarPuestos(supabase),
    userId ? idsSeguidos(supabase, userId) : Promise.resolve(new Set<string>()),
  ]);
  return (
    <>
      {!userId && (
        <form action={entrarConGoogle}>
          <Button type="submit" size="lg" className="w-full">Entrar con Google</Button>
        </form>
      )}
      <p className="rounded-xl bg-secondary p-3 text-sm">Ahora no hay nadie en vivo. Seguí a tus puestos favoritos.</p>
      <h2 className="text-lg font-bold">Puestos</h2>
      {puestos.length === 0 ? (
        <EstadoVacio texto="Pronto vas a ver acá los puestos de Tu Feria Live." />
      ) : (
        <div className="flex flex-col gap-3">
          {puestos.map((p) => (
            <TarjetaPuesto key={p.id} puesto={p} siguiendo={seguidos.has(p.id)} conSesion={Boolean(userId)} />
          ))}
        </div>
      )}
    </>
  );
}

export default function InicioPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Tu Feria Live</h1>
        <p className="text-muted-foreground">Vendé en vivo, sin que nadie te corte</p>
      </header>
      <Suspense>
        <MensajeDeError searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <Puestos />
      </Suspense>
    </main>
  );
}
```

El texto "Ahora no hay nadie en vivo…" es el estado de "En vivo ahora" sin transmisiones (regla 7.1 de la Parte 0); la Parte 2 lo reemplaza por las tarjetas de vivos cuando haya.

- [ ] **Step 8: Seguidos con la lista**

En `src/app/seguidos/page.tsx`, reemplazar la última línea de `ContenidoSeguidos` (el `return` del estado vacío) por:

```tsx
  const puestos = await listarSeguidos(supabase, userId);
  if (!puestos.length) return <EstadoVacio texto="Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten." />;
  return (
    <div className="flex flex-col gap-3">
      {puestos.map((p) => (
        <TarjetaPuesto key={p.id} puesto={p} siguiendo conSesion />
      ))}
    </div>
  );
```

Y agregar los imports `import { TarjetaPuesto } from "@/components/tiendas/tarjeta-puesto";` y `import { listarSeguidos } from "@/lib/tiendas/datos";`.

- [ ] **Step 9: Correr y ver que pasa**

```powershell
npm run test:e2e -- tests/e2e/tienda-publica.spec.ts
```

Expected: PASS (5 pruebas).

- [ ] **Step 10: Suite completa, armado y commit**

```powershell
npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }; if ($?) { npm run test:integracion }; if ($?) { npm run test:e2e }; if ($?) { npm run build }
git add -A
git commit -m "Agregar la tienda pública, el Inicio con puestos y seguir puestos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin fase-1-parte-1
```

Expected: todo PASS; GitHub Actions con tilde verde en la rama.

---

### Task 9: Publicación y verificación con el dueño

**Files:** ninguno de código salvo correcciones.

- [ ] **Step 1: (Dueño) Hacerse administrador**

Pedirle al dueño que, en **Supabase → SQL Editor → New query**, pegue y ejecute (reemplazando el email por el de su cuenta de Google con la que entra a Tu Feria Live; el email **no** se guarda en el repositorio):

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'TU-EMAIL@gmail.com'
on conflict do nothing;
```

Verificar con él que la consulta diga "1 row" (si dice 0, el email no coincide con el de su cuenta).

- [ ] **Step 2: Pull Request**

Pasarle al dueño el enlace `https://github.com/GermanValoy/-live-emprendedores/compare/main...fase-1-parte-1` con el título "Fase 1 · Parte 1: tiendas y productos" y una descripción que liste lo construido y termine con:

```markdown
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3: Probar en la versión de prueba de Vercel (con el dueño)**

En la dirección de prueba del PR:
1. Entrar a `/admin`, crear una invitación y copiarla.
2. Abrirla con **otra** cuenta de Google (o en una ventana privada) y completar los 4 pasos desde el celular, con foto.
3. Ver la tienda en `/@usuario` y el Inicio; seguirla con la cuenta principal y verla en Seguidos.

- [ ] **Step 4: Unir y verificar la versión definitiva**

Con el visto bueno del dueño, "Merge pull request". Verificar `https://tuferialive.vercel.app/@usuario` y que el CI de `main` quede en verde. Luego:

```powershell
git switch main; git pull --ff-only; git branch -d fase-1-parte-1
```
