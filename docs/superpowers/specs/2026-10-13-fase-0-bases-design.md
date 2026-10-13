# Fase 0 – Bases · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-10-13
- **Estado**: pendiente de revisión del dueño del proyecto
- **Referencia general**: [CLAUDE.md](../../../CLAUDE.md)

## 1. Objetivo

Dejar armadas las bases técnicas y visuales de Tu Feria Live para que las fases siguientes se construyan encima sin rehacer nada: proyecto, sistema de diseño, login, base de datos mínima, pruebas automáticas y publicación en internet.

La Fase 0 es **solo para uso interno** (el dueño del proyecto y el equipo). No incluye tiendas, productos, video, chat ni pagos.

## 2. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Login | Solo **Google** en la Fase 0; **código por email** como alternativa en la Fase 1. **Sin login por teléfono ni SMS**. El WhatsApp se pide como dato de contacto para las entregas (Fase 1), sin verificar | Los SMS cuestan por mensaje y la plataforma debe ser asequible. Todo Android ya tiene cuenta de Google; el código por email cubre a quien no la usa, gratis dentro del cupo de un servicio de envío como Resend. Se descarta Facebook para no depender de una cuenta que puede ser cerrada |
| Identidad visual | **Lapacho y limón** (reemplazó al estilo B "Vivo y vibrante") | Elegida por el dueño entre tres propuestas basadas en el norte argentino |
| Entornos | **Un solo proyecto de Supabase** (São Paulo, ya creado) para desarrollo y la versión publicada; el proyecto de producción se crea en la Fase 1, antes del piloto | Simple, gratis, sin instalar Docker; todos los cambios de base de datos quedan en migraciones repetibles |
| Pantallas | Inicio simple + pantalla "Hola, [nombre]" | Alcanza para verificar que todo funciona; la página de presentación para feriantes se hace cerca del piloto |
| Gestor de paquetes | **npm** | Ya instalado (Node 22) |
| Sentry y PostHog | Se posponen al **inicio de la Fase 1** | Todavía no hay usuarias cuyos errores o uso medir |
| Forma de trabajo con git | Rama `fase-0`, commits chicos en español, unión a `main` cuando todo pasa las pruebas | Cada cambio a `main` se publica solo en Vercel |

### Cuentas

- GitHub: existe (repositorio `GermanValoy/-live-emprendedores`).
- Supabase: existe, con el proyecto creado en la región São Paulo.
- Vercel: **falta crearla** (se entra con GitHub; el plan incluye la guía).
- Google Cloud: **falta crear el permiso de login** (cliente OAuth); el plan incluye la guía.

## 3. Organización del proyecto

Herramientas: Next.js (App Router) con TypeScript estricto, Tailwind CSS, shadcn/ui y Drizzle ORM, en su última versión estable, verificada en la documentación oficial antes de usarlas.

| Carpeta / archivo | Contenido |
|---|---|
| `src/app/` | Pantallas: inicio, retorno del login, "Hola, [nombre]", página de muestra del diseño |
| `src/components/ui/` | Piezas visuales reutilizables |
| `src/lib/supabase/` | Conexión con Supabase: una versión para el navegador y otra para el servidor |
| `src/lib/format/` | Utilidades de formato de plata y fechas |
| `src/db/` | Descripción de las tablas para Drizzle |
| `drizzle/` | Migraciones (historial de cambios de la base de datos) |
| `tests/` | Pruebas de punta a punta (Playwright); las pruebas chicas van junto al código que prueban |
| `.gitignore` | Excluye `.env.local`, `.superpowers/`, dependencias y archivos generados |
| `.env.example` | Nombres de las variables de entorno, sin valores |
| `.gitattributes` | Finales de línea fijos para evitar diferencias entre Windows y el resto |

No se crean carpetas para funciones de fases futuras (pagos, video, chat): cada una aparece cuando se construye.

## 4. Sistema de diseño

Todos los valores se definen una sola vez como variables de diseño (colores, letra, radios, sombras) y las pantallas los usan por nombre, nunca con valores sueltos.

### Colores: "Lapacho y limón"

Reemplaza al estilo B original (fucsia, coral, violeta) por decisión del dueño. Inspirada en el lapacho rosado que florece en Tucumán y en el limón, fruto insignia de la provincia.

