# Tu Feria Live — Guía del proyecto

> Este archivo es la referencia principal del proyecto. Leelo completo antes de cualquier tarea.
> Idioma de trabajo: **español (Argentina)**. Toda la interfaz, mensajes y textos al usuario van en español rioplatense (voseo).
> El dueño del proyecto no es programador de profesión: explicá cada decisión técnica en lenguaje simple.

## 1. Qué es

Plataforma de ventas en vivo para emprendedoras y feriantes de **Tucumán, Argentina**. Alternativa a Facebook Live donde cada emprendedora tiene **su propia sala**: video en vivo, chat, catálogo y una forma ordenada de vender, con control total de su sala (sin cierres ni baneos arbitrarios).

**Principios de producto**
- No cambiarle la costumbre a nadie: replicar cómo ya venden en Facebook, pero automatizando el trabajo manual.
- Mobile-first: la mayoría transmite y compra desde el celular.
- Asequible: costos de infraestructura bajos y variables durante el piloto.
- Reglas claras y moderación humana de la plataforma (productos prohibidos, términos y condiciones), pero la emprendedora controla su sala.

## 2. Marca

- **Nombre**: Tu Feria Live.
- **Eslogan (provisorio)**: "Vendé en vivo, sin que nadie te corte".
- **Origen**: Tucumán, pero el nombre no menciona la provincia a propósito, para poder expandirse a otras regiones sin cambiar de marca.
- **Dominio candidato**: `tuferia.live`.

## 3. Modelo de negocio

- **Mensualidad fija** que paga cada emprendedora. **La plataforma NO cobra comisión por venta** y no toca el dinero de las ventas.
- Etapa inicial **gratuita**: el abono recién se cobra cuando la plataforma esté funcional y con clientas usándola.
- El monto se define más adelante, tras un análisis de mercado.
- El cobro de la mensualidad (suscripciones) se implementa en una fase posterior; no forma parte del MVP.

## 4. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js (App Router) + TypeScript estricto |
| UI | Tailwind CSS + shadcn/ui · PWA instalable |
| Backend | Route Handlers / Server Actions de Next.js |
| Base de datos | PostgreSQL en Supabase (región São Paulo) + Drizzle ORM |
| Auth | Supabase Auth: Google (Fase 0) + código por email (Fase 1). Sin SMS: el WhatsApp se pide como dato de contacto para las entregas, sin verificar |
| Tiempo real | Supabase Realtime (chat, códigos, pedidos) |
| Video | Cloudflare Stream — Live Inputs con WebRTC (WHIP para transmitir, WHEP para ver). RTMP opcional para OBS/Larix. Activado en la Fase 1 con el plan **Images & Stream de 0 USD/mes** (se paga 1 USD cada 1.000 minutos mirados; sin almacenamiento contratado). WebRTC es oficial desde el 2026-10-15, pero **no graba, no genera miniaturas ni informa cuánta gente mira** (eso lo resuelve la app). La URL para transmitir (WHIP) es una credencial: solo la ve la dueña del puesto |
| Archivos | Supabase Storage: bucket público `tienda-fotos` (fotos comprimidas en el celular a 400 y 1200 px, sin datos EXIF, carpeta por tienda). Comprobantes de pago en bucket privado (Fase 1, Parte 4) |
| Tests | Vitest (unitarios) + Playwright (end-to-end) |
| Observabilidad | Sentry (errores) + PostHog (métricas) — se configuran antes del piloto (Fase 1, Parte 5) |
| Deploy | Vercel |

Antes de usar cualquier API de estas librerías, **consultar documentación actualizada con Context7**. No asumir firmas de funciones de memoria.

