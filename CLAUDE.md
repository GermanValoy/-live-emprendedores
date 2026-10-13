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
| Auth | Supabase Auth (Google + teléfono) |
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
7. Pago confirmado → pedido "Pagado" → se piden datos de entrega (retiro en feria, punto de encuentro, envío).
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

**Fase 1 – MVP para que las feriantes lo prueben (gratis)**: tienda y productos, sala en vivo con WebRTC (activar Cloudflare Stream), chat con moderación básica, Código en vivo con pago por prenda, **modo alias** con "Ya pagué" y confirmación de la vendedora. Piloto con 5–10 feriantes reales.

**Fase 2 – Experiencia completa**: carrito del vivo, reputación y faltas, repeticiones con productos marcados, seguidores y notificaciones push, vivos programados, ayudantes, panel de ventas.

**Fase 3 – Monetización y crecimiento**: suscripción mensual de las emprendedoras (monto según análisis de mercado), QR interoperable con confirmación automática, "En vivo ahora" y descubrimiento por categoría, publicidad, agentes de IA, apps nativas si hace falta.

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
