# Fase 1 · Parte 4 – Código en vivo y pagos · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-11-06
- **Estado**: pendiente de revisión del dueño del proyecto (ya pasó la revisión de un constructor)
- **Referencias**: [CLAUDE.md](../../../CLAUDE.md) (secciones 6 y 7) · [Parte 0 – Pantallas](2026-10-14-fase-1-parte-0-pantallas-design.md) (6.2, 6.3, 6.4, 6.7 y 7.2; capturas [04](fase-1-pantallas/04-ganaste-y-pago.png), [05](fase-1-pantallas/05-estudio-feriante.png) y [06](fase-1-pantallas/06-tienda-panel-mis-compras.png)) · [Parte 1 – Tiendas](2026-10-14-fase-1-parte-1-tiendas-design.md) · [Parte 2 – Sala en vivo](2026-10-26-fase-1-parte-2-sala-en-vivo-design.md) · [Parte 3 – Chat](2026-11-04-fase-1-parte-3-chat-design.md) (sección 11) · prueba de voz en la rama `prueba-voz` (sección 12)

## 1. Intención

Automatizar la venta que hoy se hace a mano en los vivos de Facebook, sin cambiarle la costumbre a nadie.

**Cómo es hoy:**
1. La feriante va sacando prendas frente a la cámara, dice el precio y "se lo lleva con el código ROJO". El código lo inventa ella en el momento.
2. La primera que escribe ROJO en el chat se la lleva.
3. Una ayudante, sentada al lado, anota quién ganó cada prenda.
4. La feriante le pasa el alias por mensaje.
5. La compradora transfiere y manda la captura del comprobante por WhatsApp.
6. Cuando termina el vivo, la feriante revisa en su banco que la plata haya llegado.

**Dónde duele:**
- hace falta alguien que anote;
- cuando dos dicen "yo escribí primero", no hay forma de demostrarlo, y se arma tensión;
- todo el ida y vuelta de alias y comprobantes es a mano.

En la plataforma, la feriante **dice lo mismo que hoy y la app arma el código sola, escuchando su voz**. El servidor decide quién escribió primero, todas ven quién ganó, la ganadora recibe los datos para pagar y la feriante revisa los pagos tranquila al terminar.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Crear el código **con la voz, sin tocar el celular**, mientras la feriante tiene la prenda con las dos manos. La carga a mano queda de respaldo.
- Adjudicar sin discusión: **la primera según la hora del servidor gana**, nunca hay dos ganadoras para la misma unidad, y la sala muestra a todas quién ganó.
- Que la ganadora pague como hoy (alias), informe el pago con el comprobante, y que la feriante lo confirme después de revisar su banco.
- Que la prenda pase sola a la siguiente si la ganadora no paga, y que la feriante resuelva los pagos que no llegaron.
- Mis compras, para la compradora, y los pedidos de cada vivo, para la feriante.

**No objetivos (quedan para después)**
- Carrito del vivo, ayudantes, reputación visible de las compradoras (Fase 2).
- **Balance diario y mensual de ventas**: el dueño lo quiere, pero en la Fase 2, todo junto con el panel de ventas.
- Avisos al celular (push). La compradora se entera en la sala o en Mis compras.
- QR interoperable o confirmación automática del pago (Fase 3).
- Asignar un código a mano a alguien que no lo escribió. *Decisión de Claude: no se habló y no hace falta para el piloto; con "Anular reclamo" alcanza para corregir errores.*
- Comprar fuera del vivo: la tienda sigue siendo una vidriera (Parte 0).

**Anti-objetivos** (si pasa esto, la parte falló aunque "funcione")
1. **Que la feriante tenga que soltar la prenda o dejar de mirar a cámara para vender.**
2. **Que una compradora gane algo que no quiso**, por ejemplo por preguntar "¿el rojo qué talle es?".
3. **Que la voz lance un precio o un código equivocado a las compradoras** sin que la feriante lo vea antes.
4. **Que haya dos ganadoras para la misma unidad**, o que alguien pueda dudar con razón de quién fue primera.
5. **Que la plataforma toque la plata o la retenga.** El dinero va directo de la compradora a la feriante, siempre (CLAUDE.md §7).
6. **Que se gaste plata de más.** La voz usa lo gratis de Cloudflare durante el piloto (sección 11).

