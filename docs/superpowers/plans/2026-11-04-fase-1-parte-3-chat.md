# Chat de la sala (Fase 1, Parte 3) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que compradoras y feriante charlen en tiempo real en la sala (`/@usuario/vivo`) y en el estudio (`/mi-puesto/vivo`), con un moderador automático que frena el spam, herramientas de un toque para la feriante, "Personas silenciadas" en Mi puesto y "Cuentas para revisar" en `/admin`.

**Architecture:** Los mensajes viven en `chat_messages` y **solo se escriben por funciones `SECURITY DEFINER`**. El texto pasa primero por el moderador en TypeScript (`src/lib/chat/moderar.ts`, puro y probado con listas de mensajes reales) dentro de una Server Action; la acción llama con la llave secreta a `publicar_mensaje`, que aplica en la base lo que necesita historial (vivo abierto, silencios, ráfaga, repetidos, silencio automático). Las pantallas reciben mensajes por Supabase Realtime (`postgres_changes`, como la Parte 2): la política RLS de lectura hace que **un mensaje oculto solo le llegue a quien lo escribió** y que un vivo cerrado no se lea. Borrar no quita la fila: le vacía el texto y la marca (así el cambio llega a todas las pantallas), y el texto original queda en `moderation_actions` para reclamos. El transporte de tiempo real queda encerrado en un solo hook (`useChat`) para poder pasarlo a *Broadcast* si algún día hay salas mucho más grandes.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript estricto, Tailwind + `src/components/ui/`, Supabase (Postgres, RLS, Realtime, `pg_cron`), Drizzle, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-11-04-fase-1-parte-3-chat-design.md](../specs/2026-11-04-fase-1-parte-3-chat-design.md) · boceto en [`../specs/fase-1-parte-3-chat/chat-moderar.html`](../specs/fase-1-parte-3-chat/chat-moderar.html)

## Global Constraints

