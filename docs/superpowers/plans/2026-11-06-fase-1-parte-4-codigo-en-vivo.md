# Código en vivo y pagos (Fase 1, Parte 4) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la feriante cree códigos hablando (o a mano), que las compradoras los reclamen escribiéndolos en el chat con adjudicación atómica, que la ganadora elija la entrega, pague por alias e informe el pago con comprobante, y que la feriante confirme, rechace u ofrezca la prenda a otra al terminar el vivo; con Mis compras y los pedidos en Mi puesto.

**Architecture:** Todo el estado vive en PostgreSQL y **solo cambia por funciones `SECURITY DEFINER`** que validan quién llama y el estado de origen (como el chat). El reclamo se decide en `reclamar_codigo`, con bloqueo de la fila del código, llamada desde la Server Action del chat (`enviarMensaje`) después de que el texto pasa por `esReclamo` (TypeScript puro, probado con listas). Lo público del código (vendidos, última ganadora) está en columnas de `live_codes`, que llegan por Realtime a la sala y a la portada; lo privado (reclamos, pedidos) llega por Realtime filtrado por RLS solo a la compradora y a la dueña. La voz es una pieza aparte: un detector en el celular sobre la pista de audio del transmisor manda cada frase a una ruta del servidor que llama a Whisper de Cloudflare. El cobro pasa por `src/lib/payments/` con la interfaz `PaymentMethod` (primera implementación: alias).

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript estricto, Tailwind + `src/components/ui/`, Supabase (Postgres, RLS, Realtime, Storage, `pg_cron`), Drizzle, Vitest, Playwright, Cloudflare Workers AI (REST).

**Spec:** [docs/superpowers/specs/2026-11-06-fase-1-parte-4-codigo-en-vivo-design.md](../specs/2026-11-06-fase-1-parte-4-codigo-en-vivo-design.md) · capturas de la Parte 0 [04](../specs/fase-1-pantallas/04-ganaste-y-pago.png), [05](../specs/fase-1-pantallas/05-estudio-feriante.png), [06](../specs/fase-1-pantallas/06-tienda-panel-mis-compras.png)

## Global Constraints