## 3. Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| Crear el código | **Por voz, manos libres**: la app escucha el vivo y, cuando la feriante dice el precio y "código X", arma el código con la foto. No hay que apretar nada | Dueño (pidió que el reconocimiento de voz "genere todo"; descartó apretar un botón porque tiene la prenda en las manos) |
| Con qué se reconoce la voz | **Whisper de Cloudflare** (`@cf/openai/whisper-large-v3-turbo`) sobre una copia del audio de la transmisión. El reconocimiento del celular no sirve: con la cámara prendida no oye nada (sección 12) | Probado con el dueño en su Android |
| Costo de la voz | Se acepta: gratis en el piloto y unos 3 centavos de dólar por hora de vivo después | Dueño ("dale probamos así") |
| Lanzar | Al principio, la feriante toca **"Lanzar"** para que el código llegue a las compradoras. Si molesta, más adelante se hace automático | Dueño ("lo vamos viendo, si molesta lo hacemos automático") |
| Palabra del código | La inventa la feriante en el momento (ROJO, LUNA, MARIPOSA) | Dueño |
| Quién crea códigos | Solo la feriante, desde el celular con el que transmite (no hay ayudantes en la Fase 1) | CLAUDE.md |
| Qué cuenta como reclamo | El código solo, sin importar mayúsculas, tildes, signos ni emojis ("ROJO", "rojo!!", "Rojo 🙋‍♀️"), o con palabras de "lo quiero" **que incluyan el código** ("quiero ROJO", "lo quiero ROJO", "yo ROJO", "ROJO mío"). **No cuentan** las preguntas, las frases largas ni "lo quiero" sin el código | Dueño (las compradoras mezclan el código en frases o preguntan sin querer comprar) |
| Ganadora a la vista | El nombre de la ganadora aparece en la sala para todas **unos 15 a 20 segundos** | Dueño |
| Plazo para pagar | **15 minutos** desde que gana, que cada feriante puede cambiar en su puesto. Hoy esperan "hasta que termina el vivo, y más si es conocida"; el número final se define con las feriantes | Dueño (propuesta de Claude aceptada) |
| Vence el plazo | La prenda pasa sola a la siguiente de la lista de espera, que recibe su propio plazo. Si no hay nadie, vuelve a estar disponible | Dueño |
| Conocidas | Botón **"Darle más tiempo"** en el pedido | Dueño |
| Falta | Se **registra** cuando vence el plazo o cuando la feriante ofrece la prenda a otra, pero **no se muestra ni castiga** (la reputación es de la Fase 2) | Dueño |
| Comprobante | Al tocar "Ya pagué", la captura del comprobante es **obligatoria**: es lo que la feriante usa hoy para saber que le pagaron. *Cambia la Parte 0, donde era opcional* | Claude (lo propuso y el dueño no lo objetó; ver sección 14) |
| Cuándo confirma la feriante | **Al terminar el vivo**, después de revisar en su banco que la plata haya llegado, para evitar estafas con comprobantes falsos. Durante el vivo, solo si quiere | Dueño |
| La plata no llegó | Primero aclara con la compradora y, si no se resuelve, **ofrece la prenda a otra** | Dueño |
| WhatsApp de la compradora | Se pide **al tocar "Ya pagué"** (y no recién al confirmarse el pago), para que la feriante pueda escribirle si hay algo que aclarar | Claude (ver sección 14) |
| Entrega | Se elige **al ganar, antes de pagar**, porque el envío puede sumar costo. *La Parte 0 la ponía después del pago; manda CLAUDE.md §6, que es posterior* | CLAUDE.md |

## 4. Crear el código (estudio de la feriante, `/mi-puesto/vivo`)

La forma general es la del estudio de la Parte 0 (6.4, opción A): cámara a pantalla completa, botón amarillo **"+ Nuevo código"**, el código activo abajo y los avisos de pago arriba.

### 4.1 Por voz (lo normal)

1. **La voz está prendida durante todo el vivo.** Un indicador chico muestra "🎤 Escuchando códigos" y deja apagarla y volver a prenderla. *Arranca prendida: decisión de Claude.*
2. La feriante habla como siempre. El celular detecta cuándo habla (sin costo) y, en cada pausa, manda esa frase a Cloudflare. **La transmisión no se toca**: se graba una copia del mismo audio, así que las compradoras escuchan todo, todo el tiempo.
3. **La foto**: se saca del video de la cámara **en el momento en que empieza la frase**, que es cuando está mostrando la prenda. Se guarda en memoria y solo se sube si esa frase termina armando un código.
4. Cuando la frase trae **precio y código** ("se la llevan por ocho mil con el código ROJO"), aparece abajo un cartel con la **foto, "ROJO · $8.000", la cantidad (1) y un botón grande "Lanzar código ROJO · $8.000"**. El cartel no tapa la cara ni la prenda.
   - Tocar el precio, el código o la cantidad permite corregirlos con el teclado.
   - Una ✕ lo descarta.
   - Si llega otro código antes de que lance el primero, el cartel nuevo reemplaza al anterior. *Decisión de Claude.*
