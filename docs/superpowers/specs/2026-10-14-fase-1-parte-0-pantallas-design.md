# Fase 1 · Parte 0 – Pantallas y experiencia · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-10-14
- **Estado**: pendiente de revisión del dueño del proyecto
- **Referencias**: [CLAUDE.md](../../../CLAUDE.md) · [Diseño de la Fase 0](2026-10-13-fase-0-bases-design.md) (sistema de diseño "Lapacho y limón", sección 4)

## 1. Objetivo

Definir, antes de escribir código, cómo se ve y cómo se recorre Tu Feria Live en la Fase 1: qué pantallas hay, qué muestra cada una, quién puede usarlas y cómo se comporta la app en situaciones difíciles (sin vivos, mala conexión, perder un código). Todas las partes siguientes de la Fase 1 construyen sobre este documento.

Esta parte **no produce código**. Su resultado son este documento y las capturas de las muestras elegidas en [`fase-1-pantallas/`](fase-1-pantallas/).

## 2. División de la Fase 1

| Parte | Contenido | Depende de |
|---|---|---|
| **0** | Pantallas y experiencia (este documento) | — |
| **1** | Tiendas y productos: crear tienda por invitación, alias y titular, formas de entrega, productos con fotos, tienda pública, seguir puestos | 0 |
| **2** | Sala en vivo: transmisión desde el navegador del celular (Cloudflare Stream, WebRTC), sala para mirar, portada "En vivo ahora" | 1 |
| **3** | Chat en tiempo real con moderación básica y límite contra spam | 2 |
| **4** | Código en vivo y pagos: crear código, reclamo atómico, lista de espera, plazo de pago, "Ya pagué" con comprobante, confirmación, entrega, Mis compras, pedidos en "Mi puesto" | 3 |
| **5** | Preparación del piloto: entrar con código por email, página de presentación para feriantes, formulario "Quiero vender", aprobación de feriantes por el dueño, proyecto de Supabase de producción, Sentry y PostHog | 4 |

Cada parte tiene su propio documento de diseño, plan y ejecución, y al terminarla se puede probar.

## 3. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Portada | "En vivo ahora" arriba y "Puestos" abajo | En el piloto la mayor parte del tiempo nadie transmite; la portada nunca debe verse vacía |
| Disposición de la portada | **A · Vidriera**: vivos como tarjetas verticales que se deslizan de costado, con el código activo visible; debajo, cada puesto con tres productos y precio | Muestra el código y el precio antes de entrar, que es lo que hace entrar a la sala; funciona con uno o varios vivos |
| "En vivo ahora" | Se adelanta de la Fase 3 a la Fase 1 | La portada tipo plataforma de transmisión hace que la propuesta se entienda de un vistazo |
| Quién abre una tienda | **Por invitación** durante el piloto: el dueño pasa un link a cada feriante. El resto ve "Quiero vender en Tu Feria Live" y el pedido le llega al dueño | Control de quién vende y de productos prohibidos desde el primer día |
| Sala de la compradora | **A · Pantalla completa con burbujas**: video vertical a pantalla completa, chat abajo con cada mensaje en burbuja oscura semitransparente, máximo un tercio de la pantalla, mensajes viejos que se desvanecen y botón para esconder el chat | Igual a los vivos de Facebook/Instagram que ya usan; las burbujas mantienen el chat legible sobre videos claros |
| Pago al ganar | Recorrido de 4 pasos en un panel que sube desde abajo, con el vivo andando atrás (sección 6) | No se pierde el vivo mientras se paga |
| Estudio de la feriante | **A · Cámara completa** con botón amarillo "Nuevo código", código activo con unidades vendidas, avisos de pago arriba con "Confirmar" y botón **"Pagos (n)"** que abre la lista de pagos pendientes | Se usa con una mano; la lista cubre los momentos con varios pagos a la vez |
| Grabación de vivos | **No se graba en la Fase 1** | WebRTC desde el navegador hoy no se puede grabar en Cloudflare Stream; grabar exigiría una app aparte (RTMP) y suma costo; las repeticiones son de la Fase 2 |
| Resumen del vivo | Se guardan como datos los productos mostrados, los códigos y quién ganó cada uno | Es lo que la feriante necesita para sus ventas y no cuesta almacenamiento de video |
| Seguir puestos | Entra en la Fase 1 (botón "Seguir" y pestaña "Seguidos"); las notificaciones al celular siguen en la Fase 2 | Da a la compradora sus puestos a mano sin adelantar las notificaciones |
| Compra fuera del vivo | No existe en la Fase 1: la tienda es una vidriera; se compra solo en el vivo con código | Mantiene el alcance del MVP |
| Página de presentación, "Quiero vender" y aprobación de feriantes | Se diseñan en la Parte 5 | Se usan recién antes del piloto y podrán mostrar capturas reales |

