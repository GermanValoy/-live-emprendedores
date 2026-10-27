# Sala en vivo (Fase 1, Parte 2) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la feriante salga en vivo desde `/mi-puesto/vivo` (vista previa → en vivo a pantalla completa → resumen), que las compradoras miren en `/@usuario/vivo` (con espera animada que se convierte sola en la sala) y encuentren los vivos en Inicio, tienda y Seguidos, con cierre automático y corte por administradores.

**Architecture:** El estado de cada vivo vive en la tabla `live_sessions` y solo cambia por funciones `SECURITY DEFINER` de PostgreSQL (abrir, señal de vida, terminar, cortar, cerrar vencidos); las pantallas se enteran de los cambios por Supabase Realtime (`postgres_changes` sobre esa tabla) y cuentan quién mira con un canal de presencia. La credencial para transmitir (WHIP) vive en `store_streams`, que solo lee el servidor con la llave secreta. La lógica de WebRTC de `/prueba-vivo` se mueve a `src/lib/vivos/` para reutilizarla, y la página de prueba se borra al final.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript estricto, Tailwind + `src/components/ui/`, Supabase (Postgres, RLS, Realtime, `pg_cron`), Drizzle (esquema y migraciones), Cloudflare Stream WebRTC (WHIP/WHEP), Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-26-fase-1-parte-2-sala-en-vivo-design.md](../specs/2026-10-26-fase-1-parte-2-sala-en-vivo-design.md) · bocetos en [`../specs/fase-1-parte-2-sala/`](../specs/fase-1-parte-2-sala/)

## Global Constraints

- Textos en español rioplatense (voseo). Horas en `America/Argentina/Tucuman`.
- Tiempos de espera (valores iniciales): **sin conexión 300 s (5 min)**, **fuera de la pantalla 900 s (15 min)**, señal de vida **cada 20 s**. Viven en **un solo lugar**: la fila única de la tabla `live_config`. La app y la base los leen de ahí; nunca se escriben como constantes en el código.
- La URL para transmitir (WHIP) y el identificador de Cloudflare **nunca** se leen desde el navegador: `store_streams` sin permisos para `anon`/`authenticated`; solo `service_role` desde el servidor. La página `/mi-puesto/vivo` entrega la URL WHIP únicamente a la dueña.
- `CLOUDFLARE_STREAM_API_TOKEN` y `SUPABASE_SECRET_KEY` solo en archivos con `import "server-only"`; ningún archivo `"use client"` los importa.
- Nombre de la transmisión de Cloudflare de cada puesto: exactamente `puesto-<store_id>`, sin grabación (`recording.mode: "off"`).
- Un solo vivo abierto por puesto (índice único parcial). Solo puede salir en vivo una tienda con `onboarding_step = 5`.
- Motivos de cierre (`end_reason`): exactamente `duena`, `sin_senal`, `plataforma`.
- Todo lo que se toca mide al menos 44 px. Las animaciones respetan `prefers-reduced-motion`.
- Mensajes de WhatsApp (exactos): durante → `¡Estoy en vivo en Tu Feria Live! Entrá acá 👉 {link}`; antes → `¡Pronto salgo en vivo! Entrá acá y se abre sola cuando arranque 👉 {link}`. Link para compartir: `https://wa.me/?text=<texto codificado>`.
- Migraciones nuevas, nunca editar una aplicada. La de permisos se crea con `npx drizzle-kit generate --custom --name=seguridad_vivos`.
- Nunca imprimir `DATABASE_URL` ni claves: filtrar la salida de `npm run db:migrate` y `db:generate` con `ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' }`.
- Sin dependencias nuevas.
- Commits chicos, en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Las pruebas de punta a punta comparten la base real: buscar por datos únicos (handle), no por nombre.

## Review Focus

1. **Dos toques seguidos en "Salir en vivo"** (o dos pestañas a la vez) → un solo vivo; el segundo llamado retoma el primero y pasa a ser el dispositivo que transmite. Test en la Tarea 1 (`abrir dos veces retoma el mismo vivo`).
2. **Llega una señal de vida después de que el vivo se cerró** (por tiempo o por un administrador) → no lo reabre; responde `terminado` y la pantalla de la feriante muestra el motivo. Test en la Tarea 1 (`señal sobre vivo cerrado`).
3. **El celular bloquea el sonido al arrancar** (política de reproducción automática) → la imagen arranca muda y aparece "Tocá para activar el sonido"; nunca queda sin imagen. Test en la Tarea 4 (`arranca mudo si el navegador bloquea el sonido`).
4. **La compradora entra con mayúsculas** (`/@Mica.Tejidos/vivo`) → encuentra la sala igual. Test en la Tarea 7 (`handle con mayúsculas`).
5. **Una feriante con el puesto a medio armar** entra a `/mi-puesto/vivo` → ve "Terminá de armar tu puesto para salir en vivo" con el link a `/mi-puesto/armar`, sin cámara ni llamada a Cloudflare; y la base rechaza `abrir_vivo`. Tests en la Tarea 1 (`puesto incompleto no abre`) y la Tarea 6 (`puesto incompleto`).

---