5. **Si repite el código** ("¡acuérdense, código ROJO!"), no se arma otro cartel: ROJO ya existe en este vivo. *Una palabra no se puede usar para dos códigos del mismo vivo: decisión de Claude, evita confusiones en el chat.*
6. **Si dijo el código pero no se entendió el precio**, el cartel aparece igual, con el precio vacío para completarlo.
7. **La cantidad**: arranca en 1 y se cambia en el cartel. *Que la voz entienda "tengo tres": no se pidió; queda para cuando el piloto diga si hace falta.*

### 4.2 A mano (respaldo)

El botón **"+ Nuevo código"** abre el mismo cartel, con la foto tomada en ese momento del video y los casilleros vacíos: precio (con teclado numérico), código (en mayúsculas automáticas) y cantidad. También deja **elegir un producto ya cargado** en su catálogo, que trae foto, precio y cantidad (Parte 0). **El catálogo solo sirve para llenar el cartel más rápido**: vender, vencer o anular un código **no cambia el producto** (ni su cantidad ni si se ve en la tienda). El código lleva su propia cantidad. Si la feriante quiere marcar algo como vendido en su tienda, lo hace a mano en Mis productos. *Decisión de Claude: la tienda es una vidriera en la Fase 1 y así no hay que mover stock en cada reclamo.* Sirve si Cloudflare no responde, si hay mucho ruido o si la feriante apagó la voz.

### 4.3 El código activo

- **Hay un solo código activo a la vez.** Lanzar uno nuevo cierra el anterior. Los reclamos ya hechos y la lista de espera del anterior siguen valiendo (sección 7).
- Abajo se ve "Código ROJO · 1 de 3 vendidos", con un menú:
  - **Cerrar código**: deja de recibir reclamos.
  - **Anular código**: si lo lanzó por error. Se cierra, y quien lo había ganado ve "La feriante anuló este código". *Solo si nadie pagó todavía: decisión de Claude.*
  - **Ver quién lo ganó**, con **Anular reclamo** para cada una. La unidad pasa a la siguiente de la lista.
- Cuando se venden todas las unidades, el código sigue en pantalla con "Agotado" para que sigan entrando a la lista de espera, hasta que lo cierre o lance otro.
- Cada código queda guardado con su foto, precio, cantidad y quiénes lo ganaron. Es el "resumen del vivo" de la Parte 0.

## 5. Sala de la compradora (`/@usuario/vivo`)

### 5.1 La tarjeta del código

Entre el chat y el campo de escribir (Parte 0, 6.2) aparece la tarjeta con la foto, el código en limón, el precio, las unidades que quedan y "Escribilo en el chat". El campo pasa a decir "Escribí un mensaje o un código…". El código aparece con un fundido corto.

En "En vivo ahora", la tarjeta del vivo también muestra el código activo y su precio (Parte 0, decisión de la portada).

### 5.2 Escribir el código

- Para reclamar hay que tener **sesión iniciada** (Parte 0). Sin sesión, aparece "Entrá con Google para participar".
- El mensaje que es un reclamo **se publica en el chat como cualquier otro**, como hoy en Facebook.
- **Qué cuenta como reclamo**: lo de la sección 3. Para decidirlo, el texto se normaliza (mayúsculas, tildes, signos, emojis y letras repetidas), y después:
  - si es exactamente el código, cuenta;
  - si es el código más palabras de una lista corta de "lo quiero" (yo, quiero, lo quiero, mío, mía, me lo llevo, para mí), cuenta;
  - en cualquier otro caso no cuenta: preguntas (con "?" o con palabras como qué, cuánto, talle, cuál, viene), frases más largas, o "lo quiero" sin el código.

  *La lista exacta de palabras la arma el constructor, con pruebas como las del moderador del chat.*