## 4. Personas y permisos

| Persona | Puede |
|---|---|
| **Visitante** (sin cuenta) | Ver portada, tiendas y vivos; leer el chat |
| **Compradora** (cuenta de Google) | Lo anterior, más escribir en el chat, reclamar códigos, pagar, ver Mis compras y seguir puestos |
| **Feriante** (invitada) | Lo anterior, más "Mi puesto": transmitir, crear códigos, confirmar pagos, ver pedidos, cargar productos y configurar su tienda |
| **Dueño de la plataforma** | Generar invitaciones y aprobar pedidos de "Quiero vender" (pantallas en la Parte 5) |

Regla: **mirar es libre; escribir en el chat o reclamar un código requiere sesión.** Si una visitante intenta escribir, ve "Entrá con Google para participar" y, al volver del login, regresa a la misma sala.

## 5. Mapa de pantallas

Barra de navegación inferior:
- **Compradora**: Inicio · Seguidos · Mis compras · Cuenta
- **Feriante**: Inicio · Mi puesto · Mis compras · Cuenta (una feriante también puede comprar)

```
Inicio (En vivo ahora + Puestos)
 ├─ Tarjeta de vivo ─► Sala en vivo ─► escribe el código ─► ¡Ganaste! (elige entrega) ─► Ya pagué ─► (comprobante) ─► Esperando confirmación ─► Pagado: datos de entrega
 ├─ Puesto ─► Tienda de la feriante (Seguir)
 └─ Mis compras ─► Ver datos para pagar (reabre el panel de pago)

Seguidos ─► lista de puestos seguidos (los que están en vivo, primero)

Mi puesto (feriante)
 ├─ Empezar vivo ─► Estudio (cámara + Nuevo código + Pagos (n) + Terminar)
 ├─ Pedidos ─► Confirmar pago / ver comprobante
 ├─ Mis productos ─► cargar y editar productos con foto y precio
 └─ Mi tienda ─► nombre, foto, portada, zona, "suele estar en vivo", alias, titular, formas de entrega
```

## 6. Pantallas

Capturas de referencia en [`fase-1-pantallas/`](fase-1-pantallas/). Los emojis representan fotos y videos reales.

### 6.1 Inicio — [01-portada-opciones.png](fase-1-pantallas/01-portada-opciones.png) (opción A)
- Encabezado con el logotipo "Tu Feria Live" y búsqueda.
- **En vivo ahora**: tarjetas verticales (proporción de celular) que se deslizan de costado. Cada una muestra el cartel EN VIVO, cuántas personas miran, el código activo con su precio (si hay) y el nombre y zona del puesto. Orden: más personas mirando primero.
- **Puestos**: tarjeta por puesto con foto, nombre, rubro y zona, botón Seguir y tres productos con precio. Un puesto que está en vivo lo indica.
- Sin vivos: la sección "En vivo ahora" se reemplaza por "Ahora no hay nadie en vivo. Seguí a tus puestos favoritos."

