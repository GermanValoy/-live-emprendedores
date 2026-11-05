-- ===== Restricciones de datos =====
ALTER TABLE public.chat_config
  ADD CONSTRAINT chat_config_fila_unica CHECK (id = 1),
  ADD CONSTRAINT chat_config_positivos CHECK (
    largo_maximo > 0 AND rafaga_mensajes > 0 AND rafaga_segundos > 0 AND repetido_segundos > 0
    AND frenados_para_silenciar > 0 AND frenados_ventana_segundos > 0 AND silencio_segundos > 0
    AND mensajes_al_entrar > 0 AND guardar_dias > 0 AND salas_para_revisar > 0
  );
--> statement-breakpoint
INSERT INTO public.chat_config (id) VALUES (1);
--> statement-breakpoint
-- Lista inicial (ya normalizada: minúsculas y sin tildes). Se amplía con INSERT, sin tocar el código.
INSERT INTO public.chat_blocked_words (word) VALUES
  ('boludo'), ('boluda'), ('pelotudo'), ('pelotuda'), ('forro'), ('forra'), ('hijo de puta'), ('hijadeputa'),
  ('hdp'), ('puta'), ('puto'), ('mierda'), ('concha'), ('conchudo'), ('conchuda'), ('la concha de tu madre'),
  ('culiado'), ('culiada'), ('pija'), ('verga'), ('chupapija'), ('garca'), ('gil'), ('imbecil'), ('idiota'),
  ('estupido'), ('estupida'), ('mogolico'), ('mogolica'), ('retrasado'), ('retrasada'), ('trolo'), ('trola'),
  ('sorete'), ('cagon'), ('cagona'), ('mamarracho'), ('basura'), ('ladrona'), ('ladron'), ('estafadora'),
  ('estafador'), ('chorra'), ('chorro'), ('rata'), ('inutil'), ('tarado'), ('tarada'), ('zorra'), ('perra'),
  ('cornudo'), ('hijo de mil puta'), ('andate a la mierda'), ('chupame'), ('chupamela'), ('ortiva'), ('ortiba'),
  ('cabeza de termo'), ('pajero'), ('pajera'), ('maricon'), ('negro de mierda'), ('villero de mierda');
--> statement-breakpoint
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_motivo CHECK (hidden_reason IS NULL OR hidden_reason IN ('link', 'promocion', 'insulto', 'repetido'));
--> statement-breakpoint
ALTER TABLE public.chat_silences
  ADD CONSTRAINT chat_silences_tipo CHECK (kind IN ('temporal', 'sala', 'plataforma')),
  ADD CONSTRAINT chat_silences_origen CHECK (source IN ('feriante', 'moderador', 'admin')),
  ADD CONSTRAINT chat_silences_plataforma_sin_puesto CHECK ((kind = 'plataforma') = (store_id IS NULL)),
  ADD CONSTRAINT chat_silences_temporal_con_fin CHECK ((kind = 'temporal') = (until IS NOT NULL));
--> statement-breakpoint
ALTER TABLE public.moderation_actions
  ADD CONSTRAINT moderation_actions_actor CHECK (actor_kind IN ('feriante', 'moderador', 'admin')),
  ADD CONSTRAINT moderation_actions_accion CHECK (
    action IN ('borrar', 'silenciar_temporal', 'silenciar_sala', 'silenciar_plataforma', 'quitar_silencio')
  );
--> statement-breakpoint