### Task 1: Tablas, permisos y funciones del vivo

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0004_*.sql` (generada), `drizzle/0005_seguridad_vivos.sql` (manual)
- Create: `tests/integracion/vivos.test.ts`
- Modify: `tests/helpers/tiendas-prueba.ts`

**Interfaces:**
- Produces (tablas):
  - `live_config`: `id integer PK` (CHECK `id = 1`), `sin_conexion_segundos integer NOT NULL DEFAULT 300`, `fuera_segundos integer NOT NULL DEFAULT 900`, `senal_cada_segundos integer NOT NULL DEFAULT 20`. La migración inserta la fila `id = 1`. Lectura pública; nadie la edita salvo `service_role` (el dueño la cambia por SQL).
  - `store_streams`: `store_id uuid PK → stores.id ON DELETE CASCADE`, `cloudflare_uid text NOT NULL`, `whip_url text NOT NULL`, `whep_url text NOT NULL`, `created_at`. Solo `service_role`.
  - `live_sessions`: `id uuid PK default random`, `store_id uuid NOT NULL → stores.id CASCADE`, `whep_url text NOT NULL`, `device_id uuid NOT NULL`, `started_at`, `ended_at timestamptz NULL`, `end_reason text NULL` (CHECK en `duena|sin_senal|plataforma`, y `ended_at` y `end_reason` nulos o no nulos juntos), `ended_by uuid NULL → users.id SET NULL`, `last_signal_at timestamptz NOT NULL DEFAULT now()`, `away_since timestamptz NULL`, `muted boolean NOT NULL DEFAULT false`, `viewers integer NOT NULL DEFAULT 0`, `peak_viewers integer NOT NULL DEFAULT 0`. Índice único parcial `live_sessions_un_abierto_por_puesto` en `(store_id) WHERE ended_at IS NULL`; índice en `(store_id, started_at desc)`.
- Produces (funciones, todas `SECURITY DEFINER SET search_path = ''`, errores con `RAISE EXCEPTION '<codigo>' USING ERRCODE = 'P0001'` como en `0003`):
  - `abrir_vivo(p_store uuid, p_whep text, p_device uuid) RETURNS uuid`: exige `es_duena_de(p_store)` (si no, `sin_permiso`) y `onboarding_step = 5` (si no, `puesto_incompleto`). Si hay uno abierto: le pone `device_id = p_device`, `last_signal_at = now()`, `away_since = NULL` y devuelve su id. Si no, inserta (atrapa `unique_violation` y retoma el abierto). Solo `authenticated`.
  - `senal_vivo(p_vivo uuid, p_device uuid, p_fuera boolean, p_silenciada boolean, p_mirando integer) RETURNS text`: `sin_permiso` si no es la dueña; devuelve `'terminado'` si `ended_at` no es nulo, `'otro_dispositivo'` si `device_id <> p_device` (en ambos casos no modifica nada); si no, actualiza `last_signal_at = now()`, `away_since = CASE WHEN p_fuera THEN coalesce(away_since, now()) ELSE NULL END`, `muted`, `viewers = greatest(p_mirando, 0)`, `peak_viewers = greatest(peak_viewers, p_mirando)` y devuelve `'ok'`. Solo `authenticated`.
  - `terminar_vivo(p_vivo uuid) RETURNS void`: dueña; si está abierto, `ended_at = now()`, `end_reason = 'duena'`. Si ya estaba cerrado, no hace nada. Solo `authenticated`.
  - `cortar_vivo(p_vivo uuid) RETURNS void`: exige `es_admin()` (si no, `sin_permiso`); cierra con `'plataforma'` y `ended_by = auth.uid()`. Solo `authenticated`.
  - `cerrar_vivos_vencidos() RETURNS integer`: cierra con `'sin_senal'` los abiertos donde (`away_since IS NULL` y `last_signal_at < now() - sin_conexion_segundos`) o (`away_since < now() - fuera_segundos`), leyendo `live_config`; devuelve cuántos cerró. Solo `service_role` (y `pg_cron`).
- Produces (permisos y tiempo real): RLS activado en las tres tablas; `REVOKE ALL ... FROM anon, authenticated`; `GRANT ALL ... TO service_role`; `GRANT SELECT ON live_config, live_sessions TO anon, authenticated` con políticas de lectura `USING (true)`; ningún `INSERT/UPDATE/DELETE` directo para `anon`/`authenticated` (todo pasa por las funciones). `ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;`. `CREATE EXTENSION IF NOT EXISTS pg_cron;` y `SELECT cron.schedule('cerrar-vivos-vencidos', '* * * * *', $$SELECT public.cerrar_vivos_vencidos()$$);`.
- Produces (helpers de prueba en `tiendas-prueba.ts`):
  - `crearTransmisionPrueba(storeId: string): Promise<void>` — inserta en `store_streams` con `cloudflare_uid: "prueba-<storeId>"`, `whip_url: "https://cloudflare.invalid/whip"`, `whep_url: "https://cloudflare.invalid/whep"` (así las pruebas nunca llaman a Cloudflare).
  - `borrarVivosDeTienda(storeId: string): Promise<void>`.

- [ ] **Step 1: Agregar las tres tablas a `src/db/schema.ts`** (sección nueva "Vivos (Fase 1, Parte 2). Reglas en drizzle/0005_seguridad_vivos.sql") y generar la migración:

Run: `npm run db:generate 2>&1 | ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' }`
Expected: se crea `drizzle/0004_<nombre>.sql` con los tres `CREATE TABLE`. Agregar a mano al final de esa migración el índice único parcial si Drizzle no lo generó (`uniqueIndex(...).where(sql\`ended_at IS NULL\`)` lo genera).

- [ ] **Step 2: Crear la migración de seguridad vacía**

Run: `npx drizzle-kit generate --custom --name=seguridad_vivos`
Expected: `drizzle/0005_seguridad_vivos.sql` vacío.

- [ ] **Step 3: Escribir las pruebas que fallan** en `tests/integracion/vivos.test.ts` (mismo armado que `tiendas.test.ts`: admin, Mica con tienda completa + `crearTransmisionPrueba`, compradora, y Luz con tienda incompleta `completa: false`; `afterAll` borra vivos, tiendas y usuarios). Cada prueba arranca sin vivo abierto (`beforeEach` → `borrarVivosDeTienda`). `const dispo = crypto.randomUUID()`.
  - `cualquiera lee el vivo y la configuración`: tras `abrir_vivo` de Mica, `clienteAnonimo().from("live_sessions").select("id, whep_url").eq("store_id", …)` devuelve 1 fila; `from("live_config").select("*").single()` devuelve `{ id: 1, sin_conexion_segundos: 300, fuera_segundos: 900, senal_cada_segundos: 20 }`.
  - `nadie lee store_streams desde el navegador`: la dueña, la compradora y la visitante obtienen `[]` o error al `select("*")`.
  - `solo la dueña abre su vivo`: la compradora llamando `abrir_vivo` con la tienda de Mica → error con mensaje `sin_permiso`.
  - `puesto incompleto no abre`: Luz → error `puesto_incompleto`.
  - `abrir dos veces retoma el mismo vivo`: dos llamadas en `Promise.all` con dispositivos A y B devuelven el mismo id; queda una sola fila abierta y su `device_id` es el de la última llamada que terminó (uno de A o B).
  - `nadie escribe directo`: `update({ muted: true })` desde la dueña sobre `live_sessions` → `[]` o error; `insert` también.
  - `señal de vida`: `senal_vivo(id, dispo, false, true, 7)` → `'ok'`; la fila tiene `muted: true`, `viewers: 7`, `peak_viewers: 7`; luego `(…, 3)` deja `viewers: 3`, `peak_viewers: 7`.
  - `fuera de la pantalla`: `senal_vivo(…, true, …)` dos veces seguidas mantiene el primer `away_since`; con `p_fuera: false` vuelve a `null`.
  - `otro dispositivo`: tras abrir con A, `abrir_vivo` con B; `senal_vivo(id, A, …)` → `'otro_dispositivo'` y la fila no cambia.
  - `señal sobre vivo cerrado`: tras `terminar_vivo`, `senal_vivo` → `'terminado'`; `ended_at` no vuelve a `null`; `end_reason: "duena"`.
  - `solo un admin corta`: la compradora y la dueña llamando `cortar_vivo` → `sin_permiso`; el admin → la fila queda con `end_reason: "plataforma"` y `ended_by` = id del admin.
  - `cierre automático`: con el cliente admin (`service_role`) poner `last_signal_at = now() - 301 s` en un vivo y `away_since = now() - 901 s` en otro (otra tienda de prueba), y dejar un tercero con `away_since = now() - 600 s`; `rpc("cerrar_vivos_vencidos")` → devuelve 2; los dos primeros quedan `sin_senal`, el tercero sigue abierto.
  - `la compradora no puede cerrar vencidos`: `compradora.cliente.rpc("cerrar_vivos_vencidos")` → error.

