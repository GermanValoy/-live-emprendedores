# Fase 1 · Parte 3 – Chat de la sala · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-11-04
- **Estado**: pendiente de revisión del dueño del proyecto
- **Referencias**: [CLAUDE.md](../../../CLAUDE.md) · [Parte 0 – Pantallas](2026-10-14-fase-1-parte-0-pantallas-design.md) (secciones 4, 6.2, 6.4 y 7) · [Parte 2 – Sala en vivo](2026-10-26-fase-1-parte-2-sala-en-vivo-design.md) · boceto aprobado en [`fase-1-parte-3-chat/chat-moderar.html`](fase-1-parte-3-chat/chat-moderar.html)

## 1. Intención

Que en cada vivo las compradoras puedan **saludar, preguntar por una prenda y charlar con la feriante en el momento**, como hoy en Facebook, pero **sin spam** y **sin que la feriante pierda el foco de su vivo** por tener que moderar.

Hoy, en el chat de un vivo de Facebook: saludan, preguntan por prendas y escriben el código que dice la feriante para quedarse con algo. Los problemas: **spam** (links a otras páginas, gente que promociona su propio lugar, insultos, mensajes en cadena) y **denuncias que cortan la transmisión**. En la plataforma la feriante maneja su sala: una denuncia nunca corta un vivo (solo la administración puede, a mano, como ya hace la Parte 2).

La Parte 3 construye el chat sobre el que la Parte 4 monta el Código en vivo (los códigos se escriben en este mismo chat).

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Chat en tiempo real dentro de la sala (compradora) y del estudio (feriante), con la forma ya decidida en la Parte 0.
- Un **moderador automático** con reglas fijas que frena el spam sin intervención de la feriante.
- Herramientas de un toque para la feriante cuando algo se le escapa al moderador.
- Marcar a quien se porta mal en varias salas, para que la administración lo revise.

**No objetivos (quedan para después)**
- Códigos, reclamos y su tolerancia a errores de tipeo (Parte 4; ver sección 11).
- Un moderador con inteligencia artificial (más adelante, cuando haya feriantes usándolo y se sepa qué spam aparece de verdad; ya está en CLAUDE.md §11).
- Ayudantes que moderen por la feriante (Fase 2).
- Que la feriante relea el chat de vivos anteriores (el dueño lo descartó: alcanza con guardarlo 30 días para reclamos).
- Denuncias de compradoras a otras compradoras, respuestas a un mensaje, reacciones, fotos o audios en el chat.

**Anti-objetivos** (si pasa esto, la parte falló aunque "funcione")
1. **Que la feriante tenga que dejar de vender para moderar.**
2. **Atraso entre lo que dice la feriante y lo que se lee en el chat.** El video llega con menos de un segundo; el chat tiene que sentirse igual de inmediato.
3. **Que el moderador frene mensajes normales** ("¿viene en 40?", "holaa 😍", "¿cuánto sale el envío a Yerba Buena?"). Un filtro que molesta a las compradoras es peor que un poco de spam.
4. **Que quien hace spam aprenda a esquivar el filtro** porque se le avisa exactamente qué lo frenó.
5. **Que una sola feriante pueda dejar a alguien fuera de toda la plataforma.**

