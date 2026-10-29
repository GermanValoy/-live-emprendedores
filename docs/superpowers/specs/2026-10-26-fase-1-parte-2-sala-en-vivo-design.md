# Fase 1 · Parte 2 – Sala en vivo · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-10-26
- **Estado**: pendiente de revisión del dueño del proyecto
- **Referencias**: [CLAUDE.md](../../../CLAUDE.md) · [Parte 0 – Pantallas](2026-10-14-fase-1-parte-0-pantallas-design.md) (secciones 6.1, 6.2, 6.4, 7) · [Prueba de transmisión](2026-10-16-fase-1-parte-2-prueba-transmision-design.md) (resultados en la sección 11) · bocetos en [`fase-1-parte-2-sala/`](fase-1-parte-2-sala/)

## 1. Intención

Que una feriante pueda **abrir su sala y salir en vivo desde el navegador del celular** (iPhone o Android, sin instalar nada), que las compradoras **la encuentren y la miren**, y que el vivo quede registrado con inicio y fin. Es la base sobre la que la Parte 3 suma el chat y la Parte 4 el Código en vivo.

Hoy la feriante arregla el horario por WhatsApp (encuesta o aviso "salimos a las 21"), recuerda unos minutos antes en su grupo y, durante el vivo, anota a mano quién ganó cada cosa. La Parte 2 no automatiza la venta (eso es la Parte 4): hace que **llegar a la sala y transmitir sea fácil y confiable**.

La prueba de transmisión confirmó que el navegador alcanza: hasta 720×1280, 0,3 s de atraso de punta a punta, cortes de segundos que se recuperan solos.

## 2. Lo que más le preocupa al dueño (anti-objetivos)

Si cualquiera de estas cosas pasa en el primer vivo real de una feriante, la parte falló aunque "funcione":

1. **Que se corte y tenga que armar todo el vivo de nuevo.**
2. **Lentitud que no sea culpa de la conexión.**
3. **Una automatización que no haga lo que promete.**
4. **Spam en su sala** (se resuelve en la Parte 3, con el chat; en la Parte 2 no hay forma de escribir).
5. **Un botón importante que no funcione.**

## 3. Alcance

**Incluye**
- Pantalla de la feriante: vista previa → en vivo → resumen (sección 5).
- Sala de la compradora en `/@usuario/vivo`, con la pantalla de espera "¡Pronto arrancamos!" (sección 6).
- Portada "En vivo ahora" con datos reales, acceso destacado en la tienda y vivos primero en "Seguidos" (sección 7).
- Tabla `live_sessions` y la transmisión de Cloudflare propia de cada puesto (sección 8).
- En `/admin`: lista de vivos abiertos con el botón **"Cortar este vivo"** (sección 8.2).
- Cuánta gente mira (sección 8.3).
- Borrar `/prueba-vivo` y su transmisión de Cloudflare al terminar.

**No incluye**
- Chat, moderación y spam (Parte 3). Códigos, pagos y resumen por compradora (Parte 4).
- Grabación y repeticiones (Fase 2: WebRTC no graba).
- Vivos programados, recordatorios automáticos y notificaciones al celular (Fase 2).
- Título o descripción del vivo. *Decisión de Claude: no hace falta por ahora.*
- Transmitir desde OBS/Larix por RTMP.

