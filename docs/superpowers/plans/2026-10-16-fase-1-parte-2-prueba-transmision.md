# Prueba de transmisión desde el celular · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página oculta `/prueba-vivo`, solo para administradores, que transmite desde el navegador del celular a Cloudflare Stream por WebRTC (WHIP) y la muestra en otro celular (WHEP), midiendo atraso y cortes.

**Architecture:** La conexión con la API de Cloudflare es una función pura (`src/lib/vivos/cloudflare.ts`) que recibe credenciales y `fetch`; un archivo `server-only` la alimenta con las variables de entorno. El navegador negocia WHIP/WHEP con funciones propias (sin librerías) y registra los eventos de conexión en una lista que una función pura convierte en resumen. La pantalla es descartable; lo de `src/lib/vivos/` se reutiliza en la sala.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript estricto, Tailwind + componentes de `src/components/ui/`, Vitest, API REST de Cloudflare Stream, `RTCPeerConnection` nativo.

**Spec:** [docs/superpowers/specs/2026-10-16-fase-1-parte-2-prueba-transmision-design.md](../specs/2026-10-16-fase-1-parte-2-prueba-transmision-design.md)

## Global Constraints

- Textos de pantalla en español rioplatense (voseo).
- `CLOUDFLARE_STREAM_API_TOKEN` solo en el servidor: ningún archivo con `"use client"` importa de `src/lib/vivos/config.ts` ni de `cloudflare.ts`. Los mensajes de error nunca incluyen la llave.
- La URL para transmitir (WHIP) es una credencial: solo se entrega si `es_admin` es `true`.
- Nombre de la transmisión en Cloudflare: exactamente `prueba-vivo`.
- Reconexión automática con esperas de 1, 2, 4, 8 y luego 10 segundos (tope 10 s).
- Corte en modo Mirar: más de **1 segundo** sin cuadros nuevos, o conexión `disconnected`/`failed`, o pista silenciada/terminada.
- Muestras de estadísticas cada **10 segundos**.
- Cámara pedida: 1280×720, 30 cuadros por segundo (`ideal`, no `exact`).
- Sin dependencias nuevas salvo `server-only`.
- Commits chicos, en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Falta la llave o Cloudflare responde error** → la página muestra "No se pudo preparar la transmisión de prueba: …" en español, sin la llave, y no se rompe. Test en la Tarea 1 (`errores sin filtrar la llave`).
2. **Hay otras transmisiones en la cuenta** → se reutiliza solo la que se llama exactamente `prueba-vivo`, no "prueba-vivo-2" ni la primera de la lista. Test en la Tarea 1 (`ignora otras transmisiones`).
3. **Varias señales anuncian el mismo corte a la vez** (conexión `disconnected` y pista silenciada) → cuenta como un solo corte. Test en la Tarea 2 (`no duplica cortes`).
4. **Se pide el resumen mientras sigue cortado** → el corte figura como "sigue cortado" con duración hasta ahora, no desaparece. Test en la Tarea 2 (`corte en curso`).
5. **Cloudflare devuelve `Location` relativo** en WHIP/WHEP → se resuelve contra la URL original para poder cerrar la conexión con `DELETE`. Test en la Tarea 3 (`resuelve Location relativo`).

---

### Task 1: Conexión con la API de Cloudflare

**Files:**
- Create: `src/lib/vivos/cloudflare.ts`
- Create: `src/lib/vivos/config.ts`
- Test: `src/lib/vivos/cloudflare.test.ts`
- Modify: `package.json` (agregar `server-only`)

**Interfaces:**
- Produces:
  ```ts
  export type CredencialesCloudflare = { accountId: string; token: string };
  export type UrlsTransmision = { uid: string; urlTransmitir: string; urlMirar: string };
  export class ErrorCloudflare extends Error {}
  export async function obtenerOCrearTransmision(
    nombre: string, cred: CredencialesCloudflare, f?: typeof fetch,
  ): Promise<UrlsTransmision>;
  // config.ts (import "server-only")
  export function credencialesCloudflare(): CredencialesCloudflare; // lanza ErrorCloudflare si falta alguna variable
  ```