| Uso | Color |
|---|---|
| Principal (botones importantes, marca) | Lapacho `#B0135F` (modo oscuro `#C2186B`) |
| Exclusivo de los códigos en vivo | Limón `#F5D90A` sobre `#20131C` |
| Confirmaciones y "Pagado" | Hoja `#2F7D32` |
| Exclusivo del cartel "EN VIVO" | Rojo `#D7261E` |
| Error | `#B42318` |
| Texto principal | Ciruela oscuro `#20131C` |
| Fondo | Blanco `#FFFFFF` (modo oscuro `#160D13`) |

- **Letra**: Bricolage Grotesque, una sola familia para títulos y texto. Códigos y precios en extra negrita con números tabulares.
- **Sin degradés de texto** ni recursos decorativos genéricos: lo único que "grita" es la etiqueta del código en limón.
- **Contraste**: todo texto debe cumplir al menos el nivel AA de accesibilidad (4,5:1 en texto normal). Si un tono no alcanza, se oscurece sin perder el estilo.
- **Modo oscuro**: la app sigue la preferencia del celular.

### Movimiento

Pensado para celulares de gama media: solo se animan tamaño/posición (`transform`, `scale`) y transparencia, nunca `all` ni desenfoques.

| Variable | Valor | Uso |
|---|---|---|
| `--duracion-instant` | 100 ms | Respuesta al tocar (botones se achican a 0,97) |
| `--duracion-fast` | 150 ms | Cambios de color y estado |
| `--duracion-base` | 200 ms | Avisos, menús, código nuevo sobre el video |
| `--duracion-sheet` | 280 ms | Paneles que suben desde abajo |
| `--duracion-festejo` | 400 ms | Solo "¡Ganaste!" |
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Todo lo que entra o sale |
| `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movimiento dentro de la pantalla |
| `ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | Paneles desde abajo |

- Las salidas duran ~70 % de la entrada. Nada de la interfaz supera los 300 ms salvo el festejo.
- Los mensajes del chat no se animan (llegan demasiados por vivo).
- Los efectos al pasar el mouse solo existen en dispositivos con mouse.
- Con "reducir movimiento" activado en el teléfono se quitan desplazamientos y escalas; quedan solo fundidos de transparencia y el punto de "EN VIVO" queda fijo.

### Piezas base

Botón (principal, secundario, discreto), campo de texto, tarjeta, cartel "EN VIVO", etiqueta de código ("Código ROJO – $8.000") y avisos emergentes.

### Página de muestra

Una ruta interna (`/diseno`) que muestra todas las piezas en modo claro y oscuro. No está enlazada desde la app y no aparece en buscadores.

## 5. App instalable (PWA)

- Archivo de manifiesto con nombre "Tu Feria Live", colores de la marca y apertura a pantalla completa.
- Ícono provisorio: "TF" blanco sobre lapacho con una raya limón, en los tamaños que piden Android e iPhone. Se reemplaza un solo archivo de origen cuando haya logo definitivo.
- Sin conexión: solo se muestra un mensaje amable ("Sin conexión, revisá tu internet"). No se guarda contenido para uso offline.

## 6. Login

### Recorrido

1. Inicio → botón **"Entrar con Google"**.
2. Pantalla de Google → la persona elige su cuenta.
3. Vuelve a Tu Feria Live (ruta de retorno del login), se crea la sesión y se la lleva a **"Hola, [nombre]"** con su foto.
4. Botón **"Salir"** → cierra la sesión y vuelve al inicio.

### Reglas

- La sesión se guarda en cookies seguras y se renueva sola: cerrar y volver a abrir la app no obliga a entrar de nuevo.
- La pantalla "Hola, [nombre]" está protegida: sin sesión, se redirige al inicio.
- Errores (cancelación en Google, falla de red, enlace vencido): se vuelve al inicio con el mensaje "No pudimos hacerte entrar. Probá de nuevo." Nunca se muestran errores técnicos.
- El navegador usa solo la clave pública de Supabase. `SUPABASE_SECRET_KEY` se usa únicamente en el servidor y en las pruebas.
- El diseño deja lugar para sumar el código por email en la Fase 1 sin cambiar el recorrido existente.

## 7. Base de datos

Supabase guarda por su cuenta los datos de acceso (`auth.users`). La app suma **una tabla** en el esquema público:

### Tabla `users`