## 4. Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| Pantalla de la feriante en vivo | **A · Pantalla completa**: la cámara ocupa todo y los botones flotan encima ([boceto](fase-1-parte-2-sala/pantalla-feriante.html)). Coincide con el "Estudio" de la Parte 0 (6.4) | Dueño |
| Recorrido de la feriante | Vista previa → En vivo → Resumen ([boceto](fase-1-parte-2-sala/recorrido-feriante.html)) | Dueño (aprobó el boceto) |
| Silenciar | Botón para silenciar el micrófono **cuando ella quiera** | Dueño |
| Silencio automático al salir | Si la feriante sale de la pantalla (otra app, minimiza, bloquea), el micrófono se silencia solo y quien mira ve "[Nombre] vuelve en un momento". Motivo: en la prueba, al salir la imagen queda negra pero **el sonido sigue llegando** (riesgo de privacidad) | Dueño (observación) + Claude (solución) |
| Al volver a la pantalla | Vuelve la imagen; el micrófono **sigue silenciado** y un aviso grande le ofrece "Activar sonido". *Decisión de Claude*: es más seguro que reactivarlo solo (pudo haber salido por una llamada) | Claude |
| Avisar a las compradoras | Botón **"Avisar por WhatsApp"**: abre WhatsApp con un mensaje ya escrito y el link de la sala; ella elige el grupo. Sin mensajes automáticos (caros, piden cuenta de empresa y casi no permiten grupos). Disponible en Mi puesto (para avisar antes) y durante el vivo | Claude ("hacé lo que mejor parezca") |
| Link de la sala | Siempre el mismo: `/@usuario/vivo`, para que pueda dejarlo fijo en la descripción del grupo | Claude (el dueño aprobó la idea) |
| Si se entra antes del vivo | Pantalla de espera animada "¡Pronto arrancamos!" que **se convierte sola en la sala** cuando arranca el vivo, sin recargar | Dueño |
| Animación de espera | **A · El puesto de feria**: toldo a rayas que se mece, guirnalda de lamparitas que se prenden de a una, letras con saltitos ([boceto](fase-1-parte-2-sala/espera-animaciones.html), opción A) | Dueño |
| Cortes de la feriante | El vivo **no termina** por un corte: queda abierto esperándola. Al volver a Mi puesto ve "Volver a tu vivo" y sigue en el mismo vivo, mismo link. Si no vuelve, se cierra solo | Dueño (riesgo 1) |
| Cuánto espera el vivo | **Fuera de la pantalla** (otra app, minimizado; la sala ve "vuelve en un momento"): hasta **15 minutos**. **Sin conexión** (se cortó internet, se apagó el celular, cerró la página): hasta **5 minutos**. Pasado ese tiempo, se cierra solo. Los dos tiempos viven en **un solo lugar** de configuración que usan tanto el cierre automático como la sala, para poder ajustarlos en el piloto | Dueño (aprobó la propuesta de Claude) |
| Corte por la plataforma | Un administrador puede **cortar cualquier vivo** desde `/admin` (moderación: productos prohibidos, términos y condiciones). Queda registrado quién lo cortó y cuándo. La feriante ve "La plataforma terminó este vivo" y la sala, el estado "Terminó" | Dueño (aprobó la propuesta de Claude) |
| Abrir el vivo en otro celular | Si la feriante abre la pantalla del vivo en otro celular o pestaña mientras el primero transmite, **el nuevo toma el control** y el anterior deja de transmitir y muestra "Seguís el vivo en otro celular". Nunca se la traba cuando intenta recuperarse. *Decisión de Claude* | Claude |
| Una transmisión de Cloudflare por puesto | Se crea la primera vez que la feriante sale en vivo y se reutiliza siempre. *Decisión de Claude*: menos llamadas a Cloudflare, nada que limpiar después de cada vivo | Claude |
| Un vivo a la vez por puesto | La base no permite dos vivos abiertos del mismo puesto. *Decisión de Claude* | Claude |
| Quién puede transmitir | Solo la dueña del puesto (los ayudantes son de la Fase 2) | CLAUDE.md |
| Cuánta gente mira | Cloudflare no lo informa por WebRTC: lo cuenta la app con la "presencia" de Supabase Realtime (sección 8.3) | CLAUDE.md + Claude |
| Imagen de las tarjetas de "En vivo ahora" | WebRTC no genera miniaturas: la tarjeta usa la portada (o la foto) del puesto con el cartel EN VIVO. *Decisión de Claude* | Claude |

## 5. Pantalla de la feriante

Se entra desde **Mi puesto → "Salir en vivo"** (botón rojo grande; ya existe el lugar en la Parte 0, sección 6.6). La dirección es `/mi-puesto/vivo`. *Decisión de Claude.* Solo para la dueña del puesto, con el recorrido de armado completo.

