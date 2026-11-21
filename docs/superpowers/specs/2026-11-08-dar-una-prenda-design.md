# Darle una prenda a quien preguntó · Diseño

> Fase 1, después de la Parte 4 (va en un PR aparte, cuando la Parte 4 ya esté publicada).
> Conversado con el dueño el 2026-11-08.

## 1. Para qué

En el vivo, la feriante lanza un código (ROJO, $8.000), nadie lo gana o le sobran unidades, y sigue con otro (VERDE). Al lanzar VERDE, ROJO se cierra solo. Un rato después alguien escribe en el chat "¿y el rojo?". Hoy:

- La feriante no se acuerda qué prenda era ni a cuánto la dio, y no tiene dónde mirarlo sin cortar el vivo. Necesitaría a alguien atrás buscando.
- Aunque se acuerde, no puede volver a lanzar ROJO: la palabra ya se usó en ese vivo.
- **Volver a lanzarlo sería injusto**: lo podría ganar otra persona, y la que preguntó se quedaría sin nada (lo dijo el dueño).

La solución: que la feriante le **dé la prenda directamente a la persona que preguntó**, con dos toques, reconociéndola por la foto.

Y algo relacionado: si la feriante dice por voz un código que ya usó en ese vivo, hoy no pasa nada y se queda esperando una ventana que no llega. Hay que **avisarle**.

## 2. Qué se construye

### 2.1 "Darle una prenda" (desde el chat del estudio)

1. En el estudio, la feriante toca el mensaje de una compradora (hoy eso ya abre el panel para moderar: borrar, silenciar 10 minutos, silenciar en mi sala).
2. El panel suma una opción nueva arriba de las de moderar: **"Darle una prenda"**.
3. Se abre la lista de **los códigos de este vivo que todavía tienen unidades sin vender**, cada uno con su **foto** (la sacada del video), la palabra, el precio y cuántas quedan. Del más nuevo al más viejo.
4. La feriante toca uno. Sin confirmación extra: el gesto ya es deliberado (elegir a la persona y elegir la prenda).
5. A la compradora le pasa **exactamente lo mismo que si lo hubiera ganado**: el panel con los datos para pagar, el plazo, la elección de entrega, y aparece en Mis compras. A la feriante le aparece en Pedidos como cualquier otro.
6. La sala ve el mismo cartel de ganadora ("¡Ana se lleva el ROJO!"), para que las demás sepan que esa prenda ya tiene dueña.
7. La feriante ve un aviso corto: "Le diste el ROJO a Ana."

### 2.2 Aviso de código ya usado (voz)

Cuando la feriante dice por voz un código que **ya usó en este vivo** y **no es el que está activo**, aparece arriba un aviso que no tapa el video y se va solo a los pocos segundos:

> **"ROJO ya lo usaste en este vivo. Decí otra palabra."**

Si es el código activo no aparece nada (lo está repitiendo para recordarlo: "¡acuérdense, código rojo!"). Si lo carga a mano con "+ Nuevo código" ya existe el mensaje "Ya usaste ROJO en este vivo." y no cambia.

## 3. Reglas

Las decidió Claude en la conversación y el dueño las vio sin objetar; se pueden cambiar.

- **Qué se puede dar**: solo prendas de códigos **cerrados** con unidades libres (vendidas < cantidad). No los anulados (se anulan por algún problema) ni el activo (ese se está vendiendo en pantalla y lo gana la primera que lo escribe).
- **Cuándo**: solo mientras el vivo está abierto. Terminado el vivo, la opción no está.
- **A quién**: a quien escribió ese mensaje en este vivo. No a la propia feriante. Para escribir en el chat ya hay que tener sesión, así que siempre hay una cuenta.
- **Una por persona y por código**, igual que al reclamar: si Ana ya tiene (o tuvo) un reclamo de ROJO, no se le puede dar otro de ROJO. Mensaje: "Ana ya tiene el ROJO."
- **Personas silenciadas**: se les puede dar igual. Si la feriante la elige, es su decisión.
- **Si no paga**: igual que un código ganado. Vence el plazo, cuenta como falta y la unidad vuelve a quedar libre (se le puede dar a otra). No hay lista de espera: nadie compitió. "Ofrecer a otra" y "Dar más tiempo" funcionan igual que siempre.
- **Si dos cosas pasan a la vez** (la feriante le da la última unidad a Ana justo cuando otra cosa la toma), gana una sola y la otra recibe: "Ya no quedan unidades de ROJO."
- **Precio, alias y plazo**: los del código y del puesto, igual que un reclamo (se copia el alias en el pedido).
- **Quién puede hacerlo**: solo la dueña del puesto (los ayudantes llegan en la Fase 2).