- Textos en español rioplatense (voseo). Horas en `America/Argentina/Tucuman`.
- Valores iniciales (spec §6), en la fila única de `chat_config` (**nunca** constantes en el código): `largo_maximo 200`, `rafaga_mensajes 5`, `rafaga_segundos 10`, `repetido_segundos 60`, `frenados_para_silenciar 3`, `frenados_ventana_segundos 600`, `silencio_segundos 600`, `mensajes_al_entrar 50`, `guardar_dias 30`, `salas_para_revisar 3`.
- `chat_config` y `chat_blocked_words` **no se leen desde el navegador** (sin permisos para `anon`/`authenticated`); el servidor las lee con `src/lib/supabase/admin.ts`.
- Nadie inserta, actualiza ni borra filas del chat directo desde el navegador: todo pasa por funciones. `publicar_mensaje` la ejecuta **solo `service_role`** (si la pudiera llamar el navegador, se saltearía el moderador).
- Motivos de mensaje oculto (`hidden_reason`): exactamente `link`, `promocion`, `insulto`, `repetido`.
- Tipos de silencio (`chat_silences.kind`): exactamente `temporal`, `sala`, `plataforma`. Origen (`source`): `feriante`, `moderador`, `admin`.
- Textos exactos de la sala: campo `Escribí un mensaje…`; sin sesión `Entrá con Google para escribir`; ráfaga `Esperá un ratito para volver a escribir.`; silencio temporal `No podés escribir en este vivo por un rato.`; silencio de sala o plataforma `No podés escribir en esta sala.`; error de envío `Reintentar`.
- Textos exactos del estudio (panel al tocar un mensaje): `Borrar este mensaje`, `Silenciar 10 minutos` (debajo: `No puede escribir; sigue mirando`), `Silenciar en mi sala` (debajo: `No vuelve a escribir en tus vivos (lo podés deshacer)`). Avisos: `Borraste el mensaje.`, `Silenciaste a {nombre} por 10 minutos.`, `Silenciaste a {nombre} en tu sala.`
- Nombre que se muestra: nombre + inicial del apellido ("Caro M."); la feriante, con el nombre de su puesto y `✔`.
- Largo contado en caracteres que ve la persona (`[...texto].length`), no en unidades UTF-16.
- Los mensajes del chat no se animan. Todo lo que se toca mide al menos 44 px.
- Migraciones nuevas, nunca editar una aplicada: la generada `drizzle/0007_*.sql` y la manual `npx drizzle-kit generate --custom --name=seguridad_chat` (`0008_seguridad_chat.sql`), con el mismo estilo que `0005_seguridad_vivos.sql` (`--> statement-breakpoint`, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` antes de cada `GRANT`, errores `RAISE EXCEPTION '<codigo>' USING ERRCODE = 'P0001'`).
- Nunca imprimir `DATABASE_URL` ni claves: filtrar la salida de `db:generate`/`db:migrate` con `ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' }`.
- Sin dependencias nuevas. Commits chicos en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Las pruebas comparten la base real: crean y borran sus propios usuarios, tiendas y vivos; buscan por datos únicos.
- Context7 no está autorizado en esta sesión: para firmas de `supabase-js` (`channel`, `postgres_changes`, `rpc`), seguir los usos que ya hay en `src/components/vivos/` y `src/lib/vivos/presencia.ts`.

## Review Focus

1. **Un mensaje se envía justo cuando el vivo termina** → la base responde `cerrado` y la sala no lo deja "Reintentar" para siempre: el chat se va con el resto de la sala en vivo. Tests: Tarea 1 (`no se escribe en un vivo cerrado`) y Tarea 4 (`enviar con el vivo cerrado`).
2. **Números normales** ("40", "$8.000", "18000", "15/11", "2 x 1") **no se toman como teléfono**, pero "381 555 1234" o "381-555-1234" sí. Test en la Tarea 3 (listas `NUNCA_FRENAR` y `SIEMPRE_FRENAR`).
3. **Mensaje vacío o solo espacios / solo emojis**: vacío se rechaza sin guardarse; "😍😍😍" se publica. Tests: Tarea 3 (`limpiarTexto`) y Tarea 1 (`texto vacío`).
4. **La feriante se toca a sí misma o a otra cuenta que no escribió en su sala**: no puede silenciarse ni borrar mensajes de otra sala. Test en la Tarea 2 (`no se silencia a sí misma`, `no borra en sala ajena`).
5. **Un mensaje borrado no reaparece para quien entra después** (la carga inicial excluye los borrados) y **un oculto no aparece en la carga inicial de otra persona**. Test en la Tarea 1 (`carga inicial`).

---

### Task 1: Tablas del chat, lectura y `publicar_mensaje`

**Files:**
- Modify: `src/db/schema.ts` (sección "Chat (Fase 1, Parte 3). Reglas en drizzle/0008_seguridad_chat.sql")
- Create: `drizzle/0007_*.sql` (generada), `drizzle/0008_seguridad_chat.sql` (manual)
- Create: `tests/integracion/chat.test.ts`
- Modify: `tests/helpers/tiendas-prueba.ts`

**Interfaces:**
- Produces (tablas):
  - `chat_config`: `id integer PK` (CHECK `id = 1`) y las columnas `integer NOT NULL` de Global Constraints con esos defaults (CHECK todas `> 0`). La migración inserta la fila 1. Solo `service_role`.
  - `chat_blocked_words`: `word text PK` (guardada ya normalizada: minúsculas, sin tildes). Solo `service_role`. La migración inserta la lista inicial (insultos rioplatenses y del norte; el constructor la arma).
  - `chat_messages`: `id uuid PK default random`, `live_session_id uuid NOT NULL → live_sessions CASCADE`, `store_id uuid NOT NULL → stores CASCADE`, `user_id uuid NOT NULL → users CASCADE`, `author_name text NOT NULL`, `body text NOT NULL`, `normalized text NOT NULL`, `is_seller boolean NOT NULL DEFAULT false`, `hidden_reason text NULL` (CHECK en los cuatro motivos), `deleted_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()` (hora del servidor). Índices `(live_session_id, created_at)`, `(user_id, store_id, created_at)`.
  - `chat_silences`: `id uuid PK`, `store_id uuid NULL → stores CASCADE` (nulo solo para `plataforma`), `user_id uuid NOT NULL → users CASCADE`, `kind text NOT NULL`, `source text NOT NULL`, `created_by uuid NULL → users SET NULL`, `created_at`, `until timestamptz NULL` (solo `temporal`), `lifted_at timestamptz NULL`, `lifted_by uuid NULL → users SET NULL`. CHECKs: `kind`/`source` en sus valores; `(kind = 'plataforma') = (store_id IS NULL)`; `(kind = 'temporal') = (until IS NOT NULL)`.
  - `moderation_actions`: `id uuid PK`, `store_id uuid NULL → stores CASCADE`, `target_user_id uuid NOT NULL → users CASCADE`, `actor_id uuid NULL → users SET NULL` (nulo = moderador automático), `actor_kind text NOT NULL` (`feriante|moderador|admin`), `action text NOT NULL` (`borrar|silenciar_temporal|silenciar_sala|silenciar_plataforma|quitar_silencio`), `message_id uuid NULL → chat_messages SET NULL`, `message_body text NULL` (copia del texto borrado), `created_at`.
- Produces (función auxiliar, `STABLE SECURITY DEFINER`): `esta_silenciada(p_store uuid, p_user uuid) RETURNS text` → `'plataforma'`, `'sala'`, `'temporal'` o `NULL` según el silencio vigente más fuerte (`lifted_at IS NULL` y, si es temporal, `until > now()`).
- Produces: `publicar_mensaje(p_user uuid, p_vivo uuid, p_nombre text, p_texto text, p_normalizado text, p_motivo text) RETURNS jsonb` — **solo `service_role`**. En orden:
  1. vivo inexistente o cerrado → `{"estado":"cerrado"}`;
  2. `p_texto` vacío tras `btrim` o más largo que `largo_maximo` (`char_length`) → `RAISE 'texto_invalido'`;
  3. `esta_silenciada` no nulo → `{"estado":"silenciada","tipo":<tipo>}`;
  4. mensajes guardados de `p_user` en ese vivo en los últimos `rafaga_segundos` ≥ `rafaga_mensajes` → `{"estado":"rafaga"}` (no se guarda);
  5. `is_seller` = la persona es dueña del puesto del vivo; si lo es, `author_name` = nombre del puesto y `p_motivo` se ignora salvo `insulto`; si no, `author_name = p_nombre`;
  6. si `p_motivo` es nulo y hay un mensaje de `p_user` en ese vivo con el mismo `normalized` en los últimos `repetido_segundos` → motivo `repetido`;
  7. inserta y, si quedó oculto y la persona suma ≥ `frenados_para_silenciar` ocultos en ese puesto en `frenados_ventana_segundos`, inserta un silencio `temporal`/`moderador` de `silencio_segundos` (y su `moderation_actions`);
  8. devuelve `{"estado":"ok","mensaje":<fila como json>}`.
- Produces (RLS y permisos): RLS en las cinco tablas; `REVOKE ALL … FROM anon, authenticated`; `GRANT ALL … TO service_role`. `GRANT SELECT ON chat_messages TO anon, authenticated` con tres políticas: **"Chat del vivo abierto"** (`hidden_reason IS NULL` y el vivo tiene `ended_at IS NULL`), **"Mis mensajes ocultos"** (`TO authenticated`, `user_id = auth.uid()` y vivo abierto) y **"Chat para administración"** (`es_admin()`). `GRANT SELECT ON chat_silences TO authenticated` con política "Mis silencios" (`user_id = auth.uid()`). `ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages, public.chat_silences;`.
- Produces (helpers en `tiendas-prueba.ts`): `borrarChatDeTienda(storeId: string): Promise<void>` (mensajes, silencios y acciones); `publicarPrueba(userId: string, vivoId: string, texto: string, motivo?: string | null): Promise<Record<string, unknown>>` (llama a `publicar_mensaje` con `clienteAdmin()`, `p_nombre "Prueba P."`, `p_normalizado` = `texto.toLowerCase().trim()`).

- [ ] **Step 1: Agregar las cinco tablas a `src/db/schema.ts` y generar la migración**

Run: `npm run db:generate 2>&1 | ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' }`
Expected: `drizzle/0007_<nombre>.sql` con los cinco `CREATE TABLE`.

- [ ] **Step 2: Crear la migración de seguridad vacía**: `npx drizzle-kit generate --custom --name=seguridad_chat` → `drizzle/0008_seguridad_chat.sql`.

- [ ] **Step 3: Escribir las pruebas que fallan** en `tests/integracion/chat.test.ts` (armado como `vivos.test.ts`: Mica con tienda completa + `crearTransmisionPrueba` + vivo abierto por `abrir_vivo`; compradoras Caro y Luz; admin; `beforeEach` → `borrarChatDeTienda`):
  - `cualquiera lee el chat del vivo abierto`: tras `publicarPrueba(caro, vivo, "holaa")`, `clienteAnonimo().from("chat_messages").select("body, author_name")` del vivo → `[{ body: "holaa", author_name: "Prueba P." }]`.
  - `un oculto solo lo lee quien lo escribió`: `publicarPrueba(caro, vivo, "mirá www.x.com", "link")` → Caro lo lee; Luz, la visitante y Mica no.
  - `nadie escribe directo`: `insert` desde Caro y desde la visitante → error o `[]`; `update`/`delete` sobre un mensaje → no cambia nada.
  - `el navegador no llama a publicar_mensaje`: `caro.cliente.rpc("publicar_mensaje", …)` → error.
  - `no se lee la configuración ni las palabras`: `select` de `chat_config` y `chat_blocked_words` desde Caro y la visitante → `[]` o error.
  - `no se escribe en un vivo cerrado`: tras `terminar_vivo` → `{ estado: "cerrado" }`; y los mensajes del vivo dejan de leerse para la visitante y para Caro (salvo el admin).
  - `texto vacío`: `publicarPrueba(caro, vivo, "   ")` → error `texto_invalido`; con 201 caracteres → `texto_invalido`; con 200 emojis `"😍".repeat(200)` → `ok`.
  - `ráfaga`: 5 envíos seguidos → `ok`; el 6.º → `{ estado: "rafaga" }` y no hay 6.ª fila.
  - `repetido`: dos veces `"hola"` → la segunda fila tiene `hidden_reason: "repetido"`.
  - `tres frenados silencian 10 minutos`: tres envíos con motivo `link` → existe silencio `temporal`/`moderador` con `until` ≈ ahora + 600 s; el cuarto envío → `{ estado: "silenciada", tipo: "temporal" }`.
  - `la feriante`: `publicarPrueba(mica, vivo, "mi wsp 3815551234", "promocion")` → `is_seller: true`, `hidden_reason: null`, `author_name` = nombre de la tienda.
  - `carga inicial`: (Review Focus 5) con un mensaje visible, uno oculto de Caro y uno borrado (`update` con `clienteAdmin()` de `deleted_at`) → Luz lee solo el visible no borrado si filtra `.is("deleted_at", null)`; Caro lee además el suyo oculto.
  - `tiempo real`: la visitante se suscribe con `channel(…).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: "live_session_id=eq.<vivo>" })`; tras publicar uno oculto y uno visible, en 3 s recibió **solo** el visible.

- [ ] **Step 4: Correr y ver que fallan**: `npm run test:integracion -- tests/integracion/chat.test.ts` → FAIL (`Could not find the table 'public.chat_messages'`).

- [ ] **Step 5: Escribir en `0008_seguridad_chat.sql`** restricciones, fila de `chat_config`, lista inicial de palabras, `esta_silenciada`, `publicar_mensaje`, permisos, políticas y publicación de tiempo real de la sección Interfaces.

- [ ] **Step 6: Aplicar**: `npm run db:migrate 2>&1 | ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' } | Select-Object -Last 4` → sin errores.

- [ ] **Step 7: Correr y ver que pasan**: `npm run test:integracion` → PASS (también `vivos`, `tiendas`, `usuarios`).

- [ ] **Step 8: Commit**: `git add src/db/schema.ts drizzle tests/integracion/chat.test.ts tests/helpers/tiendas-prueba.ts` · `git commit -m "Crear las tablas del chat y la publicación de mensajes con sus reglas"`

---

### Task 2: Moderar desde la sala y la administración, borrado a los 30 días y límite de señales

**Files:**
- Create: `drizzle/0009_*.sql` (`npx drizzle-kit generate --custom --name=moderacion_chat`); si la señal necesita columnas, agregarlas en `schema.ts` y generar antes
- Modify: `src/app/mi-puesto/vivo/senal/route.ts`
- Test: `tests/integracion/chat.test.ts`, `tests/integracion/vivos.test.ts`

**Interfaces:**
- Consumes: tablas y `esta_silenciada` de la Tarea 1.
- Produces (todas `SECURITY DEFINER`, `authenticated` salvo aclaración; cada una registra su fila en `moderation_actions`):
  - `borrar_mensaje(p_mensaje uuid) RETURNS void`: exige `es_duena_de(store_id)` del mensaje (si no, `sin_permiso`); copia `body` a `moderation_actions.message_body` y deja `body = ''`, `deleted_at = now()`.
  - `silenciar_en_sala(p_store uuid, p_user uuid, p_tipo text) RETURNS void`: dueña; `p_tipo` en `temporal|sala` (si no, `datos_invalidos`); `p_user` = la dueña → `no_a_vos_misma`; `temporal` dura `silencio_segundos`. Un segundo `sala` sobre alguien ya silenciado así no duplica.
  - `quitar_silencio(p_store uuid, p_user uuid) RETURNS void`: dueña; pone `lifted_at`/`lifted_by` en los silencios vigentes de ese puesto.
  - `silenciadas_de_mi_sala(p_store uuid) RETURNS TABLE(user_id uuid, nombre text, desde timestamptz)`: dueña; silencios `sala` vigentes; `nombre` = `author_name` de su último mensaje en ese puesto, o "Alguien" si no hay.
  - `cuentas_para_revisar() RETURNS TABLE(user_id uuid, nombre text, salas integer, desde timestamptz, en_plataforma boolean)`: `es_admin()`; cuentas con silencios `sala` **de origen `feriante`, vigentes**, en ≥ `salas_para_revisar` puestos distintos, más las ya silenciadas en la plataforma. `nombre` = `users.display_name`.
  - `silenciar_en_plataforma(p_user uuid) RETURNS void` y `quitar_silencio_plataforma(p_user uuid) RETURNS void`: `es_admin()`.
  - `borrar_chat_viejo() RETURNS integer`: solo `service_role`; borra `chat_messages` y `moderation_actions` con más de `guardar_dias`, salvo los de cuentas con silencio `sala` o `plataforma` vigente; borra silencios levantados o temporales vencidos con más de `guardar_dias`. `SELECT cron.schedule('borrar-chat-viejo', '17 6 * * *', $$SELECT public.borrar_chat_viejo()$$);`
  - Límite de señales: `senal_vivo` devuelve `'demasiadas'` (sin modificar nada) si el vivo recibió más de 30 señales en los últimos 60 s (llevar la cuenta en el vivo; columnas a decisión del constructor). La ruta responde `429 { error: "demasiadas" }`.

- [ ] **Step 1: Pruebas que fallan** (en `chat.test.ts` salvo aclaración):
  - `solo la dueña borra`: Caro → `sin_permiso`; Mica → el mensaje queda con `body: ""` y `deleted_at` no nulo, y `moderation_actions` tiene `message_body` con el texto original.
  - `no borra en sala ajena`: (Review Focus 4) otra feriante con su propia tienda llamando `borrar_mensaje` sobre un mensaje de la sala de Mica → `sin_permiso`.
  - `silenciar 10 minutos`: Mica silencia a Caro `temporal` → `publicarPrueba(caro…)` → `{ estado: "silenciada", tipo: "temporal" }`; Caro lee su fila en `chat_silences` y Luz no.
  - `no se silencia a sí misma`: → `no_a_vos_misma`.
  - `silenciar en mi sala y deshacer`: `sala` → `silenciadas_de_mi_sala` la lista; `quitar_silencio` → Caro vuelve a publicar `ok`; Caro no puede llamar `silenciadas_de_mi_sala` de Mica (`sin_permiso`).
  - `tres feriantes marcan la cuenta`: tres tiendas de prueba silencian a Caro en `sala` → `cuentas_para_revisar()` (admin) la incluye con `salas: 3`; con dos silencios `sala` y uno `temporal`, o si una feriante lo quita, no la incluye; Mica llamando `cuentas_para_revisar` → `sin_permiso`.
  - `silenciar en toda la plataforma`: admin → Caro recibe `silenciada`/`plataforma` en cualquier sala; Mica no puede (`sin_permiso`); `quitar_silencio_plataforma` lo deshace.
  - `borrado a los 30 días`: con `clienteAdmin()` mover `created_at` de dos mensajes a hace 31 días, uno de una cuenta con silencio `sala` vigente → `borrar_chat_viejo()` borra solo el otro; Caro no puede llamarla.
  - En `vivos.test.ts`, `demasiadas señales`: 31 `senal_vivo` seguidas → la última devuelve `'demasiadas'`.

- [ ] **Step 2: Correr y ver que fallan**: `npm run test:integracion` → FAIL (funciones inexistentes).
- [ ] **Step 3: Escribir `0009_moderacion_chat.sql`** (y columnas de señal si hacen falta) y adaptar la ruta de señal al `429`.
- [ ] **Step 4: Aplicar** (comando filtrado de la Tarea 1) **y correr**: `npm run test:integracion` → PASS.
- [ ] **Step 5: Commit**: `git commit -m "Sumar las herramientas de moderación, el borrado a los 30 días y el límite de señales"`

---

### Task 3: El moderador automático y el nombre corto (lógica pura)

**Files:**
- Create: `src/lib/chat/tipos.ts`, `src/lib/chat/moderar.ts`, `src/lib/chat/nombre.ts`
- Test: `src/lib/chat/moderar.test.ts`, `src/lib/chat/nombre.test.ts`

**Interfaces:**
- Produces:
  - `tipos.ts`: `type MotivoOculto = "link" | "promocion" | "insulto" | "repetido"`; `type MensajeChat = { id: string; live_session_id: string; user_id: string; author_name: string; body: string; is_seller: boolean; hidden_reason: MotivoOculto | null; deleted_at: string | null; created_at: string }`; `const CAMPOS_MENSAJE` con esas columnas; `type ConfigChat = { largo_maximo: number; mensajes_al_entrar: number }`; `type SilencioChat = "temporal" | "sala" | "plataforma" | null`.
  - `limpiarTexto(texto: string): string` — recorta, une espacios repetidos, saca caracteres de control.
  - `normalizar(texto: string): string` — minúsculas, sin tildes ni diéresis (la ñ queda), letras repetidas 3+ veces reducidas a una ("pelotudooo" → "pelotudo"), sustituciones `0→o 1→i 3→e 4→a 5→s @→a $→s` **solo dentro de palabras que tengan letras**, sin signos. Lo usan las reglas y la columna `normalized`.
  - `moderar(texto: string, palabras: ReadonlySet<string>, esFeriante: boolean): Exclude<MotivoOculto, "repetido"> | null` — reglas 1–3 del spec §6; la feriante solo pasa por `insulto`.
  - `largoVisible(texto: string): number` — `[...texto].length`.
  - `nombreCorto(nombre: string): string` — "Carolina Medina" → "Carolina M."; "Lu" → "Lu"; "María José Pérez" → "María P."; vacío → "Alguien"; máximo 24 caracteres.

- [ ] **Step 1: Pruebas que fallan** en `moderar.test.ts`, con dos listas como datos:
  - `NUNCA_FRENAR` (todas → `null`): "holaa desde Yerba Buena 👋", "¿viene en 40?", "precio??", "¿hacés envíos a Tafí Viejo?", "me encanta 😍😍", "ROJO", "rojo!!", "$8.000", "18000", "talle 2 x 1", "15/11 a las 21", "lo quiero 🙋‍♀️", "¿aceptás mercado pago?", "qué lindo el saquito", "gracias mica!!", "Vñleta", "me lo reservás?". Más una prueba que recorre todas con `esFeriante: false`.
  - `SIEMPRE_FRENAR` como pares `[texto, motivo]`: `["mirá www.ofertas.com", "link"]`, `["entrá a ofertas .com", "link"]`, `["ofertas punto com", "link"]`, `["bit.ly/abc", "link"]`, `["https://x.co", "link"]`, `["wsp 381 555 1234", "promocion"]`, `["381-555-1234", "promocion"]`, `["seguime en insta @ofertas_tuc", "promocion"]`, `["pasate por mi página", "promocion"]`, `["vendo ropa más barata", "promocion"]`, `["mirá mi perfil", "promocion"]`, y para insultos una palabra de la lista inicial escrita normal, con un `0` en lugar de `o` y con la última letra repetida.
  - `la feriante pasa links y teléfonos pero no insultos`.
  - `normalizar`: `"PeLoTuDooo"` → `"pelotudo"`, `"Ñandú"` → `"ñandu"`, `"$8.000"` sin cambiar dígitos a letras.
  - `limpiarTexto("  hola   che  ")` → `"hola che"`; `limpiarTexto("   ")` → `""`.
  - `largoVisible("😍".repeat(200))` → `200`.
  - En `nombre.test.ts`, los casos de `nombreCorto` de Interfaces.
- [ ] **Step 2: Correr y ver que fallan**: `npm test -- src/lib/chat` → FAIL.
- [ ] **Step 3: Implementar.** Teléfono = 7 o más dígitos seguidos admitiendo espacios, puntos o guiones entre ellos, pero no un monto con `$` ni una fecha `dd/mm`. Las frases de promoción son una lista en `moderar.ts` comparada sobre el texto normalizado y por palabra entera ("hago envios" sí, "¿hacés envíos?" no).
- [ ] **Step 4: Correr**: `npm test` → PASS.
- [ ] **Step 5: Commit**: `git commit -m "Escribir el moderador automático del chat"`

---

### Task 4: El chat en la sala de la compradora

**Files:**
- Create: `src/lib/chat/config.ts` (`server-only`), `src/lib/chat/datos.ts`, `src/app/tienda/[handle]/vivo/acciones.ts`, `src/components/chat/use-chat.ts`, `src/components/chat/chat-sala.tsx`, `src/components/chat/burbuja.tsx`
- Modify: `src/app/tienda/[handle]/vivo/page.tsx`, `src/components/vivos/sala-vivo.tsx` (reemplazar el `espacio-chat`)
- Test: `tests/e2e/chat-sala.spec.ts`

**Interfaces:**
- Consumes: Tareas 1 y 3.
- Produces:
  - `config.ts`: `obtenerConfigChat(): Promise<ConfigChat>` y `palabrasBloqueadas(): Promise<ReadonlySet<string>>` (con `src/lib/supabase/admin.ts`; las palabras se guardan en memoria 5 minutos).
  - `datos.ts`: `mensajesIniciales(supabase, vivoId: string, cantidad: number): Promise<MensajeChat[]>` (los últimos `cantidad` sin borrar, de más viejo a más nuevo; la RLS ya decide qué ocultos ve) y `miSilencio(supabase, storeId: string, userId: string): Promise<SilencioChat>` (lee sus filas de `chat_silences` y elige el más fuerte vigente).
  - `acciones.ts`: `enviarMensaje(vivoId: string, texto: string): Promise<{ ok: true; mensaje: MensajeChat } | { ok: false; motivo: "sin_sesion" | "cerrado" | "rafaga" | "silenciada" | "invalido" | "error"; silencio?: SilencioChat }>` — valida uuid y texto (`limpiarTexto`, `largoVisible`), toma el usuario de la sesión, lee `display_name` → `nombreCorto`, corre `moderar`, llama `publicar_mensaje` con el cliente admin.
  - `use-chat.ts`: `useChat(vivo: { id: string; storeId: string } | null, inicial: MensajeChat[], silencioInicial: SilencioChat, userId: string | null): { mensajes: MensajeChat[]; enviar(texto: string): Promise<void>; reintentar(idLocal: string): Promise<void>; silencio: SilencioChat; aviso: string | null; canalListo: boolean }`. Suscribe `postgres_changes` a `INSERT`/`UPDATE` de `chat_messages` del vivo (y a `chat_silences` con `user_id=eq.<yo>` si hay sesión). El envío propio aparece al instante como pendiente; al confirmar lo reemplaza el mensaje del servidor (sin duplicarlo cuando llega también por el canal). Si falla la red queda `error` con "Reintentar". Un `UPDATE` con `deleted_at` lo saca de la lista. Guarda como máximo 100 mensajes en memoria.
  - `ChatSala` (props: `vivo`, `inicial`, `silencioInicial`, `config`, `userId`, `handle`): burbujas abajo (máx. un tercio de la pantalla, desvanecidas arriba, sin animación), campo con contador desde 180 caracteres, botón 💬 (`aria-label` "Esconder el chat" / "Mostrar el chat") y, sin sesión, el formulario de `entrarConGoogle` con `next` = `/@<handle>/vivo` y el texto exacto. `data-chat="listo"` cuando el canal está suscrito (para las pruebas).
  - `Burbuja` (props: `mensaje`, `pendiente?`, `error?`, `alTocar?`): nombre en negrita; la feriante con `✔` y color `--accent`.

- [ ] **Step 1: Pruebas que fallan** en `tests/e2e/chat-sala.spec.ts` (proyecto `celular`; armado como `sala-vivo.spec.ts`: Mica, tienda, transmisión de prueba y vivo abierto por `rpc`; esperar `data-chat="listo"`):
  - `dos compradoras charlan`: Caro (`crearUsuarioPrueba({ nombre: "Carolina Medina" })`) y Luz en dos contextos; Caro escribe "¿viene en 40?" → Luz lo ve en menos de 5 s como "Carolina M.".
  - `sin conexión queda Reintentar`: con `context.setOffline(true)` Caro envía → su burbuja muestra "Reintentar"; con `setOffline(false)` y un toque, se publica y Luz lo ve.
  - `la visitante lee pero no escribe`: ve los mensajes y el botón "Entrá con Google para escribir"; no hay campo.
  - `un link solo lo ve quien lo escribió`: Caro escribe "mirá www.ofertas.com" → lo ve; Luz no (esperar 3 s y luego un mensaje normal de Caro que sí le llega).
  - `ráfaga`: Caro envía 6 mensajes distintos seguidos → ve "Esperá un ratito para volver a escribir."
  - `silenciada`: Mica la silencia por `rpc` → el campo de Caro se desactiva con "No podés escribir en este vivo por un rato." sin recargar.
  - `quien entra tarde ve los últimos mensajes`: con 3 mensajes publicados por `publicarPrueba`, Luz entra y los ve en orden.
  - `enviar con el vivo cerrado`: (Review Focus 1) Mica termina el vivo por `rpc` antes de que Caro envíe → la sala pasa a "¡Gracias por venir!" y el chat ya no está.
  - `esconder el chat`: 💬 esconde y muestra las burbujas.
  - `200 caracteres`: el campo no acepta el 201.º.
- [ ] **Step 2: Correr y ver que fallan**: `npx playwright test tests/e2e/chat-sala.spec.ts --project=celular` → FAIL.
- [ ] **Step 3: Implementar.** La página carga en paralelo `obtenerConfigChat`, `mensajesIniciales` (solo si hay vivo) y `miSilencio`. `SalaVivo` recibe esas props y muestra `ChatSala` solo con el vivo abierto.
- [ ] **Step 4: Correr**: el spec nuevo, `tests/e2e/sala-vivo.spec.ts` y `tests/e2e/claves.spec.ts` → PASS; `npm run typecheck`, `npm run lint`, `npm test` → limpios.
- [ ] **Step 5: Commit**: `git commit -m "Sumar el chat a la sala de la compradora"`

---

### Task 5: El chat y la moderación en el estudio de la feriante

**Files:**
- Modify: `src/app/mi-puesto/vivo/page.tsx`, `src/app/mi-puesto/vivo/acciones.ts`, `src/components/vivos/estudio-vivo.tsx`
- Create: `src/components/chat/chat-estudio.tsx`, `src/components/chat/panel-moderar.tsx`
- Test: `tests/e2e/chat-estudio.spec.ts`

**Interfaces:**
- Consumes: `useChat`, `Burbuja`, `enviarMensaje` (Tarea 4); funciones de la Tarea 2.
- Produces (en `mi-puesto/vivo/acciones.ts`, devuelven `Resultado` de `@/lib/tiendas/tipos`): `borrarMensaje(mensajeId: string)`, `silenciarEnSala(storeId: string, userId: string, tipo: "temporal" | "sala")`, `quitarSilencio(storeId: string, userId: string)`. Validan uuid y llaman a la función de la base con la sesión de la feriante.
- `ChatEstudio`: las burbujas sobre la cámara, encima de los botones del estudio y sin taparlos (los botones de la derecha siguen tocables); un campo propio para escribir; tocar el mensaje **de otra persona** abre `PanelModerar`; los suyos no.
- `PanelModerar` (props: `nombre`, `alBorrar`, `alSilenciarTemporal`, `alSilenciarSala`, `alCerrar`): panel desde abajo con el nombre, "Tocaste su mensaje" y las tres opciones con los textos exactos; sin confirmación extra; tras cada una, `toast` con el aviso exacto.

- [ ] **Step 1: Pruebas que fallan** en `tests/e2e/chat-estudio.spec.ts` (proyecto `celular-camara`; agregar el nombre al patrón `CON_CAMARA` de `playwright.config.ts`):
  - `la feriante lee y responde`: Caro escribe en la sala → aparece en el estudio; Mica responde "sí, en 38, 40 y 42" → Caro lo ve con `✔`.
  - `borrar un mensaje`: Mica toca el de Caro → "Borrar este mensaje" → desaparece del estudio y de la sala de Luz; aviso "Borraste el mensaje.".
  - `silenciar 10 minutos`: → aviso con el nombre; el campo de Caro se desactiva.
  - `silenciar en mi sala`: → Caro ve "No podés escribir en esta sala.".
  - `sus mensajes no abren el panel`: tocar el propio no muestra "Borrar este mensaje".
  - `los ocultos no le aparecen`: Caro escribe un link → Mica no lo ve.
  - `los botones del estudio siguen andando con chat`: con 10 mensajes en pantalla, "Terminar" abre la confirmación.
- [ ] **Step 2: Correr y ver que fallan**: `npx playwright test tests/e2e/chat-estudio.spec.ts --project=celular-camara` → FAIL.
- [ ] **Step 3: Implementar.** La página del estudio carga `obtenerConfigChat` y `mensajesIniciales` del vivo abierto (si lo hay) y se los pasa a `EstudioVivo`; el chat se muestra solo en la fase "en-vivo".
- [ ] **Step 4: Correr**: el spec nuevo y `tests/e2e/estudio-vivo.spec.ts` → PASS; `typecheck`, `lint`, `npm test` → limpios.
- [ ] **Step 5: Commit**: `git commit -m "Sumar el chat y la moderación de un toque al estudio"`

---

### Task 6: "Personas silenciadas" en Mi puesto y "Cuentas para revisar" en /admin

**Files:**
- Modify: `src/app/mi-puesto/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/acciones.ts`
- Create: `src/app/mi-puesto/personas-silenciadas.tsx`, `src/app/admin/panel-cuentas.tsx`
- Test: `tests/e2e/mi-tienda.spec.ts` o un spec nuevo `tests/e2e/silenciadas.spec.ts`, y `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `silenciadas_de_mi_sala`, `quitarSilencio` (Tarea 5), `cuentas_para_revisar`, `silenciar_en_plataforma`, `quitar_silencio_plataforma` (Tarea 2).
- Produces:
  - En Mi puesto (con el puesto completo), sección **"Personas silenciadas"**: lista con nombre y "desde {fecha}", botón "Quitar silencio" por fila; vacía → "No silenciaste a nadie." *(Ubicación: debajo de las opciones del puesto.)*
  - En `admin/acciones.ts`: `silenciarEnPlataforma(userId: string): Promise<Resultado>`, `quitarSilencioPlataforma(userId: string): Promise<Resultado>`, `ultimosMensajes(userId: string): Promise<{ ok: true; mensajes: { body: string; hidden_reason: string | null; deleted: boolean; created_at: string; tienda: string }[] } | { ok: false; error: string }>` (últimos 20, incluidos ocultos y el texto original de los borrados desde `moderation_actions`).
  - En `/admin`, sección **"Cuentas para revisar"** entre "Vivos ahora" e "Invitaciones": cada cuenta con nombre, "Silenciada en {n} salas", "Ver mensajes" (despliega `ultimosMensajes`, con una marca "oculto" o "borrado") y "Silenciar en toda la plataforma" / "Quitar silencio de la plataforma". Vacía → "No hay cuentas para revisar."

- [ ] **Step 1: Pruebas que fallan**:
  - `la feriante quita un silencio`: con un silencio `sala` creado por `rpc`, Mi puesto lo lista; "Quitar silencio" lo saca y Caro vuelve a poder escribir (comprobar con `publicarPrueba` → `ok`).
  - `sin silenciadas`: → "No silenciaste a nadie.".
  - En `admin.spec.ts`, `la admin revisa y silencia una cuenta`: tres tiendas de prueba silencian a una compradora → aparece; "Ver mensajes" muestra uno oculto con su marca; "Silenciar en toda la plataforma" → `publicarPrueba` devuelve `silenciada`/`plataforma`; "Quitar silencio de la plataforma" lo deshace.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** los specs tocados → PASS; `typecheck`, `lint`, `npm test` → limpios.
- [ ] **Step 5: Commit**: `git commit -m "Mostrar las personas silenciadas y las cuentas para revisar"`

---

### Task 7: Documentación y verificación final

**Files:**
- Modify: `CLAUDE.md` (§8: las cinco tablas pasan a "Ya creadas — Fase 1, Parte 3", con `chat_config` y `chat_blocked_words` que se cambian por SQL; §11: sacar "Limitar la cantidad de señales…" y sumar "Términos y condiciones (Parte 5): decir que los mensajes del chat se guardan 30 días para resolver reclamos y después se borran"; §13: `src/lib/chat/` y `src/components/chat/` en el mapa)
- Modify: `tests/e2e/claves.spec.ts` (sin cambios de páginas, pero confirmar que sigue pasando con el chat)

- [ ] **Step 1: Editar CLAUDE.md** con lo anterior.
- [ ] **Step 2: Verificación completa**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integracion`, `npx playwright test` → todo PASS (anotar cualquier falla con su salida, sin darla por buena).
- [ ] **Step 3: Commit**: `git commit -m "Anotar la Parte 3 en la guía del proyecto"`
- [ ] **Step 4: Pruebas a mano en celulares reales** (las hace el dueño, spec §9): charlar desde varios celulares con un vivo real, medir el atraso feriante → chat, que el teclado no tape el campo ni los mensajes, y que tocar un mensaje en el estudio no corte la transmisión. Publicar recién después.