## 3. Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| Forma del chat | La de la Parte 0 (6.2 y 6.4): video a pantalla completa, mensajes en burbujas abajo, máximo un tercio de la pantalla, los viejos se desvanecen hacia arriba, botón 💬 para esconder o mostrar. Los mensajes no se animan | Dueño (Parte 0) |
| Quién escribe | **Hay que iniciar sesión para escribir**; mirar y leer el chat sigue siendo libre. Quien no tiene sesión ve "Entrá con Google para escribir" y, al volver, regresa a la misma sala | Dueño ("lo hace más privado y podemos marcarlo si se porta mal") |
| Moderación | Un **moderador automático** con reglas antispam, para que la feriante no pierda el foco (sección 6) | Dueño |
| Qué frena el moderador | Links a otras páginas, gente que promociona su propio lugar, insultos y mensajes en cadena | Dueño |
| Herramientas de la feriante | Un toque sobre un mensaje: **Borrar este mensaje**, **Silenciar 10 minutos** (no escribe, sigue mirando) y **Silenciar en mi sala** (no vuelve a escribir en sus vivos; se puede deshacer) | Dueño (aprobó el boceto) |
| Mensaje frenado por el moderador | Quien lo escribió lo ve como enviado; **nadie más lo ve**. Si insiste, queda silenciada un rato en esa sala | Dueño (aprobó el boceto) |
| Muchos mensajes seguidos | Excepción a lo anterior: a quien manda muchos seguidos **sí se le avisa** "Esperá un ratito para volver a escribir" (es lo único que una persona normal puede hacer sin querer) | Dueño (aprobó el boceto) |
| Marcar a quien se porta mal | Si una cuenta queda **silenciada en su sala por 3 feriantes distintas**, aparece en `/admin` para revisar. Ahí un administrador puede silenciarla en toda la plataforma (y deshacerlo) | Claude (el dueño pidió poder marcarla; aprobó el boceto) |
| Al entrar tarde | Se ven los **últimos 50 mensajes** del vivo en curso | Claude (el dueño aprobó) |
| Cuando termina el vivo | El chat **desaparece de la sala**. Los mensajes se guardan **30 días** sin que nadie los vea públicamente (para reclamos: "yo escribí primero el código", insultos, denuncias) y después **se borran solos** | Claude (el dueño aprobó) |
| Aviso en los términos | Los términos y condiciones dicen que los mensajes se guardan 30 días para resolver reclamos y después se borran. La página de términos es de la Parte 5: se agrega ahí | Dueño |

## 4. Sala de la compradora (`/@usuario/vivo`)

Ver [boceto](fase-1-parte-3-chat/chat-moderar.html), pantallas 2 y 3, y la Parte 0 (6.2).

- Abajo, sobre el video: los mensajes en burbujas oscuras semitransparentes (contraste verificado por una prueba automática, Parte 0 7.4) y el campo **"Escribí un mensaje…"** con botón Enviar. En la Parte 4 el campo pasa a decir "Escribí un mensaje o un código…" y se suma la tarjeta del código entre el chat y el campo.
- Cada mensaje muestra el **nombre** de quien escribe y el texto. Los de la feriante llevan su nombre de puesto, una marca ✔ y otro color, para que se distingan de un vistazo.
- **Nombre que se muestra**: el nombre del perfil acortado a nombre e inicial del apellido ("Caro M."). *Decisión de Claude: lo bastante para reconocerse, sin exponer el nombre completo de las compradoras a desconocidos.*
- **Sin sesión**: se lee el chat; en lugar del campo, el botón "Entrá con Google para escribir" (pantalla 3 del boceto). Al volver del login, regresa a la misma sala (el login ya acepta a dónde volver, con el parámetro `next`).
- **Al enviar**: el mensaje aparece al instante para quien lo escribió. Si no se pudo enviar (sin conexión), queda marcado con **"Reintentar"** (Parte 0 7.3).
- **Silenciada** (por la feriante o por el moderador): el campo queda desactivado con "No podés escribir en este vivo por un rato" (o "en esta sala", si es permanente). Sigue viendo el video y el chat. *Decisión de Claude: el silencio que pone la feriante es explícito; lo que no se explica es por qué el moderador frenó un mensaje puntual.*
- **Largo máximo**: 200 caracteres, con contador cuando se acerca al límite. *Decisión de Claude.*
- Emojis permitidos.
- Botón 💬 para esconder el chat y ver solo el video (Parte 0).
- Cuando el vivo pasa a "Terminó" (Parte 2), el chat se va con el resto de la sala en vivo.

## 5. Estudio de la feriante (`/mi-puesto/vivo`)

Ver [boceto](fase-1-parte-3-chat/chat-moderar.html), pantalla 1, y la Parte 0 (6.4).