| Columna | Tipo | Detalle |
|---|---|---|
| `id` | uuid | Clave principal; es el mismo id de `auth.users` y se borra si se borra la cuenta |
| `display_name` | texto | Nombre para mostrar; viene de Google |
| `avatar_url` | texto, opcional | Foto de Google |
| `created_at` | fecha y hora con zona | En UTC; se muestra en `America/Argentina/Tucuman` |

### Reglas

- **Alta automática**: una función de la base de datos crea la fila en `users` en el momento en que se crea la cuenta en `auth.users`. Así nunca queda una persona con sesión pero sin perfil.
- **RLS activado**: cada persona puede leer y editar **solo su propia fila**; nadie puede borrar filas desde la app.
- **Permisos explícitos** en la migración para el rol de usuarios con sesión; el rol anónimo no tiene acceso a la tabla.
- Toda la estructura se crea con migraciones guardadas en git, para poder repetirla idéntica en el proyecto de producción de la Fase 1.

## 8. Utilidades de formato

- **Plata**: recibe centavos enteros y devuelve el formato argentino. Ejemplo: `800000` → `"$8.000"`; `850050` → `"$8.500,50"`. Nunca usa números con coma flotante para guardar montos.
- **Fechas**: recibe una fecha en UTC y la muestra en hora de Tucumán.

Ambas se construyen con pruebas primero (TDD).

## 9. Pruebas

### Pruebas chicas (Vitest)

- Utilidades de formato de plata y fechas, incluidos casos borde (cero, montos grandes, centavos, cambio de día por zona horaria).

### Pruebas de punta a punta (Playwright, en tamaño celular)

- El inicio carga y muestra "Entrar con Google".
- Sin sesión, la pantalla protegida redirige al inicio.
- Con sesión, se ve "Hola, [nombre]" y "Salir" cierra la sesión.
- El manifiesto de la app instalable existe y es válido.
- La fila en `users` se crea sola y una persona no puede leer la fila de otra.

**Límite conocido**: Google bloquea navegadores automatizados. Las pruebas con sesión usan un **usuario de prueba** creado con la clave secreta solo dentro de las pruebas; ese camino no existe en la app publicada. El login real con Google se verifica **a mano** al cierre de la fase.

## 10. Revisión automática (CI) y publicación

- **GitHub Actions** en cada envío y en cada pull request: revisión de tipos de TypeScript, revisión de estilo, pruebas chicas, armado de la app y pruebas de punta a punta. Si algo falla, no se publica.
- Las claves que necesitan las pruebas se guardan como secretos de GitHub, nunca en el código.
- **Vercel** conectado al repositorio: cada cambio en `main` se publica solo; cada rama tiene su dirección de prueba. Las variables de entorno se cargan en Vercel.
- Las direcciones de retorno del login (local, de prueba y publicada) se registran en Supabase y en Google Cloud.
- El dominio `tuferia.live` se conecta cuando esté registrado; no es requisito de esta fase.

## 11. Fuera de alcance de la Fase 0

Tiendas, productos, sala en vivo, video, chat, Código en vivo, pagos, código por email, dato de WhatsApp, página de presentación para feriantes, Sentry, PostHog, proyecto de Supabase de producción separado.

## 12. Pendientes que pasan a la Fase 1

- Crear el proyecto de Supabase de **producción** y aplicarle las migraciones antes del piloto.
- Sumar el **código por email** como forma de entrar, con un servicio de envío de emails dentro de su cupo gratis (por ejemplo, Resend), porque el envío que trae Supabase de fábrica permite muy pocos emails por hora.
- Pedir el **número de WhatsApp** como dato de contacto al ganar el primer código o al cargar los datos de entrega.
- Configurar **Sentry y PostHog**.
- Evaluar pasar Supabase al **plan pago** para que el proyecto no se pause durante el piloto.
- Registrar el dominio **`tuferia.live`**.

## 13. Criterios de terminado

La Fase 0 está terminada cuando:

1. La app está publicada en Vercel con el estilo "Lapacho y limón".
2. El dueño del proyecto entra con su cuenta de Google, ve "Hola, [nombre]" con su foto y puede salir (verificado a mano).
3. La app se puede instalar en el celular con el ícono "TF".
4. La tabla `users` se llena sola y cada persona solo puede ver su propia fila.
5. Todas las pruebas pasan en GitHub.
