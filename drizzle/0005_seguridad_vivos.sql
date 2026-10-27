-- ===== Restricciones de datos =====
ALTER TABLE public.live_config ADD CONSTRAINT live_config_fila_unica CHECK (id = 1);
--> statement-breakpoint
INSERT INTO public.live_config (id) VALUES (1);
--> statement-breakpoint
ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_motivo CHECK (end_reason IS NULL OR end_reason IN ('duena', 'sin_senal', 'plataforma')),
  ADD CONSTRAINT live_sessions_cierre_junto CHECK ((ended_at IS NULL) = (end_reason IS NULL));
--> statement-breakpoint

-- ===== Funciones (SECURITY DEFINER, search_path vacío) =====
CREATE FUNCTION public.abrir_vivo(p_store uuid, p_whep text, p_device uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.es_duena_de(p_store) THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND onboarding_step = 5) THEN
    RAISE EXCEPTION 'puesto_incompleto' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.live_sessions
    SET device_id = p_device, last_signal_at = now(), away_since = NULL
    WHERE store_id = p_store AND ended_at IS NULL
    RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  BEGIN
    INSERT INTO public.live_sessions (store_id, whep_url, device_id)
    VALUES (p_store, p_whep, p_device)
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.live_sessions
        SET device_id = p_device, last_signal_at = now(), away_since = NULL
        WHERE store_id = p_store AND ended_at IS NULL
        RETURNING id INTO v_id;
  END;
  RETURN v_id;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.senal_vivo(
  p_vivo uuid, p_device uuid, p_fuera boolean, p_silenciada boolean, p_mirando integer
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_vivo public.live_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_vivo FROM public.live_sessions WHERE id = p_vivo FOR UPDATE;
  IF NOT FOUND OR NOT public.es_duena_de(v_vivo.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_vivo.ended_at IS NOT NULL THEN RETURN 'terminado'; END IF;
  IF v_vivo.device_id <> p_device THEN RETURN 'otro_dispositivo'; END IF;
  UPDATE public.live_sessions SET
    last_signal_at = now(),
    away_since = CASE WHEN p_fuera THEN coalesce(away_since, now()) ELSE NULL END,
    muted = p_silenciada,
    viewers = greatest(p_mirando, 0),
    peak_viewers = greatest(peak_viewers, p_mirando)
  WHERE id = p_vivo;
  RETURN 'ok';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.terminar_vivo(p_vivo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store FROM public.live_sessions WHERE id = p_vivo;
  IF NOT FOUND OR NOT public.es_duena_de(v_store) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.live_sessions SET ended_at = now(), end_reason = 'duena'
    WHERE id = p_vivo AND ended_at IS NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cortar_vivo(p_vivo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.live_sessions SET ended_at = now(), end_reason = 'plataforma', ended_by = auth.uid()
    WHERE id = p_vivo AND ended_at IS NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.cerrar_vivos_vencidos() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cfg public.live_config%ROWTYPE;
  v_cerrados integer;
BEGIN
  SELECT * INTO v_cfg FROM public.live_config WHERE id = 1;
  UPDATE public.live_sessions SET ended_at = now(), end_reason = 'sin_senal'
  WHERE ended_at IS NULL
    AND (
      (away_since IS NULL AND last_signal_at < now() - make_interval(secs => v_cfg.sin_conexion_segundos))
      OR (away_since IS NOT NULL AND away_since < now() - make_interval(secs => v_cfg.fuera_segundos))
    );
  GET DIAGNOSTICS v_cerrados = ROW_COUNT;
  RETURN v_cerrados;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.abrir_vivo(uuid, text, uuid), public.senal_vivo(uuid, uuid, boolean, boolean, integer),
  public.terminar_vivo(uuid), public.cortar_vivo(uuid), public.cerrar_vivos_vencidos() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.abrir_vivo(uuid, text, uuid), public.senal_vivo(uuid, uuid, boolean, boolean, integer),
  public.terminar_vivo(uuid), public.cortar_vivo(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.cerrar_vivos_vencidos() TO service_role;
--> statement-breakpoint

-- ===== RLS y permisos =====
ALTER TABLE public.live_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.live_config, public.store_streams, public.live_sessions FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.live_config, public.store_streams, public.live_sessions TO service_role;
--> statement-breakpoint
GRANT SELECT ON public.live_config, public.live_sessions TO anon, authenticated;
CREATE POLICY "Configuración del vivo pública" ON public.live_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Vivos públicos" ON public.live_sessions FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint

-- ===== Tiempo real y cierre automático =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_cron;
--> statement-breakpoint
SELECT cron.schedule('cerrar-vivos-vencidos', '* * * * *', $$SELECT public.cerrar_vivos_vencidos()$$);