- El chat aparece abajo, sobre su cámara, en burbujas como lo ven las compradoras, sin tapar los botones del estudio.
- **Tocar un mensaje** de otra persona abre un panel desde abajo con el nombre y tres opciones:
  - **Borrar este mensaje**: desaparece para todas.
  - **Silenciar 10 minutos**: no puede escribir en esta sala por 10 minutos; sigue mirando.
  - **Silenciar en mi sala**: no vuelve a escribir en ningún vivo de esta feriante hasta que ella lo deshaga.
  - Ninguna pide confirmación extra (*decisión de Claude*: es en pleno vivo, todo se puede deshacer y lo que se borra no es grave). Tras tocar, un aviso corto confirma lo hecho ("Silenciaste a Juan P. por 10 minutos").
- **La feriante puede escribir** en su chat (para responder "sí, en 38, 40 y 42"), con un campo que no compite con los botones del estudio. Sus mensajes no pasan por las reglas de links y teléfonos (puede pasar su WhatsApp o un link propio). *Decisión de Claude.*
- **Deshacer un silencio permanente**: en Mi puesto, una sección "Personas silenciadas" con la lista y el botón "Quitar silencio". *Dónde exactamente: decisión del constructor dentro de Mi puesto.*
- Los mensajes frenados por el moderador **no** se le muestran a la feriante (no la distraen).

## 6. El moderador automático

Revisa **cada mensaje en el servidor, antes de que lo vea nadie más**. Nunca confía en el navegador. Las reglas:

1. **Links**: cualquier dirección web, también disfrazada ("www punto…", "tienda .com", "bit.ly/…"). Excepto en mensajes de la feriante.
2. **Promoción de otro lugar**: números de teléfono (7 o más dígitos, aunque estén separados por espacios, puntos o guiones), @usuarios de otras redes y frases típicas ("seguime en", "pasate por mi página", "vendo…", "hago envíos", "mirá mi perfil"). Excepto en mensajes de la feriante. *Lo disfrazado se le puede escapar: para eso está el botón de la feriante y, más adelante, la IA.*
3. **Insultos**: una lista de palabras, que también detecta letras cambiadas o repetidas ("b0ludo", "pelotudooo") y tildes o mayúsculas. **La lista vive en la base** y se amplía con un `INSERT`, sin tocar el código (igual que los tiempos de `live_config`).
4. **Mensajes en cadena**:
   - el mismo texto (normalizado) de la misma persona en el último minuto;
   - mensajes de más de 200 caracteres (no se pueden escribir: el campo lo impide y el servidor lo rechaza);
   - **muchos mensajes seguidos**: más de 5 en 10 segundos. Este es el único caso que se le avisa a la persona ("Esperá un ratito para volver a escribir") y el mensaje no se envía.

**Qué pasa con un mensaje frenado** (reglas 1 a 3 y repetidos): se guarda marcado como oculto; quien lo escribió lo ve como enviado; nadie más lo ve, ni siquiera la feriante.

**Qué cuenta para "muchos seguidos"**: todos los mensajes que se guardaron (visibles y ocultos). Un mensaje rechazado por ir demasiado rápido **no se guarda** y no cuenta. *Decisión de Claude.*

**Si insiste**: con **3 mensajes frenados en 10 minutos** en la misma sala, queda **silenciada 10 minutos** en esa sala (como si la feriante hubiera tocado "Silenciar 10 minutos").

**Cuidar los mensajes normales** (anti-objetivo 3): las reglas se prueban contra una lista de mensajes reales de vivos ("holaa desde Yerba Buena", "¿viene en 40?", "precio??", "¿hacés envíos a Tafí Viejo?", "me encanta 😍😍", "ROJO", un número de talle o un precio como "$8.000" o "18000") que **nunca** deben frenarse. *Que "¿hacés envíos?" de una compradora no choque con la frase "hago envíos": el constructor afina las frases para que eso no pase, y la prueba lo comprueba.*

