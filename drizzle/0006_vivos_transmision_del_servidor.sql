-- abrir_vivo ya no recibe la URL de reproducción del navegador: la lee de store_streams
DROP FUNCTION public.abrir_vivo(uuid, text, uuid);
--> statement-breakpoint
CREATE FUNCTION public.abrir_vivo(p_store uuid, p_device uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_whep text;
BEGIN
  IF NOT public.es_duena_de(p_store) THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND onboarding_step = 5) THEN
    RAISE EXCEPTION 'puesto_incompleto' USING ERRCODE = 'P0001';
  END IF;
  SELECT whep_url INTO v_whep FROM public.store_streams WHERE store_id = p_store;
  IF NOT FOUND THEN RAISE EXCEPTION 'sin_transmision' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.live_sessions
    SET device_id = p_device, last_signal_at = now(), away_since = NULL
    WHERE store_id = p_store AND ended_at IS NULL
    RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  BEGIN
    INSERT INTO public.live_sessions (store_id, whep_url, device_id)
    VALUES (p_store, v_whep, p_device)
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
REVOKE EXECUTE ON FUNCTION public.abrir_vivo(uuid, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.abrir_vivo(uuid, uuid) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.senal_vivo(
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
  IF v_vivo.device_id IS DISTINCT FROM p_device THEN RETURN 'otro_dispositivo'; END IF;
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
ALTER TABLE public.live_config ADD CONSTRAINT live_config_tiempos_positivos CHECK (
  sin_conexion_segundos > 0 AND fuera_segundos > 0 AND senal_cada_segundos > 0
);
