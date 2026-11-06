-- Suma segundos de voz al día de un puesto de forma atómica (dos frases juntas no se pisan).
CREATE FUNCTION public.sumar_voz(p_tienda uuid, p_dia date, p_segundos real)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.voice_usage (store_id, day, seconds)
  VALUES (p_tienda, p_dia, GREATEST(p_segundos, 0))
  ON CONFLICT (store_id, day) DO UPDATE SET seconds = public.voice_usage.seconds + EXCLUDED.seconds;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.sumar_voz(uuid, date, real) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sumar_voz(uuid, date, real) TO service_role;