### 5.1 Vista previa
- La cámara a pantalla completa, con el cartel "Vista previa · nadie te ve todavía". Ya se pidió permiso de cámara y micrófono.
- Botones: cambiar cámara, silenciar, **"Avisar por WhatsApp"** y el botón grande **"Salir en vivo"**.
- Un aviso fijo: "Mientras estés en vivo no salgas de esta pantalla. Si salís, se silencia el micrófono y la gente ve 'Vuelvo en un momento'."
- Si niega el permiso de cámara o micrófono: explicación con pasos para habilitarlo en iPhone y Android, y "Probar de nuevo". Nunca una pantalla negra muda.

### 5.2 En vivo (opción A)
- Arriba: **EN VIVO · mm:ss** (rojo `--vivo`) y **👁 cuánta gente mira**.
- Botones flotantes (44 px o más, separados entre sí): **Silenciar / Activar sonido**, **Cambiar cámara**, **Avisar por WhatsApp**, **Terminar**.
- **Terminar** pide confirmación ("¿Seguro que querés terminar el vivo?").
- Estado de conexión visible: si la subida se corta, "Reconectando…" sobre la imagen. La reconexión es automática (ya probada en `/prueba-vivo`: reconexiones sin duplicados, recuperar cámara y sonido).
- Silenciada: un indicador claro y permanente ("🔇 Silenciada") para que no hable sin sonido sin darse cuenta.
- La pantalla no se apaga sola mientras transmite (bloqueo de suspensión del navegador, si el celular lo permite).

### 5.3 Si sale de la pantalla y vuelve
1. Al salir: se silencia el micrófono, se avisa a la sala ("[Nombre] vuelve en un momento").
2. Al volver: se recupera la imagen; queda silenciada con un aviso grande "Estás silenciada · Activar sonido".
3. Si cerró la página o se apagó el celular: al entrar a Mi puesto ve **"Volver a tu vivo"** mientras el vivo siga abierto (5 minutos sin conexión). Retoma el mismo vivo.
4. Si estuvo fuera de la pantalla más de 15 minutos, o sin conexión más de 5, el vivo ya se cerró: al volver ve "Tu vivo terminó porque estuviste afuera mucho tiempo" con el resumen y "Salir en vivo de nuevo".
5. Si abre el vivo en otro celular, ese toma el control; el primero muestra "Seguís el vivo en otro celular".

### 5.4 Resumen al terminar
"¡Terminó tu vivo! 🎉", cuánto duró y la mayor cantidad de gente mirando a la vez. Botón "Volver a mi puesto". La Parte 4 suma acá lo vendido por compradora.

### 5.5 Mensaje de "Avisar por WhatsApp"
- Durante el vivo: "¡Estoy en vivo en Tu Feria Live! Entrá acá 👉 [link]".
- Antes del vivo (desde Mi puesto): "¡Pronto salgo en vivo! Entrá acá y te avisa solo cuando arranque 👉 [link]".
- *Texto exacto: decisión del constructor, en voseo.* Se usa el link para compartir de WhatsApp (`wa.me/?text=`).

## 6. Sala de la compradora (`/@usuario/vivo`)

Mirar es libre, sin sesión. La sala es siempre oscura (video a pantalla completa). La Parte 0 (6.2) ya define su forma; la Parte 2 construye todo **menos el chat y la tarjeta del código**, dejando su espacio previsto.

| Estado | Qué se ve |
|---|---|
| **Esperando** (no hay vivo abierto) | Animación "A · El puesto de feria": "¡Pronto arrancamos!", "Quedate acá: cuando [Nombre] salga en vivo, se abre sola", el texto "Suele estar en vivo…" del puesto (`stores.live_schedule_note`, si lo cargó), tres productos con precio y botón Seguir. Al arrancar el vivo, pasa sola al estado "En vivo" |
| **En vivo** | Video vertical a pantalla completa. Arriba: foto y nombre del puesto, Seguir, EN VIVO, 👁 cuánta gente mira, cerrar. Botón **"Tocá para activar el sonido"** si el navegador arrancó sin sonido |
| **Sin sonido** | Aviso chico "Sin sonido por un momento" mientras la feriante está silenciada |
| **Vuelve en un momento** | La feriante salió de la pantalla: cartel "[Nombre] vuelve en un momento" sobre la imagen, en lugar de negro |
| **Reconectando** | Se cortó la conexión de quien mira: "Reconectando…", sin sacarla de la sala. Reconexión automática |
| **Se está reconectando la feriante** | Se cortó la transmisión: "[Nombre] se está reconectando" durante hasta 5 minutos (o 15 si la feriante salió de la pantalla) |
| **Terminó** | La misma feria de la espera con "¡Gracias por venir!", el cartel "El vivo terminó", "Cuando [Nombre] vuelva a salir en vivo, se abre sola acá.", "Suele estar en vivo…", sus productos y botón a su tienda. Si vuelve a salir en vivo, pasa sola al estado "En vivo" (cambio pedido por el dueño en la prueba con celulares del 2026-10-29: casi nunca hace otro vivo enseguida) |
| **Puesto inexistente** | La página "no encontrada" de siempre |

