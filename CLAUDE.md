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
| Video | Cloudflare Stream — Live Inputs con WebRTC (WHIP para transmitir, WHEP para ver). RTMP opcional para OBS/Larix. Se activa en la Fase 1 |
| Archivos | Supabase Storage (fotos de productos, comprobantes en bucket privado) |
| Tests | Vitest (unitarios) + Playwright (end-to-end) |
| Observabilidad | Sentry (errores) + PostHog (métricas) |
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
- **Tienda (store)**: perfil público de la emprendedora con catálogo y sus datos de cobro (alias).
- **Sala**: la página del vivo de una tienda (video + chat + producto/código activo).
- **Vivo (live_session)**: una transmisión concreta, con inicio, fin y grabación.
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

`users`, `stores` (incluye alias y titular de cobro), `store_members` (ayudantes), `products`, `live_sessions`, `live_codes`, `claims`, `chat_messages`, `orders`, `order_items`, `payment_reports` (pago informado por la compradora + comprobante + confirmación de la vendedora), `follows`, `buyer_reputation`, `moderation_actions` (sala), `reports` (plataforma).

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

## 10. Plan por fases

**Fase 0 – Bases**: proyecto Next.js + Supabase + Drizzle, sistema de diseño (colores, tipografía, componentes base), login, estructura de carpetas, CI con tests, deploy en Vercel.

**Fase 1 – MVP para que las feriantes lo prueben (gratis)**: portada **"En vivo ahora"** con puestos debajo, tienda y productos (tiendas por invitación durante el piloto), seguir puestos, sala en vivo con WebRTC (activar Cloudflare Stream; **sin grabación**, porque WebRTC no se graba y las repeticiones son de la Fase 2), chat con moderación básica, Código en vivo con pago por prenda, **modo alias** con "Ya pagué" y confirmación de la vendedora. Piloto con 5–10 feriantes reales. Se construye en partes; las pantallas están definidas en `docs/superpowers/specs/2026-10-14-fase-1-parte-0-pantallas-design.md`.

**Fase 2 – Experiencia completa**: carrito del vivo, reputación y faltas, repeticiones con productos marcados (requiere grabar por RTMP u otra alternativa, con borrado automático), notificaciones push a seguidores, vivos programados, ayudantes, panel de ventas.

**Fase 3 – Monetización y crecimiento**: suscripción mensual de las emprendedoras (monto según análisis de mercado), QR interoperable con confirmación automática, descubrimiento por categoría, publicidad, agentes de IA, apps nativas si hace falta.

## 11. Ideas pendientes (se definen en el camino)

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
| `src/components/` | Piezas visuales reutilizables, agrupadas por tema: `ui/` (shadcn), `marca/`, `navegacion/`, `fotos/`, `tiendas/` | Interfaz |
| `src/lib/` | Lógica sin pantalla, por tema: `tiendas/` (validaciones, entregas, lecturas de datos, tipos), `fotos/` (compresión, subida, rutas), `format/` (plata y fechas), `auth/`, `supabase/` (conexiones), `red.ts` (errores de conexión) | Reglas del negocio |
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