Todos los números (5 en 10 s, 3 frenados en 10 min, 10 minutos de silencio, 200 caracteres, 50 mensajes al entrar, 30 días) viven en la configuración de la base, como `live_config`, para ajustarlos en el piloto con un `UPDATE`.

## 7. Marcar a quien se porta mal (`/admin`)

- Una sección **"Cuentas para revisar"**: cuentas silenciadas en su sala por **3 o más feriantes distintas**, con cuántas y desde cuándo. Solo cuenta el **"Silenciar en mi sala" que la feriante tocó a mano y sigue vigente**; no cuentan los silencios de 10 minutos ni los del moderador automático, ni los que la feriante deshizo. *Decisión de Claude: así solo marca una decisión deliberada de varias feriantes (anti-objetivo 5).*
- Para cada una, el administrador puede **ver sus últimos mensajes** (de los guardados, sección 8, **incluidos los ocultos**) y **"Silenciar en toda la plataforma"** (no escribe en ninguna sala; sigue pudiendo mirar y comprar). Se puede deshacer.
- Queda registrado qué administrador lo hizo y cuándo.
- *Las compradoras silenciadas por toda la plataforma ven lo mismo que con el silencio permanente de una sala: "No podés escribir en esta sala".*

## 8. Por dentro

### 8.1 Datos

- **Mensajes del chat** (`chat_messages`, ya planeada en CLAUDE.md §8): vivo, quien escribe, **el nombre que se muestra, ya acortado y guardado en el mensaje** (así quien mira sin sesión no necesita leer la tabla de perfiles; si la persona cambia su nombre después, los mensajes viejos quedan con el anterior, y está bien: duran un vivo), texto, **hora del servidor** (para saber quién escribió primero; la Parte 4 la usa en los reclamos), si es de la feriante, si quedó oculto y por qué regla, y si se borró (y quién).
- **Acciones de moderación** (`moderation_actions`, ya planeada): cada silencio, borrado o "quitar silencio", con quién lo hizo (feriante, moderador automático o administrador), a quién, en qué puesto, hasta cuándo y cuándo.
- **Lista de palabras** para la regla de insultos, en su propia tabla.
- **Configuración del chat**: los números de la sección 6, junto a `live_config` o en una tabla hermana.
- *Nombres de tablas y columnas, y si los silencios son su propia tabla o se derivan de `moderation_actions`: decisión del constructor.*

### 8.2 Quién ve qué (RLS)

- **Mientras el vivo está abierto**: cualquiera (también sin sesión) lee los mensajes **visibles** de ese vivo. Quien escribió un mensaje oculto lo lee también; nadie más.
- **Cuando el vivo termina**: nadie lee sus mensajes desde el navegador, tampoco la feriante. Solo los administradores, para reclamos.
- **Escribir**: solo con sesión, solo en un vivo abierto, sin estar silenciada, y **siempre a través del servidor** (una función de la base o una acción del servidor que aplique el moderador). Nadie inserta mensajes directo en la tabla desde el navegador.
- **Borrar y silenciar** en una sala: solo la dueña del puesto. En toda la plataforma: solo un administrador (`es_admin()`).
- La lista de palabras y la configuración no se exponen al navegador (si se supieran las palabras, sería fácil esquivarlas).

### 8.3 Tiempo real

- Los mensajes llegan por **Supabase Realtime**, como los estados de la Parte 2. **Los mensajes ocultos nunca viajan al navegador de otra persona** (una prueba lo comprueba). Un mensaje borrado desaparece de todas las pantallas sin recargar.
- Meta: un mensaje enviado aparece en los demás celulares en **menos de 1 segundo** en condiciones normales (anti-objetivo 2). Se mide en celulares reales antes de publicar.
- **Tamaño a soportar**: en el piloto (5 a 10 feriantes, rara vez dos en vivo a la vez), hasta **200 personas mirando una misma sala** y picos de unos **10 mensajes por segundo** cuando la feriante lanza algo. *Cifras de Claude: holgadas para el piloto; hay que poder crecer después sin rehacer todo.*
- *Mecanismo exacto (cambios de la tabla filtrados por RLS, canal de difusión, etc.): decisión del constructor, respetando las dos reglas de arriba.* Ojo con el volumen: en un vivo concurrido llegan muchos mensajes por segundo; la sala no debe trabarse ni gastar batería (por ejemplo, mostrar solo los últimos mensajes en pantalla).