- [ ] **Step 1: Instalar `server-only`**

Run: `npm install server-only`
Expected: aparece en `dependencies`.

- [ ] **Step 2: Escribir las pruebas que fallan** en `cloudflare.test.ts`, con un `fetch` falso que registra las llamadas y responde con el formato de Cloudflare `{ success, errors, result }`:

- `reutiliza la existente`: la lista (`GET .../accounts/ACC/stream/live_inputs`) devuelve `[{ uid: "u1", meta: { name: "prueba-vivo" } }]`; el detalle (`GET .../live_inputs/u1`) devuelve `{ uid: "u1", webRTC: { url: "https://w/whip" }, webRTCPlayback: { url: "https://w/whep" } }`. Espera `{ uid: "u1", urlTransmitir: "https://w/whip", urlMirar: "https://w/whep" }` y que **no** hubo ningún `POST`.
- `crea si no existe`: lista vacía → un `POST` a `.../live_inputs` cuyo cuerpo JSON es `{ meta: { name: "prueba-vivo" }, recording: { mode: "off" } }`; devuelve las URLs del resultado.
- `ignora otras transmisiones`: la lista trae `prueba-vivo-2` y `otra`; espera un `POST` (crea una nueva).
- `manda la llave como Bearer`: todas las llamadas llevan `Authorization: Bearer TOK`.
- `errores sin filtrar la llave`: respuesta `{ success: false, errors: [{ code: 10000, message: "Authentication error" }] }` con estado 403 → rechaza con `ErrorCloudflare` cuyo `message` contiene `"Authentication error"` y **no** contiene `"TOK"`. Lo mismo si `fetch` lanza un error de red (mensaje en español: `"No se pudo conectar con Cloudflare"`).

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run src/lib/vivos/cloudflare.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Step 4: Implementar `obtenerOCrearTransmision`** en `cloudflare.ts`. Base `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`. Busca por `meta.name === nombre` exacto en la lista; con el `uid` pide el detalle (la lista no trae las URLs). Mensajes de `ErrorCloudflare` con el formato `"Cloudflare respondió: <mensajes unidos por '; '>"`.

- [ ] **Step 5: Implementar `credencialesCloudflare`** en `config.ts` (primera línea `import "server-only";`), leyendo `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_STREAM_API_TOKEN`; si falta alguna, `ErrorCloudflare("Faltan CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_STREAM_API_TOKEN")`. Sin prueba: es la misma forma que `src/lib/supabase/env.ts`.

- [ ] **Step 6: Correr y ver que pasan**

Run: `npx vitest run src/lib/vivos/cloudflare.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/vivos/cloudflare.ts src/lib/vivos/config.ts src/lib/vivos/cloudflare.test.ts
git commit -m "Conectar con Cloudflare Stream para obtener o crear una transmisión"
```

---

### Task 2: Registro de cortes y resumen

**Files:**
- Create: `src/lib/vivos/registro.ts`
- Test: `src/lib/vivos/registro.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MotivoCorte = "conexion" | "sin-cuadros" | "pista";
  export type EventoRegistro =
    | { tipo: "inicio"; en: number }
    | { tipo: "corte"; en: number; motivo: MotivoCorte }
    | { tipo: "vuelta"; en: number; como: "sola" | "manual" }
    | { tipo: "muestra"; en: number; atrasoMs: number | null; ancho: number | null; alto: number | null; fps: number | null }
    | { tipo: "fin"; en: number };
  export type Corte = { inicio: number; duracionMs: number; como: "sola" | "manual" | "sigue" };
  export type Resumen = { duracionMs: number; cortes: Corte[]; atrasoPromedioMs: number | null; atrasoMaxMs: number | null };
  export function agregarEvento(eventos: EventoRegistro[], e: EventoRegistro): EventoRegistro[];
  export function resumir(eventos: EventoRegistro[], ahora: number): Resumen;
  export function textoResumen(r: Resumen, modo: "transmitir" | "mirar", aparato: string): string;
  export function esperaReconexion(intento: number): number; // ms
  ```
  (`en` son milisegundos de `Date.now()`; `fin` cierra la duración, si no hay `fin` se usa `ahora`.)

