# Darle una prenda a quien preguntó · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la feriante, desde el chat del estudio, le dé una prenda de un código cerrado con unidades libres a la persona que preguntó, y que la voz le avise cuando dice un código ya usado en el vivo.

**Architecture:** una función atómica nueva en PostgreSQL (`dar_prenda`) que reutiliza `armar_pedido`; una Server Action que la llama; una opción nueva en el panel de moderar del chat del estudio que abre un panel con las prendas libres (los códigos los tiene `CodigosEstudio`, así que `EstudioVivo` hace de puente entre el chat y los códigos). La compradora y la sala no cambian: ya reaccionan al pedido nuevo y a `last_winner_*`.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres, RLS, Realtime), Drizzle, Vitest, Playwright, sonner (avisos).

**Spec:** `docs/superpowers/specs/2026-11-08-dar-una-prenda-design.md`

## Global Constraints

- Textos en español rioplatense (voseo). Textos exactos:
  - Opción del panel: **"Darle una prenda"**, con la línea chica "De un código que ya pasó".
  - Título del panel de prendas: **"¿Qué prenda le das a {nombre}?"**; vacío: **"No quedan prendas sin vender de códigos anteriores."**
  - Éxito: **"Le diste el {ETIQUETA} a {nombre}."**
  - Errores: agotado → **"Ya no quedan unidades de {ETIQUETA}."**; repetido → **"{nombre} ya tiene el {ETIQUETA}."**; vivo terminado → **"Este vivo ya terminó."**; código no disponible → **"Ese código ya no se puede dar."**; cualquier otro → el `ERROR_GENERICO` existente.
  - Voz: **"{PALABRA} ya lo usaste en este vivo. Decí otra palabra."**
  - Pedidos: **"Se la diste vos"**.
- Orden de bloqueos: primero `live_codes … FOR UPDATE`, después lo demás; nunca `live_sessions FOR UPDATE`.
- Funciones `SECURITY DEFINER` con `SET search_path = ''`; `REVOKE … FROM PUBLIC, anon, authenticated` antes del `GRANT`.
- Montos en centavos enteros. Ninguna clave nueva.
- Migraciones nuevas, nunca editar una aplicada. Commits chicos en español terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. La feriante toca "Darle una prenda" dos veces seguidas (doble toque) → un solo pedido; el segundo intento dice "{nombre} ya tiene el {ETIQUETA}." (lo cubre la regla de una por persona; test en Tarea 1).
2. El código cerrado pierde la última unidad mientras el panel está abierto (otra compradora o la misma feriante en otra pestaña) → el panel se actualiza solo (la lista sale de `useCodigosVivo`, en tiempo real) y si igual llega tarde, "Ya no quedan unidades de…". Test de simultaneidad en Tarea 1.
3. El vivo termina con el panel abierto → la acción responde "Este vivo ya terminó." y el estudio cierra el panel al pasar a la pantalla de fin (test en Tarea 1 a nivel base).
4. Mensaje borrado por la feriante o escondido por el moderador → igual se le puede dar (la persona existe y escribió en este vivo). Test en Tarea 1.
5. La feriante repite por voz el código activo ("¡acuérdense, código rojo!") → sin aviso; uno viejo → aviso. Test unitario en Tarea 3.

---

### Task 1: Función `dar_prenda` en la base

**Files:**
- Modify: `src/db/schema.ts` (tabla `orders`: `givenByOwner: boolean("given_by_owner").notNull().default(false)`)
- Create: la migración que genera `npm run db:generate` (será `drizzle/0027_*.sql`)
- Create: `drizzle/0028_seguridad_dar_prenda.sql` (registrarla en `drizzle/meta/_journal.json` como las anteriores hechas a mano, p. ej. `0026_sumar_voz`)
- Modify: `src/lib/codigos/tipos.ts` (`Pedido.given_by_owner: boolean` y sumarlo a `CAMPOS_PEDIDO`)
- Test: `tests/integracion/dar-prenda.test.ts`