- [ ] **Step 4: Correr y ver que fallan**

Run: `npm run test:integracion -- tests/integracion/vivos.test.ts`
Expected: FAIL (`Could not find the table 'public.live_sessions'`).

- [ ] **Step 5: Escribir `0005_seguridad_vivos.sql`** con las restricciones, funciones, permisos, publicación de tiempo real y tarea de `pg_cron` de la sección Interfaces, separadas con `--> statement-breakpoint` y con `REVOKE EXECUTE ... FROM PUBLIC` antes de cada `GRANT EXECUTE`, igual que `0003`.

- [ ] **Step 6: Aplicar las migraciones (salida filtrada)**

Run: `npm run db:migrate 2>&1 | ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' } | Select-Object -Last 4`
Expected: sin errores. Si falla `CREATE EXTENSION pg_cron` por permisos, pedirle al dueño que lo active en **Supabase → Database → Extensions → pg_cron** y volver a correr.

- [ ] **Step 7: Correr y ver que pasan**

Run: `npm run test:integracion`
Expected: PASS (las de tiendas y usuarios siguen pasando).

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts drizzle tests/integracion/vivos.test.ts tests/helpers/tiendas-prueba.ts
git commit -m "Crear las tablas y reglas de los vivos con cierre automático"
```

---

### Task 2: Lógica pura de la sala y del aviso por WhatsApp

**Files:**
- Create: `src/lib/vivos/tipos.ts`, `src/lib/vivos/sala.ts`, `src/lib/vivos/whatsapp.ts`
- Test: `src/lib/vivos/sala.test.ts`, `src/lib/vivos/whatsapp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // tipos.ts
  export type MotivoCierre = "duena" | "sin_senal" | "plataforma";
  export type Vivo = {
    id: string; store_id: string; whep_url: string; device_id: string; started_at: string;
    ended_at: string | null; end_reason: MotivoCierre | null; last_signal_at: string;
    away_since: string | null; muted: boolean; viewers: number; peak_viewers: number;
  };
  export type ConfigVivo = { sin_conexion_segundos: number; fuera_segundos: number; senal_cada_segundos: number };
  export const CAMPOS_VIVO = "id, store_id, whep_url, device_id, started_at, ended_at, end_reason, last_signal_at, away_since, muted, viewers, peak_viewers";
  // sala.ts
  export type EstadoSala = "esperando" | "en-vivo" | "vuelve-pronto" | "reconectando-feriante" | "terminado";
  export function estadoSala(vivo: Vivo | null, ahora: number, config: ConfigVivo): EstadoSala;
  export function duracionVivoMs(vivo: Vivo, ahora: number): number;
  // whatsapp.ts
  export function linkSala(origen: string, handle: string): string;           // `${origen}/@${handle}/vivo`
  export function mensajeAviso(momento: "antes" | "durante", link: string): string;
  export function linkWhatsapp(texto: string): string;                         // `https://wa.me/?text=${encodeURIComponent(texto)}`
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `sala.test.ts` (config `{ 300, 900, 20 }`, `ahora = Date.parse("2026-10-27T21:00:00Z")`):
    - `sin vivo espera`: `estadoSala(null, …)` → `"esperando"`.
    - `cerrado termina`: `ended_at` con fecha → `"terminado"` (aunque `away_since` tenga valor).
    - `fuera de la pantalla`: `away_since` no nulo → `"vuelve-pronto"`.
    - `señal vieja`: `last_signal_at` 41 s antes (más de dos señales) → `"reconectando-feriante"`; 39 s antes → `"en-vivo"`.
    - `duracionVivoMs`: abierto → `ahora - started_at`; cerrado → `ended_at - started_at`.
  - `whatsapp.test.ts`:
    - `linkSala("https://tuferialive.vercel.app", "mica.tejidos")` → `"https://tuferialive.vercel.app/@mica.tejidos/vivo"`.
    - `mensajeAviso("durante", L)` → `` `¡Estoy en vivo en Tu Feria Live! Entrá acá 👉 ${L}` ``; `"antes"` → `` `¡Pronto salgo en vivo! Entrá acá y se abre sola cuando arranque 👉 ${L}` ``.
    - `linkWhatsapp("a b&c")` → `"https://wa.me/?text=a%20b%26c"`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/vivos/sala.test.ts src/lib/vivos/whatsapp.test.ts`
Expected: FAIL (no existen los módulos).

- [ ] **Step 3: Implementar** `tipos.ts`, `estadoSala` (orden de las reglas: sin vivo → cerrado → fuera → señal vieja (`ahora - last_signal_at > 2 × senal_cada_segundos × 1000`) → en vivo), `duracionVivoMs` y `whatsapp.ts`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run src/lib/vivos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vivos/tipos.ts src/lib/vivos/sala.ts src/lib/vivos/sala.test.ts src/lib/vivos/whatsapp.ts src/lib/vivos/whatsapp.test.ts
git commit -m "Calcular el estado de la sala y armar el aviso por WhatsApp"
```

---