Mientras espera o mira, la compradora no recarga nada: los cambios de estado llegan por Supabase Realtime.

`/prueba-vivo` mostró cómo se ve la imagen al arrancar (baja calidad unos segundos, sube sola): no hace falta ocultarlo.

## 7. Dónde aparece el vivo

- **Inicio**: la sección "En vivo ahora" (Parte 0, 6.1) con los vivos abiertos reales: tarjeta vertical con la portada o foto del puesto, EN VIVO, 👁 cuánta gente mira, nombre y zona; ordenadas por más gente mirando. Sin vivos: "Ahora no hay nadie en vivo. Seguí a tus puestos favoritos." El código activo en la tarjeta llega en la Parte 4. La sección se actualiza sola cuando alguien arranca o termina. *Que se actualice sola: decisión de Claude.*
- **Tienda** (`/@usuario`): si está en vivo, acceso destacado a la sala (Parte 0, 6.5).
- **Puestos del Inicio** y **Seguidos**: el puesto en vivo lo indica; en Seguidos, los que están en vivo van primero.

## 8. Por dentro

### 8.1 Datos

- **`live_sessions`**: puesto, inicio, fin (vacío mientras está abierto), última señal de la feriante, si está fuera de la pantalla y desde cuándo, mayor cantidad mirando a la vez, motivo de cierre (terminó ella / se cerró solo por falta de señal / lo cortó la plataforma, con el administrador que lo cortó). Un solo vivo abierto por puesto (índice único parcial). *Nombres de columnas: decisión del constructor.*
- **Transmisión de Cloudflare del puesto**: el identificador de Cloudflare y la URL para transmitir (WHIP) son **credenciales**: en una tabla o columna que **solo lee el servidor** (ni siquiera el navegador de la dueña la lee de la base; el servidor se la entrega solo a ella al abrir `/mi-puesto/vivo`). La URL para mirar (WHEP) sí puede ser pública. *Dónde exactamente: decisión del constructor, respetando esta regla.*
- RLS en todo: el vivo (sin credenciales) lo lee cualquiera; abrir, cerrar y actualizar un vivo, solo la dueña del puesto y por funciones o acciones del servidor que lo validen. **Cortar** un vivo ajeno: solo un administrador de la plataforma (`es_admin()`).

### 8.2 Abrir, mantener y cerrar un vivo

1. **Salir en vivo**: acción del servidor que verifica que es la dueña, obtiene o crea la transmisión del puesto en Cloudflare (reutilizando `src/lib/vivos/cloudflare.ts`, pero guardando el identificador en lugar de buscar por nombre), y abre el `live_session`. Si ya hay uno abierto, lo retoma (no crea otro).
2. **Señal de vida**: mientras transmite, la pantalla de la feriante avisa al servidor cada unos segundos que sigue ahí. Al salir de la pantalla avisa "me voy" (antes de que el celular la frene) y al volver, "volví". Ojo: en iPhone una página en segundo plano deja de correr código, así que durante el tiempo afuera no hay señal de la página; por eso ese tiempo tiene su propio límite (15 minutos) en lugar del de "sin conexión". *Mecanismo exacto (y si además se consulta el estado de la transmisión en Cloudflare): decisión del constructor.*
3. **Cierre automático**: un vivo sin señal por **5 minutos**, o fuera de la pantalla por **15 minutos**, se considera terminado. Tiene que cerrarse aunque nadie abra ninguna página (no puede quedar "En vivo" para siempre en la portada) y conservar la mayor cantidad de gente mirando. *Cómo (tarea programada en la base, al consultar, etc.): decisión del constructor.*
4. **Terminar**: acción del servidor que cierra el vivo y guarda la mayor cantidad de gente mirando.
5. **Cortar (administrador)**: acción del servidor desde `/admin` que verifica `es_admin()`, cierra el vivo con motivo "lo cortó la plataforma" y registra quién. La pantalla de la feriante deja de transmitir y muestra "La plataforma terminó este vivo".
6. **Otro celular**: al abrir la pantalla del vivo en un segundo dispositivo, el servidor lo marca como el que transmite; el anterior se entera (por el canal del vivo), corta su envío y muestra "Seguís el vivo en otro celular". *Cómo identificar el dispositivo: decisión del constructor.*