**Interfaces:**
- Produces: `public.dar_prenda(p_codigo uuid, p_mensaje uuid) RETURNS text` (devuelve `buyer_name`). Errores `P0001` con mensaje: `sin_permiso` (no es la dueña), `cerrado` (vivo terminado), `no_disponible` (código `activo` o `anulado`), `agotado` (`sold >= quantity`), `repetido` (esa persona ya tiene un reclamo de ese código), `datos_invalidos` (mensaje inexistente, de otro vivo o de la dueña). `estado_invalido` lo sigue pudiendo tirar `armar_pedido` (puesto sin alias).
- Produces: columna `orders.given_by_owner`, `true` solo en pedidos creados por `dar_prenda`.

- [ ] **Step 1: Escribir las pruebas de integración** (mismos helpers que `tests/integracion/codigos.test.ts`: `crearUsuarioPrueba`, `crearTiendaPrueba`, `lanzarPrueba`, `reclamarPrueba`; la feriante llama con su propio `cliente`, rol `authenticated`):
  - `da la prenda de un código cerrado`: ROJO cantidad 2, se cierra sin ventas; Ana escribe "¿y el rojo?"; `dar_prenda` devuelve el nombre de Ana; hay un pedido `por_pagar` de Ana con `price_cents` del código, el alias del puesto, `given_by_owner = true`, `deadline` ≈ ahora + plazo del puesto; `live_codes.sold = 1`; `last_winner_name` = Ana; el reclamo es `ganadora`.
  - `rechaza el código activo` → `no_disponible`; `rechaza un código anulado` → `no_disponible`.
  - `rechaza sin unidades` (cantidad 1 ya ganada y cerrado) → `agotado`.
  - `rechaza con el vivo terminado` → `cerrado`.
  - `rechaza a quien ya tiene el código` (dos llamadas iguales seguidas) → la segunda `repetido`, un solo pedido.
  - `rechaza el mensaje de la dueña` y `un mensaje de otro vivo` → `datos_invalidos`.
  - `rechaza a otra feriante` → `sin_permiso`; `anon` no puede ejecutarla (error de permiso).
  - `se puede dar aunque el mensaje esté borrado` (`deleted_at` puesto).
  - `dos a la vez por la última unidad`: cantidad 1, cerrado, dos mensajes de dos personas, `Promise.all` de dos `dar_prenda` → exactamente uno ok y el otro `agotado`; `sold = 1`.
  - `si vence vuelve a quedar libre`: después de darla, poner `deadline` en el pasado con el cliente admin y llamar `vencer_pedidos` → pedido `vencido`, `sold = 0`, y se le puede dar a otra persona.
- [ ] **Step 2: Correrlas y ver que fallan** — `npx vitest run tests/integracion/dar-prenda.test.ts` → FAIL (la función no existe).
- [ ] **Step 3: Columna** — agregar `givenByOwner` en `orders`, `npm run db:generate`, revisar que la migración solo agrega esa columna.
- [ ] **Step 4: Escribir `0028_seguridad_dar_prenda.sql`**: `dar_prenda` bloquea la fila del código (`FOR UPDATE`) antes de todo, comprueba en el orden de la interfaz (dueña con `es_duena_de(store_id)` → vivo abierto → estado `cerrado` → mensaje válido → `repetido` → `agotado`), inserta el reclamo `ganadora` con `message_id`, `message_body` (texto del mensaje), `buyer_name` = `author_name` del mensaje y `claimed_at = clock_timestamp()`, suma `sold`, pone `last_winner_name/last_winner_at`, llama `armar_pedido(reclamo, clock_timestamp())`, marca `orders.given_by_owner = true` y devuelve el nombre. `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO authenticated;`. Ninguna política nueva: `given_by_owner` se lee con el `GRANT SELECT` que `orders` ya tiene.
- [ ] **Step 5: Aplicar** — `npm run db:migrate` (filtrar la salida con `sed -E 's#postgres(ql)?://[^ ]+#postgresql://[OCULTO]#g'`).
- [ ] **Step 6: Pasar las pruebas** — `npx vitest run tests/integracion/dar-prenda.test.ts tests/integracion/codigos.test.ts tests/integracion/pedidos.test.ts` → PASS.
- [ ] **Step 7: Commit** — `Funcion para darle una prenda a quien pregunto`.