### Task 3: Transmisión propia de cada puesto y acciones del servidor

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/vivos/transmision-puesto.ts`, `src/lib/vivos/datos.ts`
- Create: `src/app/mi-puesto/vivo/acciones.ts`, `src/app/mi-puesto/vivo/senal/route.ts`
- Test: `tests/integracion/transmision-puesto.test.ts`

**Interfaces:**
- Consumes: `obtenerOCrearTransmision`, `UrlsTransmision`, `CredencialesCloudflare` (`src/lib/vivos/cloudflare.ts`); `credencialesCloudflare()` (`config.ts`); funciones SQL de la Tarea 1; `Vivo`, `ConfigVivo`, `CAMPOS_VIVO` (Tarea 2).
- Produces:
  ```ts
  // src/lib/supabase/admin.ts  (import "server-only")
  export function createAdminClient(): SupabaseClient; // NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY, sin persistir sesión
  // src/lib/vivos/transmision-puesto.ts  (sin "server-only", para poder probarlo; solo lo importa código de servidor)
  export async function obtenerTransmisionDelPuesto(
    storeId: string, deps: { db: SupabaseClient; cred: CredencialesCloudflare; f?: typeof fetch },
  ): Promise<UrlsTransmision>;
  // src/lib/vivos/datos.ts
  export async function obtenerConfigVivo(supabase: SupabaseClient): Promise<ConfigVivo>;
  export async function vivoAbiertoDe(supabase: SupabaseClient, storeId: string): Promise<Vivo | null>;
  export type VivoEnPortada = { vivo: Vivo; puesto: { id: string; handle: string; name: string; zone: string; avatar_path: string | null; cover_path: string | null } };
  export async function listarVivosAbiertos(supabase: SupabaseClient): Promise<VivoEnPortada[]>; // más mirando primero
  export async function idsPuestosEnVivo(supabase: SupabaseClient): Promise<Set<string>>;
  // src/app/mi-puesto/vivo/acciones.ts  ("use server")
  export async function salirEnVivo(dispositivo: string): Promise<{ ok: true; vivo: Vivo } | { ok: false; error: string }>;
  export async function terminarVivo(vivoId: string): Promise<{ ok: true; vivo: Vivo } | { ok: false; error: string }>;
  // src/app/mi-puesto/vivo/senal/route.ts
  // POST JSON { vivoId: uuid, dispositivo: uuid, fuera: boolean, silenciada: boolean, mirando: int 0..100000 }
  // → 200 { resultado: "ok" | "otro_dispositivo" | "terminado" } · 400 datos inválidos · 401 sin sesión · 403 sin_permiso
  ```

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/integracion/transmision-puesto.test.ts`, con `db = clienteAdmin()` y un `fetch` falso como el de `cloudflare.test.ts`:
  - `usa la guardada sin llamar a Cloudflare`: con `crearTransmisionPrueba(storeId)` hecha, devuelve `{ uid: "prueba-<id>", urlTransmitir: "https://cloudflare.invalid/whip", urlMirar: "https://cloudflare.invalid/whep" }` y el `fetch` falso no recibió ninguna llamada.
  - `crea y guarda la primera vez`: sin fila, el `fetch` falso responde lista vacía y un `POST` cuyo cuerpo tiene `meta.name === "puesto-<storeId>"` y `recording.mode === "off"`; después existe la fila en `store_streams` con esas URLs. Una segunda llamada no vuelve a llamar a Cloudflare.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm run test:integracion -- tests/integracion/transmision-puesto.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Step 3: Implementar `createAdminClient`, `obtenerTransmisionDelPuesto`** (lee `store_streams`; si no hay, `obtenerOCrearTransmision(\`puesto-${storeId}\`, cred, f)` y `upsert` con `onConflict: "store_id"`, para que dos pedidos a la vez no fallen) **y `datos.ts`** (`listarVivosAbiertos` hace `select(\`${CAMPOS_VIVO}, stores(id, handle, name, zone, avatar_path, cover_path)\`)` con `ended_at IS NULL`, orden `viewers desc`).

- [ ] **Step 4: Implementar las acciones y la ruta de señal.** `salirEnVivo`: sesión → `obtenerMiTienda` → si `onboarding_step < 5`, error `"Terminá de armar tu puesto para salir en vivo."` → `obtenerTransmisionDelPuesto(tienda.id, { db: createAdminClient(), cred: credencialesCloudflare() })` → `rpc("abrir_vivo", { p_store, p_whep: urlMirar, p_device })` → devuelve el vivo leído con `CAMPOS_VIVO`. `ErrorCloudflare` → `"No pudimos preparar la transmisión. Probá de nuevo en un rato."`. Validar `dispositivo` y `vivoId` como UUID con `zod`. La ruta de señal valida el cuerpo con `zod`, llama `rpc("senal_vivo")` con el cliente de servidor (cookies de la dueña) y traduce `sin_permiso` a 403. Las pruebas de punta a punta de las Tareas 6 y 8 cubren las acciones.

- [ ] **Step 5: Correr las pruebas**

Run: `npm run test:integracion; if ($?) { npm run typecheck }; if ($?) { npm run lint }`
Expected: PASS, sin errores.

- [ ] **Step 6: Comprobar que `SUPABASE_SECRET_KEY` está en Vercel.** Pedirle al dueño que verifique en **Vercel → Settings → Environment Variables** que existe en *Production*, marcada como *Sensitive*. Nunca pedir el valor.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/admin.ts src/lib/vivos/transmision-puesto.ts src/lib/vivos/datos.ts src/app/mi-puesto/vivo tests/integracion/transmision-puesto.test.ts
git commit -m "Guardar la transmisión de cada puesto y abrir, cerrar y mantener vivos desde el servidor"
```

---

### Task 4: Transmisor, reproductor, privacidad y presencia (navegador)

**Files:**
- Create: `src/lib/vivos/transmisor.ts`, `src/lib/vivos/reproductor.ts`, `src/lib/vivos/privacidad.ts`, `src/lib/vivos/presencia.ts`, `src/lib/vivos/senal.ts`
- Test: `src/lib/vivos/privacidad.test.ts`, `src/lib/vivos/reproductor.test.ts`, `src/lib/vivos/senal.test.ts`

**Interfaces:**
- Consumes: `transmitir`, `mirar`, `ConexionVivo` (`webrtc.ts`); `leerMuestra` (`estadisticas.ts`); `esperaReconexion` (`registro.ts`); cliente de navegador `createClient` (`src/lib/supabase/client.ts`).
- Produces:
  ```ts
  // privacidad.ts
  export function silenciarAudio(stream: MediaStream, silenciada: boolean): void; // pista.enabled = !silenciada en todas las de audio
  export function vigilarSalida(doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
    alSalir: () => void, alVolver: () => void): () => void; // usa "visibilitychange" y "pagehide"; devuelve cómo dejar de vigilar
  // transmisor.ts
  export type EstadoTransmision = "preparando" | "vista-previa" | "conectando" | "en-vivo" | "reconectando" | "sin-camara" | "detenido";
  export type Transmisor = {
    salirEnVivo(urlTransmitir: string): Promise<void>; silenciar(si: boolean): void;
    cambiarCamara(): Promise<void>; volverATransmitir(): Promise<void>; detener(): void;
  };
  export function crearTransmisor(video: HTMLVideoElement, alEstado: (e: EstadoTransmision) => void): Promise<Transmisor>;
  // reproductor.ts
  export type EstadoReproduccion = "conectando" | "reproduciendo" | "reconectando";
  export type Reproductor = { activarSonido(): void; cerrar(): void };
  export function crearReproductor(urlMirar: string, video: HTMLVideoElement,
    al: { estado(e: EstadoReproduccion): void; sinSonido(): void }): Reproductor;
  export function reproducirConSonido(video: HTMLVideoElement, alSinSonido: () => void): Promise<void>;
  // presencia.ts
  export function anunciarPresencia(supabase: SupabaseClient, vivoId: string): () => void;            // la compradora
  export function contarMirando(supabase: SupabaseClient, vivoId: string, al: (n: number) => void): () => void; // canal `presencia:<vivoId>`
  // senal.ts
  export type DatosSenal = { fuera: boolean; silenciada: boolean; mirando: number };
  export type ResultadoSenal = "ok" | "otro_dispositivo" | "terminado";
  export function crearSenal(op: { vivoId: string; dispositivo: string; cadaSegundos: number; leer(): DatosSenal;
    alResultado(r: ResultadoSenal): void; f?: typeof fetch }): { avisarAhora(): void; detener(): void };
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `privacidad.test.ts`: `silenciarAudio` con un stream falso (dos pistas de audio y una de video) deja `enabled: false` en las de audio y no toca la de video; con `false` las vuelve a `true`. `vigilarSalida` con un documento falso: al disparar `visibilitychange` con `visibilityState: "hidden"` llama `alSalir` una vez; con `"visible"`, `alVolver`; `pagehide` también llama `alSalir`; la función devuelta quita los oyentes.
  - `reproductor.test.ts` — `arranca mudo si el navegador bloquea el sonido`: un video falso cuyo `play()` rechaza la primera vez con `NotAllowedError` y resuelve la segunda; `reproducirConSonido` termina con `video.muted === true` y llamó `alSinSonido` una vez. Si `play()` resuelve de entrada, `muted === false` y no llama a `alSinSonido`.
  - `senal.test.ts` (con `vi.useFakeTimers()` y un `fetch` falso): manda un `POST` a `/mi-puesto/vivo/senal` cada `cadaSegundos` con el cuerpo `{ vivoId, dispositivo, ...leer() }` y `keepalive: true`; `avisarAhora()` manda uno inmediato; si la respuesta es `{ resultado: "terminado" }` llama `alResultado("terminado")` y deja de mandar; un error de red no detiene las señales siguientes.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/vivos/privacidad.test.ts src/lib/vivos/reproductor.test.ts src/lib/vivos/senal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `privacidad.ts`, `senal.ts`, `presencia.ts`** (`channel(\`presencia:${vivoId}\`, { config: { presence: { key: crypto.randomUUID() } } })`, `track({})` al suscribirse; `contarMirando` cuenta las claves de `presenceState()` en cada `sync`).