- **Si nombra el código y no cuenta**, solo a ella le aparece abajo un aviso chico: "¿Lo querés? Escribí **ROJO**".
- **Códigos mal escritos** ("amarlllo", "amarilo" con el código AMARILLO activo): **en el piloto no cuentan**, pero solo a esa compradora le aparece al instante "¿Quisiste escribir **AMARILLO**? Escribilo de nuevo". Su lugar lo decide el mensaje bien escrito. Hoy la feriante suele aceptarlos "si se entiende"; **el dueño lo va a definir con las feriantes**. Por eso cada casi-acierto (una letra de diferencia, sin contar las letras repetidas) **se registra**: así se sabe cuántas veces pasa. Más adelante, si se decide aceptarlos, se activa con un interruptor en la configuración, sin rehacer nada. *Mientras tanto, una letra de diferencia no alcanza si hay otro código del mismo vivo igual de cerca.*
- **Una persona, una unidad por código.** Si escribe ROJO dos veces, no se lleva dos ni ocupa dos lugares en la lista.
- **La feriante no puede reclamar sus propios códigos.**
- **Silenciadas**: la Parte 3 dice que quien está silenciada "sigue pudiendo mirar y comprar". Por eso, si una silenciada escribe un reclamo válido, **cuenta como reclamo, pero el mensaje no aparece en el chat**. El campo de escribir lo permite solo para reclamos. *Decisión de Claude, para respetar la Parte 3.*
- Los límites del chat (muchos mensajes seguidos, repetidos) **no le roban un reclamo a nadie**. El reclamo se decide con el primer mensaje válido de cada persona, aunque el moderador oculte una repetición (Parte 3, sección 11).

### 5.3 Quién ganó

- **La primera según la hora del servidor gana**, unidad por unidad, y la decisión es atómica en la base (sección 10).
- A **todas** las que miran les aparece sobre el video "🎉 **ROJO** es de **Carla M.**" durante **18 segundos**. Es el mismo nombre corto del chat. *18 s está dentro de los 15 a 20 que pidió el dueño, y se cambia en la configuración.* Si se gana otra unidad mientras tanto, se agrega o se reemplaza. *Cómo: decisión del constructor.*
- **A la ganadora** se le abre el panel "¡Ganaste!" (sección 6), que es el único festejo animado de la app.
- **A las que llegaron después** (Parte 0, 7.2):
  - con lugar en la lista de espera: "**Carla M.** llegó primero. Quedaste **2.ª en la lista**: si no paga a tiempo, es tuyo.";
  - con la lista llena, o con el código agotado y sin lista: "Se agotó ROJO.".
- **La lista de espera** tiene hasta **5 personas por código**, en el orden en que escribieron. *Decisión de Claude, se cambia en la configuración.* Cada una ve solo su propio lugar.

## 6. Ganar y pagar (compradora)

La forma es la de la Parte 0 (6.3, captura 04), con dos cambios: la entrega se elige antes de pagar y el comprobante es obligatorio.

1. **¡Ganaste el código ROJO!** El panel sube desde abajo y el vivo sigue andando atrás. Muestra:
   - la foto y el precio del código, y el nombre del puesto;
   - **cómo la querés recibir**, entre las formas que ofrece la feriante (Parte 1): retiro en su domicilio (con la zona, sin la dirección exacta), envío (gratis, con monto fijo o "a coordinar") o punto de encuentro;
   - el **total**, que se actualiza según la entrega ("Vestido $8.000 + envío $2.500 = $10.500"). Con envío "a coordinar", el total es solo la prenda y aparece la aclaración "el envío lo arreglás con la feriante";
   - el **alias** con botón **Copiar**, el **titular** y el **monto exacto** a transferir;
   - la **cuenta regresiva** ("Tenés 14:52 para pagar. Si no, pasa a la siguiente.");
   - el botón **Ya pagué**, que se habilita cuando eligió la entrega.
2. **Ya pagué → comprobante y WhatsApp.**
   - Hay que subir la captura del comprobante. Se comprime en el celular y se le sacan los datos EXIF, igual que las fotos de la Parte 1.
   - Hay que poner el WhatsApp. Si ya lo usó en otra compra, viene completado.
   - Al enviar, **se frena la cuenta regresiva**: la prenda ya no pasa a otra mientras la feriante no diga lo contrario.
3. **Esperando confirmación**: "Le avisamos a Mica. Cuando confirme que le llegó la plata, lo vas a ver acá y en Mis compras." La compradora sigue mirando el vivo.
4. **Pagado**: "¡Mica confirmó tu pago!" y los datos de la entrega:
   - **retiro**: la dirección exacta y los horarios, que recién ahora puede ver (CLAUDE.md §1, Parte 1);
   - **punto de encuentro**: el lugar y la nota que cargó la feriante;
   - **envío**: "Mica te va a escribir por WhatsApp para coordinar".