- [ ] **Step 1: Escribir las pruebas que fallan**

- `no duplica cortes`: `agregarEvento` ignora un `corte` si el último corte no tiene `vuelta`, e ignora una `vuelta` si no hay corte abierto. Dos `corte` seguidos + una `vuelta` → `resumir` da 1 corte.
- `resume duración y cortes`: inicio en 0, corte en 60 000, vuelta "sola" en 63 000, corte en 120 000, vuelta "manual" en 128 000, fin en 900 000 → `duracionMs` 900 000, cortes `[{inicio:60000,duracionMs:3000,como:"sola"},{inicio:120000,duracionMs:8000,como:"manual"}]`.
- `corte en curso`: inicio 0, corte en 10 000, sin vuelta, `ahora` 15 000 → un corte `{inicio:10000,duracionMs:5000,como:"sigue"}`.
- `atraso`: muestras con `atrasoMs` 300, 500, `null` → promedio 400, máximo 500; sin muestras → ambos `null`.
- `texto`: para el caso de "resume duración y cortes" con muestras de 400 ms, `textoResumen(r, "mirar", "iPhone")` es exactamente `"Mirar · iPhone · 15 min · 2 cortes (3 s y 8 s) · 1 volvió sola, 1 hubo que tocar · atraso estimado 0,4 s"`. Sin cortes: `"… · 0 cortes · …"`. Sin atraso: termina en `"· atraso estimado sin datos"`.
- `esperas`: `esperaReconexion(0..6)` → `[1000, 2000, 4000, 8000, 10000, 10000, 10000]`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/vivos/registro.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** las funciones en `registro.ts` (puras, sin acceso al navegador). Minutos redondeados hacia abajo; segundos de corte redondeados; lista de cortes unida con ", " y " y " antes del último; decimal con coma.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run src/lib/vivos/registro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vivos/registro.ts src/lib/vivos/registro.test.ts
git commit -m "Llevar el registro de cortes de una transmisión y su resumen"
```

---

### Task 3: WHIP/WHEP y estadísticas en el navegador

**Files:**
- Create: `src/lib/vivos/webrtc.ts`
- Create: `src/lib/vivos/estadisticas.ts`
- Test: `src/lib/vivos/webrtc.test.ts`
- Test: `src/lib/vivos/estadisticas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // webrtc.ts
  export async function negociarSdp(url: string, ofertaSdp: string, f?: typeof fetch): Promise<{ respuestaSdp: string; recurso: string | null }>;
  export type ConexionVivo = { pc: RTCPeerConnection; cerrar(): Promise<void> };
  export async function transmitir(urlTransmitir: string, stream: MediaStream): Promise<ConexionVivo>;
  export async function mirar(urlMirar: string): Promise<ConexionVivo & { stream: MediaStream }>;
  // estadisticas.ts
  export type Muestra = { atrasoMs: number | null; ancho: number | null; alto: number | null; fps: number | null; cuadros: number | null };
  export function leerMuestra(reporte: Iterable<Record<string, unknown>>, modo: "transmitir" | "mirar"): Muestra;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

`webrtc.test.ts` (solo `negociarSdp`, con `fetch` falso):
- `manda la oferta`: `POST` a la URL con `Content-Type: application/sdp` y la oferta como cuerpo; devuelve el texto de la respuesta como `respuestaSdp`.
- `resuelve Location relativo`: con `Location: /abc/resource/1` y URL `https://x.cloudflarestream.com/abc/webRTC/publish` → `recurso` es `https://x.cloudflarestream.com/abc/resource/1`. Sin `Location` → `null`.
- `error claro`: estado 409 → rechaza con `Error("La transmisión respondió 409")`.