- [ ] **Step 4: Implementar `transmisor.ts` y `reproductor.ts` moviendo la lógica de `src/app/prueba-vivo/prueba-vivo.tsx`** (`Sesion`, líneas 84–339): pedir cámara 1280×720 a 30 cuadros (`ideal`), sin micrófono → sin sonido con aviso, reconexión con `esperaReconexion` y un solo reintento pendiente, "generación" para descartar intentos viejos, recuperar cámara y sonido al terminar una pista, cambiar cámara apagando la anterior, y en el reproductor reconectar tras 5 s de imagen congelada. Cambios respecto de la prueba: sin registro de eventos ni muestras; `crearTransmisor` prende la cámara y queda en `"vista-previa"` sin conectar hasta `salirEnVivo(url)`; `silenciar` usa `silenciarAudio` y también se aplica a una pista de audio renovada; el reproductor usa `reproducirConSonido`. Pedir `navigator.wakeLock.request("screen")` al salir en vivo (si existe) y renovarlo al volver a la pantalla.

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run src/lib/vivos; if ($?) { npm run typecheck }`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vivos
git commit -m "Mover la transmisión a piezas reutilizables y silenciar el micrófono al salir de la pantalla"
```

---

### Task 5: Animación de espera "El puesto de feria"

**Files:**
- Create: `src/components/vivos/espera-feria.tsx`
- Modify: `src/app/globals.css` (sección "Espera del vivo")
- Modify: `src/app/diseno/page.tsx` (mostrarla en la muestra del sistema de diseño)
- Test: `tests/e2e/diseno.spec.ts` (agregar caso)

**Interfaces:**
- Produces: `export function EsperaFeria({ nombre }: { nombre: string }): JSX.Element` — decorado (toldo, guirnalda, mostrador), título "¡Pronto arrancamos!" y la línea "Quedate acá: cuando {nombre} salga en vivo, se abre sola." Lo demás de la pantalla de espera (cabecera, "Suele estar en vivo", productos) lo arma la Tarea 7.

- [ ] **Step 1: Escribir la prueba que falla** en `diseno.spec.ts` — `muestra la espera del vivo`: en `/diseno` se ve el encabezado "¡Pronto arrancamos!" y, con `page.emulateMedia({ reducedMotion: "reduce" })`, el elemento con `data-testid="toldo"` tiene `animation-name: none` (via `getComputedStyle`).

- [ ] **Step 2: Correr y ver que falla**

Run: `npx playwright test tests/e2e/diseno.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** según la opción A de [espera-animaciones.html](../specs/fase-1-parte-2-sala/espera-animaciones.html): toldo de 8 franjas lapacho/crema que se mece (4 s, `cubic-bezier(0.77, 0, 0.175, 1)`), guirnalda SVG con 5 lamparitas limón que titilan escalonadas cada 0,3 s, letras del título con saltitos escalonados cada 0,05 s, cartel "Abrimos el puesto en un ratito". Solo CSS (`transform`/`opacity`), colores con las variables de `globals.css` (`--primary`, `--codigo`, `--vivo`), y bajo `prefers-reduced-motion: reduce`, `animation: none`. Las letras van en `aria-hidden` y el título completo en texto accesible.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx playwright test tests/e2e/diseno.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/vivos/espera-feria.tsx src/app/globals.css src/app/diseno/page.tsx tests/e2e/diseno.spec.ts
git commit -m "Agregar la animación de espera del puesto de feria"
```

---

### Task 6: Pantalla de la feriante (`/mi-puesto/vivo`) y botones en Mi puesto

**Files:**
- Create: `src/app/mi-puesto/vivo/page.tsx`
- Create: `src/components/vivos/estudio-vivo.tsx`, `src/components/vivos/boton-avisar-whatsapp.tsx`
- Modify: `src/app/mi-puesto/page.tsx`
- Modify: `playwright.config.ts`
- Test: `tests/e2e/estudio-vivo.spec.ts`

**Interfaces:**
- Consumes: `salirEnVivo`, `terminarVivo` (Tarea 3); `obtenerTransmisionDelPuesto`, `createAdminClient`, `obtenerConfigVivo`, `vivoAbiertoDe` (Tarea 3); `crearTransmisor`, `vigilarSalida`, `crearSenal`, `contarMirando` (Tarea 4); `duracionVivoMs`, `linkSala`, `mensajeAviso`, `linkWhatsapp` (Tarea 2); `EnVivo` (`src/components/marca/en-vivo.tsx`).
- Produces:
  ```ts
  export function EstudioVivo(props: {
    tienda: { id: string; handle: string; name: string };
    urlTransmitir: string; config: ConfigVivo; vivoAbierto: Vivo | null;
  }): JSX.Element;
  export function BotonAvisarWhatsapp(props: { handle: string; momento: "antes" | "durante"; className?: string }): JSX.Element;
  // Abre linkWhatsapp(mensajeAviso(momento, linkSala(window.location.origin, handle))) en una pestaña nueva.
  ```