### 8.4 Borrado a los 30 días

Una tarea programada en la base (como el cierre automático de vivos de la Parte 2) borra los mensajes y acciones de moderación de más de 30 días, salvo que formen parte de un silencio vigente (*decisión de Claude: el historial que justifica un silencio permanente se conserva mientras siga vigente*).

### 8.5 Límite de señales (pendiente de la Parte 2)

CLAUDE.md §11 dejó anotado limitar las señales por persona en `/mi-puesto/vivo/senal` "junto con el límite del chat". Se resuelve en esta parte con el mismo mecanismo de límite que el chat. *Valores: decisión del constructor.*

## 9. Pruebas

- **Unitarias**: cada regla del moderador, con su lista de mensajes que **sí** deben frenarse (links disfrazados, teléfonos con espacios, @usuarios, insultos con letras cambiadas, repetidos) y la lista de mensajes normales que **nunca** deben frenarse (sección 6); acortar el nombre; contador de caracteres.
- **Base de datos (integración)**: sin sesión no se escribe; nadie inserta directo en la tabla; los mensajes de un vivo cerrado no se leen; un mensaje oculto solo lo lee quien lo escribió; solo la dueña borra y silencia en su sala; una silenciada no escribe; muchos mensajes seguidos se rechazan; 3 frenados silencian 10 minutos; 3 feriantes distintas marcan la cuenta para revisar; solo un administrador silencia en toda la plataforma; la lista de palabras no se lee desde el navegador; el borrado a los 30 días respeta los silencios vigentes.
- Las pruebas escriben en la misma base que la página publicada (pendiente conocido de CLAUDE.md §11): crean sus propios usuarios, tiendas y vivos y los borran al terminar, como en la Parte 2.
- **De punta a punta (Playwright)**: dos compradoras charlan y se leen en tiempo real; una visitante lee y ve "Entrá con Google para escribir"; un mensaje con link le aparece a quien lo escribió y no a la otra; la feriante borra un mensaje y silencia a alguien, y a esa persona se le desactiva el campo; quien entra tarde ve los últimos mensajes; al terminar el vivo el chat desaparece; un administrador ve una cuenta para revisar y la silencia en toda la plataforma.
- **A mano en celulares reales (iPhone y Android)**, antes de publicar: charlar desde varios celulares con un vivo real, medir el atraso entre lo que dice la feriante y lo que aparece en el chat, que el teclado del celular no tape el campo ni los mensajes, y que tocar un mensaje en el estudio no interfiera con la transmisión.

## 10. Lo que queda para el constructor

Nombres de tablas, columnas, componentes y archivos (siguiendo el mapa de la sección 13 del CLAUDE.md); el mecanismo de tiempo real y de límite; la normalización de textos para las reglas; la lista inicial de palabras e insultos (en español rioplatense y con la jerga del norte); los textos exactos (en voseo); los detalles visuales finos dentro del boceto y el sistema de diseño "Lapacho y limón".

## 11. Anotado para la Parte 4 (Código en vivo)

- **Códigos mal escritos**: hoy la gente escribe "Vñleta", "amarlllo" o "blnco" y la feriante da el ok igual. Idea a charlar en la Parte 4: si el error es de una sola letra, la app lo detecta y le pregunta a la feriante "¿lo tomás?"; ella decide, como hoy, pero sin perder tiempo. La alternativa es educar al público para que escriba bien. **Decisión pendiente del dueño.**
- Los códigos se escriben en este chat: la Parte 4 tiene que cuidar que las reglas de repetidos y de muchos mensajes seguidos no le roben un reclamo a nadie (por ejemplo, alguien que escribe "ROJO" dos veces).
- La hora del servidor de cada mensaje es la que decide quién escribió primero.