**Si cierra la sala sin querer**, todo esto sigue en **Mis compras** (sección 9), con la cuenta regresiva corriendo.

**El cobro pasa por un módulo intercambiable** (CLAUDE.md §7): `lib/payments/` con una interfaz común, por ejemplo `PaymentMethod`, que dice qué datos mostrar para pagar y cómo se confirma. El modo alias, con confirmación a mano, es la primera implementación. Las pantallas no saben que es un alias.

## 7. Vencimientos y lista de espera

- Si vence el plazo sin "Ya pagué":
  1. el pedido queda **vencido** y se registra la falta;
  2. la unidad pasa a la **primera de la lista de espera**, que ve el panel "¡Ganaste!" con su propio plazo completo. Si no está en la sala, lo ve en Mis compras;
  3. si no queda nadie en la lista, la unidad vuelve a estar **disponible**. Si el código sigue activo, se puede volver a reclamar. Si no, queda para que la feriante la ofrezca en otro vivo.
- La lista sigue sirviendo **aunque el vivo haya terminado**, porque la feriante confirma pagos después (sección 8).
- **Darle más tiempo**: desde el pedido, la feriante le suma tiempo a una compradora que todavía no pagó. *Cuánto (por ejemplo +15 min, +1 hora, hasta mañana): decisión del constructor, con pocos botones.*
- **El vencimiento lo hace el servidor**, no el celular de nadie: una tarea programada en la base, como el cierre automático de vivos de la Parte 2, o la revisión de cada pedido cuando alguien lo mira. *Mecanismo: decisión del constructor. Lo que importa es que pase a tiempo aunque nadie tenga la app abierta.*

## 8. La feriante revisa los pagos

- **Durante el vivo**, arriba del estudio aparece un contador discreto, "Pagos para revisar (3)", que abre la lista. No hay avisos que tapen la cámara a cada pago. *Cambia la Parte 0, que mostraba un aviso por pago con "Confirmar": el dueño dijo que las feriantes revisan al terminar, así que se prioriza no distraer.*
- **Al terminar el vivo**, en lugar de la pantalla "Terminó" del estudio, aparece **"Pedidos de este vivo"**, agrupados por compradora (CLAUDE.md §6, punto 8). Cada compradora muestra su nombre, su WhatsApp con un botón para abrir el chat de WhatsApp, y sus prendas. Cada prenda muestra la foto, el código, el monto, la entrega elegida, el estado y el comprobante, que se agranda al tocarlo.
- Un aviso fijo arriba: "**Antes de confirmar, revisá en tu banco que la plata haya llegado.** Las capturas se pueden falsificar."
- **Acciones por pedido**:
  - **Confirmar pago**: pasa a Pagado.
  - **No me llegó el pago**: pasa a "En revisión". A la compradora le aparece "Mica no encuentra tu pago. Te va a escribir por WhatsApp para aclararlo." (la tienda no tiene WhatsApp propio; la feriante tiene el de la compradora) El pedido no vence en este estado. Desde ahí, la feriante puede:
    - **Confirmar pago**, si se aclaró;
    - **Ofrecer a otra**: el pedido queda anulado, se registra la falta y la unidad pasa a la siguiente de la lista, o vuelve a estar disponible (sección 7).
  - **Darle más tiempo**, si todavía no pagó (sección 7).
- La misma lista está en **Mi puesto → Pedidos**, con los vivos anteriores, para confirmar días después. Solo lista pedidos y sus acciones: no hay totales ni balances (Fase 2).
- Solo la dueña del puesto puede confirmar, rechazar u ofrecer a otra (CLAUDE.md §7).

## 9. Mis compras (`/mis-compras`)

Forma de la Parte 0 (6.7). Muestra todos los pedidos de la compradora, el más nuevo arriba, cada uno con la foto, el puesto, el código, el monto y el **estado**:
- **Por pagar**, con la cuenta regresiva y el botón "Ver datos para pagar", que reabre el panel;
- **Esperando confirmación**;
- **En revisión**, con el aviso de que la feriante le va a escribir por WhatsApp;
- **Pagado**, con los datos de la entrega;
- **Vencido** o **Anulado**, en gris.

Si no tiene pedidos: "Cuando ganes un código, lo vas a ver acá." (Parte 0).

