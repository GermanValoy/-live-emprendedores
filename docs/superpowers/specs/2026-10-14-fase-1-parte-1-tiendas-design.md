# Fase 1 · Parte 1 – Tiendas y productos · Documento de diseño

- **Proyecto**: Tu Feria Live
- **Fecha**: 2026-10-14
- **Estado**: pendiente de revisión del dueño del proyecto
- **Referencias**: [CLAUDE.md](../../../CLAUDE.md) · [Fase 0](2026-10-13-fase-0-bases-design.md) · [Fase 1 · Parte 0 – Pantallas](2026-10-14-fase-1-parte-0-pantallas-design.md)

## 1. Objetivo

Que una feriante invitada abra su tienda en Tu Feria Live, la deje lista para vender (datos de cobro, formas de entrega, productos con fotos) y que cualquier persona pueda verla y seguirla. Incluye la página de administración mínima para que el dueño genere invitaciones.

No incluye: vivos, chat, códigos, pagos ni pedidos (Partes 2 a 4).

## 2. Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Invitaciones | Página `/admin` solo para administradores, con "Crear invitación", lista y anulación. Link de un solo uso, vence a los 7 días | Independencia del dueño sin depender de nadie; la Parte 5 la amplía con "Quiero vender" |
| Alta de la tienda | **Recorrido guiado de 4 pasos** que retoma donde quedó | Feriantes poco habituadas a la tecnología; la tienda queda lista para vender desde el primer día |
| Productos | **Simples**: hasta 4 fotos, nombre, precio, descripción corta (talle/color van ahí), cantidad, visible u oculto. Sin variantes ni categorías | Ropa usada, dulces y artesanías suelen tener pocas unidades; el código en vivo ya define precio y cantidad propios |
| Alias y titular | **Privados**: solo los ve la dueña de la tienda (y en la Parte 4, la compradora que ganó) | Evita que copien la tienda para estafar; regla clara: "el alias de verdad es el que te muestra Tu Feria Live cuando ganás" |
| Dirección del puesto | **Privada**: en la tienda solo se ve la zona; la dirección exacta solo la ve quien ya pagó (Parte 4) | Las feriantes venden desde su domicilio particular |
| Formas de entrega | Retiro en domicilio (zona pública, dirección y horarios privados), envío (gratis, monto fijo o a coordinar) y punto de encuentro (opcional) | Refleja cómo trabajan hoy las feriantes |
| Dirección de la tienda | `/@usuario`, elegido por la feriante; cambio limitado a una vez cada 30 días | Es la tarjeta de presentación que comparten en redes |
| Fotos | Se comprimen **en el celular** antes de subir: WebP en 400 px (grillas) y 1200 px (detalle) | Costo extra cero y subidas rápidas con la señal irregular |
| Una tienda por cuenta | Sí; ayudantes con acceso a una tienda ajena quedan para la Fase 2 | Simplicidad del piloto |
| Acceso a datos | Lecturas y escrituras con el cliente de Supabase bajo RLS (como en la Fase 0); Drizzle para esquema y migraciones | La base de datos hace cumplir las reglas de privacidad |

## 3. Datos

Todas las tablas con RLS activado y permisos (`grant`) explícitos. Montos en centavos enteros. Fechas en UTC.

### `platform_admins`
| Columna | Tipo | Detalle |
|---|---|---|
| `user_id` | uuid, PK | → `users.id`, borrado en cascada |
| `created_at` | timestamptz | |

Solo la ven y la usan los administradores. El primer administrador (el dueño) se agrega a mano con una sentencia SQL que se le entrega por fuera del repositorio, para no publicar su email en el código.

### `invitations`
| Columna | Tipo | Detalle |
|---|---|---|
| `id` | uuid, PK | |
| `token` | texto único | Aleatorio, al menos 32 caracteres seguros para URL |
| `created_by` | uuid | → `users.id` (administrador) |
| `note` | texto, opcional | Para quién es ("Mica, ropa usada"), hasta 80 caracteres |
| `expires_at` | timestamptz | Creación + 7 días |
| `used_by` | uuid, opcional | → `users.id` |
| `used_at` | timestamptz, opcional | |
| `revoked_at` | timestamptz, opcional | |
| `created_at` | timestamptz | |

Solo los administradores pueden leer, crear y anular. Una feriante **no lee la tabla**: el canje se hace con una función de la base de datos (`canjear_invitacion`) que valida el token y crea la tienda en una sola transacción, bloqueando la fila para que dos personas no la usen a la vez.