### Task 2: "Darle una prenda" en el estudio

**Files:**
- Modify: `src/app/mi-puesto/vivo/acciones-codigos.ts` (acción `darPrenda` y textos de error)
- Modify: `src/components/chat/panel-moderar.tsx` (prop opcional `alDarPrenda?(): void`; si está, la opción va primera)
- Modify: `src/components/chat/chat-estudio.tsx` (prop opcional `alDarPrenda?(m: Destinataria): void`; al elegirla cierra el panel de moderar y la llama)
- Create: `src/components/codigos/panel-dar-prenda.tsx`
- Modify: `src/components/codigos/codigos-estudio.tsx` (props `darA: Destinataria | null` y `alTerminarDarA(): void`; muestra `PanelDarPrenda` con sus `codigos`)
- Modify: `src/components/vivos/estudio-vivo.tsx` (estado `darA` que conecta a `ChatEstudio` con `CodigosEstudio`)
- Modify: `src/components/codigos/pedidos-vivo.tsx` (detalle "Se la diste vos" si `given_by_owner`)
- Create: `src/lib/codigos/prendas.ts` (función pura `prendasLibres`)
- Test: `src/lib/codigos/prendas.test.ts` y `tests/e2e/dar-prenda.spec.ts`

**Interfaces:**
- Consumes: `dar_prenda` (Tarea 1); `useCodigosVivo` (ya existe); `Foto`, `formatARS`, `alServidor`, `toast` (ya existen).
- Produces: `type Destinataria = { mensajeId: string; userId: string; nombre: string }` exportado desde `src/components/codigos/panel-dar-prenda.tsx`.
- Produces: `prendasLibres(codigos: Codigo[]): Codigo[]` — los `status === "cerrado"` con `sold < quantity`, del más nuevo al más viejo.
- Produces: `darPrenda(codigoId: string, mensajeId: string, textos: { nombre: string; etiqueta: string }): Promise<Resultado>` — valida los dos uuid con zod, llama el rpc y traduce el error a los textos de Global Constraints (`textos` solo arma los mensajes; no se guarda nada de ahí).

- [ ] **Step 1: Prueba de `prendasLibres`**: con un activo, un anulado, un cerrado agotado y dos cerrados con unidades (creados en distinto orden) devuelve solo los dos cerrados con unidades, el más nuevo primero.
- [ ] **Step 2: Verla fallar, implementar `prendasLibres`, verla pasar** (`npx vitest run src/components/codigos`).
- [ ] **Step 3: `darPrenda`** en `acciones-codigos.ts` y su traducción de errores (`agotado`, `repetido`, `cerrado`, `no_disponible`).
- [ ] **Step 4: `PanelDarPrenda`**: mismo estilo de hoja que sube desde abajo que `PanelModerar` (diálogo con `aria-modal`, Escape y tocar afuera cierran, botón Cancelar con foco). Cada prenda es un botón de al menos 56 px de alto con la foto (`Foto tamano="chica"`, o un cuadrado vacío si no tiene), la etiqueta, el precio y "Quedan N". Al tocar: deshabilita los botones, llama `darPrenda` con `alServidor`, `toast.success` o `toast.error` con el texto devuelto, y cierra.
- [ ] **Step 5: Conectar** `PanelModerar` → `ChatEstudio` → `EstudioVivo` → `CodigosEstudio`. Solo en el estudio (la sala no cambia).
- [ ] **Step 6: Pedidos** — en la tarjeta del pedido de `pedidos-vivo.tsx`, si `given_by_owner`, la línea chica "Se la diste vos".
- [ ] **Step 7: Prueba e2e** `tests/e2e/dar-prenda.spec.ts`, armada como `tests/e2e/codigo-completo.spec.ts`: la feriante lanza ROJO y después VERDE (ROJO queda cerrado con unidades); la compradora escribe "¿y el rojo?"; la feriante toca ese mensaje → "Darle una prenda" → toca ROJO → ve "Le diste el ROJO a {nombre}."; a la compradora se le abre el panel con los datos para pagar; en la sala de un tercero aparece el cartel de ganadora con ROJO; en `/mi-puesto/pedidos` aparece "Se la diste vos". Y: el panel no ofrece VERDE (activo).
- [ ] **Step 8: Verificar** — `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx playwright test tests/e2e/dar-prenda.spec.ts tests/e2e/chat-estudio.spec.ts tests/e2e/codigo-estudio.spec.ts` → todo PASS.
- [ ] **Step 9: Commit** — `Darle una prenda desde el chat del estudio`.

