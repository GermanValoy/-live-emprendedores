-- Dar una prenda (la feriante, en el vivo, le da a mano una prenda libre de un código cerrado a
-- quien la pidió en el chat). Orden de bloqueos (el mismo que reclamar_codigo y anular_codigo):
-- primero la fila del código en live_codes, después lo demás. Nunca se bloquea live_sessions.

-- Solo la dueña del puesto. Devuelve el nombre corto de la compradora (el del mensaje del chat).
-- Errores (P0001), en este orden: datos_invalidos (faltan datos o el código no existe), sin_permiso
-- (no es la dueña), cerrado (el vivo terminó), no_disponible (el código sigue activo o está anulado),
-- datos_invalidos (el mensaje no existe, es de otro vivo o es de la dueña), repetido (esa persona ya
-- tiene un reclamo de este código), agotado (no quedan unidades libres). Si la lista de espera del
-- código cerrado todavía tiene gente, se la ignora: solo cuenta sold < quantity.
-- Si el puesto no tiene alias, armar_pedido tira estado_invalido y no se adjudica nada.
CREATE FUNCTION public.dar_prenda(p_codigo uuid, p_mensaje uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo public.live_codes%ROWTYPE;
  v_mensaje public.chat_messages%ROWTYPE;
  v_ahora timestamptz;
  v_reclamo uuid;
  v_pedido uuid;
BEGIN
  IF p_codigo IS NULL OR p_mensaje IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_codigo FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.es_duena_de(v_codigo.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.live_sessions WHERE id = v_codigo.live_session_id AND ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cerrado' USING ERRCODE = 'P0001';
  END IF;
  IF v_codigo.status <> 'cerrado' THEN
    RAISE EXCEPTION 'no_disponible' USING ERRCODE = 'P0001';
  END IF;

  -- El mensaje tiene que ser de este vivo y de otra persona (también vale si fue borrado u ocultado).
  SELECT * INTO v_mensaje FROM public.chat_messages
    WHERE id = p_mensaje AND live_session_id = v_codigo.live_session_id;
  IF NOT FOUND OR v_mensaje.user_id IS NULL OR EXISTS (
    SELECT 1 FROM public.stores WHERE id = v_codigo.store_id AND owner_id = v_mensaje.user_id
  ) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.claims WHERE code_id = p_codigo AND user_id = v_mensaje.user_id) THEN
    RAISE EXCEPTION 'repetido' USING ERRCODE = 'P0001';
  END IF;
  IF v_codigo.sold >= v_codigo.quantity THEN
    RAISE EXCEPTION 'agotado' USING ERRCODE = 'P0001';
  END IF;

  -- La hora real en que obtuvo el turno (now() sería la hora en que empezó a esperar).
  v_ahora := clock_timestamp();
  INSERT INTO public.claims (code_id, user_id, buyer_name, message_id, message_body, claimed_at, status)
    VALUES (p_codigo, v_mensaje.user_id, v_mensaje.author_name, v_mensaje.id, v_mensaje.body, v_ahora, 'ganadora')
    RETURNING id INTO v_reclamo;
  UPDATE public.live_codes
    SET sold = sold + 1, last_winner_name = v_mensaje.author_name, last_winner_at = v_ahora
    WHERE id = p_codigo;
  v_pedido := public.armar_pedido(v_reclamo, clock_timestamp());
  UPDATE public.orders SET given_by_owner = true WHERE id = v_pedido;
  RETURN v_mensaje.author_name;
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.dar_prenda(uuid, uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dar_prenda(uuid, uuid) TO authenticated;