### `stores`
| Columna | Tipo | Detalle |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid, único | → `users.id`; una tienda por cuenta |
| `handle` | texto único | `@usuario`: minúsculas, números y puntos; 3 a 30; sin empezar ni terminar con punto ni dos puntos seguidos; no reservado |
| `handle_changed_at` | timestamptz | Para limitar el cambio a uno cada 30 días |
| `name` | texto | 2 a 60 caracteres |
| `category` | texto | Rubro libre, hasta 40 caracteres ("Ropa usada") |
| `zone` | texto | Zona o barrio, hasta 40 caracteres ("Yerba Buena") |
| `description` | texto, opcional | Hasta 300 caracteres |
| `live_schedule_note` | texto, opcional | "Suele estar en vivo…", hasta 80 caracteres |
| `avatar_path`, `cover_path` | texto, opcional | Rutas en Storage (sin tamaño; se derivan las variantes) |
| `onboarding_step` | entero | 1 a 4 mientras arma el puesto; 5 = completo |
| `created_at`, `updated_at` | timestamptz | |

Lectura pública (visitantes incluidos). Escritura solo de la dueña. Se crea solo vía `canjear_invitacion`.

### `store_private_info`
| Columna | Tipo | Detalle |
|---|---|---|
| `store_id` | uuid, PK | → `stores.id`, borrado en cascada |
| `payment_alias` | texto | Alias de banco o billetera, 6 a 20 caracteres (letras, números, puntos y guiones) |
| `payment_holder` | texto | Titular, 3 a 80 caracteres |
| `pickup_address` | texto, opcional | Dirección exacta para retiro, hasta 120 caracteres |
| `pickup_hours` | texto, opcional | Horarios de retiro, hasta 80 caracteres |
| `updated_at` | timestamptz | |

Solo la lee y escribe la dueña. La Parte 4 agregará la política para la compradora con un pedido de esa tienda.

### `store_delivery_options`
| Columna | Tipo | Detalle |
|---|---|---|
| `store_id` | uuid | → `stores.id` |
| `kind` | enum `pickup` \| `shipping` \| `meetup` | PK compuesta con `store_id` |
| `enabled` | booleano | |
| `shipping_mode` | enum `free` \| `fixed` \| `arrange`, opcional | Solo para `shipping`; por defecto `fixed` |
| `shipping_cost_cents` | entero, opcional | Obligatorio y > 0 si `shipping_mode = fixed` |
| `note` | texto, opcional | Hasta 80 caracteres ("Solo Gran San Miguel", "Plaza Independencia, a coordinar") |

Lectura pública; escritura solo de la dueña. Debe haber al menos una opción habilitada para completar el paso 3. Para `pickup`, lo público es solo que existe y la zona de la tienda; dirección y horarios están en `store_private_info`.

### `products`
| Columna | Tipo | Detalle |
|---|---|---|
| `id` | uuid, PK | |
| `store_id` | uuid | → `stores.id`, borrado en cascada |
| `name` | texto | 2 a 60 caracteres |
| `description` | texto, opcional | Hasta 200 caracteres |
| `price_cents` | entero | > 0 y ≤ 100.000.000 (un millón de pesos) |
| `quantity` | entero | ≥ 0 y ≤ 999 |
| `visible` | booleano | Por defecto verdadero |
| `created_at`, `updated_at` | timestamptz | |

Lectura pública solo de los visibles; la dueña ve todos. Escritura solo de la dueña.

### `product_photos`
| Columna | Tipo | Detalle |
|---|---|---|
| `id` | uuid, PK | |
| `product_id` | uuid | → `products.id`, borrado en cascada |
| `path` | texto | Ruta base en Storage |
| `position` | entero | 0 a 3; única por producto |

Lectura pública si el producto es visible (o si es de la dueña). Escritura solo de la dueña. Máximo 4 por producto, controlado en la base.

### `follows`
| Columna | Tipo | Detalle |
|---|---|---|
| `user_id` | uuid | → `users.id` |
| `store_id` | uuid | → `stores.id`; PK compuesta |
| `created_at` | timestamptz | |

Cada persona ve, crea y borra solo sus propias filas. El conteo de seguidores de una tienda se expone mediante una función (`contar_seguidores`) o columna calculada, sin revelar quiénes son.

### Almacenamiento de fotos (Supabase Storage)

- Bucket público de lectura `tienda-fotos`, organizado como `{store_id}/avatar/…`, `{store_id}/cover/…`, `{store_id}/products/{product_id}/…`.
- Cada imagen se guarda en dos archivos: `{base}-400.webp` y `{base}-1200.webp`.
- Solo la dueña de la tienda puede subir, reemplazar o borrar dentro de su carpeta (política sobre `storage.objects`).
- Tamaño máximo por archivo: 1 MB (tras la compresión siempre queda muy por debajo).
- Al borrar un producto o reemplazar una foto se borran sus archivos.

