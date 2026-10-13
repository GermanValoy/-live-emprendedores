import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} (en .env.local o en los secretos de CI)`);
  return valor;
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

export function clienteAdmin(): SupabaseClient {
  return createClient(variable("NEXT_PUBLIC_SUPABASE_URL"), variable("SUPABASE_SECRET_KEY"), opciones);
}

export function clienteAnonimo(): SupabaseClient {
  return createClient(
    variable("NEXT_PUBLIC_SUPABASE_URL"),
    variable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    opciones,
  );
}

export type UsuarioPrueba = { id: string; email: string; cliente: SupabaseClient; sesion: Session };

/** Crea una cuenta de prueba con sesión iniciada, sin pasar por Google. */
export async function crearUsuarioPrueba(
  datos: { nombre?: string; avatarUrl?: string } = {},
): Promise<UsuarioPrueba> {
  const admin = clienteAdmin();
  const email = `prueba-${crypto.randomUUID()}@tuferia.test`;
  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: datos.nombre, avatar_url: datos.avatarUrl },
  });
  if (errorAlta || !creado.user) throw errorAlta ?? new Error("No se creó el usuario de prueba");

  const { data: enlace, error: errorEnlace } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (errorEnlace) throw errorEnlace;

  const cliente = clienteAnonimo();
  const { data: ingreso, error: errorIngreso } = await cliente.auth.verifyOtp({
    type: "email",
    token_hash: enlace.properties.hashed_token,
  });
  if (errorIngreso || !ingreso.session) throw errorIngreso ?? new Error("Sin sesión de prueba");

  return { id: creado.user.id, email, cliente, sesion: ingreso.session };
}

export async function borrarUsuarioPrueba(id: string): Promise<void> {
  const { error } = await clienteAdmin().auth.admin.deleteUser(id);
  if (error) throw error;
}