## 10. Por dentro

### 10.1 Datos

Tablas nuevas (ya planeadas en CLAUDE.md §8):

- **Códigos** (`live_codes`): vivo, puesto, palabra (normalizada y como se muestra), precio en centavos, cantidad, foto (ruta en Storage), producto del catálogo (si salió de ahí), estado (activo, cerrado, anulado), creado por voz o a mano, horas.
- **Reclamos** (`claims`): código, compradora, **mensaje del chat que lo originó, con una copia propia de su texto y su hora del servidor** (el chat se borra a los 30 días, Parte 3, pero la prueba de quién escribió primero tiene que quedar con el reclamo), lugar (ganó una unidad o está en la lista y en qué puesto), estado. La falta se deriva de aquí y de los pedidos vencidos o anulados.
- **Pedidos** (`orders`, y `order_items` si hace falta): compradora, puesto, vivo, código, monto de la prenda, entrega elegida y su costo, total, **plazo (hasta cuándo)**, estado (por pagar, pago informado, en revisión, pagado, vencido, anulado), WhatsApp de la compradora y horas de cada cambio. Se guarda **una copia del alias y del titular con los que se mostró el pago**, para que un cambio posterior de la feriante no confunda un pedido en curso. *Decisión de Claude.*
- **Informes de pago** (`payment_reports`): pedido, ruta del comprobante y hora.
- **Configuración del código en vivo**, como `live_config` y `chat_config`: plazo por defecto (15 min), segundos del cartel de la ganadora (18), lugares de la lista de espera (5) y los números del detector de voz (sección 11). Se cambia con un `UPDATE`, nunca en el código. El plazo de cada feriante va en su tienda y se edita en Mi tienda.
- **Uso de la voz**: segundos de audio mandados a Cloudflare por puesto y por día, para controlar el costo (sección 11). *Decisión de Claude.*
- *Nombres finales, si `order_items` hace falta en la Fase 1 (un pedido es una prenda con pago por prenda) y cómo se modela la lista de espera: decisión del constructor.*

Montos en centavos enteros. Fechas en UTC, que se muestran en hora de Tucumán (CLAUDE.md §8).

### 10.2 El reclamo atómico

- Una **función de PostgreSQL con transacción y bloqueo de fila** del código (CLAUDE.md §6.4). Recibe el mensaje del chat ya guardado y decide con **su hora del servidor**: si quedan unidades, crea el reclamo ganador y el pedido "por pagar" con su plazo; si no, ocupa un lugar en la lista o responde "agotado".
- Se llama **desde el servidor**, en el mismo camino que publica el mensaje (hoy `enviarMensaje` → `publicar_mensaje`), después de reconocer que el texto es un reclamo válido del código activo. Nunca se llama directo desde el navegador.
- Las pruebas tienen que demostrar que **muchos reclamos simultáneos sobre un código con una unidad dan exactamente una ganadora**, y que con varias unidades no se pasa de la cantidad.

### 10.3 Quién ve qué (RLS)

- **Códigos**: los del vivo abierto los lee cualquiera, también sin sesión. Los de vivos terminados, solo la dueña del puesto.
- **Reclamos y pedidos**: cada compradora lee los suyos, y la dueña del puesto lee los de su puesto. Nadie más. A la sala solo le llega el **nombre corto de la ganadora** para el cartel, nunca la lista de espera de otras.
- **Datos para pagar**: el alias y el titular siguen en `store_private_info`, que solo lee la dueña (Parte 1). La compradora recibe **la copia guardada en su pedido**, y solo de sus pedidos.
- **Dirección exacta y horarios de retiro**: solo los ve la compradora de un pedido **Pagado** (CLAUDE.md §1).
- **WhatsApp de la compradora**: solo ella y la dueña del puesto de ese pedido.
- **Comprobantes**: en un **bucket privado** (CLAUDE.md §4), con una carpeta por compradora. Los ven solo ella y la dueña del puesto, con **URLs firmadas de corta duración** (CLAUDE.md §9).
- **Cambios de estado**: confirmar, rechazar, ofrecer a otra, darle más tiempo, anular reclamos y anular o cerrar códigos, solo la dueña. "Ya pagué" y elegir la entrega, solo la compradora de ese pedido. Todo pasa por funciones o acciones del servidor que validan el estado de origen. Nadie cambia el estado escribiendo directo en la tabla.
- Las tablas nuevas no se exponen solas a la Data API: cada migración da los permisos de forma explícita (CLAUDE.md §8).