## 4. Pantallas y recorridos

Siguiendo la Parte 0 (capturas en `fase-1-pantallas/`).

### 4.1 `/admin` (solo administradores)
- Botón **Crear invitación** con campo opcional "¿Para quién es?". Muestra el link y un botón Copiar.
- Lista de invitaciones: nota, estado (Pendiente / Usada por @usuario / Vencida / Anulada), fecha; las pendientes se pueden anular.
- Cualquier otra persona recibe la página "no encontrada" (no se revela que existe).

### 4.2 `/invitacion/[token]` → recorrido guiado
1. Sin sesión: "Te invitaron a abrir tu puesto en Tu Feria Live" + Entrar con Google; al volver, sigue en el mismo link.
2. Validación del token (vencido, usado, anulado o ya tiene tienda → mensaje de la sección 6).
3. **Paso 1 · Tu puesto**: nombre, @usuario (verificación de disponibilidad mientras escribe), rubro, zona, foto (portada opcional). Al confirmar se canjea la invitación y se crea la tienda.
4. **Paso 2 · Cómo cobrás**: alias y titular, con la aclaración "Solo lo ve quien te compra".
5. **Paso 3 · Cómo entregás**: retiro en tu domicilio (dirección y horarios, con "Solo lo ve quien ya pagó"), envío (gratis / monto fijo / a coordinar + aclaración), punto de encuentro (texto). Al menos una.
6. **Paso 4 · Tu primer producto** (o "Lo cargo después").
7. "¡Tu puesto está listo!" → Mi puesto.

Barra de avance "Paso N de 4". Si cierra a mitad de camino, al entrar a Mi puesto retoma en el paso guardado (`onboarding_step`). El canje ocurre en el paso 1: después, el link ya no sirve aunque no termine el recorrido.

### 4.3 Mi puesto (feriante)
En esta parte: saludo, aviso si falta completar el puesto (vuelve al recorrido), accesos a **Mis productos** y **Mi tienda**. El botón "Empezar vivo" y los pedidos llegan en las Partes 2 y 4.

### 4.4 Mi tienda
Edición de todo lo cargado en los pasos 1 a 3, más descripción y "suele estar en vivo". Cambiar el @usuario avisa que el link anterior deja de funcionar y que solo se puede cambiar una vez cada 30 días.

### 4.5 Mis productos
Grilla con foto, nombre, precio, cantidad y estado (visible/oculto). Botón **＋ Producto**. Formulario: fotos (cámara o galería, hasta 4, reordenables), nombre, precio, descripción, cantidad, visible. Acciones: editar, ocultar/mostrar, borrar (con confirmación).

### 4.6 Tienda pública `/@usuario`
Según la Parte 0 (sección 6.5): portada, foto, nombre, rubro, zona, seguidores, Seguir, "suele estar en vivo", formas de entrega (resumen público: "Retiro en Yerba Buena", "Envío $2.500", "Envío gratis", "Punto de encuentro"), grilla de productos visibles. Al tocar un producto se ve en grande con sus fotos (1200 px) y descripción. Seguir sin sesión pide entrar con Google y vuelve.

### 4.7 Inicio y Seguidos
- **Inicio**: solo la sección "Puestos" (tarjeta con foto, nombre, rubro, zona, Seguir y tres productos con precio). "En vivo ahora" se suma en la Parte 2. Orden: tiendas con productos visibles primero, más recientes arriba.
- **Seguidos**: puestos que sigue la persona; vacío según la regla 7.1 de la Parte 0.

### 4.8 Barra de navegación
Se implementa la barra inferior definida en la Parte 0 (Inicio · Seguidos o Mi puesto · Mis compras · Cuenta). "Mis compras" muestra por ahora el estado vacío.

## 5. Fotos

- Se aceptan JPG, PNG, HEIC/HEIF y WebP de hasta 25 MB de origen.
- En el navegador se corrige la orientación, se recorta al tamaño máximo (lado mayor 1200 y 400 px) y se convierte a WebP (calidad ~0,8). Se muestra "Preparando foto…" con vista previa.
- HEIC: si el navegador no lo decodifica, se usa una librería de conversión en el cliente; si igual falla: "No pudimos usar esta foto. Probá con otra."
- Se suben los dos tamaños; la ruta se guarda en la base solo cuando ambos subieron bien.
- Las pantallas usan 400 px en grillas y 1200 px en el detalle, con carga diferida y tamaño reservado para que la página no "salte".