- Textos en español rioplatense (voseo). Horas guardadas en UTC y mostradas en `America/Argentina/Tucuman`. Montos en **centavos enteros**; se muestran con `formatARS` (`src/lib/format/plata.ts`).
- Valores iniciales en la fila única de `code_config` (**nunca** constantes en el código): `plazo_minutos 15`, `cartel_ganadora_segundos 18`, `lista_espera_max 5`, `aceptar_casi false`, `voz_umbral_minimo 0.012`, `voz_previo_ms 600`, `voz_silencio_fin_ms 800`, `voz_maximo_ms 12000`, `voz_solape_ms 2000`, `voz_minimo_voz_ms 500`, `voz_segundos_por_dia 10800`. Solo `service_role` la lee; el servidor pasa a cada pantalla lo que necesita.
- Estados de pedido (`orders.status`), exactamente: `por_pagar`, `pago_informado`, `en_revision`, `pagado`, `vencido`, `anulado`. Motivo de anulación (`orders.cancel_reason`): `ofrecida_a_otra`, `codigo_anulado`, `reclamo_anulado`. **Falta** = pedido `vencido`, o `anulado` con motivo `ofrecida_a_otra` (se deriva; no hay tabla).
- Estados de reclamo (`claims.status`): `ganadora`, `espera`, `anulada`, `caducada`. Estados de código (`live_codes.status`): `activo`, `cerrado`, `anulado`.
- Errores de las funciones: `RAISE EXCEPTION '<codigo>' USING ERRCODE = 'P0001'` con códigos `sin_permiso`, `datos_invalidos`, `estado_invalido`, `palabra_repetida`, `cerrado`.
- Textos exactos de la sala: campo `Escribí un mensaje o un código…`; tarjeta `Escribilo en el chat`; cartel `🎉 {CÓDIGO} es de {nombre}`; lista `{nombre} llegó primero. Quedaste {n}.ª en la lista: si no paga a tiempo, es tuyo.`; agotado `Se agotó {CÓDIGO}.`; nombra el código `¿Lo querés? Escribí {CÓDIGO}`; casi `¿Quisiste escribir {CÓDIGO}? Escribilo de nuevo`; código anulado `La feriante anuló este código.`.
- Textos exactos del pago: título `¡Ganaste el código {CÓDIGO}!`; `Transferile a {feriante} este monto exacto:`; cuenta regresiva `Tenés {mm:ss} para pagar. Si no, pasa a la siguiente.`; envío a coordinar `el envío lo arreglás con la feriante`; botón `Ya pagué`; esperando `Le avisamos a {feriante}. Cuando confirme que le llegó la plata, lo vas a ver acá y en Mis compras.`; pagado `¡{feriante} confirmó tu pago!`; envío pagado `{feriante} te va a escribir por WhatsApp para coordinar`; en revisión `{feriante} no encuentra tu pago. Te va a escribir por WhatsApp para aclararlo.` (la tienda no tiene WhatsApp propio; la feriante tiene el de la compradora); Mis compras vacío `Cuando ganes un código, lo vas a ver acá.`.
- Textos exactos de la feriante: `Pagos para revisar ({n})`; aviso fijo `Antes de confirmar, revisá en tu banco que la plata haya llegado. Las capturas se pueden falsificar.`; botones `Confirmar pago`, `No me llegó el pago`, `Ofrecer a otra`, `Darle más tiempo` (opciones `+15 min`, `+1 hora`, `+24 horas`); indicador `🎤 Escuchando códigos`; botón `+ Nuevo código`; lanzar `Lanzar código {CÓDIGO} · {precio}`; menú `Cerrar código`, `Anular código`, `Ver quién lo ganó`, `Anular reclamo`; título fin `Pedidos de este vivo`.
- Tamaños de pedido: un pedido = una prenda de un código (pago por prenda). **No hay `order_items`.**
- Migraciones nuevas, nunca editar una aplicada: generadas con `npm run db:generate` y manuales con `npx drizzle-kit generate --custom --name=<nombre>`, con el estilo de `0008_seguridad_chat.sql` (`--> statement-breakpoint`, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` antes de cada `GRANT`). Las tablas nuevas no se exponen solas: permisos explícitos.
- Nunca imprimir `DATABASE_URL` ni claves: filtrar `db:generate`/`db:migrate` con `ForEach-Object { "$_" -replace 'postgres(ql)?://\S+','postgresql://[OCULTO]' }`. `CLOUDFLARE_AI_API_TOKEN` solo en archivos con `import "server-only"`.
- Sin dependencias nuevas. Commits chicos en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. En Windows, `git commit -F <archivo>` (las comillas en `-m` se rompen en PowerShell 5.1).
- Las pruebas comparten la base real: crean y borran sus propios usuarios, tiendas, vivos, códigos y pedidos.
- Context7 no está autorizado: para `supabase-js` seguir los usos de `src/components/chat/use-chat.ts` y `src/components/vivos/`; para Workers AI, la ruta de la prueba (`src/app/prueba-voz/transcribir/route.ts` en la rama `prueba-voz`).
- Todo lo que se toca mide al menos 44 px. Solo el panel "¡Ganaste!" tiene animación grande; el código nuevo aparece con un fundido corto; los paneles suben desde abajo.

## Review Focus

1. **Dos compradoras escriben el código en el mismo instante y hay una sola unidad** → exactamente una ganadora y la otra primera en la lista. Test: Tarea 2 (`reclamos simultáneos`).
2. **El plazo vence mientras la compradora está subiendo el comprobante** → si "Ya pagué" llega después del vencimiento, se rechaza con `estado_invalido` y la pantalla le dice que se le pasó el tiempo (no queda un pedido pagado y otra ganadora a la vez). Test: Tarea 3 (`informar después de vencer`) y Tarea 9 (texto `Se te pasó el tiempo para pagar.`).
3. **La feriante cambia su alias o su retiro después de que alguien ganó** → el pedido en curso sigue mostrando el alias con el que se ganó (copia en el pedido). Test: Tarea 3 (`el pedido guarda el alias`).
4. **La feriante dice dos veces el mismo código o lanza uno con una palabra ya usada en el vivo** → no se duplica (`palabra_repetida`; el cartel de voz no aparece). Test: Tarea 1 (`palabra repetida`) y Tarea 12 (`armarBorrador` con la palabra en usadas).
5. **Una compradora silenciada escribe el código** → gana igual y su mensaje no aparece en el chat. Test: Tarea 5 (`silenciada reclama`).

---

### Task 1: Tablas, configuración y lanzar / cerrar / anular códigos

**Files:**
- Modify: `src/db/schema.ts` (sección nueva "Código en vivo (Fase 1, Parte 4). Reglas en drizzle/0018_seguridad_codigos.sql")
- Create: `drizzle/0017_*.sql` (generada), `drizzle/0018_seguridad_codigos.sql` (`--custom --name=seguridad_codigos`)
- Create: `tests/integracion/codigos.test.ts`
- Modify: `tests/helpers/tiendas-prueba.ts`

**Interfaces:**
- Produces (tablas):
  - `code_config`: `id integer PK` (CHECK `id = 1`) con las columnas de Global Constraints (`integer NOT NULL`, salvo `voz_umbral_minimo real` y `aceptar_casi boolean`), CHECK `> 0` en los enteros. La migración inserta la fila 1. Solo `service_role`.
  - `stores.payment_minutes integer NULL` (CHECK entre 5 y 1440): el plazo propio de la feriante; nulo = el de `code_config`.
  - `live_codes`: `id uuid PK`, `live_session_id → live_sessions CASCADE`, `store_id → stores CASCADE`, `word text NOT NULL` (normalizada con `normalizarCodigo`), `label text NOT NULL` (como se muestra, en mayúsculas), `price_cents integer NOT NULL` (CHECK `> 0`), `quantity integer NOT NULL` (CHECK 1..99), `sold integer NOT NULL DEFAULT 0`, `photo_path text NULL`, `product_id uuid NULL → products SET NULL`, `by_voice boolean NOT NULL DEFAULT false`, `status text NOT NULL DEFAULT 'activo'` (CHECK), `last_winner_name text NULL`, `last_winner_at timestamptz NULL`, `created_at`, `closed_at`. UNIQUE `(live_session_id, word)`; índice único parcial "un solo activo por vivo" `(live_session_id) WHERE status = 'activo'`.
  - `claims`: `id uuid PK`, `code_id → live_codes CASCADE`, `user_id → users CASCADE`, `buyer_name text NOT NULL`, `message_id uuid NULL → chat_messages SET NULL`, `message_body text NOT NULL` (copia), `claimed_at timestamptz NOT NULL` (hora del servidor), `status text NOT NULL` (CHECK). UNIQUE `(code_id, user_id)`. Índice `(code_id, status, claimed_at)`.
  - `orders`: `id uuid PK`, `claim_id → claims CASCADE` UNIQUE, `code_id → live_codes CASCADE`, `store_id → stores CASCADE`, `live_session_id → live_sessions CASCADE`, `buyer_id → users CASCADE`, `buyer_name text NOT NULL`, `price_cents integer NOT NULL`, `delivery_kind delivery_kind NULL`, `shipping_cents integer NULL`, `total_cents integer NOT NULL`, `payment_alias text NOT NULL`, `payment_holder text NOT NULL` (copias), `buyer_whatsapp text NULL`, `status text NOT NULL DEFAULT 'por_pagar'` (CHECK), `cancel_reason text NULL` (CHECK), `deadline timestamptz NOT NULL`, `created_at`, `reported_at`, `confirmed_at`, `updated_at`. Índices `(store_id, status)`, `(buyer_id, created_at)`, `(status, deadline)`.
  - `payment_reports`: `id uuid PK`, `order_id → orders CASCADE`, `proof_path text NOT NULL`, `created_at`.
  - `voice_usage`: `store_id → stores CASCADE`, `day date`, `seconds real NOT NULL DEFAULT 0`, PK `(store_id, day)`. Solo `service_role`.
- Produces (funciones, `authenticated`, dueña vía `es_duena_de`):
  - `lanzar_codigo(p_vivo uuid, p_palabra text, p_etiqueta text, p_precio integer, p_cantidad integer, p_foto text, p_producto uuid, p_por_voz boolean) RETURNS live_codes`: vivo abierto de su puesto (si no, `cerrado`/`sin_permiso`); valida rangos (`datos_invalidos`); `p_foto` nula o con formato `<store_id>/codigos/<uuid>.(webp|jpg)`; cierra el activo anterior (`status 'cerrado'`, `closed_at`); palabra ya usada en el vivo → `palabra_repetida`.
  - `cerrar_codigo(p_codigo uuid) RETURNS void`: activo → cerrado.
  - `anular_codigo(p_codigo uuid) RETURNS void`: si algún pedido del código está `pago_informado`, `en_revision` o `pagado` → `estado_invalido`; si no, código `anulado`, pedidos `por_pagar` → `anulado`/`codigo_anulado`, reclamos `ganadora`/`espera` → `anulada`.
- Produces (RLS de lectura): `live_codes` SELECT para `anon, authenticated` con política "Códigos del vivo abierto" (vivo `ended_at IS NULL`) y "Mis códigos" (`es_duena_de(store_id)`). `claims`: SELECT "Mis reclamos" (`user_id = auth.uid()`) y "Reclamos de mi puesto" (dueña del código). `orders` y `payment_reports`: SELECT "Mis pedidos" (`buyer_id = auth.uid()`) y "Pedidos de mi puesto" (`es_duena_de(store_id)`). Nadie inserta/actualiza/borra directo. `ALTER PUBLICATION supabase_realtime ADD TABLE public.live_codes, public.claims, public.orders;`
- Produces (helpers en `tiendas-prueba.ts`): `borrarCodigosDeTienda(storeId: string): Promise<void>` (pedidos, informes, reclamos, códigos y comprobantes); `lanzarPrueba(cliente: SupabaseClient, vivoId: string, palabra: string, opciones?: { precio?: number; cantidad?: number }): Promise<{ id: string }>` (precio por defecto 800000, cantidad 1).

- [ ] **Step 1: Agregar tablas y columna a `schema.ts` y generar**: `npm run db:generate 2>&1 | <filtro>` → `drizzle/0017_<nombre>.sql` con los `CREATE TABLE` y el `ALTER TABLE stores`.
- [ ] **Step 2: Crear la migración manual vacía**: `npx drizzle-kit generate --custom --name=seguridad_codigos`.
- [ ] **Step 3: Pruebas que fallan** en `tests/integracion/codigos.test.ts` (armado como `chat.test.ts`: Mica con tienda completa, alias "mica.ropa" y titular "Micaela Díaz" en `store_private_info`, vivo abierto; compradoras Caro y Luz; `beforeEach` → `borrarCodigosDeTienda`):
  - `la feriante lanza un código y cualquiera lo lee`: `lanzar_codigo(vivo, "rojo", "ROJO", 800000, 1, null, null, false)` → la visitante lee `{ label: "ROJO", price_cents: 800000, sold: 0, status: "activo" }`.
  - `lanzar otro cierra el anterior`: tras lanzar AZUL, ROJO queda `cerrado` y hay un solo `activo`.
  - `palabra repetida`: (Review Focus 4) volver a lanzar "rojo" en el mismo vivo → `palabra_repetida`; en otro vivo se puede.
  - `solo la dueña lanza, cierra y anula`: Caro → `sin_permiso` en las tres.
  - `datos inválidos`: precio 0, cantidad 0 o 100, foto `otra-tienda/codigos/x.webp` → `datos_invalidos`.
  - `vivo cerrado`: tras `terminar_vivo` → `cerrado`; y la visitante ya no lee los códigos de ese vivo (la dueña sí).
  - `nadie escribe directo`: `insert`/`update` en `live_codes`, `claims`, `orders` desde Caro → error o sin cambios; `select` de `code_config` y `voice_usage` desde Caro → `[]` o error.
- [ ] **Step 4: Correr y ver que fallan**: `npm run test:integracion -- tests/integracion/codigos.test.ts` → FAIL (`Could not find the table 'public.live_codes'`).
- [ ] **Step 5: Escribir `0018_seguridad_codigos.sql`** (CHECKs, fila de `code_config`, funciones, permisos, políticas, publicación) según Interfaces.
- [ ] **Step 6: Aplicar**: `npm run db:migrate 2>&1 | <filtro> | Select-Object -Last 4` → sin errores.
- [ ] **Step 7: Correr y ver que pasan**: `npm run test:integracion` → PASS (también `chat`, `vivos`, `tiendas`).
- [ ] **Step 8: Commit**: `Crear las tablas del código en vivo y lanzar, cerrar y anular códigos`.

---

### Task 2: El reclamo atómico

**Files:**
- Create: `drizzle/0019_reclamar_codigo.sql` (`--custom --name=reclamar_codigo`)
- Test: `tests/integracion/codigos.test.ts`
- Modify: `tests/helpers/tiendas-prueba.ts`

**Interfaces:**
- Consumes: tablas de la Tarea 1.
- Produces: `reclamar_codigo(p_user uuid, p_codigo uuid, p_nombre text, p_mensaje uuid, p_texto text) RETURNS jsonb` — **solo `service_role`**. Bloquea la fila del código (`SELECT … FOR UPDATE`) y, en orden:
  1. código inexistente, no `activo` o de un vivo cerrado → `{"estado":"sin_codigo"}`;
  2. `p_user` es dueña del puesto → `{"estado":"propio"}`;
  3. ya tiene reclamo en ese código (cualquier estado) → `{"estado":"repetido"}`;
  4. `claimed_at` = `created_at` del mensaje `p_mensaje` si existe, si no `now()`;
  5. `sold < quantity` → reclamo `ganadora`, `sold + 1`, `last_winner_name = p_nombre`, `last_winner_at = now()`, y pedido `por_pagar` con `price_cents` y `total_cents` del código, copias de `payment_alias`/`payment_holder` de `store_private_info` y `deadline = now() + coalesce(stores.payment_minutes, plazo_minutos) minutos` → `{"estado":"ganaste","pedido":<id>}`;
  6. si no, y hay menos de `lista_espera_max` reclamos `espera` → reclamo `espera` → `{"estado":"lista","lugar":<n>,"ganadora":<last_winner_name>}`;
  7. si no → `{"estado":"agotado"}` (no se guarda nada).
- Produces (función interna, sin `GRANT`): `pasar_a_siguiente(p_codigo uuid) RETURNS void` — toma la primera `espera` por `claimed_at`, la pasa a `ganadora` y le crea su pedido (mismo armado del paso 5, plazo completo desde ahora, `last_winner_*` actualizados); si no hay nadie, `sold - 1`. La usan las Tareas 3 y 7.
- Produces (helper): `reclamarPrueba(userId: string, codigoId: string, nombre = "Prueba P."): Promise<Record<string, unknown>>` (con `clienteAdmin()`, `p_mensaje null`, `p_texto` = "ROJO").

- [ ] **Step 1: Pruebas que fallan**:
  - `la primera gana`: Caro reclama → `{ estado: "ganaste", pedido }`; Caro lee su pedido `{ status: "por_pagar", total_cents: 800000, payment_alias: "mica.ropa" }` con `deadline` ≈ ahora + 15 min; Luz → `{ estado: "lista", lugar: 1, ganadora: "Prueba P." }`; la visitante lee el código con `sold: 1` y `last_winner_name`.
  - `reclamos simultáneos`: (Review Focus 1) 20 compradoras de prueba reclaman en paralelo (`Promise.all`) un código de cantidad 1 → exactamente 1 `ganaste`, 5 `lista` (lugares 1 a 5) y 14 `agotado`; con cantidad 3 → exactamente 3 pedidos.
  - `una persona, un reclamo`: Caro reclama dos veces → la segunda `repetido`.
  - `la feriante no reclama lo suyo`: → `propio`.
  - `código cerrado`: → `sin_codigo`.
  - `plazo propio`: con `stores.payment_minutes = 30` → `deadline` ≈ ahora + 30 min.
  - `el navegador no reclama`: `caro.cliente.rpc("reclamar_codigo", …)` → error.
  - `privacidad`: Luz no lee el pedido ni el reclamo de Caro; Mica lee los dos.
- [ ] **Step 2: Correr y ver que fallan** (función inexistente).
- [ ] **Step 3: Escribir `0019_reclamar_codigo.sql`**.
- [ ] **Step 4: Aplicar y correr**: `npm run test:integracion -- tests/integracion/codigos.test.ts` → PASS.
- [ ] **Step 5: Commit**: `Adjudicar los reclamos de códigos en la base, sin dos ganadoras`.

---

### Task 3: El pedido: entrega, "Ya pagué", confirmar, rechazar, ofrecer a otra, más tiempo y vencimientos

**Files:**
- Create: `drizzle/0020_pedidos.sql` (`--custom --name=pedidos`)
- Test: `tests/integracion/pedidos.test.ts`

**Interfaces:**
- Consumes: `pasar_a_siguiente` (Tarea 2).
- Produces (compradora del pedido, `authenticated`; otra persona → `sin_permiso`; estado de origen distinto → `estado_invalido`):
  - `elegir_entrega(p_pedido uuid, p_tipo delivery_kind) RETURNS orders`: solo `por_pagar`; la opción tiene que estar `enabled` en `store_delivery_options` (si no, `datos_invalidos`); `shipping_cents` = costo si `shipping`/`fixed`, 0 si `free`, nulo si `arrange` o no es envío; `total_cents = price_cents + coalesce(shipping_cents, 0)`.
  - `informar_pago(p_pedido uuid, p_comprobante text, p_whatsapp text) RETURNS orders`: solo `por_pagar` **con `deadline > now()`** y entrega elegida; `p_comprobante` con formato `<buyer_id>/<pedido>/<uuid>.(webp|jpg)`; `p_whatsapp` con 8 a 15 dígitos (se guardan solo los dígitos); inserta `payment_reports`, pasa a `pago_informado`, `reported_at`.
  - `ultimo_whatsapp() RETURNS text`: el `buyer_whatsapp` de su pedido más reciente que lo tenga.
  - `datos_entrega(p_pedido uuid) RETURNS jsonb`: compradora o dueña; si el pedido no está `pagado` y quien llama es la compradora → `{}`; si no, según `delivery_kind`: `{"direccion","horarios"}` (de `store_private_info`) o `{"nota"}` (de `store_delivery_options`).
- Produces (dueña del puesto):
  - `confirmar_pago(p_pedido uuid)`: desde `pago_informado` o `en_revision` → `pagado`, `confirmed_at`.
  - `rechazar_pago(p_pedido uuid)`: `pago_informado` → `en_revision`.
  - `ofrecer_a_otra(p_pedido uuid)`: desde `por_pagar`, `pago_informado` o `en_revision` → `anulado`/`ofrecida_a_otra`, su reclamo `caducada`, y `pasar_a_siguiente`.
  - `dar_mas_tiempo(p_pedido uuid, p_minutos integer)`: solo `por_pagar`; `p_minutos` en (15, 60, 1440); `deadline = greatest(deadline, now()) + p_minutos`.
  - `anular_reclamo(p_reclamo uuid)`: reclamo `ganadora` con pedido `por_pagar`/`pago_informado`/`en_revision` → pedido `anulado`/`reclamo_anulado`, reclamo `anulada`, `pasar_a_siguiente`; reclamo `espera` → `anulada`.
- Produces (sistema): `vencer_pedidos() RETURNS integer` — solo `service_role`; cada `por_pagar` con `deadline <= now()` → `vencido`, su reclamo `caducada`, `pasar_a_siguiente`. `SELECT cron.schedule('vencer-pedidos', '* * * * *', $$SELECT public.vencer_pedidos()$$);`
- Produces (Storage): bucket privado `comprobantes` (`public false`, límite 5 MB, `image/webp`, `image/jpeg`). Políticas sobre `storage.objects`: INSERT y SELECT de la compradora en su carpeta (`foldername[1] = auth.uid()`); SELECT de la dueña si `foldername[2]` es un pedido de su puesto.

- [ ] **Step 1: Pruebas que fallan** en `tests/integracion/pedidos.test.ts` (Mica con retiro en domicilio "Av. Siempre Viva 742", envío fijo $2.500 y punto de encuentro; Caro gana ROJO con `reclamarPrueba`):
  - `elegir entrega suma el envío`: envío → `total_cents: 1050000`; retiro → `800000`; una forma deshabilitada → `datos_invalidos`; Luz → `sin_permiso`.
  - `ya pagué`: Caro sube un archivo a `comprobantes/<caro>/<pedido>/<uuid>.jpg` e informa con "381 555-1234" → `pago_informado`, `buyer_whatsapp: "3815551234"`; sin entrega elegida → `estado_invalido`; comprobante de otra carpeta → `datos_invalidos`.
  - `informar después de vencer`: (Review Focus 2) con `deadline` movido al pasado → `estado_invalido`.
  - `el pedido guarda el alias`: (Review Focus 3) Mica cambia su alias → el pedido de Caro sigue con "mica.ropa".
  - `la dirección recién al pagar`: `datos_entrega` de Caro → `{}` en `pago_informado`; tras `confirmar_pago` → `{ direccion: "Av. Siempre Viva 742", … }`.
  - `confirmar y rechazar`: solo Mica; `rechazar_pago` → `en_revision`; `confirmar_pago` desde `en_revision` → `pagado`; Caro → `sin_permiso`.
  - `ofrecer a otra`: con Luz en la lista → pedido de Caro `anulado`/`ofrecida_a_otra` y Luz tiene un pedido `por_pagar` con plazo completo; sin lista → `sold` vuelve a 0.
  - `vencer`: con `deadline` en el pasado, `vencer_pedidos()` (admin) → `vencido` y pasa a Luz; un `pago_informado` vencido no cambia.
  - `más tiempo`: `dar_mas_tiempo(…, 60)` suma una hora; 30 → `datos_invalidos`; sobre `pago_informado` → `estado_invalido`.
  - `anular reclamo`: Mica anula el de Caro → pasa a Luz.
  - `comprobantes privados`: Luz no puede leer el archivo de Caro; Mica sí (`createSignedUrl`); la visitante no.
  - `whatsapp anterior`: tras informar, `ultimo_whatsapp()` de Caro → "3815551234".
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Escribir `0020_pedidos.sql`** (funciones, bucket, políticas de Storage, `cron.schedule`).
- [ ] **Step 4: Aplicar y correr**: `npm run test:integracion` → PASS.
- [ ] **Step 5: Commit**: `Sumar el pago de los pedidos, la confirmación de la feriante y los vencimientos`.

---

### Task 4: Reglas en TypeScript: reconocer el reclamo, total del pedido y módulo de pagos

**Files:**
- Create: `src/lib/codigos/reclamo.ts`, `src/lib/codigos/reclamo.test.ts`, `src/lib/codigos/pedido.ts`, `src/lib/codigos/pedido.test.ts`, `src/lib/codigos/tipos.ts`, `src/lib/codigos/config.ts`
- Create: `src/lib/payments/tipos.ts`, `src/lib/payments/alias.ts`, `src/lib/payments/index.ts`, `src/lib/payments/alias.test.ts`

**Interfaces:**
- Produces (`reclamo.ts`, puro):
  - `normalizarCodigo(texto: string): string` — minúsculas, sin tildes, sin signos ni emojis, **tandas de 3 o más letras iguales reducidas a una** ("rojooo" → "rojo"; "ll" y "rr" quedan), espacios simples. Es la forma que se guarda en `live_codes.word`.
  - `type Lectura = "reclamo" | "nombra" | "casi" | "nada"`; `leerReclamo(texto: string, palabra: string): Lectura` — `palabra` ya normalizada. `reclamo`: el texto normalizado es la palabra, o la palabra más solo palabras de `PALABRAS_QUIERO` (`yo`, `quiero`, `lo`, `la`, `mio`, `mia`, `me`, `llevo`, `para`, `mi`), sin `?` en el original y con 4 palabras o menos; `nombra`: contiene la palabra como palabra entera pero no es reclamo; `casi`: no la contiene y alguna palabra del texto, **con todas las tandas de letras iguales reducidas a una** (igual que la palabra), queda a distancia de edición 0 o 1 de la palabra así reducida, siempre que la palabra tenga 4 letras o más; `nada` en otro caso.
- Produces (`pedido.ts`, puro): `totalPedido(precio: number, envio: number | null): number`; `restante(deadline: string, ahora: number): { ms: number; texto: string }` (`"14:52"`, nunca negativo).
- Produces (`tipos.ts`): `Codigo`, `Pedido`, `EstadoPedido`, `Reclamo`, `ConfigCodigo` con las columnas de la Tarea 1, y las constantes `CAMPOS_CODIGO`, `CAMPOS_PEDIDO`.
- Produces (`config.ts`, `server-only`): `obtenerConfigCodigo(): Promise<ConfigCodigo>` (como `obtenerConfigChat`).
- Produces (`src/lib/payments/`):
  - `tipos.ts`: `interface PaymentMethod { tipo: "alias"; datosParaPagar(pedido: PedidoParaPagar): DatosPago; confirmacion: "manual" | "automatica" }`, `type DatosPago = { tipo: "alias"; alias: string; titular: string; monto: number }`, `type PedidoParaPagar = { payment_alias: string; payment_holder: string; total_cents: number }`.
  - `alias.ts`: `metodoAlias: PaymentMethod` (`confirmacion: "manual"`).
  - `index.ts`: `metodoDePago(): PaymentMethod` (hoy devuelve `metodoAlias`). Las pantallas solo usan `metodoDePago()`.

- [ ] **Step 1: Pruebas que fallan** en `reclamo.test.ts`, con palabra `"rojo"`:
  - `SIEMPRE_RECLAMO`: `"ROJO"`, `"rojo!!"`, `"Rojo 🙋‍♀️"`, `"rojooo"`, `"quiero ROJO"`, `"lo quiero rojo"`, `"yo rojo"`, `"ROJO mío"`, `"me lo llevo rojo"`, `"rojo para mi"` → `"reclamo"`.
  - `NUNCA_RECLAMO`: `"¿el rojo qué talle es?"`, `"me encanta el rojo, ¿viene en 40?"`, `"rojo?"`, `"hay rojo en M"`, `"el rojo me queda chico seguro jaja"` → `"nombra"`; `"lo quiero"`, `"hola chicas"`, `"rojito"` → `"nada"`.
  - `CASI`: `"rjo"` con palabra `"rojo"` → `"casi"`; con palabra `"amarillo"`: `"amarlllo"` → `"casi"` (normalizado "amarlo", distinto de "amarillo"; reducidos "amarlo" y "amarilo" están a 1), `"amarilo"` → `"casi"` (reducidos iguales), `"amarillo"` → `"reclamo"`, `"blanco"` → `"nada"`; con palabra `"sol"` (3 letras): `"sal"` → `"nada"`.
  - `normalizarCodigo("¡MARIPOSA!")` → `"mariposa"`.
- [ ] **Step 2: Pruebas que fallan** en `pedido.test.ts` (`totalPedido(800000, 250000)` → `1050000`; `totalPedido(800000, null)` → `800000`; `restante` con 892 s → `"14:52"`, con −5 s → `{ ms: 0, texto: "0:00" }`) y en `alias.test.ts` (`metodoDePago().datosParaPagar({ payment_alias: "mica.ropa", payment_holder: "Micaela Díaz", total_cents: 1050000 })` → `{ tipo: "alias", alias: "mica.ropa", titular: "Micaela Díaz", monto: 1050000 }`).
- [ ] **Step 3: Correr y ver que fallan**: `npx vitest run src/lib/codigos src/lib/payments` → FAIL.
- [ ] **Step 4: Implementar** los archivos de Interfaces.
- [ ] **Step 5: Correr y ver que pasan.**
- [ ] **Step 6: Commit**: `Reconocer reclamos en el chat y armar el módulo de pagos con el modo alias`.

---

### Task 5: Reclamar desde el chat

**Files:**
- Modify: `src/app/tienda/[handle]/vivo/acciones.ts`
- Modify: `src/components/chat/use-chat.ts`, `src/components/chat/chat-sala.tsx`
- Test: `tests/integracion/codigos.test.ts` (acción), `tests/e2e/chat-sala.spec.ts` (sin regresiones)

**Interfaces:**
- Consumes: `leerReclamo`, `normalizarCodigo` (Tarea 4), `reclamar_codigo` (Tarea 2).
- Produces: `ResultadoEnvio` suma el campo opcional `reclamo?: ResultadoReclamo` con `type ResultadoReclamo = { estado: "ganaste"; pedido: string } | { estado: "lista"; lugar: number; ganadora: string } | { estado: "agotado" | "repetido" | "propio" } | { estado: "pista"; tipo: "nombra" | "casi"; codigo: string }` (exportado desde `src/lib/codigos/tipos.ts`).
- Produces: `enviarMensaje(vivoId, texto)` — después de leer el vivo, busca el código `activo` del vivo (con `admin`). Si `leerReclamo` da `reclamo` (o `casi` con `aceptar_casi` en `true`):
  - **no silenciada**: publica como hoy y, si quedó `ok`, llama `reclamar_codigo(userId, codigo.id, nombreCorto, mensaje.id, limpio)`; si el mensaje quedó oculto como `repetido`, igual reclama (devuelve `repetido`).
  - **silenciada**: no publica; llama `reclamar_codigo` con `p_mensaje null`; devuelve `{ ok: false, motivo: "silenciada", silencio, reclamo }`.
  - **ráfaga**: no reclama.
  - si da `nombra` o `casi`: publica como hoy y devuelve `reclamo: { estado: "pista", tipo, codigo: label }`. Cada `casi` se registra con `console.info("Código casi acertado", { codigo, texto })` (el registro que pide la spec §5.2; *sin tabla nueva: decisión del plan, se lee en los logs de Vercel*).
- Produces (sala): `useChat` expone `ultimoReclamo: ResultadoReclamo | null`; `ChatSala` cambia el placeholder a `Escribí un mensaje o un código…` y, si la compradora está silenciada y hay código activo, muestra el campo con placeholder `Escribí el código` (los mensajes de silenciadas solo sirven como reclamo).

- Produces: `procesarReclamo(admin: SupabaseClient, datos: { userId: string; vivoId: string; nombre: string; texto: string; mensajeId: string | null; estadoChat: "ok" | "repetido" | "silenciada" | "rafaga" }): Promise<ResultadoReclamo | null>` en `src/lib/codigos/reclamar.ts` (`server-only`); `enviarMensaje` la llama. Las pruebas de integración la llaman con `clienteAdmin()` (una Server Action no se puede llamar desde Vitest).

- [ ] **Step 1: Pruebas que fallan** en `codigos.test.ts`, publicando con `publicarPrueba` y llamando a `procesarReclamo`:
  - `reclamo desde el chat`: Caro manda "ROJO!!" → `reclamo.estado: "ganaste"` y el mensaje está publicado.
  - `pregunta no reclama`: "¿el rojo qué talle es?" → `reclamo: { estado: "pista", tipo: "nombra", codigo: "ROJO" }` y no hay reclamo en la base.
  - `silenciada reclama`: (Review Focus 5) Caro silenciada en la sala → `reclamo.estado: "ganaste"`, sin mensaje nuevo en `chat_messages`.
  - `repetido`: dos "ROJO" → el segundo `repetido`, un solo reclamo.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** acción, `useChat` y `ChatSala`.
- [ ] **Step 4: Correr**: integración PASS y `npx playwright test tests/e2e/chat-sala.spec.ts --workers=1` PASS.
- [ ] **Step 5: Commit**: `Reclamar códigos escribiéndolos en el chat`.

---

### Task 6: Estudio: crear un código a mano y el código activo

**Files:**
- Create: `src/components/codigos/panel-codigo.tsx` (el cartel para lanzar; lo reutiliza la voz), `src/components/codigos/codigo-activo.tsx`, `src/components/codigos/use-codigos-vivo.ts`
- Create: `src/app/mi-puesto/vivo/acciones-codigos.ts` (Server Actions: `lanzarCodigo`, `cerrarCodigo`, `anularCodigo`, `anularReclamo`)
- Modify: `src/lib/fotos/rutas.ts` (`CarpetaFoto` suma `"codigos"`), `src/components/vivos/estudio-vivo.tsx`, `src/app/mi-puesto/vivo/page.tsx`
- Test: `tests/e2e/codigo-estudio.spec.ts`

**Interfaces:**
- Consumes: `lanzar_codigo`, `cerrar_codigo`, `anular_codigo`, `anular_reclamo`; `normalizarCodigo`; `subirFoto` (o una variante `subirFotoDeVideo(storeId, blob)` que reutiliza `comprimirFoto` con un `File` armado del cuadro del video).
- Produces: `PanelCodigo({ inicial, productos, alLanzar, alCerrar }: { inicial: Borrador; productos: ProductoResumen[]; alLanzar(b: Borrador): Promise<void>; alCerrar(): void })` con `type Borrador = { foto: Blob | null; precio: number | null; palabra: string; cantidad: number; productoId: string | null; porVoz: boolean }`. Precio con teclado numérico (`inputMode="numeric"`), palabra en mayúsculas automáticas, cantidad con − / + (1 a 99), botón `Lanzar código {CÓDIGO} · {precio}` deshabilitado sin precio o sin palabra, ✕ para descartar, "O elegí uno de tus productos" que completa foto, precio y cantidad.
- Produces: `fotoDelVideo(video: HTMLVideoElement): Promise<Blob | null>` en `src/lib/codigos/foto-video.ts`.
- Produces: `useCodigosVivo(vivoId: string, inicial: Codigo[]): { activo: Codigo | null; codigos: Codigo[] }` (Realtime `live_codes` filtrado por `live_session_id`; lo usan estudio y sala).
- `CodigoActivo` muestra `Código {CÓDIGO} · {vendidos} de {cantidad} vendidos` (o `Agotado`) y el menú de Global Constraints; "Ver quién lo ganó" lista los reclamos `ganadora` y `espera` del código (la dueña los lee por RLS) con `Anular reclamo`.

- [ ] **Step 1: Prueba e2e que falla** `tests/e2e/codigo-estudio.spec.ts` (Mica en el estudio con cámara falsa de Playwright, como `estudio-vivo.spec.ts`): sale en vivo, toca `+ Nuevo código`, escribe 8000 y "rojo", toca `Lanzar código ROJO · $8.000` → ve `Código ROJO · 0 de 1 vendidos`; con un reclamo de Caro (`reclamarPrueba`) pasa a `Agotado`; `Ver quién lo ganó` muestra a Caro; `Anular reclamo` la saca; `Anular código` deja la barra vacía; lanzar otra vez "rojo" muestra `Ya usaste ROJO en este vivo.`.
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr**: `npx playwright test tests/e2e/codigo-estudio.spec.ts tests/e2e/estudio-vivo.spec.ts --workers=1` → PASS.
- [ ] **Step 5: Commit**: `Crear códigos a mano desde el estudio y manejar el código activo`.

---

### Task 7: Sala: tarjeta del código, cartel de la ganadora y respuestas al reclamo

**Files:**
- Create: `src/components/codigos/tarjeta-codigo.tsx`, `src/components/codigos/cartel-ganadora.tsx`, `src/components/codigos/aviso-reclamo.tsx`
- Modify: `src/components/vivos/sala-vivo.tsx`, `src/app/tienda/[handle]/vivo/page.tsx`, `src/components/vivos/tarjeta-vivo.tsx`, `src/lib/vivos/datos.ts` (la portada trae el código activo), `src/components/vivos/vivos-ahora.tsx`
- Test: `tests/e2e/codigo-sala.spec.ts`, `tests/e2e/inicio.spec.ts`

**Interfaces:**
- Consumes: `useCodigosVivo` (Tarea 6), `ultimoReclamo` (Tarea 5), `cartel_ganadora_segundos` (pasado desde la página).
- `TarjetaCodigo` entre el chat y el campo: foto (`urlFoto(path, "chica")`), código en limón, precio, `Quedan {n}` o `Agotado`, `Escribilo en el chat`; aparece con fundido corto.
- `CartelGanadora`: cuando cambia `last_winner_at` del código activo, muestra `🎉 {CÓDIGO} es de {nombre}` durante `cartel_ganadora_segundos`; un cambio nuevo reemplaza al anterior y reinicia el tiempo.
- `AvisoReclamo` (solo para quien escribió): `lista` → texto de lista; `agotado` → `Se agotó {CÓDIGO}.`; `pista` → `¿Lo querés? Escribí {CÓDIGO}` o `¿Quisiste escribir {CÓDIGO}? Escribilo de nuevo`; se va a los 6 s. `ganaste` lo maneja la Tarea 8. Si el código pasa a `anulado` y la compradora lo había ganado: `La feriante anuló este código.`.
- Portada: `VivoEnPortada` suma `codigo: { label: string; price_cents: number } | null`; la tarjeta lo muestra debajo del nombre. `VivosAhora` suma al mismo canal `postgres_changes` de `INSERT` y `UPDATE` en `live_codes` → `recargar()` (el mismo que ya usa para los vivos).

- [ ] **Step 1: Prueba e2e que falla** `codigo-sala.spec.ts`: con un vivo de Mica y ROJO lanzado por `lanzarPrueba`, Caro y Luz en dos páginas: las dos ven la tarjeta `ROJO` `$8.000`; Caro escribe "rojo" → las dos ven `🎉 ROJO es de` y el nombre de Caro; Luz escribe "ROJO" → ve `llegó primero. Quedaste 1.ª en la lista`; Luz escribe "¿el rojo qué talle?" → ve `¿Lo querés? Escribí ROJO`; el cartel desaparece pasado el tiempo (`page.clock`). En `inicio.spec.ts`: la tarjeta del vivo muestra `ROJO` y `$8.000`.
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** las dos specs más `sala-vivo.spec.ts` → PASS.
- [ ] **Step 5: Commit**: `Mostrar el código en la sala y en la portada, con la ganadora a la vista`.

---

### Task 8: Ganar y pagar (compradora)

**Files:**
- Create: `src/components/codigos/panel-pago.tsx`, `src/components/codigos/use-mis-pedidos.ts`, `src/app/pedidos/acciones.ts` (Server Actions `elegirEntrega`, `informarPago`, `datosEntrega`)
- Create: `src/lib/codigos/comprobante.ts` (sube al bucket `comprobantes`, reutilizando `comprimirFoto`, ruta `<buyer>/<pedido>/<uuid>.<ext>` solo con el tamaño grande)
- Modify: `src/components/vivos/sala-vivo.tsx`
- Test: `tests/e2e/pago.spec.ts`

**Interfaces:**
- Consumes: funciones de la Tarea 3, `metodoDePago()` y `restante` (Tarea 4).
- Produces: `useMisPedidos(userId: string | null): Pedido[]` (Realtime `orders` filtrado por `buyer_id`; lo reutiliza Mis compras).
- Produces: `PanelPago({ pedido, tienda, opciones, alCerrar })` con los pasos de la spec §6 y los textos de Global Constraints:
  1. **Ganaste**: festejo animado (solo la primera vez que se abre), foto, precio, puesto, formas de entrega habilitadas (retiro muestra la zona, no la dirección), total, alias con `Copiar` (`navigator.clipboard`), titular, monto, cuenta regresiva y `Ya pagué` (deshabilitado sin entrega).
  2. **Comprobante y WhatsApp**: subir captura (obligatoria), WhatsApp precargado con `ultimo_whatsapp()`, botón `Enviar`. Si la base responde `estado_invalido` porque venció: `Se te pasó el tiempo para pagar.`.
  3. **Esperando confirmación**, 4. **Pagado** con `datos_entrega`, y **En revisión** con su texto de Global Constraints (sin link: la tienda no tiene WhatsApp propio, así que escribe la feriante).
- El panel se abre solo cuando llega un pedido `por_pagar` nuevo de la compradora en ese vivo (por `ultimoReclamo` o por Realtime al pasarle una prenda de la lista).

- [ ] **Step 1: Prueba e2e que falla** `pago.spec.ts`: Caro gana ROJO en la sala → ve `¡Ganaste el código ROJO!`, el alias `mica.ropa`, `Tenés 1` (cuenta regresiva); `Ya pagué` deshabilitado hasta elegir `Envío` → total `$10.500`; sube `tests/e2e/fotos` (imagen de prueba existente) y WhatsApp → ve `Le avisamos a`; Mica confirma con `confirmar_pago` → Caro ve `confirmó tu pago!`. Segundo caso: con `deadline` vencido antes de enviar → `Se te pasó el tiempo para pagar.`.
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit**: `Panel para pagar el código ganado con alias, entrega y comprobante`.

---

### Task 9: Mis compras

**Files:**
- Modify: `src/app/mis-compras/page.tsx`
- Create: `src/components/codigos/lista-mis-compras.tsx`
- Test: `tests/e2e/mis-compras.spec.ts`

**Interfaces:**
- Consumes: `useMisPedidos`, `PanelPago` (Tarea 8).
- Página con sesión (sin sesión: el botón de entrar, como `/cuenta`); lista del más nuevo arriba con foto, puesto, código, monto y estado: `Por pagar` (con cuenta regresiva y `Ver datos para pagar`, que abre `PanelPago`), `Esperando confirmación`, `En revisión` (con su texto), `Pagado` (con los datos de entrega), `Vencido` y `Anulado` en gris. Vacío: `Cuando ganes un código, lo vas a ver acá.`.

- [ ] **Step 1: Prueba e2e que falla**: Caro con un pedido en cada estado (armados con las funciones) ve los seis estados; `Ver datos para pagar` abre el panel; sin pedidos ve el texto vacío.
- [ ] **Step 2–4: Fallar, implementar, pasar.**
- [ ] **Step 5: Commit**: `Mis compras con el estado de cada pedido`.

---

### Task 10: La feriante revisa los pagos y configura su plazo

**Files:**
- Create: `src/components/codigos/pedidos-vivo.tsx` (lista agrupada por compradora, con acciones), `src/components/codigos/use-pedidos-puesto.ts`, `src/app/mi-puesto/pedidos/page.tsx`, `src/app/mi-puesto/pedidos/acciones.ts` (`confirmarPago`, `rechazarPago`, `ofrecerAOtra`, `darMasTiempo`, `urlComprobante`)
- Modify: `src/components/vivos/estudio-vivo.tsx` (contador `Pagos para revisar ({n})` y `PantallaFin` → `Pedidos de este vivo`), `src/app/mi-puesto/page.tsx` (botón `Pedidos`), `src/app/mi-puesto/tienda/secciones.tsx` y su acción (plazo en "Cómo cobrás": opciones 15 min, 30 min, 1 hora, 2 horas, hasta 24 horas → `payment_minutes`)
- Test: `tests/e2e/pedidos-feriante.spec.ts`, `tests/e2e/mi-tienda.spec.ts`

**Interfaces:**
- Consumes: funciones de la Tarea 3; `useCodigosVivo`.
- `urlComprobante(pedido)`: Server Action que verifica que quien llama es la dueña y devuelve `createSignedUrl(path, 60)`.
- `PedidosVivo({ storeId, vivoId? })`: agrupa por `buyer_id`; cada compradora con nombre, WhatsApp (link `https://wa.me/549{número}` si tiene 10 dígitos; si no, `https://wa.me/{número}`) y sus prendas (foto, código, monto, entrega, estado, comprobante que se agranda al tocar). Aviso fijo arriba. Acciones según estado: `pago_informado` → `Confirmar pago` y `No me llegó el pago`; `en_revision` → `Confirmar pago` y `Ofrecer a otra`; `por_pagar` → `Darle más tiempo` (+15 min, +1 hora, +24 horas) y `Ofrecer a otra`.
- El contador del estudio cuenta pedidos `pago_informado` del vivo y abre `PedidosVivo` en un panel desde abajo.
- `/mi-puesto/pedidos`: `PedidosVivo` sin `vivoId`, agrupado además por vivo (el más nuevo arriba). Solo lista; sin totales.

- [ ] **Step 1: Pruebas e2e que fallan**: con Caro en `pago_informado`, Mica ve `Pagos para revisar (1)` en el estudio; al terminar el vivo ve `Pedidos de este vivo` con Caro, el aviso del banco y el comprobante; `No me llegó el pago` → `En revisión`; `Ofrecer a otra` con Luz en la lista → Luz pasa a tener `Por pagar`; en `/mi-puesto/pedidos` está el vivo con sus pedidos. En `mi-tienda.spec.ts`: elegir `30 min` y guardar → `payment_minutes = 30`.
- [ ] **Step 2–4: Fallar, implementar, pasar** (más `estudio-vivo.spec.ts` sin regresiones).
- [ ] **Step 5: Commit**: `Pedidos del vivo para la feriante: confirmar, rechazar, ofrecer a otra y más tiempo`.

---

### Task 11: La voz, del lado del servidor y la lógica pura

**Files:**
- Create: `src/lib/voz/entender.ts`, `src/lib/voz/entender.test.ts` (traídos de la rama `prueba-voz`: `git show prueba-voz:src/app/prueba-voz/entender.ts`), `src/lib/voz/wav.ts`, `src/lib/voz/wav.test.ts`, `src/lib/voz/detector.ts`, `src/lib/voz/detector.test.ts`, `src/lib/voz/fantasmas.ts`, `src/lib/voz/whisper.ts` (`server-only`)
- Create: `src/app/mi-puesto/vivo/voz/route.ts`
- Modify: `.env.example` (`CLOUDFLARE_AI_API_TOKEN=`), `tests/e2e/claves.spec.ts` (suma el nombre a las claves que no pueden aparecer)
- Test: `tests/integracion/voz.test.ts`

**Interfaces:**
- Produces: `entender(texto: string): { precio: number | null; codigo: string | null }` (precio en **pesos**; quien lo usa multiplica por 100), con los casos de la prueba más: `"¡Gracias!"` → nulos.
- Produces: `esFantasma(texto: string): boolean` — normalizado, es una de `"gracias"`, `"muchas gracias"`, `"gracias por ver"`, `"gracias por ver el video"`, `"suscribete"`, `"subtitulos realizados por la comunidad de amara.org"`, o queda vacío.
- Produces: `aWav(muestras: Float32Array, tasaOrigen: number): Blob` (16 kHz mono 16 bits, como la prueba).
- Produces: `class DetectorVoz` en `detector.ts`, puro, sin Web Audio: `constructor(config: { umbralMinimo; previoMs; silencioFinMs; maximoMs; solapeMs; minimoVozMs }, tasa: number, alFrase: (muestras: Float32Array, inicioMs: number) => void)`; `procesar(bloque: Float32Array, ahoraMs: number): "esperando" | "escuchando"`. Umbral adaptativo `max(umbralMinimo, ruido * 2.5)`; una frase se entrega solo si sumó al menos `minimoVozMs` de bloques con voz; corta en `silencioFinMs` sin voz o a `maximoMs` (la siguiente arranca con los últimos `solapeMs`).
- Produces: `transcribir(audio: ArrayBuffer): Promise<string>` en `whisper.ts` — `@cf/openai/whisper-large-v3-turbo`, cuerpo JSON `{ audio: base64, language: "es", vad_filter: true, initial_prompt: "Precio y código de una prenda en un vivo de ventas. Por ejemplo: ocho mil pesos, código rojo." }`; lee `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_AI_API_TOKEN`; error claro si faltan.
- Produces: `POST /mi-puesto/vivo/voz?vivo=<id>` con el WAV en el cuerpo: sesión obligatoria (401), dueña de un vivo **abierto** con ese id (403), cuerpo de 1 B a 1 MB y `audio/wav` (400), segundos del día del puesto en `voice_usage` menores que `voz_segundos_por_dia` (429 `{ error: "limite" }`); suma los segundos (largo del WAV / 32000) a `voice_usage`; responde `{ texto: string }` (vacío si `esFantasma`).

- [ ] **Step 1: Pruebas unitarias que fallan**: `entender` (casos de la prueba más fantasmas); `esFantasma`; `aWav` (cabecera `RIFF`, 16000 Hz, largo correcto para 1 s a 48 kHz); `DetectorVoz` con bloques sintéticos (silencio → nada; 300 ms de voz y pausa → nada por `minimoVozMs`; 1,5 s de voz y 900 ms de silencio → una frase con el audio previo incluido; 13 s de voz seguida → frase a los 12 s y la siguiente empieza con 2 s de solape).
- [ ] **Step 2: Prueba de integración que falla** `voz.test.ts` (con un WAV de 0,5 s de silencio): sin sesión → 401; Caro (no dueña) → 403; Mica con el vivo cerrado → 403; Mica con vivo abierto → 200 `{ texto: "" }` y `voice_usage` sumó ≈ 0,5 s; con `voice_usage` del día en el límite → 429. La ruta delega en `atenderVoz(request: Request, deps: { userId: string | null; admin: SupabaseClient; transcribir(audio: ArrayBuffer): Promise<string> }): Promise<Response>` de `src/lib/voz/atender.ts` (`server-only`); la prueba la llama con `clienteAdmin()` y un `transcribir` falso que devuelve `""`, así no depende de Cloudflare ni de la clave.
- [ ] **Step 3: Correr y ver que fallan.**
- [ ] **Step 4: Implementar** y sumar la clave a `.env.example` y a `claves.spec.ts`.
- [ ] **Step 5: Correr**: unitarias, integración y `npx playwright test tests/e2e/claves.spec.ts --workers=1` → PASS.
- [ ] **Step 6: Commit**: `Entender la voz de la feriante con Whisper de Cloudflare, del lado del servidor`.

---

### Task 12: La voz en el estudio

**Files:**
- Modify: `src/lib/vivos/transmisor.ts` (exponer el audio)
- Create: `src/components/codigos/use-voz.ts`, `src/components/codigos/indicador-voz.tsx`
- Modify: `src/components/vivos/estudio-vivo.tsx`, `src/app/mi-puesto/vivo/page.tsx` (pasa la config de voz)
- Test: `src/components/codigos/use-voz.test.ts` (lógica de armado del borrador, sin micrófono), `tests/e2e/codigo-estudio.spec.ts`

**Interfaces:**
- Consumes: `DetectorVoz`, `aWav`, `entender` (Tarea 11), `PanelCodigo` y `fotoDelVideo` (Tarea 6), `useCodigosVivo`.
- Produces (`transmisor.ts`): `Transmisor` suma `pistaDeAudio(): MediaStreamTrack | null` y `alCambiarAudio(fn: (pista: MediaStreamTrack | null) => void): () => void` (avisa cuando renueva la pista del micrófono). La voz nunca para, pausa ni silencia la pista: solo la lee con un `AudioContext` propio.
- Produces: `useVoz({ transmisor, video, vivoId, config, palabrasUsadas, activa }): { estado: "apagada" | "esperando" | "escuchando" | "sin-servicio"; borrador: Borrador | null; descartar(): void }`. Por cada frase: guarda la foto del momento de inicio (`fotoDelVideo`), manda el WAV a la ruta y, si `entender` trae código, arma el `Borrador` (`porVoz: true`, `precio` en centavos o nulo, `cantidad: 1`). Si la palabra normalizada ya está en `palabrasUsadas`, no arma nada. Un borrador nuevo reemplaza al anterior. Tres errores seguidos de la ruta → `sin-servicio` (el indicador lo dice y queda `+ Nuevo código`). 429 → `apagada` con el aviso `Llegaste al límite de voz de hoy. Usá + Nuevo código.`.
- Produces: `armarBorrador(texto: string, foto: Blob | null, usadas: ReadonlySet<string>): Borrador | null` (pura, exportada para la prueba).
- `IndicadorVoz`: `🎤 Escuchando códigos` con interruptor para apagar y prender (arranca prendido); punto rojo mientras `escuchando`.

- [ ] **Step 1: Prueba unitaria que falla** de `armarBorrador`: `"se la llevan por ocho mil con el código rojo"` → `{ palabra: "ROJO", precio: 800000, cantidad: 1, porVoz: true }`; `"código luna"` → precio `null`; `"hola chicas"` → `null`; con `"rojo"` en usadas → `null`.
- [ ] **Step 2: Prueba e2e que falla** en `codigo-estudio.spec.ts`: el estudio muestra `🎤 Escuchando códigos` al salir en vivo y el interruptor lo apaga y lo prende. *El audio real no se simula en Playwright (el micrófono falso de Chrome emite pitidos): el camino frase → cartel queda cubierto por `armarBorrador` (Step 1, incluido `no repite códigos`) y por la prueba en celulares reales (Tarea 13).*
- [ ] **Step 3: Correr y ver que fallan.**
- [ ] **Step 4: Implementar.**
- [ ] **Step 5: Correr** unitarias y `codigo-estudio.spec.ts`, `estudio-vivo.spec.ts` → PASS.
- [ ] **Step 6: Commit**: `Crear códigos con la voz desde el estudio, sin tocar la transmisión`.

---

### Task 13: Cierre: guía, prueba de punta a punta completa y verificación

**Files:**
- Create: `tests/e2e/codigo-completo.spec.ts`
- Modify: `CLAUDE.md` (§4: `CLOUDFLARE_AI_API_TOKEN` y Whisper; §8: tablas de la Parte 4 pasan a "Ya creadas" con `code_config`; §10: estado; §11: balance de ventas a la Fase 2, códigos casi acertados a definir con las feriantes, cargar la clave de IA en Production, probar la voz en iPhone; §13: carpetas `codigos/`, `payments/`, `voz/` y direcciones `/mi-puesto/pedidos`)

- [ ] **Step 1: Prueba de punta a punta** `codigo-completo.spec.ts` (los flujos críticos de CLAUDE.md §12): Mica lanza ROJO a mano; Caro y Luz lo escriben; Caro gana y Luz queda 1.ª; Caro elige retiro, informa el pago con comprobante; Mica termina el vivo y confirma; Caro ve la dirección en Mis compras; el pedido de otra compradora vence (con `vencer_pedidos()` tras mover el plazo) y pasa a Luz.
- [ ] **Step 2: Correr todo**: `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npm run test:integracion`, `npx playwright test --workers=1` → todo PASS (anotar las pruebas que fallen por la base compartida y repetirlas aisladas).
- [ ] **Step 3: Actualizar `CLAUDE.md`.**
- [ ] **Step 4: Commit**: `Prueba completa del código en vivo y guía actualizada`.
- [ ] **Step 5: Pasos manuales para el dueño** (no los hace el constructor): cargar `CLOUDFLARE_AI_API_TOKEN` en Vercel para **Production**; probar en celulares reales Android e iPhone (spec §13): un vivo creando códigos por voz con la prenda en las manos, reclamos desde varios celulares, una transferencia real de prueba confirmada.