-- ===== Funciones (SECURITY DEFINER, search_path vacío) =====
-- Silencio vigente más fuerte de una persona en un puesto: 'plataforma', 'sala', 'temporal' o NULL.
CREATE FUNCTION public.esta_silenciada(p_store uuid, p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.kind
  FROM public.chat_silences s
  WHERE s.user_id = p_user
    AND s.lifted_at IS NULL
    AND (s.kind = 'plataforma' OR s.store_id = p_store)
    AND (s.kind <> 'temporal' OR s.until > now())
  ORDER BY CASE s.kind WHEN 'plataforma' THEN 1 WHEN 'sala' THEN 2 ELSE 3 END
  LIMIT 1;
$$;
--> statement-breakpoint
CREATE FUNCTION public.publicar_mensaje(
  p_user uuid, p_vivo uuid, p_nombre text, p_texto text, p_normalizado text, p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cfg public.chat_config%ROWTYPE;
  v_vivo public.live_sessions%ROWTYPE;
  v_puesto text;
  v_silencio text;
  v_es_duena boolean;
  v_motivo text := p_motivo;
  v_nombre text;
  v_fila public.chat_messages%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.chat_config WHERE id = 1;

  -- Un envío por persona a la vez: así la ráfaga y los frenados no se esquivan con pedidos en paralelo.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  SELECT * INTO v_vivo FROM public.live_sessions WHERE id = p_vivo FOR SHARE;
  IF NOT FOUND OR v_vivo.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'cerrado');
  END IF;

  IF char_length(btrim(coalesce(p_texto, ''))) = 0 OR char_length(p_texto) > v_cfg.largo_maximo THEN
    RAISE EXCEPTION 'texto_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF v_motivo IS NOT NULL AND v_motivo NOT IN ('link', 'promocion', 'insulto', 'repetido') THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'P0001';
  END IF;

  v_silencio := public.esta_silenciada(v_vivo.store_id, p_user);
  IF v_silencio IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'silenciada', 'tipo', v_silencio);
  END IF;

  IF (
    SELECT count(*) FROM public.chat_messages
    WHERE user_id = p_user AND live_session_id = p_vivo
      AND created_at > now() - make_interval(secs => v_cfg.rafaga_segundos)
  ) >= v_cfg.rafaga_mensajes THEN
    RETURN jsonb_build_object('estado', 'rafaga');
  END IF;

  SELECT name INTO v_puesto FROM public.stores WHERE id = v_vivo.store_id AND owner_id = p_user;
  v_es_duena := FOUND;
  IF v_es_duena THEN
    v_nombre := v_puesto;
    IF v_motivo IS DISTINCT FROM 'insulto' THEN v_motivo := NULL; END IF;
  ELSE
    v_nombre := p_nombre;
  END IF;

  IF v_motivo IS NULL AND EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE user_id = p_user AND live_session_id = p_vivo AND normalized = p_normalizado
      AND created_at > now() - make_interval(secs => v_cfg.repetido_segundos)
  ) THEN
    v_motivo := 'repetido';
  END IF;

  INSERT INTO public.chat_messages (live_session_id, store_id, user_id, author_name, body, normalized, is_seller, hidden_reason)
  VALUES (p_vivo, v_vivo.store_id, p_user, v_nombre, p_texto, p_normalizado, v_es_duena, v_motivo)
  RETURNING * INTO v_fila;

  IF v_motivo IS NOT NULL AND (
    SELECT count(*) FROM public.chat_messages
    WHERE user_id = p_user AND store_id = v_vivo.store_id AND hidden_reason IS NOT NULL
      AND created_at > now() - make_interval(secs => v_cfg.frenados_ventana_segundos)
  ) >= v_cfg.frenados_para_silenciar THEN
    INSERT INTO public.chat_silences (store_id, user_id, kind, source, until)
    VALUES (v_vivo.store_id, p_user, 'temporal', 'moderador', now() + make_interval(secs => v_cfg.silencio_segundos));
    INSERT INTO public.moderation_actions (store_id, target_user_id, actor_id, actor_kind, action)
    VALUES (v_vivo.store_id, p_user, NULL, 'moderador', 'silenciar_temporal');
  END IF;

  RETURN jsonb_build_object('estado', 'ok', 'mensaje', to_jsonb(v_fila));
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.esta_silenciada(uuid, uuid),
  public.publicar_mensaje(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.esta_silenciada(uuid, uuid),
  public.publicar_mensaje(uuid, uuid, text, text, text, text) TO service_role;
--> statement-breakpoint

-- ===== RLS y permisos =====
ALTER TABLE public.chat_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocked_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_silences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.chat_config, public.chat_blocked_words, public.chat_messages, public.chat_silences,
  public.moderation_actions FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.chat_config, public.chat_blocked_words, public.chat_messages, public.chat_silences,
  public.moderation_actions TO service_role;
--> statement-breakpoint
GRANT SELECT ON public.chat_messages TO anon, authenticated;
GRANT SELECT ON public.chat_silences TO authenticated;
--> statement-breakpoint
CREATE POLICY "Chat del vivo abierto" ON public.chat_messages FOR SELECT TO anon, authenticated
  USING (
    hidden_reason IS NULL
    AND EXISTS (SELECT 1 FROM public.live_sessions v WHERE v.id = live_session_id AND v.ended_at IS NULL)
  );
CREATE POLICY "Mis mensajes ocultos" ON public.chat_messages FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.live_sessions v WHERE v.id = live_session_id AND v.ended_at IS NULL)
  );
CREATE POLICY "Chat para administración" ON public.chat_messages FOR SELECT TO authenticated
  USING ((SELECT public.es_admin()));
CREATE POLICY "Mis silencios" ON public.chat_silences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint

-- ===== Tiempo real =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages, public.chat_silences;