- Produces (Playwright): proyecto `celular-camara` = `devices["Pixel 7"]` + `launchOptions.args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]` + `permissions: ["camera", "microphone"]`, con `testMatch: /(estudio-vivo|sala-vivo)\.spec\.ts/`; el proyecto `celular` existente los ignora (`testIgnore`).

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/e2e/estudio-vivo.spec.ts` (Mica con tienda completa + `crearTransmisionPrueba`, Luz con tienda incompleta; cookies con `cookiesDeSesion`; `afterEach` → `borrarVivosDeTienda`). La transmisión apunta a `cloudflare.invalid`, así que el video nunca conecta: las pruebas miran botones y estados, no la imagen.
  - `puesto incompleto`: Luz en `/mi-puesto/vivo` ve "Terminá de armar tu puesto para salir en vivo" y un link a `/mi-puesto/armar`; no hay botón "Salir en vivo".
  - `vista previa y salir en vivo`: Mica en `/mi-puesto` toca "Salir en vivo" → ve "Vista previa · nadie te ve todavía" y el aviso "Mientras estés en vivo no salgas de esta pantalla"; toca el botón "Salir en vivo" → ve "EN VIVO" y "👁 0"; la base tiene un vivo abierto para su tienda.
  - `silenciar`: toca "Silenciar" → ve "🔇 Silenciada" y el botón dice "Activar sonido"; en la base, tras la siguiente señal (esperar con `expect.poll`), `muted: true`.
  - `salir de la pantalla silencia`: con `page.evaluate` se fuerza `document.visibilityState = "hidden"` y se dispara `visibilitychange` (`Object.defineProperty`) → en la base `away_since` no es nulo; al volver a `"visible"` se ve "Estás silenciada · Activar sonido".
  - `terminar con confirmación`: "Terminar" → "¿Seguro que querés terminar el vivo?" → "Sí, terminar" → ve "¡Terminó tu vivo! 🎉" y "Volver a mi puesto"; en la base `end_reason: "duena"`.
  - `volver a tu vivo`: con un vivo abierto (creado con `rpc("abrir_vivo")` por el cliente de Mica), `/mi-puesto` muestra "Volver a tu vivo"; al entrar y salir en vivo se usa el mismo id.
  - `otra pestaña toma el control`: con la pantalla en vivo en la página 1, abrir `/mi-puesto/vivo` en una página 2 del mismo contexto y salir en vivo → la página 1 muestra "Seguís el vivo en otro celular".
  - `cortado por la plataforma`: con la pantalla en vivo, el admin de prueba llama `rpc("cortar_vivo")` → la pantalla muestra "La plataforma terminó este vivo".
  - `avisar por WhatsApp`: en `/mi-puesto`, "Avisar por WhatsApp" abre una página cuya URL empieza con `https://wa.me/?text=` y contiene `encodeURIComponent("/@<handle>/vivo")` (interceptar con `context.route("https://wa.me/**", r => r.fulfill({ body: "ok" }))`).

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx playwright test tests/e2e/estudio-vivo.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `page.tsx`** (servidor, mismo armado que `mi-puesto/page.tsx`: `connection()`, sesión, tienda; si `onboarding_step < 5` el aviso de "Terminá de armar…"; si no, `obtenerTransmisionDelPuesto` con el cliente admin, `obtenerConfigVivo`, `vivoAbiertoDe`, y `<EstudioVivo>`). `ErrorCloudflare` → mensaje en pantalla "No pudimos preparar la transmisión. Probá de nuevo en un rato." con botón "Probar de nuevo".

- [ ] **Step 4: Implementar `EstudioVivo`** según la opción A ([pantalla-feriante.html](../specs/fase-1-parte-2-sala/pantalla-feriante.html), [recorrido-feriante.html](../specs/fase-1-parte-2-sala/recorrido-feriante.html)): contenedor `fixed inset-0 z-50 bg-black` (tapa la barra inferior), video `object-cover` espejado solo con la cámara frontal.
  - **Vista previa**: cartel, aviso fijo, Cambiar cámara, Silenciar, `BotonAvisarWhatsapp momento="antes"`, botón rojo grande "Salir en vivo". Permiso de cámara negado → "Necesitamos tu cámara y tu micrófono", pasos para iPhone (Ajustes → Safari → Cámara/Micrófono → Permitir) y Android (candado de la barra de direcciones → Permisos), y "Probar de nuevo".
  - **Salir en vivo**: `dispositivo = crypto.randomUUID()` (uno por pestaña), `salirEnVivo(dispositivo)` → `transmisor.salirEnVivo(urlTransmitir)` → `crearSenal` cada `config.senal_cada_segundos` → `contarMirando` → suscripción `postgres_changes` a `live_sessions` con `filter: id=eq.<vivoId>`: si cambia `device_id` a otro → `transmisor.detener()` y "Seguís el vivo en otro celular"; si `ended_at` no es nulo → detener y mostrar según `end_reason` (`plataforma` → "La plataforma terminó este vivo"; `sin_senal` → "Tu vivo terminó porque estuviste afuera mucho tiempo" + "Salir en vivo de nuevo"; `duena` → resumen). Lo mismo si la señal responde `otro_dispositivo` o `terminado`.
  - **En vivo**: arriba `EnVivo` + `mm:ss` (con `duracionVivoMs`) y `👁 n`; abajo a la derecha, en columna, Silenciar/Activar sonido, Cambiar cámara y "Terminar" (blanco con texto lapacho); abajo a la izquierda `BotonAvisarWhatsapp momento="durante"`. "Reconectando…" sobre la imagen si el transmisor está `reconectando`. Silenciada → "🔇 Silenciada" fijo. Silenciar o activar el sonido llama `senal.avisarAhora()` para que la sala se entere enseguida (y la prueba `silenciar` no espere 20 s).
  - **Salir y volver** (`vigilarSalida`): al salir, `transmisor.silenciar(true)` y `senal.avisarAhora()` con `fuera: true`; al volver, `fuera: false`, sigue silenciada y muestra el aviso grande "Estás silenciada · Activar sonido".
  - **Resumen**: "¡Terminó tu vivo! 🎉", "Duró" (minutos), "Más gente mirando a la vez" (`peak_viewers`), "Volver a mi puesto".