### Task 3: Aviso de código ya usado (voz) y guía

**Files:**
- Modify: `src/components/codigos/use-voz.ts`
- Modify: `src/components/codigos/codigos-estudio.tsx`
- Test: el `.test.ts` existente de `armarBorrador` (junto a `use-voz.ts`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `armarBorrador(texto: string, foto: Blob | null, usadas: ReadonlySet<string>, activa: string | null): Borrador | { repetida: string } | null` — `activa` es la palabra normalizada del código activo. Si la palabra ya se usó: `null` si es la activa, `{ repetida: <palabra como la dijo> }` si no.
- Produces: opción nueva de `useVoz`: `palabraActiva: string | null` y `alRepetida(palabra: string): void` (guardado en un ref, como `usadas`).

- [ ] **Step 1: Pruebas** de `armarBorrador`: "código rojo ocho mil" con ROJO usado y activo VERDE → `{ repetida: "rojo" }`; con ROJO usado y activo ROJO → `null`; sin código → `null`; palabra nueva → `Borrador` como hoy. Actualizar las llamadas existentes al nuevo parámetro.
- [ ] **Step 2: Verlas fallar, implementar, verlas pasar** (`npx vitest run src/components/codigos`).
- [ ] **Step 3: En `CodigosEstudio`** pasar `palabraActiva = activo ? normalizarCodigo(activo.word) : null` y `alRepetida = (p) => toast(\`${p.toUpperCase()} ya lo usaste en este vivo. Decí otra palabra.\`, { id: \`voz-repetida-${normalizarCodigo(p)}\` })` (el `id` evita apilar el mismo aviso si lo repite).
- [ ] **Step 4: Actualizar `CLAUDE.md`**: §10 (la Parte 4 publicada el 2026-11-19 tras probarse en Android e iPhone; "Darle una prenda" construida en la rama `fase-1-dar-una-prenda`), §8 (`dar_prenda` y `orders.given_by_owner`, migraciones hasta la 0028), §11 (sacar "Cargar `CLOUDFLARE_AI_API_TOKEN`…" y "Probar la voz en iPhone"; corregir la línea que dice que "Ofrecer a otra" no pide confirmación; sumar: "Si otro celular abre el vivo con la misma cuenta, se queda con la transmisión sin preguntar, y el primero tardó ~30 s en enterarse: pedir confirmación ('Ya estás en vivo desde otro celular. ¿Pasar el vivo a este?') y revisar el aviso instantáneo"), §13 (`panel-dar-prenda` en `codigos/`).
- [ ] **Step 5: Verificación completa** — `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx playwright test` → PASS (si `abrir-puesto` falla solo en la tanda completa, repetirla sola: es por tiempos, ya conocido).
- [ ] **Step 6: Commit** — `Avisar por voz cuando el codigo ya se uso y guia actualizada`.
