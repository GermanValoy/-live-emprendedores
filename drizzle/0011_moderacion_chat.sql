-- ===== Moderación del chat (Fase 1, Parte 3, Tarea 2) =====

-- La feriante borra un mensaje de SU sala. Se vacían body y normalized (la política de lectura pública
-- no excluye los borrados, así que el texto no puede quedar a la vista); el original se guarda en
-- moderation_actions, que no lee nadie desde el navegador.
CREATE FUNCTION public.borrar_mensaje(p_mensaje uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_msg public.chat_messages%ROWTYPE;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_mensaje FOR UPDATE;
  IF NOT FOUND OR NOT public.es_duena_de(v_msg.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_msg.deleted_at IS NOT NULL THEN RETURN; END IF;

  INSERT INTO public.moderation_actions (store_id, target_user_id, actor_id, actor_kind, action, message_id, message_body)
  VALUES (v_msg.store_id, v_msg.user_id, (SELECT auth.uid()), 'feriante', 'borrar', v_msg.id, v_msg.body);

  UPDATE public.chat_messages SET body = '', normalized = '', deleted_at = now() WHERE id = v_msg.id;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.silenciar_en_sala(p_store uuid, p_user uuid, p_tipo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cfg public.chat_config%ROWTYPE;
BEGIN
  IF NOT public.es_duena_de(p_store) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('temporal', 'sala') THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;
  IF p_user = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'no_a_vos_misma' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cfg FROM public.chat_config WHERE id = 1;

  IF p_tipo = 'sala' THEN
    -- Un segundo silencio de sala sobre alguien ya silenciado así no se duplica.
    IF EXISTS (
      SELECT 1 FROM public.chat_silences
      WHERE store_id = p_store AND user_id = p_user AND kind = 'sala' AND lifted_at IS NULL
    ) THEN RETURN; END IF;
    INSERT INTO public.chat_silences (store_id, user_id, kind, source, created_by)
    VALUES (p_store, p_user, 'sala', 'feriante', (SELECT auth.uid()));
  ELSE
    INSERT INTO public.chat_silences (store_id, user_id, kind, source, created_by, until)
    VALUES (p_store, p_user, 'temporal', 'feriante', (SELECT auth.uid()), now() + make_interval(secs => v_cfg.silencio_segundos));
  END IF;

  INSERT INTO public.moderation_actions (store_id, target_user_id, actor_id, actor_kind, action)
  VALUES (p_store, p_user, (SELECT auth.uid()), 'feriante', CASE p_tipo WHEN 'sala' THEN 'silenciar_sala' ELSE 'silenciar_temporal' END);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.quitar_silencio(p_store uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.es_duena_de(p_store) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.chat_silences
  SET lifted_at = now(), lifted_by = (SELECT auth.uid())
  WHERE store_id = p_store AND user_id = p_user AND lifted_at IS NULL;
  IF FOUND THEN
    INSERT INTO public.moderation_actions (store_id, target_user_id, actor_id, actor_kind, action)
    VALUES (p_store, p_user, (SELECT auth.uid()), 'feriante', 'quitar_silencio');
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.silenciadas_de_mi_sala(p_store uuid)
RETURNS TABLE (user_id uuid, nombre text, desde timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.es_duena_de(p_store) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT s.user_id,
    coalesce(
      (SELECT m.author_name FROM public.chat_messages m
       WHERE m.user_id = s.user_id AND m.store_id = p_store ORDER BY m.created_at DESC LIMIT 1),
      'Alguien'
    ),
    s.created_at
  FROM public.chat_silences s
  WHERE s.store_id = p_store AND s.kind = 'sala' AND s.lifted_at IS NULL
  ORDER BY s.created_at DESC;
END;
$$;
--> statement-breakpoint

-- ===== Administración =====
-- Cuentas que varias feriantes silenciaron por su cuenta (de origen feriante, vigentes) más las que
-- ya están silenciadas en toda la plataforma.
CREATE FUNCTION public.cuentas_para_revisar()
RETURNS TABLE (user_id uuid, nombre text, salas integer, desde timestamptz, en_plataforma boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_umbral integer;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  SELECT salas_para_revisar INTO v_umbral FROM public.chat_config WHERE id = 1;
  RETURN QUERY
  WITH sala AS (
    SELECT s.user_id, count(DISTINCT s.store_id)::integer AS n, min(s.created_at) AS d
    FROM public.chat_silences s
    WHERE s.kind = 'sala' AND s.source = 'feriante' AND s.lifted_at IS NULL
    GROUP BY s.user_id
  ), plat AS (
    SELECT s.user_id, min(s.created_at) AS d
    FROM public.chat_silences s
    WHERE s.kind = 'plataforma' AND s.lifted_at IS NULL
    GROUP BY s.user_id
  )
  SELECT u.id, u.display_name, coalesce(sala.n, 0), least(sala.d, plat.d), plat.user_id IS NOT NULL
  FROM public.users u
  LEFT JOIN sala ON sala.user_id = u.id
  LEFT JOIN plat ON plat.user_id = u.id
  WHERE coalesce(sala.n, 0) >= v_umbral OR plat.user_id IS NOT NULL
  ORDER BY coalesce(sala.n, 0) DESC, u.display_name;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.silenciar_en_plataforma(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.chat_silences WHERE user_id = p_user AND kind = 'plataforma' AND lifted_at IS NULL
  ) THEN RETURN; END IF;
  INSERT INTO public.chat_silences (store_id, user_id, kind, source, created_by)
  VALUES (NULL, p_user, 'plataforma', 'admin', (SELECT auth.uid()));
  INSERT INTO public.moderation_actions (store_id, target_user_id, actor_id, actor_kind, action)
  VALUES (NULL, p_user, (SELECT auth.uid()), 'admin', 'silenciar_plataforma');
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.quitar_silencio_plataforma(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.chat_silences
  SET lifted_at = now(), lifted_by = (SELECT auth.uid())
  WHERE user_id = p_user AND kind = 'plataforma' AND lifted_at IS NULL;
  IF FOUND THEN
    INSERT INTO public.moderation_actions (store_id, target_user_id, actor_id, actor_kind, action)
    VALUES (NULL, p_user, (SELECT auth.uid()), 'admin', 'quitar_silencio');
  END IF;
END;
$$;
--> statement-breakpoint

-- ===== Borrado a los 30 días =====
-- Solo la ejecuta el servidor (y pg_cron). Las cuentas con un silencio de sala o de plataforma vigente
-- conservan sus mensajes y registros, por si hace falta revisarlas.
CREATE FUNCTION public.borrar_chat_viejo() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_corte timestamptz;
  v_borrados integer;
BEGIN
  SELECT now() - make_interval(days => guardar_dias) INTO v_corte FROM public.chat_config WHERE id = 1;

  DELETE FROM public.chat_messages m
  WHERE m.created_at < v_corte
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_silences s
      WHERE s.user_id = m.user_id AND s.kind IN ('sala', 'plataforma') AND s.lifted_at IS NULL
    );
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  DELETE FROM public.moderation_actions a
  WHERE a.created_at < v_corte
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_silences s
      WHERE s.user_id = a.target_user_id AND s.kind IN ('sala', 'plataforma') AND s.lifted_at IS NULL
    );

  DELETE FROM public.chat_silences s
  WHERE (s.lifted_at IS NOT NULL AND s.lifted_at < v_corte)
     OR (s.kind = 'temporal' AND s.until < v_corte);

  RETURN v_borrados;
END;
$$;
--> statement-breakpoint

-- ===== Límite de señales del vivo =====
-- Más de 30 señales en 60 s (ventana fija que arranca con la primera): responde 'demasiadas' sin tocar nada.
CREATE OR REPLACE FUNCTION public.senal_vivo(
  p_vivo uuid, p_device uuid, p_fuera boolean, p_silenciada boolean, p_mirando integer
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_vivo public.live_sessions%ROWTYPE;
  v_inicio timestamptz;
  v_cuenta integer;
BEGIN
  SELECT * INTO v_vivo FROM public.live_sessions WHERE id = p_vivo FOR UPDATE;
  IF NOT FOUND OR NOT public.es_duena_de(v_vivo.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_vivo.ended_at IS NOT NULL THEN RETURN 'terminado'; END IF;
  IF v_vivo.device_id IS DISTINCT FROM p_device THEN RETURN 'otro_dispositivo'; END IF;

  IF v_vivo.signal_window_start IS NULL OR v_vivo.signal_window_start <= now() - interval '60 seconds' THEN
    v_inicio := now();
    v_cuenta := 1;
  ELSIF v_vivo.signal_count >= 30 THEN
    RETURN 'demasiadas';
  ELSE
    v_inicio := v_vivo.signal_window_start;
    v_cuenta := v_vivo.signal_count + 1;
  END IF;

  UPDATE public.live_sessions SET
    last_signal_at = now(),
    away_since = CASE WHEN p_fuera THEN coalesce(away_since, now()) ELSE NULL END,
    muted = p_silenciada,
    viewers = greatest(p_mirando, 0),
    peak_viewers = greatest(peak_viewers, p_mirando),
    signal_window_start = v_inicio,
    signal_count = v_cuenta
  WHERE id = p_vivo;
  RETURN 'ok';
END;
$$;
--> statement-breakpoint

-- ===== Permisos =====
REVOKE EXECUTE ON FUNCTION public.borrar_mensaje(uuid), public.silenciar_en_sala(uuid, uuid, text),
  public.quitar_silencio(uuid, uuid), public.silenciadas_de_mi_sala(uuid), public.cuentas_para_revisar(),
  public.silenciar_en_plataforma(uuid), public.quitar_silencio_plataforma(uuid), public.borrar_chat_viejo()
  FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.borrar_mensaje(uuid), public.silenciar_en_sala(uuid, uuid, text),
  public.quitar_silencio(uuid, uuid), public.silenciadas_de_mi_sala(uuid), public.cuentas_para_revisar(),
  public.silenciar_en_plataforma(uuid), public.quitar_silencio_plataforma(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.borrar_chat_viejo() TO service_role;
--> statement-breakpoint

-- ===== Limpieza diaria (03:17 hora de Tucumán) =====
SELECT cron.schedule('borrar-chat-viejo', '17 6 * * *', $$SELECT public.borrar_chat_viejo()$$);