### 6.2 Sala en vivo (compradora) — [02-sala-opciones.png](fase-1-pantallas/02-sala-opciones.png) (A) y [03-sala-chat-legible.png](fase-1-pantallas/03-sala-chat-legible.png) (versión final)
- Video vertical a pantalla completa.
- Arriba: foto y nombre del puesto (sobre fondo oscuro translúcido), botón Seguir, cerrar, EN VIVO y cantidad mirando.
- Abajo, de arriba hacia abajo: mensajes del chat en burbujas, tarjeta del **código activo** (foto, código en limón, unidades que quedan, precio, "Escribilo en el chat"), campo "Escribí un mensaje o un código…".
- El chat ocupa como máximo un tercio de la pantalla; los mensajes viejos se desvanecen hacia arriba; un oscurecido suave detrás. Botón 💬 para esconder o mostrar el chat.
- Los anuncios de ganadoras ("🎉 Sofi se llevó ROJO") se destacan en limón dentro del chat.

### 6.3 Ganar y pagar — [04-ganaste-y-pago.png](fase-1-pantallas/04-ganaste-y-pago.png)
Panel que sube desde abajo, con el vivo visible atrás:
1. **¡Ganaste el código X!**: foto y descripción del producto, puesto, **elección de la forma de entrega** entre las que ofrece la feriante (retiro en su domicilio, envío, punto de encuentro), total actualizado según la entrega ("Vestido $8.000 + envío $2.500 = $10.500"), alias con botón Copiar, titular, cuenta regresiva del plazo ("Si no, pasa a la siguiente") y botón **Ya pagué**. Único festejo animado de la app.
2. **Comprobante (opcional)**: subir captura desde la galería, "Enviar comprobante" o "Seguir sin comprobante". Solo lo ven la compradora y la feriante.
3. **Esperando confirmación**: "Le avisamos a Mica", estado "Pago informado", botón Seguir mirando.
4. **Pago confirmado**: se muestran los datos de la entrega elegida (por ejemplo, la dirección exacta y horarios de retiro, visibles recién ahora) y se pide el WhatsApp la primera vez, para coordinar.

> **Ajuste del 2026-10-14 (diseño de la Parte 1):** las feriantes venden desde su domicilio, no en una feria física, y el envío puede ser gratis, con monto fijo o "a coordinar". Por eso la entrega se elige en el paso 1, antes de transferir, y la dirección exacta del domicilio solo la ve quien ya pagó. La captura `04` es anterior a este ajuste (muestra la entrega en el paso 4 y "Retiro en la feria").

### 6.4 Estudio de la feriante — [05-estudio-feriante.png](fase-1-pantallas/05-estudio-feriante.png) (A + panel)
- Cámara a pantalla completa, como la ven las compradoras.
- Arriba: EN VIVO con el tiempo transcurrido, cantidad mirando, cambiar cámara, botón **Pagos (n)** y **Terminar**.
- Avisos de pago arriba ("Sofi pagó ROJO · $8.000 · con comprobante" + Confirmar).
- Abajo: chat en burbujas, el código activo con "1 de 3 vendidos" y menú (anular, liberar, asignar a mano), y el botón amarillo grande **＋ Nuevo código**.
- **Pagos (n)** abre un panel con la lista de pagos pendientes y en espera, cada uno con Confirmar y acceso al comprobante.
- **Nuevo código** (panel desde abajo): foto tomada sola del video, precio, código sugerido (por ejemplo colores) o escrito a mano, cantidad disponible y botón "Lanzar código X · $precio". También permite elegir un producto ya cargado. Objetivo: menos de 5 segundos.

### 6.5 Tienda de la feriante — [06-tienda-panel-mis-compras.png](fase-1-pantallas/06-tienda-panel-mis-compras.png) (izquierda)
Portada, foto, nombre, rubro, zona, cantidad de seguidores, botón Seguir, recuadro "Suele estar en vivo…" (texto que escribe la feriante) y grilla de productos con foto, precio y descripción corta. Si está en vivo, un acceso destacado a la sala.

### 6.6 Mi puesto — misma captura (centro)
Saludo, botón rojo grande **Empezar vivo**, resumen (pagos por confirmar, ventas del último vivo), lista de pedidos con estado (Confirmar pago, Esperando pago con tiempo restante, Pagado con forma de entrega y WhatsApp) y accesos a Mis productos y Mi tienda.