### 10.4 Tiempo real

Por Supabase Realtime, como el chat y los vivos:
- código lanzado, cerrado o agotado → la tarjeta de la sala y de "En vivo ahora";
- ganadora → el cartel para todas;
- cambios de estado de los pedidos → el panel de la compradora, Mis compras y el contador del estudio.

Lo privado viaja solo a quien puede verlo (sección 10.3). *Mecanismo: decisión del constructor. Ojo con el pendiente conocido de CLAUDE.md §11: la portada y la sala ya reciben cada cambio de todos los vivos.*

### 10.5 La voz, por dentro

- **En el celular de la feriante**: un detector de voz sobre la pista de audio de la transmisión, que solo mide el volumen y no le saca el micrófono a nadie. Junta cada frase con un poco de audio previo (para no cortar la primera palabra), la corta en cada pausa o si se hace muy larga (con solape, para no partir "código | ROJO") y la manda al servidor.
- **En el servidor**: una ruta o acción que **solo acepta audio de la dueña del puesto con un vivo abierto**. Así nadie usa nuestra cuota de Cloudflare desde afuera. Le pone un límite de tamaño y de frecuencia por puesto, la manda a Whisper con idioma español, filtro de voz (`vad_filter`) y un texto de contexto ("Precio y código de una prenda en un vivo de ventas…"), y devuelve el texto.
- **La clave** `CLOUDFLARE_AI_API_TOKEN` (plantilla "Workers AI") vive solo en el servidor, en un archivo con `import "server-only"`, como la de Stream (CLAUDE.md §9). Ya está en `.env.local` y en Vercel para Preview; **falta cargarla en Production** antes de publicar. Va en `.env.example`. La prueba `tests/e2e/claves.spec.ts` tiene que cubrirla.
- **Entender la frase**: el analizador de la prueba (`src/app/prueba-voz/entender.ts`, con sus pruebas) saca el precio (en números o en palabras: "ocho mil quinientos", "$12.500", "15000") y la palabra que sigue a "código". Se reutiliza y se amplía.
- **Frases fantasma**: con ruido, Whisper a veces devuelve "¡Gracias!" u otras frases que nadie dijo. Se descartan antes de buscar el código.
- **Fotos del código**: se suben al bucket público `tienda-fotos`, en la carpeta del puesto, comprimidas y sin EXIF (Parte 1).

### 10.6 Orden de construcción

La voz se construye como **una pieza aparte, con su interruptor**: el código a mano, los reclamos, el pago y los pedidos funcionan solos, sin ella. *Decisión de Claude.* Si en la prueba con iPhone la voz manos libres no anda (iPhone graba el audio en otro formato), la Parte 4 se publica igual, y en iPhone la feriante usa la carga a mano mientras se resuelve. El código de la prueba (`entender.ts` y la ruta de Whisper) está en la rama `prueba-voz`, sin unir: se trae a esta rama y se ordena en `src/lib/` (CLAUDE.md §13).

## 11. Costo de la voz

- Lo gratis de Cloudflare son 10.000 "neuronas" por día, unos **240 minutos de audio**. Como solo se manda el audio en el que la feriante habla, alcanza para unas **5 horas de vivo por día**, sumando todas las feriantes. Con 5 a 10 feriantes en el piloto, queda gratis.
- Pasado eso, unos **0,0005 dólares por minuto**: cerca de **3 centavos por hora de vivo**. Una feriante con 20 horas de vivo al mes costaría unos 60 centavos de dólar. Es poco al lado de la mensualidad (CLAUDE.md §3).
- **Para no gastar en ruido**, el detector tiene que ser más exigente que en la prueba, donde mandó muchos pedacitos de 1 o 2 segundos "sin palabras". Por ejemplo: un mínimo de voz real dentro de la frase y un umbral que se adapte al ruido del lugar. Sus números van en la configuración.
- El registro de segundos por puesto y por día (sección 10.1) permite ver el gasto real del piloto.
- Si la plataforma crece mucho, se puede pasar a un reconocimiento que corra en el propio celular, cuando los teléfonos lo permitan (anotado para el futuro).

## 12. Lo que mostró la prueba de voz (2026-11-06)

Prueba descartable en la rama `prueba-voz` (páginas `/prueba-voz` y `/prueba-voz/manos-libres`), hecha por el dueño en un Android 10 con Chrome 156:

