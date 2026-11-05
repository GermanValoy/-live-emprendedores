-- La feriante no se modera a sí misma en su sala: sus mensajes se saltean "repetido" y nunca
-- cuentan ni disparan el silencio automático. Solo "insulto" puede ocultar un mensaje suyo.
CREATE OR REPLACE FUNCTION public.publicar_mensaje(
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

  IF NOT v_es_duena AND v_motivo IS NULL AND EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE user_id = p_user AND live_session_id = p_vivo AND normalized = p_normalizado
      AND created_at > now() - make_interval(secs => v_cfg.repetido_segundos)
  ) THEN
    v_motivo := 'repetido';
  END IF;

  INSERT INTO public.chat_messages (live_session_id, store_id, user_id, author_name, body, normalized, is_seller, hidden_reason)
  VALUES (p_vivo, v_vivo.store_id, p_user, v_nombre, p_texto, p_normalizado, v_es_duena, v_motivo)
  RETURNING * INTO v_fila;

  IF NOT v_es_duena AND v_motivo IS NOT NULL AND (
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
REVOKE EXECUTE ON FUNCTION public.publicar_mensaje(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.publicar_mensaje(uuid, uuid, text, text, text, text) TO service_role;