## 6. Seguridad y errores

**Seguridad**
- RLS y permisos explícitos en todas las tablas; tablas privadas (`store_private_info`, `invitations`, `platform_admins`) sin acceso para visitantes.
- Canje de invitación atómico (función con bloqueo de fila).
- Validación en el servidor de todo lo que llega del cliente (formatos, largos, rangos) además de las restricciones en la base.
- @usuario reservados (lista en el código y en la base): `admin`, `administrador`, `api`, `auth`, `cuenta`, `diseno`, `invitacion`, `soporte`, `ayuda`, `tuferia`, `tuferialive`, `tuferia.live`, `oficial`, `seguidos`, `compras`, `puesto`, `tienda`, `vivo`, `envivo`.
- `/admin` responde "no encontrada" a quien no es administrador.
- Las fotos públicas no contienen datos sensibles; los metadatos EXIF (incluida la ubicación GPS) se eliminan al recomprimir.

**Mensajes de error**

| Situación | Mensaje |
|---|---|
| Invitación vencida | "Esta invitación venció. Pedile una nueva a Tu Feria Live." |
| Invitación usada | "Esta invitación ya se usó." |
| Invitación anulada o inexistente | "Esta invitación no es válida." |
| @usuario tomado | "@roperiademica ya está en uso. Probá con otro." |
| @usuario inválido | "Usá solo minúsculas, números y puntos (de 3 a 30)." |
| Ya tiene tienda | "Ya tenés tu puesto." + botón a Mi puesto |
| Error de conexión al guardar | "No se pudo guardar. Revisá tu conexión y probá de nuevo." (los datos escritos se conservan) |
| Foto ilegible | "No pudimos usar esta foto. Probá con otra." |
| Más de 4 fotos | "Podés subir hasta 4 fotos por producto." |
| Tienda inexistente | "No encontramos este puesto." + botón al Inicio |
| Cambio de @usuario antes de 30 días | "Podés cambiar tu @usuario de nuevo el [fecha]." |

## 7. Pruebas

**Unitarias (Vitest)**
- Validación de @usuario: formato, largo, puntos, reservados, normalización a minúsculas.
- Validación de precio, cantidad, textos y alias.
- Resumen público de formas de entrega ("Envío gratis", "Envío $2.500", "Envío a coordinar", "Retiro en Yerba Buena").
- Armado de rutas y nombres de archivos de fotos.

**Integración con la base (Vitest contra Supabase)**
- Visitante y compradora no pueden leer `store_private_info`; la dueña sí.
- Una feriante no puede modificar tienda, productos, fotos ni opciones de entrega de otra.
- Productos ocultos invisibles para terceros.
- Invitación: no se canjea dos veces (incluido canje simultáneo), ni vencida, ni anulada; una cuenta con tienda no canjea otra.
- Solo administradores crean, leen y anulan invitaciones.
- Seguir: cada persona ve solo sus seguimientos; el conteo es correcto y no expone identidades.
- Máximo 4 fotos por producto; políticas de Storage (nadie escribe en la carpeta de otra tienda).

**Punta a punta (Playwright, tamaño celular)**
- Administrador crea invitación → feriante nueva la abre, completa los 4 pasos y llega a Mi puesto.
- Retomar el recorrido después de cerrar en el paso 3.
- Cargar producto con foto y verlo en `/@usuario`.
- Seguir una tienda y verla en Seguidos.
- Persona no administradora en `/admin` ve "no encontrada".
- Tienda inexistente muestra su mensaje.

## 8. Fuera de alcance

Vivos y "En vivo ahora" (Parte 2), chat (Parte 3), códigos, pedidos, pagos y la política que muestra datos privados a la compradora (Parte 4), "Quiero vender" y aprobaciones (Parte 5), variantes y categorías de productos, compra desde la tienda, ayudantes (Fase 2), notificaciones de seguidores (Fase 2).

## 9. Criterios de terminado

1. Desde `/admin` el dueño crea una invitación y copia el link.
2. Una cuenta de prueba abre el link y deja su tienda lista en los 4 pasos.
3. Carga productos con fotos desde el celular y se ven rápido en `/@usuario`.
4. Otra persona sigue la tienda y la ve en Seguidos; la portada muestra los puestos.
5. Las pruebas automáticas confirman que nadie más que la dueña ve alias, titular y dirección.
6. Todas las pruebas pasan en GitHub y la Parte 1 está publicada en la versión definitiva.