| Probado | Resultado |
|---|---|
| Reconocimiento de voz del celular, sin cámara | Anda bien: entendió "se la van a llevar por $8000 con el código rojo" |
| Lo mismo, con la cámara prendida | **No oye nada** (arranca, recibe audio, nunca detecta voz) |
| Pausar o soltar el micrófono de la transmisión mientras se aprieta un botón | Tampoco oye nada; el micrófono vuelve a la transmisión en medio segundo |
| Botón apretado + Whisper de Cloudflare | "Funcionó de maravilla": entendió "ocho mil pesos, código rojo", "siete mil pesos, código azul" y "dos mil pesos, código amarillo", en unos 2,4 s y sin cortar el sonido |
| **Manos libres + Whisper** | **Funciona** si se dice con claridad: armó AZUL $8.000 y CELESTE $2.000. Mandó muchos pedacitos de ruido "sin palabras" y algunos "¡Gracias!" inventados (sección 10.5 y 11) |

No se probó en iPhone. Hay que hacerlo antes de publicar (sección 13).

## 13. Pruebas

- **Unitarias**:
  - **entender la frase**: precios en números y en palabras, frases largas con el código al final, "un vestido de 15000…", sin código, sin precio, frases fantasma;
  - **reconocer un reclamo**: una lista de mensajes que **sí** cuentan ("ROJO", "rojo!!", "Rojo 🙋‍♀️", "quiero ROJO", "yo rojo") y otra que **nunca** cuentan ("¿el rojo qué talle es?", "me encanta el rojo, ¿viene en 40?", "lo quiero", "rojito"), en el estilo del moderador del chat;
  - total con entrega, cuenta regresiva y armado del audio.
- **Base de datos (integración)**:
  - muchos reclamos simultáneos → una sola ganadora por unidad; la lista respeta el orden y su máximo;
  - una persona no gana dos veces el mismo código; la feriante no reclama lo suyo;
  - vencer el plazo pasa a la siguiente y registra la falta; sin lista, la unidad vuelve a estar disponible;
  - "Ya pagué" frena el vencimiento; "No me llegó" deja el pedido en revisión; "Ofrecer a otra" pasa a la siguiente;
  - solo la dueña confirma y rechaza; solo la compradora informa el pago;
  - nadie ve pedidos, WhatsApp ni comprobantes ajenos; la dirección exacta aparece recién con el pedido pagado;
  - la ruta de la voz rechaza a quien no es la dueña con un vivo abierto.
- **De punta a punta (Playwright)**, los flujos críticos de CLAUDE.md §12:
  - la feriante lanza un código a mano;
  - dos compradoras lo escriben y gana la primera, y las dos ven el cartel con su nombre;
  - la segunda ve su lugar en la lista;
  - la ganadora elige la entrega, ve el alias, informa el pago con comprobante;
  - la feriante lo confirma después de terminar el vivo y la compradora ve la dirección;
  - vence el plazo de otra y la prenda pasa a la siguiente;
  - Mis compras muestra cada estado.

  La voz se prueba aparte, con un audio grabado mandado a la ruta, sin depender del micrófono.
- **A mano en celulares reales (Android e iPhone)**, antes de publicar:
  - un vivo real en el que la feriante crea códigos hablando, con la prenda en las manos;
  - medir cuánto tarda en aparecer el cartel y cuántos segundos de ruido se mandan;
  - reclamar desde varios celulares a la vez;
  - pagar con una transferencia real de prueba y confirmar.

## 14. Lo que queda para el constructor

- Nombres de tablas, columnas, componentes y archivos, siguiendo el mapa de CLAUDE.md §13.
- El mecanismo de tiempo real y de vencimientos.
- La lista exacta de palabras de "lo quiero" y de las preguntas que no cuentan.
- Los números finos del detector de voz.
- Los textos exactos, en voseo.
- Los detalles visuales, dentro de las capturas de la Parte 0 y del sistema de diseño "Lapacho y limón".
- Cómo se modela la lista de espera.

**Cambios respecto de la Parte 0**, a confirmar por el dueño al leer este documento:
- el comprobante pasa a ser **obligatorio**;
- el WhatsApp se pide **al informar el pago**;
- la entrega se elige **antes de pagar**;
- los pagos durante el vivo son un **contador**, no avisos sueltos.

## 15. Pendiente de decidir

- **Códigos mal escritos**: en el piloto no cuentan y se avisa al instante (sección 5.2). El dueño define con las feriantes si se pasan a aceptar o si se educa a las compradoras a escribir bien.
