-- Ajuste de la revisión final de la Parte 3.

-- 1) Palabras de la lista de insultos que aparecen en ventas normales ("viene retrasado", "collar para perra",
--    "gris rata", "bolsas de basura", "un chorro de agua", "Ana Gil", "no me anda, es inútil", "la concha del mate",
--    "no soy estafadora"). Frenarlas rompería mensajes normales.
DELETE FROM public.chat_blocked_words
WHERE word IN (
  'retrasado', 'retrasada', 'perra', 'rata', 'basura', 'chorro', 'chorra', 'gil', 'inutil',
  'concha', 'ladron', 'ladrona', 'estafador', 'estafadora'
);
--> statement-breakpoint

-- 2) Borrado a los 30 días: solo se conservan los mensajes de la sala que silenció (o de cualquier sala
--    si hay un silencio de plataforma vigente), no todos los de la cuenta.
CREATE OR REPLACE FUNCTION public.borrar_chat_viejo() RETURNS integer
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
      WHERE s.user_id = m.user_id AND s.lifted_at IS NULL
        AND (s.kind = 'plataforma' OR (s.kind = 'sala' AND s.store_id = m.store_id))
    );
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  DELETE FROM public.moderation_actions a
  WHERE a.created_at < v_corte
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_silences s
      WHERE s.user_id = a.target_user_id AND s.lifted_at IS NULL
        AND (s.kind = 'plataforma' OR (s.kind = 'sala' AND s.store_id = a.store_id))
    );

  DELETE FROM public.chat_silences s
  WHERE (s.lifted_at IS NOT NULL AND s.lifted_at < v_corte)
     OR (s.kind = 'temporal' AND s.until < v_corte);

  RETURN v_borrados;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.borrar_chat_viejo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_chat_viejo() TO service_role;