### 6.7 Mis compras — misma captura (derecha)
Arriba y resaltado en limón, lo que falta pagar con su cuenta regresiva y "Ver datos para pagar". Debajo, lo que espera confirmación y lo pagado con su forma de entrega.

## 7. Reglas de experiencia

### 7.1 Nunca una pantalla vacía o muda

| Situación | Mensaje |
|---|---|
| Nadie en vivo | "Ahora no hay nadie en vivo. Seguí a tus puestos favoritos." |
| Tienda sin productos | "Todavía no cargó productos. Mirala en su próximo vivo." |
| Mis compras vacío | "Cuando ganes un código, lo vas a ver acá." |
| Seguidos vacío | "Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten." |
| El vivo terminó mientras se miraba | "El vivo terminó. Gracias por acompañar a [nombre]." + botón a su tienda |

### 7.2 Perder un código
- Si otra llegó antes y hay lista de espera: "**[Nombre] llegó primero.** Quedaste **N.ª en la lista**: si no paga a tiempo, es tuyo."
- Si se agotó y no hay lista: "Se agotó [CÓDIGO]."
- Si pasa a ser la ganadora por vencimiento de otra: se abre el panel "¡Ganaste!" con su propio plazo.

### 7.3 Mala conexión
- Video cortado: "Reconectando…" sobre la imagen, sin sacar a nadie de la sala.
- Transmisión caída de la feriante: la sala muestra "[Nombre] se está reconectando" y espera unos minutos antes de dar el vivo por terminado (el tiempo exacto se define en la Parte 2).
- Mensaje no enviado: queda marcado con "Reintentar".

### 7.4 Legibilidad y accesibilidad
- Chat en burbujas; una prueba automática verifica su contraste sobre fondos claros y oscuros.
- Todo lo que se toca mide al menos 44 px; textos con contraste AA; se respeta "reducir movimiento".
- Montos en pesos con formato argentino ($8.000); horas en `America/Argentina/Tucuman`.

### 7.5 Movimiento
Según el sistema de diseño de la Fase 0: solo el festejo de "¡Ganaste!" es una animación grande; el código nuevo aparece con un fundido corto; los paneles suben desde abajo; los mensajes del chat no se animan.

### 7.6 Textos
Voseo, claros y sin tecnicismos. Los errores dicen qué pasó y qué hacer (ejemplo: "No se pudo subir la foto. Probá con otra o revisá tu conexión."). Nunca códigos de error ni textos en inglés.

## 8. Costos del video (referencia para la mensualidad)

Precios de Cloudflare Stream consultados el 2026-10-14:

- **Transmitir es gratis.** Se paga **1 dólar cada 1.000 minutos mirados** (por cada persona que mira).
- **Guardar grabaciones** cuesta 5 dólares por mes cada 1.000 minutos; no aplica en la Fase 1 porque no se graba.
- Ejemplo: un vivo de 90 minutos con 48 personas mirando ≈ 4.320 minutos ≈ **4,30 dólares**.
- Ejemplo de piloto: 10 feriantes × 8 vivos por mes × 30 personas promedio × 90 minutos ≈ 216.000 minutos ≈ **216 dólares por mes**.
- El costo crece con el público; debe considerarse al definir la mensualidad.

## 9. Fuera de alcance de la Fase 1 (anotado para después)

- Grabación y repeticiones de vivos; fila "Ya mostró en este vivo" dentro de la sala (Fase 2).
- Notificaciones al celular de "está en vivo" (Fase 2).
- Vivos programados con agenda (Fase 2); en la Fase 1 solo existe el texto libre "Suele estar en vivo…".
- Compra desde la tienda sin vivo.
- Carrito del vivo (Fase 2): en la Fase 1 se paga por prenda.

## 10. Criterios de terminado de la Parte 0

1. El dueño aprobó este documento.
2. Las capturas de las pantallas elegidas están en `docs/superpowers/specs/fase-1-pantallas/`.
3. El CLAUDE.md refleja el cambio de alcance ("En vivo ahora" en la Fase 1, sin grabación en la Fase 1).