- [ ] **Step 5: Modificar `mi-puesto/page.tsx`**: si la tienda está completa, arriba de las opciones un link-botón rojo grande (`bg-vivo`) "Salir en vivo" → `/mi-puesto/vivo`, o "Volver a tu vivo" si `vivoAbiertoDe` devuelve uno; debajo, `BotonAvisarWhatsapp momento="antes"` (o `"durante"` si hay vivo abierto).

- [ ] **Step 6: Correr y ver que pasan**

Run: `npx playwright test tests/e2e/estudio-vivo.spec.ts; if ($?) { npm run typecheck }; if ($?) { npm run lint }`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/mi-puesto src/components/vivos playwright.config.ts tests/e2e/estudio-vivo.spec.ts
git commit -m "Agregar la pantalla para salir en vivo desde Mi puesto"
```

---

### Task 7: Sala de la compradora (`/@usuario/vivo`)

**Files:**
- Modify: `next.config.ts` (reescritura `{ source: "/@:handle/vivo", destination: "/tienda/:handle/vivo" }`)
- Create: `src/app/tienda/[handle]/vivo/page.tsx`, `src/components/vivos/sala-vivo.tsx`
- Test: `tests/e2e/sala-vivo.spec.ts`

**Interfaces:**
- Consumes: `obtenerTiendaPorHandle`, `listarProductos`, `idsSeguidos` (`src/lib/tiendas/datos.ts`); `obtenerConfigVivo`, `vivoAbiertoDe` (Tarea 3); `estadoSala` (Tarea 2); `crearReproductor`, `anunciarPresencia` (Tarea 4); `EsperaFeria` (Tarea 5); `BotonSeguir`, `Foto`, `EnVivo`.
- Produces:
  ```ts
  export function SalaVivo(props: {
    tienda: { id: string; handle: string; name: string; avatar_path: string | null; live_schedule_note: string | null };
    productos: { id: string; price_cents: number; foto: string | null }[]; // hasta 3 visibles
    vivoInicial: Vivo | null; config: ConfigVivo; siguiendo: boolean; conSesion: boolean;
  }): JSX.Element;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/e2e/sala-vivo.spec.ts` (proyecto `celular-camara`; Mica con tienda completa, `live_schedule_note: "martes y jueves a las 21"`, un producto y `crearTransmisionPrueba`; sin sesión salvo que se indique):
  - `espera antes del vivo`: `/@<handle>/vivo` muestra "¡Pronto arrancamos!", "Suele estar en vivo martes y jueves a las 21", el precio del producto y "Seguir".
  - `se abre sola cuando arranca`: con la página abierta en espera, Mica llama `rpc("abrir_vivo")` → sin recargar se ve "EN VIVO" y desaparece "¡Pronto arrancamos!".
  - `vuelve en un momento`: con el vivo abierto, `senal_vivo(…, fuera: true, …)` → se ve "Mica vuelve en un momento" (con el nombre de la tienda).
  - `sin sonido`: `senal_vivo(…, silenciada: true, …)` → se ve "Sin sonido por un momento".
  - `terminó`: `terminar_vivo` → "El vivo terminó. Gracias por acompañar a <nombre>." y un link a `/@<handle>`.
  - `cuenta como mirando`: con la sala abierta en una página y la pantalla de Mica en vivo en otra (contexto con cookies de Mica), la pantalla de Mica muestra "👁 1".
  - `handle con mayúsculas`: `/@<HANDLE EN MAYÚSCULAS>/vivo` muestra la sala.
  - `puesto inexistente`: `/@no.existe.nunca/vivo` → "No encontramos este puesto."

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx playwright test tests/e2e/sala-vivo.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar la página** (servidor, como `tienda/[handle]/page.tsx`): tienda por handle (o `NoEncontrado`), hasta 3 productos visibles con su primera foto, `vivoAbiertoDe`, `obtenerConfigVivo`, seguidos → `<SalaVivo>`. `metadata` con el nombre del puesto.

- [ ] **Step 4: Implementar `SalaVivo`**: contenedor `fixed inset-0 z-50 bg-black text-white`. Estado con `estadoSala(vivo, ahora, config)`, recalculado cada segundo y en cada cambio que llega por `postgres_changes` sobre `live_sessions` con `filter: store_id=eq.<id>` (`INSERT` → nuevo vivo; `UPDATE` → reemplaza si es el mismo id). Al entrar en `"en-vivo"` crea el reproductor con `vivo.whep_url` y `anunciarPresencia`; al `"terminado"` los cierra.
  - Cabecera fija (fondo oscuro translúcido): foto y nombre, `BotonSeguir`, y en vivo `EnVivo` + `👁 viewers`; botón cerrar (vuelve a `/@handle`).
  - `esperando`: `EsperaFeria` + "Suele estar en vivo …" (si hay) + "Mientras tanto, mirá lo que tiene" con los productos.
  - `en-vivo`: video vertical a pantalla completa; "Tocá para activar el sonido" si el reproductor avisó `sinSonido`; "Reconectando…" si el reproductor está `reconectando`; "Sin sonido por un momento" si `vivo.muted`. Dejar abajo el espacio del chat (Parte 3) vacío.
  - `vuelve-pronto`: "<nombre> vuelve en un momento" sobre la imagen (sin negro).
  - `reconectando-feriante`: "<nombre> se está reconectando".
  - `terminado`: "El vivo terminó. Gracias por acompañar a <nombre>." + botón "Ver su tienda".

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx playwright test tests/e2e/sala-vivo.spec.ts; if ($?) { npm run typecheck }; if ($?) { npm run lint }`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts src/app/tienda src/components/vivos/sala-vivo.tsx tests/e2e/sala-vivo.spec.ts
git commit -m "Agregar la sala para mirar el vivo con su pantalla de espera"
```

---

### Task 8: "En vivo ahora" en el Inicio, la tienda y Seguidos

**Files:**
- Create: `src/components/vivos/vivos-ahora.tsx`, `src/components/vivos/tarjeta-vivo.tsx`
- Modify: `src/app/page.tsx`, `src/app/tienda/[handle]/page.tsx`, `src/app/seguidos/page.tsx`, `src/components/tiendas/tarjeta-puesto.tsx`, `src/lib/tiendas/datos.ts` (`listarSeguidos` ordena en vivo primero si recibe el conjunto)
- Test: `tests/e2e/inicio.spec.ts`, `tests/e2e/tienda-publica.spec.ts` (agregar casos)

**Interfaces:**
- Consumes: `listarVivosAbiertos`, `idsPuestosEnVivo`, `VivoEnPortada` (Tarea 3).
- Produces:
  ```ts
  export function VivosAhora(props: { iniciales: VivoEnPortada[] }): JSX.Element; // client
  export function TarjetaVivo(props: { item: VivoEnPortada }): JSX.Element;
  // TarjetaPuesto gana la prop opcional `enVivo?: boolean`
  // listarSeguidos(supabase, userId, enVivo?: Set<string>): en vivo primero, mismo orden relativo
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `inicio.spec.ts` — `muestra el vivo y lo saca al terminar`: con un puesto de prueba en vivo (`abrir_vivo`), en `/` se ve una tarjeta con "EN VIVO" y el nombre del puesto que lleva a `/@<handle>/vivo`; tras `terminar_vivo` desaparece sin recargar. `sin vivos` sigue mostrando "Ahora no hay nadie en vivo. Seguí a tus puestos favoritos." (buscar la tarjeta por handle, la base es compartida: el texto de "sin vivos" solo se comprueba si `listarVivosAbiertos` está vacío al empezar; si no, saltar con `test.skip`).
  - `tienda-publica.spec.ts` — `acceso destacado al vivo`: con el puesto en vivo, `/@<handle>` muestra "Está en vivo · Entrar a la sala" que lleva a `/@<handle>/vivo`; sin vivo, no aparece.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx playwright test tests/e2e/inicio.spec.ts tests/e2e/tienda-publica.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** `TarjetaVivo` (vertical 9:16, portada o foto del puesto — o el degradado de la tienda si no tiene —, `EnVivo` y `👁 n` arriba, nombre y zona abajo, link a la sala) y `VivosAhora` (carrusel horizontal con `snap-x`; suscripción `postgres_changes` a `live_sessions`: `INSERT` o un `UPDATE` que cierra → `router.refresh()`; `UPDATE` de un abierto → actualiza `viewers` y reordena en el lugar; vacío → el texto de "sin vivos"). En `page.tsx`, reemplazar el párrafo fijo por `<VivosAhora iniciales={…} />` y pasar `enVivo` a cada `TarjetaPuesto` (que muestra `EnVivo` chico junto al nombre). En la tienda, el acceso destacado rojo. En Seguidos, `listarSeguidos(…, await idsPuestosEnVivo(supabase))`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx playwright test tests/e2e/inicio.spec.ts tests/e2e/tienda-publica.spec.ts; if ($?) { npm run typecheck }; if ($?) { npm run lint }`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/vivos src/app/page.tsx src/app/tienda src/app/seguidos src/components/tiendas/tarjeta-puesto.tsx src/lib/tiendas/datos.ts tests/e2e/inicio.spec.ts tests/e2e/tienda-publica.spec.ts
git commit -m "Mostrar los vivos en el Inicio, la tienda y Seguidos"
```