`estadisticas.test.ts` (reportes armados a mano como objetos de `getStats`):
- `mirar`: con `inbound-rtp` de video (`frameWidth` 1280, `frameHeight` 720, `framesPerSecond` 30, `framesDecoded` 900, `jitterBufferDelay` 6, `jitterBufferEmittedCount` 60) y `candidate-pair` con `state: "succeeded"`, `nominated: true` y `currentRoundTripTime` 0.08 → `{ atrasoMs: 140, ancho: 1280, alto: 720, fps: 30, cuadros: 900 }` (atraso = RTT/2 + jitterBufferDelay/jitterBufferEmittedCount, en ms).
- `transmitir`: con `outbound-rtp` de video → ancho, alto y fps de ahí; `atrasoMs` = RTT/2; `cuadros` = `framesEncoded`.
- `sin datos`: reporte vacío → todo `null`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/vivos/webrtc.test.ts src/lib/vivos/estadisticas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `negociarSdp` y `leerMuestra`.**

- [ ] **Step 4: Implementar `transmitir` y `mirar`** (sin prueba unitaria: se prueban con los celulares). Ambas crean `new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" })`. `transmitir` agrega las pistas del `stream` con transceivers `sendonly`; `mirar` agrega transceivers `recvonly` de audio y video y arma el `MediaStream` con las pistas que llegan por `ontrack`. Luego `createOffer` → `setLocalDescription` → esperar a que termine de juntar candidatos (`icegatheringstatechange` a `complete`, con un tope de 2 s) → `negociarSdp` con `pc.localDescription.sdp` → `setRemoteDescription({ type: "answer", sdp })`. `cerrar()` hace `pc.close()` y, si hay `recurso`, `DELETE` a esa URL ignorando errores.

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run src/lib/vivos`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vivos/webrtc.ts src/lib/vivos/estadisticas.ts src/lib/vivos/webrtc.test.ts src/lib/vivos/estadisticas.test.ts
git commit -m "Transmitir y mirar por WebRTC con Cloudflare y leer sus estadísticas"
```

---

### Task 4: Página `/prueba-vivo`

**Files:**
- Create: `src/app/prueba-vivo/page.tsx`
- Create: `src/app/prueba-vivo/prueba-vivo.tsx` (`"use client"`)
- Modify: `CLAUDE.md` (sección 13: fila `/prueba-vivo` en "Direcciones de la app" y `vivos/` en la descripción de `src/lib/`)

**Interfaces:**
- Consumes: `credencialesCloudflare`, `obtenerOCrearTransmision`, `ErrorCloudflare` (Tarea 1); `agregarEvento`, `resumir`, `textoResumen`, `esperaReconexion` (Tarea 2); `transmitir`, `mirar`, `leerMuestra` (Tarea 3); `obtenerUsuarioId` (`src/lib/auth/sesion.ts`); `createClient` (`src/lib/supabase/server.ts`).
- Produces: `export function PruebaVivo(props: { urlTransmitir: string; urlMirar: string }): JSX.Element`.

- [ ] **Step 1: Página del servidor.** Igual que `src/app/admin/page.tsx`: `metadata` con título `"Prueba de transmisión · Tu Feria Live"` y `robots: { index: false, follow: false }`; contenido dentro de `<Suspense>` con `await connection()`; sin sesión o `es_admin !== true` → `notFound()`. Luego `obtenerOCrearTransmision("prueba-vivo", credencialesCloudflare())`; si lanza `ErrorCloudflare`, muestra `"No se pudo preparar la transmisión de prueba: <mensaje>"` en vez del componente.