### Variables de entorno (`.env.local`, nunca se sube al repo)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_API_TOKEN=   # se crea en la Fase 1
```

Mantener un `.env.example` con los nombres y sin valores.

## 5. Glosario del dominio

- **Emprendedora / vendedora**: dueña de una tienda; transmite en vivo.
- **Tienda (store) / puesto**: perfil público de la emprendedora en `/@usuario`, con catálogo y formas de entrega. Sus datos de cobro (alias, titular) y su dirección son **privados**: solo los ve ella (y, desde la Parte 4, quien le compra).
- **Invitación**: link de un solo uso, que vence a los 7 días, con el que una feriante abre su puesto durante el piloto. Lo crea un administrador en `/admin`.
- **Sala**: la página del vivo de una tienda (video + chat + producto/código activo).
- **Vivo (live_session)**: una transmisión concreta, con inicio y fin. En la Fase 1 no se graba (las repeticiones son de la Fase 2).
- **Ayudante / moderador**: persona autorizada por la emprendedora para cargar códigos y moderar el chat.
- **Código en vivo (live_code)**: palabra clave que dice la vendedora ("ROJO") asociada a un producto, precio, foto y stock.
- **Reclamo (claim)**: cuando una compradora escribe un código válido en el chat. La primera (hora del servidor) gana; el resto queda en lista de espera.
- **Carrito del vivo**: modo en que los códigos ganados se acumulan y se pagan todos juntos al final.
- **Falta**: reclamo ganado y no pagado; afecta la reputación de la compradora.

## 6. Función estrella: "Código en vivo"

Flujo actual en Facebook: la vendedora muestra el producto, dice "se lo lleva con el código ROJO", la primera que lo escribe en el chat gana, la vendedora le pasa el alias por mensaje y espera la transferencia. Todo manual.

Flujo en la plataforma:
1. La vendedora (o su ayudante) toca **Nuevo código**: captura del video como foto, precio, código. Menos de 5 segundos. También puede precargar productos.
2. El código se muestra superpuesto en el video ("Código ROJO – $8.000").
3. Las compradoras escriben el código en el chat. Detección automática tolerante a mayúsculas, tildes y signos.
4. Adjudicación **atómica en PostgreSQL** (función con transacción y bloqueo de fila): nunca dos ganadoras para la misma unidad.
5. La ganadora recibe un aviso con los **datos de pago** (ver sección 7) y un plazo configurable.
6. Si vence el plazo sin pago informado → pasa automáticamente a la siguiente de la lista de espera y se registra una falta.
7. La forma de entrega se elige al ganar, antes de pagar, porque el envío puede sumar costo: retiro en el domicilio de la feriante (la mayoría vende desde su casa; la dirección exacta solo la ve quien ya pagó), envío (gratis, monto fijo o a coordinar) o punto de encuentro. Pago confirmado → pedido "Pagado" → se muestran los datos de la entrega y se pide el WhatsApp para coordinar.
8. Al terminar el vivo, la vendedora recibe un resumen agrupado por compradora.

Configuraciones de la vendedora: **pago por prenda** o **carrito del vivo**; plazo de pago; asignación manual; anular/liberar código; stock > 1 por código.

## 7. Pagos

**La plataforma no procesa ni intermedia pagos.** El dinero va siempre directo de la compradora a la emprendedora.

### MVP: modo alias (lo que ya usan hoy)
- La emprendedora carga en su tienda su **alias** (y titular) de banco o billetera.
- Al ganar un código, la compradora ve automáticamente el alias, el titular y el **monto exacto**, con botón para copiar el alias.
- La compradora toca **"Ya pagué"** y puede adjuntar el comprobante (imagen guardada en bucket privado; solo la ven ella y la vendedora).
- La vendedora confirma el pago con un toque desde su panel. Solo la vendedora (o su ayudante) puede marcar un pedido como pagado.

### Más adelante: QR interoperable (Transferencias 3.0)
- QR de cobro con monto exacto que funciona entre todas las billeteras y bancos (Mercado Pago, Naranja X, apps bancarias), con confirmación automática.
- Proveedores a evaluar: MODO, Mobbex, Talo, Mercado Pago. Pendiente confirmar qué billeteras usan las feriantes (Naranja X tiene mucha presencia en Tucumán).
- Si el comprador mira desde el celular no puede escanear un QR de su propia pantalla: ofrecer siempre también un **botón/link de pago**.

### Regla de arquitectura
Programar los pagos como un **módulo intercambiable** (`lib/payments/` con una interfaz común, ej. `PaymentMethod`), donde el modo alias es la primera implementación. El resto de la app no debe depender de un proveedor concreto.

## 8. Modelo de datos inicial

**Ya creadas** (migraciones en `drizzle/`):
- Fase 0: `users` (perfil público; se crea solo al registrarse).
- Fase 1, Parte 1: `platform_admins` (administradores de la plataforma; el primero se carga a mano por SQL, sin escribir el email en el código), `invitations`, `stores` (con `handle` = @usuario y `onboarding_step` del recorrido de 4 pasos), `store_private_info` (alias, titular, dirección y horarios de retiro: **solo la dueña**), `store_delivery_options` (retiro en domicilio, envío gratis/fijo/a coordinar, punto de encuentro), `products`, `product_photos` (hasta 4 por producto), `follows`.
- Fase 1, Parte 2: `live_sessions` (cada vivo, con su inicio y su fin), `store_streams` (la transmisión de cada tienda en Cloudflare, con la URL para transmitir (WHIP), que es una credencial: **solo la lee el servidor**) y `live_config` (los tiempos de la sala: 300 s sin conexión, 900 s fuera de pantalla y señal de vida cada 20 s; se cambian con un `UPDATE` en `live_config`, nunca en el código).

**Planeadas**: `chat_messages` y `moderation_actions` (Parte 3), `live_codes`, `claims`, `orders`, `order_items`, `payment_reports` (Parte 4), `store_members` (ayudantes, Fase 2), `buyer_reputation` (Fase 2), `reports` (plataforma).

- Row Level Security activado en **todas** las tablas (RLS automático habilitado en Supabase; las tablas nuevas NO se exponen automáticamente a la Data API: dar permisos explícitos en cada migración).
- Montos en **centavos enteros (ARS)**, nunca en float.
- Fechas en UTC; mostrar en zona `America/Argentina/Tucuman`.

## 9. Seguridad (no negociable)

- Secretos solo en variables de entorno; `.env.local` en `.gitignore`.
- `SUPABASE_SECRET_KEY` y tokens de Cloudflare: **solo en el servidor**, nunca en código de cliente.
- Comprobantes de pago en bucket privado con URLs firmadas de corta duración.
- Rate limiting en chat y reclamos de códigos.
- Para reclamar un código hay que tener sesión iniciada; mirar y comentar puede ser libre.
- Validar en el servidor todo lo que llega del cliente.
- **Datos privados de las feriantes** (alias, titular, dirección exacta) en tablas separadas que solo lee la dueña; la base de datos lo hace cumplir (RLS), no solo la pantalla.
- **Fotos**: se suben sin datos EXIF (sin ubicación GPS); cada tienda solo escribe en su carpeta de Storage.
- **@usuario reservados** (`admin`, `soporte`, `tuferialive` y otros) para que nadie se haga pasar por la plataforma.
- **Credenciales**: nunca se piden ni se pegan en el chat; el dueño las carga en `.env.local` y se verifican sin mostrarlas. Las contraseñas de la base deben ser solo letras y números.

## 10. Plan por fases

**Estado (2026-10-30)**: Fase 0 publicada · Fase 1: Parte 0 (pantallas), Parte 1 (tiendas y productos) y **Parte 2 (sala en vivo)** publicadas en `tuferialive.vercel.app` (la Parte 2, probada en celulares reales Android e iPhone el 2026-10-29). Lo siguiente: Parte 3 (chat).

**Fase 0 – Bases**: proyecto Next.js + Supabase + Drizzle, sistema de diseño (colores, tipografía, componentes base), login, estructura de carpetas, CI con tests, deploy en Vercel.

**Fase 1 – MVP para que las feriantes lo prueben (gratis)**: portada **"En vivo ahora"** con puestos debajo, tienda y productos (tiendas por invitación durante el piloto), seguir puestos, sala en vivo con WebRTC (activar Cloudflare Stream; **sin grabación**, porque WebRTC no se graba y las repeticiones son de la Fase 2), chat con moderación básica, Código en vivo con pago por prenda, **modo alias** con "Ya pagué" y confirmación de la vendedora. Piloto con 5–10 feriantes reales. Se construye en 6 partes (0 pantallas · 1 tiendas y productos · 2 sala en vivo · 3 chat · 4 código en vivo y pagos · 5 preparación del piloto); las pantallas están en `docs/superpowers/specs/2026-10-14-fase-1-parte-0-pantallas-design.md` y cada parte tiene su diseño y su plan en `docs/superpowers/`.

**Fase 2 – Experiencia completa**: carrito del vivo, reputación y faltas, repeticiones con productos marcados (requiere grabar por RTMP u otra alternativa, con borrado automático), notificaciones push a seguidores, vivos programados, ayudantes, panel de ventas.

**Fase 3 – Monetización y crecimiento**: suscripción mensual de las emprendedoras (monto según análisis de mercado), QR interoperable con confirmación automática, descubrimiento por categoría, publicidad, agentes de IA, apps nativas si hace falta.

## 11. Ideas pendientes (se definen en el camino)

### Pendientes conocidos (detalles menores anotados en las revisiones)

- La dueña ve el botón "Seguir" en su propia tienda (ocultarlo).
- En escritorio todo se ve en una columna angosta (pensado primero para celular).
- Editar un producto no es "todo o nada": si falla a mitad de camino puede perder sus fotos.
- Fotos sueltas en Storage cuando se abandona un formulario: hace falta una limpieza periódica.
- La consulta del Inicio trae más datos de los necesarios (optimizar cuando haya muchas tiendas).
- La base no controla el formato de las rutas de fotos ni impide saltar pasos del recorrido manipulando el navegador.
- Si se pierde la respuesta al abrir el puesto, el reintento dice "Esta invitación ya se usó." aunque la tienda se creó.
- Vista previa con foto al compartir el link de una tienda por WhatsApp.
- Antes del piloto: proyecto de Supabase separado para producción y plan pago (para que no se pause). Hoy las pruebas automáticas escriben en la misma base que usa la página publicada: mientras corren, pueden aparecer vivos de prueba en "En vivo ahora". Separarlo antes de invitar a las feriantes.
- Si la feriante cierra la página, el vivo queda como "vuelve en un momento" hasta 15 minutos (en vez de 5): el celular no distingue bien entre cerrar y salir un rato.
- Si la transmisión no llega a Cloudflare (por ejemplo, Cloudflare caído), el vivo figura "EN VIVO" con la imagen en negro mientras su página esté abierta: mandar en la señal si realmente está transmitiendo.
- La tabla de vivos muestra públicamente qué cuenta de administración cortó un vivo (`ended_by`, un identificador sin nombre) y el `device_id`: ocultar esas columnas.
- Limitar la cantidad de señales por persona en `/mi-puesto/vivo/senal` (junto con el límite del chat, Parte 3).
- La portada y la sala reciben cada cambio de todos los vivos (optimizar cuando haya muchos).
- Si la compradora entra a un vivo que ya perdió la señal, el aviso "se está reconectando" tarda hasta 40 s en aparecer.
- Idea del dueño (2026-10-29): en "vuelve en un momento" y "se está reconectando", en vez de solo el cartel de texto, mostrar una animación o un indicador de carga con la portada o la foto del puesto.
- Idea del dueño (2026-10-29): programar vivos (ya está en la Fase 2 como "vivos programados").
- Borrar los 2 administradores temporales de `platform_admins` al terminar la prueba en celulares.

- Agentes de IA como moderadores del chat y asistentes de la vendedora.
- Más seguridad para emprendedoras y compradoras (verificación de identidad de la vendedora, reputación pública, denuncias).
- Videos promocionales para invitar feriantes (posible uso de HyperFrames).

## 12. Forma de trabajo

- Usar **Superpowers**: brainstorming → writing-plans → ejecución con TDD → verificación antes de dar algo por terminado.
- **Planificar antes de construir**: no escribir código sin un plan aprobado por el dueño del proyecto.
- **Context7** para documentación de librerías.
- **Frontend Design** para todas las pantallas: diseño profesional, cálido y cercano, que no parezca plantilla genérica.
- **Playwright** para probar los flujos críticos: entrar a la sala, reclamar código, informar pago.
- Commits pequeños y descriptivos en español.
- Avanzar de a un paso y mostrar qué cambió antes de seguir.

## 13. Mapa del proyecto

Next.js es "todo en uno": cada pantalla y las acciones del servidor que usa viven juntas. No hay carpetas "Frontend" y "Backend" separadas a propósito (decisión del 2026-10-15): separarlas obligaría a mantener dos aplicaciones sin beneficio para las usuarias.

### Carpetas

| Carpeta | Qué hay | Rol |
|---|---|---|
| `src/app/` | Una carpeta por dirección de la app. Adentro: `page.tsx` (la pantalla) y, si guarda datos, `acciones.ts` (Server Actions: el "backend" de esa pantalla) | Pantallas + servidor |
| `src/components/` | Piezas visuales reutilizables, agrupadas por tema: `ui/` (shadcn), `marca/`, `navegacion/`, `fotos/`, `tiendas/`, `vivos/` | Interfaz |
| `src/lib/` | Lógica sin pantalla, por tema: `tiendas/` (validaciones, entregas, lecturas de datos, tipos), `vivos/` (Cloudflare Stream, transmitir y mirar con WebRTC, presencia, señal de vida, privacidad, reconexión y lecturas de datos), `fotos/` (compresión, subida, rutas), `format/` (plata y fechas), `auth/`, `supabase/` (conexiones), `red.ts` (errores de conexión) | Reglas del negocio |
| `src/db/schema.ts` | Descripción de las tablas (Drizzle) | Base de datos |
| `drizzle/` | Migraciones numeradas: las `seguridad_*.sql` tienen los permisos (RLS), funciones y reglas de Storage | Base de datos |
| `src/proxy.ts` | Corre antes de cada página: renueva la sesión y protege `/cuenta` y `/mi-puesto` | Seguridad |
| `tests/` | `e2e/` (Playwright, como una persona usando la app), `integracion/` (reglas de la base contra Supabase), `helpers/` (usuarios y tiendas de prueba). Las pruebas unitarias van junto al archivo que prueban (`*.test.ts`) | Calidad |
| `docs/superpowers/` | `specs/` (documentos de diseño) y `plans/` (planes de implementación) | Documentación |
| `assets/`, `scripts/`, `public/icons/` | Ícono de la app en SVG, el script que genera los PNG y los PNG generados | Marca |
| `.claude/skills/` | Skills del proyecto (diseño, animaciones, UI/UX) | Herramientas |

### Direcciones de la app → archivos

| Dirección | Archivo | Quién la ve |
|---|---|---|
| `/` | `src/app/page.tsx` | Todos (Inicio con Puestos) |
| `/@usuario` y `/@usuario/p/[id]` | `src/app/tienda/[handle]/…` (reescritura en `next.config.ts`, porque en Next las carpetas con `@` son otra cosa) | Todos |
| `/seguidos`, `/mis-compras` | `src/app/seguidos/`, `src/app/mis-compras/` | Compradoras |
| `/mi-puesto` y debajo (`armar`, `tienda`, `productos`) | `src/app/mi-puesto/…` | Feriantes |
| `/mi-puesto/vivo` | `src/app/mi-puesto/vivo/` | Feriantes |
| `/@usuario/vivo` | `src/app/tienda/[handle]/vivo/` | Todos |
| `/invitacion/[token]` | `src/app/invitacion/[token]/` | Quien recibe una invitación |
| `/admin` | `src/app/admin/` | Solo administradores (los demás ven "no encontrada") |
| `/cuenta` | `src/app/cuenta/` | Con sesión |
| `/auth/callback` | `src/app/auth/callback/route.ts` | Vuelta del login de Google |
| `/diseno` | `src/app/diseno/` | Muestra interna del sistema de diseño |

### Dónde cambiar cada cosa

- **Un texto de una pantalla**: en el `page.tsx` o en el componente de `src/components/` que la dibuja.
- **Un mensaje de error de un formulario**: en `src/lib/tiendas/validacion.ts` (formatos) o en el `acciones.ts` de esa pantalla.
- **Colores, letra, animaciones**: `src/app/globals.css` (ver la sección 4 del diseño de la Fase 0).
- **Quién puede ver o editar un dato**: en la migración `seguridad_*.sql` correspondiente, con una migración nueva (nunca editando una ya aplicada).
- **Una tabla o columna**: `src/db/schema.ts` + `npm run db:generate` + migración de seguridad + `npm run db:migrate`.

### Dónde va el código nuevo

Cada función nueva del producto (por ejemplo, los vivos de la Parte 2) sigue el mismo patrón: pantallas en `src/app/<dirección>/`, sus acciones en un `acciones.ts` al lado, lógica en `src/lib/<tema>/`, componentes en `src/components/<tema>/`, tablas en `src/db/schema.ts` + `drizzle/`, y pruebas en `tests/` o junto al archivo.