### 8.3 Cuánta gente mira

Cada persona que está en la sala se anuncia en un canal de "presencia" de Supabase Realtime de ese vivo (sin sesión también cuenta). La feriante, la sala y la portada leen de ahí el número. La mayor cantidad se guarda al cerrar. Es un número aproximado: está bien que tarde unos segundos en actualizarse.

### 8.4 Estados que se transmiten a la sala

Silenciada, "vuelve en un momento", reconectando y terminado viajan por un canal de Supabase Realtime del vivo (los mensajes de estado no van por el video). Solo la dueña puede publicar estados en su canal. *Decisión de Claude.*

### 8.5 Rendimiento

- La sala carga primero lo justo para mostrar el video; el resto después.
- La animación de espera es solo CSS (sin videos ni librerías), respeta "reducir movimiento" y no pesa en el celular.
- Meta de referencia: en Wi-Fi, la imagen aparece en pocos segundos desde que se abre el link. Se mide en los celulares reales antes de publicar. *Número exacto: lo fija el constructor tras medir.*

## 9. Pruebas

- **Unitarias**: lógica de estados de la sala, silencio automático al salir, armado del mensaje de WhatsApp, cuenta de gente mirando, decisión de cierre por falta de señal.
- **Base de datos (integración)**: solo la dueña abre y cierra su vivo; solo un administrador corta un vivo ajeno; nadie lee la URL para transmitir; un vivo abierto por puesto; el cierre automático cierra los vivos sin señal (5 min) y fuera de pantalla (15 min) y respeta los que siguen vivos.
- **De punta a punta (Playwright)**: la feriante sale en vivo, silencia, termina; un administrador corta un vivo; abrir en otra pestaña toma el control; la compradora entra antes del vivo y la pantalla de espera pasa sola a la sala; "Volver a tu vivo" retoma el mismo vivo; "En vivo ahora" muestra y saca el vivo. La cámara se simula.
- **A mano en celulares reales (iPhone y Android)**, antes de publicar: el recorrido completo, salir a WhatsApp y volver (sin sonido de fondo), cerrar la página y retomar, y transmitir con datos móviles (pendiente de la prueba).

## 10. Lo que queda para el constructor

Nombres de tablas, columnas, componentes y archivos (siguiendo el mapa de la sección 13 del CLAUDE.md); el mecanismo de señal de vida y de cierre automático; los textos exactos (en voseo); detalles visuales finos dentro de los bocetos y el sistema de diseño "Lapacho y limón".

## 11. Ideas anotadas para más adelante

- **Código por voz (Parte 4 o después)**: la feriante dice "código ROSA" y la app, con reconocimiento de voz, le **propone** el código con la foto tomada del video y el precio si lo dijo; ella confirma con un toque. Nunca 100 % automático: la voz se equivoca ("esta remera es rosa") y un código mal lanzado es justo el tipo de error que más le preocupa al dueño. Primero se hace el "Nuevo código" manual en menos de 5 segundos; la voz requiere una prueba previa (¿se puede transmitir y reconocer voz a la vez en iPhone?, ¿entiende la tonada con ruido de casa?, costo por minuto).
- Recordatorio automático unos minutos antes de un vivo programado (Fase 2, con vivos programados y notificaciones).