- [ ] **Step 2: Componente `PruebaVivo`.** Comportamiento fijado por la spec (secciones 4.2 a 4.4):
  - Inicio: dos botones grandes, **Transmitir** y **Mirar**, y una línea de ayuda: "Uno transmite y el otro mira. Para medir el atraso, poné el celular que mira frente a la cámara del que transmite".
  - **Transmitir:** `getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: true })`, vista previa en `<video muted playsInline autoPlay>`, botón **Cambiar cámara** (detiene la pista actual, pide la otra `facingMode` y usa `sender.replaceTrack`), botón **Terminar**.
  - **Mirar:** `<video playsInline autoPlay>` con el stream recibido; si el navegador bloquea el sonido, botón **Activar sonido**. Debajo, reloj grande `HH:MM:SS.d` actualizado con `requestAnimationFrame`, en tipografía monoespaciada y tamaño ≥ 48 px.
  - Estado visible: "Conectando…", "En vivo", "Se cortó, reconectando…", "Se cortó: tocá Volver a transmitir".
  - Cortes: `connectionstatechange` a `disconnected`/`failed` → evento `corte` motivo `conexion`; pista `mute`/`ended` → `pista`; en Mirar, si `cuadros` no aumentó en 1 s (consulta de `getStats` cada 1 s) → `sin-cuadros`. Vuelta a `connected` con cuadros nuevos → `vuelta` `sola`.
  - Reconexión: si la conexión queda `failed`, `cerrar()` y reintentar con `esperaReconexion(intento)`. En Transmitir, si la pista de video terminó (iPhone al cambiar de app), intentar `getUserMedia` de nuevo; si falla, mostrar el botón **Volver a transmitir**, y la vuelta que logra ese botón se registra como `manual`.
  - Cada 10 s: evento `muestra` con `leerMuestra`.
  - Registro en pantalla (lista de eventos con hora) y **resumen** con `textoResumen`, `aparato` = "iPhone" si el `userAgent` contiene iPhone/iPad, "Android" si contiene Android, si no "Computadora". Botón **Copiar resumen** (`navigator.clipboard.writeText`, con aviso de `sonner` "Resumen copiado").
  - Al desmontar o tocar **Terminar**: evento `fin`, `cerrar()`, detener las pistas de la cámara.
  - Estilo: componentes de `src/components/ui/` y tokens de `globals.css`; columna `max-w-md`, como el resto.

- [ ] **Step 3: Verificar tipos, lint y pruebas**

Run: `npm run typecheck; npm run lint; npm test`
Expected: sin errores; todas las pruebas pasan.

- [ ] **Step 4: Probar en la computadora.** `npm run dev`, entrar con la cuenta de administrador a `http://localhost:3000/prueba-vivo` en dos pestañas: una transmite con la cámara de la computadora y la otra mira. Esperado: el video aparece en "Mirar", el estado pasa a "En vivo", después de 10 s hay una muestra con atraso, y "Copiar resumen" funciona. Cerrar la pestaña que transmite → en la que mira se registra un corte. Sin sesión → "no encontrada".

- [ ] **Step 5: Actualizar `CLAUDE.md` sección 13.**

- [ ] **Step 6: Commit**

```bash
git add src/app/prueba-vivo CLAUDE.md
git commit -m "Agregar la página de prueba de transmisión para administradores"
```

---

### Task 5: Publicar y probar con los celulares

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-fase-1-parte-2-prueba-transmision-design.md` (sección nueva "11. Resultados")

- [ ] **Step 1: Paso manual del dueño.** Cargar en Vercel → Settings → Environment Variables (Production) `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_STREAM_API_TOKEN`, con los mismos valores de `.env.local`. Claude guía en el panel y no ve ni copia los valores.

- [ ] **Step 2: Revisión del código y publicación.** Revisión de toda la rama, `push`, pull request a `main` y, con el visto bueno del dueño, merge. Esperado: Vercel publica y `https://tuferialive.vercel.app/prueba-vivo` abre con la cuenta de administrador.

- [ ] **Step 3: Prueba del dueño** con el guion de la sección 4.5 de la spec, en las dos direcciones. Pasa a Claude los resúmenes copiados y las capturas de los relojes.

- [ ] **Step 4: Anotar los resultados** en la sección "11. Resultados" de la spec: por dirección, atraso medido con los relojes (3 mediciones), atraso estimado, cortes en 15 min por Wi-Fi, qué pasó al girar, al apagar la pantalla y al cambiar de app, y la vuelta con datos móviles. Cerrar con la conclusión: ¿alcanza el navegador o hace falta Larix en algún celular?

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-16-fase-1-parte-2-prueba-transmision-design.md
git commit -m "Anotar los resultados de la prueba de transmisión"
```