---

### Task 9: Cortar un vivo desde `/admin`

**Files:**
- Modify: `src/app/admin/page.tsx`, `src/app/admin/acciones.ts`
- Create: `src/app/admin/panel-vivos.tsx`
- Test: `tests/e2e/admin.spec.ts` (agregar caso)

**Interfaces:**
- Consumes: `listarVivosAbiertos` (Tarea 3); `cortar_vivo` (Tarea 1); `adminActual()` (ya existe en `acciones.ts`).
- Produces: `export async function cortarVivo(vivoId: string): Promise<Resultado>` en `src/app/admin/acciones.ts`; `PanelVivos({ vivos: { id: string; handle: string; name: string; desde: string; viewers: number }[] })`.

- [ ] **Step 1: Escribir la prueba que falla** — `la admin corta un vivo`: con un puesto de prueba en vivo, la admin en `/admin` ve la sección "Vivos ahora" con el handle, toca "Cortar este vivo", confirma "Sí, cortar" y la fila desaparece; en la base `end_reason: "plataforma"`. Sin vivos, la sección dice "No hay nadie en vivo".

- [ ] **Step 2: Correr y ver que falla**

Run: `npx playwright test tests/e2e/admin.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** `cortarVivo` (valida UUID, `adminActual()`, `rpc("cortar_vivo")`, error → `"No se pudo cortar el vivo. Probá de nuevo."`) y `PanelVivos` arriba de las invitaciones (desde cuándo, con `formatFechaTucuman`, y cuánta gente mira), con confirmación antes de cortar.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx playwright test tests/e2e/admin.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin tests/e2e/admin.spec.ts
git commit -m "Permitir que la plataforma corte un vivo desde administración"
```

---

### Task 10: Borrar la prueba, actualizar la guía y probar en celulares

**Files:**
- Delete: `src/app/prueba-vivo/` (las dos páginas); `src/lib/vivos/registro.ts` y `registro.test.ts` si ya nada los usa (mover `esperaReconexion` a `src/lib/vivos/reconexion.ts` con su prueba si `transmisor`/`reproductor` lo usan)
- Modify: `CLAUDE.md` (secciones 8, 10, 13), `.superpowers` no se toca

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Borrar `/prueba-vivo`** y lo que quedó sin uso; mover `esperaReconexion` si hace falta.

Run: `npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }`
Expected: PASS.

- [ ] **Step 2: Borrar la transmisión `prueba-vivo` de Cloudflare.** Pedirle al dueño que la borre en **Cloudflare → Stream → Live inputs → prueba-vivo → Delete** (o hacerlo con un script temporal en la carpeta de trabajo de Claude que lea las credenciales de `.env.local` sin mostrarlas).

- [ ] **Step 3: Actualizar `CLAUDE.md`**: en la sección 8, mover `live_sessions` a "Ya creadas" junto con `store_streams` y `live_config` (con una línea cada una, y que los tiempos se cambian con un `UPDATE` en `live_config`); en la 10, el estado de la Parte 2; en la 13, quitar `/prueba-vivo` y agregar `/mi-puesto/vivo` (Feriantes) y `/@usuario/vivo` (Todos).

- [ ] **Step 4: Verificación completa**

Run: `npm test; if ($?) { npm run typecheck }; if ($?) { npm run lint }; if ($?) { npm run test:integracion }; if ($?) { npm run test:e2e }; if ($?) { npm run build }`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add -A src CLAUDE.md
git commit -m "Borrar la página de prueba de transmisión y actualizar la guía"
```

- [ ] **Step 6: Prueba a mano en celulares reales** (después de publicar en una vista previa o en producción, con el dueño, un iPhone y un Android; se anota el resultado en la sección 11 de la prueba de transmisión o en un apartado nuevo del diseño):
  1. iPhone sale en vivo y Android mira (y al revés): imagen, sonido, 👁.
  2. La feriante va a WhatsApp 1 minuto: quien mira ve "vuelve en un momento" y **no escucha nada**; al volver, "Estás silenciada · Activar sonido".
  3. La feriante cierra la página y entra de nuevo a Mi puesto: "Volver a tu vivo" retoma el mismo vivo; la compradora no recarga.
  4. Compradora en la espera antes del vivo: se abre sola al arrancar.
  5. Transmitir con **datos móviles** (pendiente de la prueba).
  6. Tiempo hasta ver la imagen al abrir el link por Wi-Fi: anotarlo (meta: pocos segundos).
