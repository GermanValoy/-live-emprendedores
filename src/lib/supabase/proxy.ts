import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

const RUTAS_PROTEGIDAS = ["/cuenta", "/mi-puesto"];

const RUTA_SENAL = "/mi-puesto/vivo/senal";

function esProtegida(ruta: string) {
  return RUTAS_PROTEGIDAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));
}

/** Renueva la sesión en cada pedido y saca al inicio a quien entra sin sesión a una ruta protegida. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  let encabezadosDeSesion: Record<string, string> = {};
  const { url, publishableKey } = supabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        // Encabezados que evitan que una respuesta con sesión quede guardada en caché.
        encabezadosDeSesion = { ...encabezadosDeSesion, ...headers };
        Object.entries(headers).forEach(([clave, valor]) => supabaseResponse.headers.set(clave, valor));
      },
    },
  });

  let conSesion = false;
  try {
    const { data } = await supabase.auth.getClaims();
    conSesion = !!data?.claims;
  } catch {
    conSesion = false; // cookie vencida o corrupta: se trata como sin sesión
  }

  if (!conSesion && request.nextUrl.pathname === RUTA_SENAL) {
    // La señal de vida la llama el navegador con fetch: necesita un 401 en JSON, no una redirección a una página.
    return NextResponse.json({ error: "sin_sesion" }, { status: 401 });
  }

  if (!conSesion && esProtegida(request.nextUrl.pathname)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    const redireccion = NextResponse.redirect(destino);
    // La redirección lleva las cookies que Supabase actualizó o borró (por ejemplo, una sesión vencida).
    supabaseResponse.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
    Object.entries(encabezadosDeSesion).forEach(([clave, valor]) => redireccion.headers.set(clave, valor));
    return redireccion;
  }

  return supabaseResponse;
}
