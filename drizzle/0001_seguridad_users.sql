-- RLS: nadie ve nada salvo lo que permiten las políticas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Permisos explícitos: anónimos sin acceso; con sesión solo leer y editar nombre y foto
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.users TO authenticated;
--> statement-breakpoint
GRANT UPDATE (display_name, avatar_url) ON TABLE public.users TO authenticated;
--> statement-breakpoint
CREATE POLICY "Cada persona ve su propia fila" ON public.users
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
--> statement-breakpoint
CREATE POLICY "Cada persona edita su propia fila" ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);
--> statement-breakpoint
-- Alta automática del perfil cuando se crea la cuenta
CREATE FUNCTION public.crear_perfil_de_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'Sin nombre'
    ),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.crear_perfil_de_usuario() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER al_crear_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_de_usuario();
