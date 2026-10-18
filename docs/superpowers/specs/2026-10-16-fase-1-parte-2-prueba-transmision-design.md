# Fase 1 · Parte 2 – Prueba de transmisión desde el celular · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-10-16
- **Estado**: pendiente de revisión del dueño del proyecto
- **Referencias**: [CLAUDE.md](../../../CLAUDE.md) · [Fase 1 · Parte 0 – Pantallas](2026-10-14-fase-1-parte-0-pantallas-design.md) · [Cloudflare Stream – WebRTC](https://developers.cloudflare.com/stream/webrtc-beta/)

## 1. Objetivo

Antes de construir la sala en vivo, comprobar que **transmitir desde el navegador del celular** (sin instalar nada) con Cloudflare Stream por WebRTC funciona bien en **Android y en iPhone**, midiendo lo que más le importa al dueño:

1. **El atraso**: cuántos segundos pasan entre que algo ocurre frente a la cámara y lo ve quien mira. El Código en vivo ("la primera que lo escribe gana") necesita pocos segundos para ser justo.
2. **Los cortes**: cuántas veces se interrumpe, cuánto dura cada interrupción y si se recupera sola.

La prueba la hace el dueño con dos celulares propios (uno Android y otro iPhone), principalmente por **Wi-Fi**, que es como transmiten las feriantes. Una vuelta corta con datos móviles es un extra.

**No incluye**: la sala de verdad, chat, códigos, la tabla `live_sessions`, el botón "Salir en vivo" del panel ni nada visible para las usuarias. Esas piezas son del resto de la Parte 2, que se diseña con los resultados de esta prueba.

## 2. Qué se considera "funciona"

| Criterio | Meta |
|---|---|
| Video y sonido llegan en las dos direcciones | Android → iPhone y iPhone → Android |
| Atraso | Menor a 2 segundos (Cloudflare anuncia menos de 0,5 s) |
| Estabilidad por Wi-Fi | 15 minutos sin cortes, o con cortes que se recuperan solos |
| Cambio de cámara | Pasar de la cámara de adelante a la de atrás sin cortar la transmisión |
| Situaciones típicas | Se sabe qué pasa al girar el celular, apagar la pantalla y cambiar de app (no hace falta que "funcione": hay que saberlo para diseñar la sala) |

Si algún criterio falla, no se "arregla" en esta prueba: se anota y se decide en el diseño de la sala (por ejemplo, recomendar Larix para iPhone o avisarle a la feriante que no cambie de app).

## 3. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Quién prueba | El dueño, con su Android y su iPhone | No hace falta involucrar a una feriante para saber si la tecnología anda |
| Dirección | `/prueba-vivo`, **solo para administradores** (los demás ven "no encontrada", como `/admin`), sin enlaces desde ningún menú y sin indexar en buscadores | Nadie la encuentra por accidente; la URL para transmitir es una credencial |
| Dónde se publica | En producción (`tuferialive.vercel.app`), detrás del control de administrador. *Decisión de Claude* | Los celulares solo dejan usar la cámara en páginas `https`; en producción el login con Google ya funciona, en una vista previa de Vercel habría que configurar Supabase de nuevo |
| Transmisión de Cloudflare | **Una sola**, llamada `prueba-vivo`, que se crea la primera vez y se reutiliza. Se busca por nombre en la lista de Cloudflare. Sin tabla en la base. *Decisión de Claude* | Lo más simple; la tabla `live_sessions` se diseña después con lo aprendido |
| Llave de Cloudflare | Solo en el servidor (`CLOUDFLARE_STREAM_API_TOKEN`). El navegador recibe únicamente las dos URLs de la transmisión de prueba, y solo si la persona es administradora | Regla de seguridad de la guía |
| Código reutilizable | La conexión con Cloudflare (`src/lib/vivos/`) se escribe bien y con pruebas, porque la sala la va a usar. La pantalla de prueba es descartable. *Decisión de Claude* | No tirar trabajo útil |
| Medición del atraso | Ver sección 4.3: filmar la pantalla del celular que mira. *Decisión de Claude, reemplaza la idea inicial de dos relojes sincronizados* | Mide el atraso real de punta a punta sin depender de que los relojes de los dos celulares coincidan |

## 4. Cómo funciona

### 4.1 Por dentro

- **`src/lib/vivos/cloudflare.ts`** (solo servidor, marcado con `server-only`): funciones para listar transmisiones (*live inputs*), crear una con nombre y obtener sus dos URLs:
  - `webRTC.url` → URL para **transmitir** (WHIP). Es una credencial: quien la tiene puede transmitir.
  - `webRTCPlayback.url` → URL para **mirar** (WHEP).
  - Usa la API de Cloudflare (`/accounts/{CLOUDFLARE_ACCOUNT_ID}/stream/live_inputs`) con `fetch` y la llave del entorno. Si falta alguna variable, o Cloudflare responde con error, devuelve un error claro en español (sin mostrar la llave).
- **`src/app/prueba-vivo/page.tsx`**: comprueba sesión y administrador (`es_admin`, igual que `/admin`), obtiene o crea la transmisión `prueba-vivo` y le pasa las dos URLs a la parte que corre en el celular.
- **Cliente WebRTC**: el navegador habla directo con Cloudflare (WHIP para transmitir, WHEP para mirar). Queda a criterio de quien construye usar las funciones nativas del navegador (`RTCPeerConnection`; Cloudflare tiene un ejemplo sin dependencias) o una librería chica como `@eyevinn/whip-web-client`. Se prefiere **no sumar dependencias** si el código propio es corto. Video en H.264 o VP8 (los que soportan los dos celulares).

### 4.2 La pantalla

Una sola página, mobile-first, con dos modos que se eligen con dos botones grandes:

**Transmitir**
- Pide permiso de cámara y micrófono y muestra la vista previa.
- Botón para **cambiar entre cámara de adelante y de atrás** sin cortar (reemplazando la pista de video de la conexión, no reconectando).
- Indicador de estado: "Conectando…", "En vivo", "Se cortó, reconectando…".
- Botón **Terminar**.

**Mirar**
- El video de la transmisión, con sonido (un toque para activar el audio si el navegador lo bloquea al inicio).
- Un **reloj grande** con horas, minutos, segundos y décimas, debajo del video.
- Indicador de estado igual al de transmitir.

En los dos modos: el **registro de cortes** (sección 4.4) y el texto mínimo para entender qué hacer. Estilo visual: el de la app, sin esfuerzo extra de diseño (es descartable).

### 4.3 Medir el atraso

1. El celular que **mira** muestra el video y su reloj grande.
2. Se pone ese celular **frente a la cámara** del que transmite, de modo que el reloj quede filmado.
3. En la pantalla del que mira aparecen dos relojes: el **real** (debajo) y el **filmado** (dentro del video). La diferencia entre los dos es el atraso completo.
4. Se saca una captura de pantalla. Se repite 3 veces en cada dirección.

Además, la página muestra una **estimación automática** del atraso de la red, a partir de las estadísticas de la conexión (`getStats`: tiempo de ida y vuelta y espera del reproductor), y la guarda en el registro cada 10 segundos para ver si sube con el tiempo.

### 4.4 Registro de cortes

Lo lleva la página sola, en los dos celulares:
- Hora de inicio, y cada **corte** con hora, duración y cómo terminó ("volvió sola" o "hubo que tocar algo").
- Qué se considera corte: la conexión pasa a "desconectada" o "fallida", la pista de video se silencia o termina (por ejemplo, el iPhone apaga la cámara al cambiar de app), o en el modo Mirar **no llegan cuadros nuevos durante más de 1 segundo**.
- **Reconexión automática**: si la conexión falla, la página vuelve a conectarse sola, con esperas crecientes (1, 2, 4… hasta 10 segundos).
- Calidad recibida (resolución y cuadros por segundo) cada 10 segundos.
- Al tocar **Terminar** (o en cualquier momento) se ve un **resumen**: "15 min · 2 cortes (3 s y 8 s) · volvió sola · atraso estimado 0,4 s", con un botón **Copiar resumen** para pegárselo a Claude.

El registro vive solo en la pantalla (no se guarda en la base). Si se recarga la página, se pierde.

### 4.5 Guion de la prueba (para el dueño)

Por cada dirección (Android transmite → iPhone mira, y al revés):
1. Medir el atraso 3 veces (sección 4.3).
2. Cambiar de cámara de adelante a atrás y volver.
3. Girar el celular que transmite.
4. Dejarlo transmitiendo **15 minutos por Wi-Fi** sin tocarlo.
5. Apagar la pantalla del que transmite 10 segundos y volver a prenderla.
6. Cambiar a otra app (WhatsApp) 10 segundos y volver.
7. Copiar el resumen de los dos celulares.

Extra: repetir los pasos 1 y 4 (5 minutos alcanzan) con **datos móviles**.

## 5. Costo

Cloudflare cobra 1 USD cada 1.000 minutos mirados. La prueba completa ronda los 60–80 minutos con una sola persona mirando: menos de 0,10 USD.

## 6. Seguridad

- La llave de Cloudflare nunca llega al navegador; la página la usa en el servidor.
- La URL para transmitir solo se entrega a administradores. Para la sala definitiva, la regla de la guía se mantiene: solo la ve la dueña del puesto.
- La página responde "no encontrada" a quien no es administrador, igual que `/admin`, y no se indexa.

## 7. Pasos manuales del dueño

- Cargar `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_STREAM_API_TOKEN` en las variables de entorno de **Vercel** (Producción). La llave ya está creada y verificada en `.env.local` (2026-10-16): permiso `Stream:Edit`, solo sobre su cuenta.
- Hacer la prueba con el guion de la sección 4.5 y pasarle a Claude los resúmenes y las capturas.

## 8. Pruebas automáticas

- **Unitarias (Vitest)**: la conexión con Cloudflare con `fetch` simulado (lista, crea, reutiliza la existente, errores claros sin filtrar la llave); el cálculo del resumen de cortes a partir de una lista de eventos.
- **No** se agrega prueba de Playwright para la cámara: lo que se quiere averiguar es justamente cómo se comportan los celulares reales.

## 9. Después de la prueba

- Los resultados (atraso medido, cortes, comportamiento al apagar la pantalla o cambiar de app, por celular) se anotan en una sección nueva al final de este documento.
- Con eso se diseña la sala en vivo (resto de la Parte 2). La página `/prueba-vivo` se borra cuando exista la sala, o antes si el dueño lo prefiere.
- Si la transmisión desde el navegador del iPhone no sirve, la alternativa a evaluar es una app de transmisión (Larix Broadcaster, gratis) con la misma URL WHIP.

## 10. Queda a criterio de quien construye

- Cliente WebRTC propio o librería chica (preferencia: propio si es corto).
- Cómo organizar los componentes de la pantalla de prueba.
- Resolución de la cámara a pedir (sugerencia: 720p, 30 cuadros por segundo).