## 4. Cómo (decisiones técnicas)

- **Una función nueva en la base**, `dar_prenda(p_codigo uuid, p_mensaje uuid)`, `SECURITY DEFINER` con `search_path = ''`, que la llama la feriante (rol `authenticated`), con el mismo orden de bloqueos de siempre: primero la fila del código (`live_codes … FOR UPDATE`), después lo demás; nunca `live_sessions FOR UPDATE`. Comprueba: que sea la dueña del puesto del código, que el vivo siga abierto, que el código esté `cerrado` y tenga `sold < quantity`, que el mensaje sea de ese vivo y no de la dueña, y que esa persona no tenga ya un reclamo de ese código. Crea el reclamo como `ganadora` (con el mensaje y su texto), suma `sold`, actualiza `last_winner_name` / `last_winner_at` (eso dispara el cartel en la sala) y reutiliza `armar_pedido`. Devuelve el nombre de la compradora, o un error con nombre (`sin_permiso`, `cerrado`, `agotado`, `repetido`, `no_disponible`, `datos_invalidos`, `estado_invalido`) que la acción traduce al español.
- **Marca en el pedido**: una columna nueva `orders.given_by_owner boolean not null default false` (en el pedido y no en el reclamo, porque Pedidos lee `orders` y no `claims`), para que se sepa que no lo ganó escribiendo el código. En Pedidos se muestra un detalle chico: "Se la diste vos".
- **Acción del servidor** en `src/app/mi-puesto/vivo/acciones-codigos.ts` (`darPrenda`), con validación de lo que llega.
- **Pantalla**: la opción en `PanelModerar` y un panel nuevo con la lista en `src/components/codigos/` (reutiliza la foto y el formato de precio de las tarjetas de código). La lista sale de los códigos del vivo que el estudio ya tiene en tiempo real (`useCodigosVivo`).
- **Compradora y sala**: sin cambios; ya reaccionan al pedido nuevo y a `last_winner_*`. Hay que comprobarlo con una prueba.
- **Voz**: `armarBorrador` hoy devuelve `null` tanto si no se dijo un código como si ya se usó; tiene que distinguir los dos casos para que `useVoz` muestre el aviso (como un aviso arriba, un toast de sonner, no dentro de `IndicadorVoz`).
- **Permisos**: la migración de seguridad nueva revoca y después da `EXECUTE` de `dar_prenda` solo a `authenticated`.

## 5. Pruebas que tiene que haber

- Integración (`tests/integracion/`): dar una prenda crea el pedido `por_pagar` con el plazo y el alias del puesto; no se puede con el código activo, anulado, agotado, con el vivo terminado, a la dueña, a quien ya lo tiene, ni siendo otra feriante; dos `dar_prenda` simultáneos por la última unidad dejan una sola ganadora; si vence, la unidad vuelve a quedar libre.
- End-to-end (`tests/e2e/`): la feriante toca un mensaje, elige "Darle una prenda", elige el código por la foto, y a la compradora se le abre el panel de pago; la sala ve el cartel.
- Unitaria: `armarBorrador` distingue "ya usado" de "no hay código"; el aviso no aparece si la palabra es la del código activo.

## 6. Fuera de alcance

- Que la compradora pida sola una prenda vieja (por ejemplo escribiendo el código cerrado).
- Darla después de que terminó el vivo, o a alguien que no escribió en el chat (por WhatsApp).
- Volver a lanzar un código cerrado o repetir palabras en el mismo vivo.
- Ayudantes (Fase 2).
