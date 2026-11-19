-- Reclamo atómico del código en vivo (Fase 1, Parte 4, Tarea 2).
-- Orden de bloqueos (el mismo que anular_codigo): primero la fila del código en live_codes,
-- después sus pedidos. Mientras una compradora tiene tomada la fila del código, las demás esperan
-- su turno: nunca hay dos ganadoras para la misma unidad.

-- Interna: arma el pedido "por pagar" de un reclamo ganador, con el precio del código, una copia
-- del alias y del titular de la feriante (si después los cambia, el pedido sigue con los de ahora)
-- y el plazo del puesto (o el general de code_config). Quien la llama ya bloqueó la fila del código.
CREATE FUNCTION public.armar_pedido(p_reclamo uuid, p_ahora timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_reclamo public.claims%ROWTYPE;
  v_codigo public.live_codes%ROWTYPE;
  v_alias text;
  v_titular text;
  v_minutos integer;
  v_pedido uuid;
BEGIN
  SELECT * INTO v_reclamo FROM public.claims WHERE id = p_reclamo;
  SELECT * INTO v_codigo FROM public.live_codes WHERE id = v_reclamo.code_id;
  SELECT pi.payment_alias, pi.payment_holder,
         coalesce(s.payment_minutes, (SELECT plazo_minutos FROM public.code_config WHERE id = 1))
    INTO v_alias, v_titular, v_minutos
    FROM public.stores s LEFT JOIN public.store_private_info pi ON pi.store_id = s.id
    WHERE s.id = v_codigo.store_id;
  -- Un puesto abierto siempre tiene alias y titular (los pide el recorrido de 4 pasos). Si faltan,
  -- no se adjudica nada: mejor que nadie gane a que gane sin saber a quién transferir.
  IF btrim(coalesce(v_alias, '')) = '' OR btrim(coalesce(v_titular, '')) = '' THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.orders (
    claim_id, code_id, store_id, live_session_id, buyer_id, buyer_name,
    price_cents, total_cents, payment_alias, payment_holder, status, deadline
  ) VALUES (
    v_reclamo.id, v_codigo.id, v_codigo.store_id, v_codigo.live_session_id, v_reclamo.user_id,
    v_reclamo.buyer_name, v_codigo.price_cents, v_codigo.price_cents, v_alias, v_titular, 'por_pagar',
    p_ahora + make_interval(mins => v_minutos)
  ) RETURNING id INTO v_pedido;
  RETURN v_pedido;
END;
$$;
--> statement-breakpoint
-- Una compradora escribió el código en el chat. La llama solo el servidor (con la clave de servicio),
-- después de detectar el código en el mensaje. Devuelve qué pasó, para mostrárselo a la compradora.
CREATE FUNCTION public.reclamar_codigo(
  p_user uuid, p_codigo uuid, p_nombre text, p_mensaje uuid, p_texto text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo public.live_codes%ROWTYPE;
  v_ahora timestamptz;
  v_hora timestamptz;
  v_mensaje uuid;
  v_reclamo uuid;
  v_pedido uuid;
  v_max integer;
  v_lugar integer;
BEGIN
  IF p_user IS NULL OR btrim(coalesce(p_nombre, '')) = '' OR p_texto IS NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_codigo FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND OR v_codigo.status <> 'activo' OR EXISTS (
    SELECT 1 FROM public.live_sessions WHERE id = v_codigo.live_session_id AND ended_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('estado', 'sin_codigo');
  END IF;
  -- La hora real en que esta compradora obtuvo el turno (now() sería la hora en que empezó a esperar).
  v_ahora := clock_timestamp();

  IF EXISTS (SELECT 1 FROM public.stores WHERE id = v_codigo.store_id AND owner_id = p_user) THEN
    RETURN jsonb_build_object('estado', 'propio');
  END IF;
  IF EXISTS (SELECT 1 FROM public.claims WHERE code_id = p_codigo AND user_id = p_user) THEN
    RETURN jsonb_build_object('estado', 'repetido');
  END IF;

  -- La hora del mensaje del chat (hora del servidor), si es de esta compradora y de este vivo.
  SELECT id, created_at INTO v_mensaje, v_hora FROM public.chat_messages
    WHERE id = p_mensaje AND user_id = p_user AND live_session_id = v_codigo.live_session_id;
  v_hora := coalesce(v_hora, v_ahora);

  IF v_codigo.sold < v_codigo.quantity THEN
    INSERT INTO public.claims (code_id, user_id, buyer_name, message_id, message_body, claimed_at, status)
      VALUES (p_codigo, p_user, btrim(p_nombre), v_mensaje, p_texto, v_hora, 'ganadora')
      RETURNING id INTO v_reclamo;
    UPDATE public.live_codes
      SET sold = sold + 1, last_winner_name = btrim(p_nombre), last_winner_at = v_ahora
      WHERE id = p_codigo;
    v_pedido := public.armar_pedido(v_reclamo, v_ahora);
    RETURN jsonb_build_object('estado', 'ganaste', 'pedido', v_pedido);
  END IF;

  SELECT lista_espera_max INTO v_max FROM public.code_config WHERE id = 1;
  IF (SELECT count(*) FROM public.claims WHERE code_id = p_codigo AND status = 'espera') < v_max THEN
    INSERT INTO public.claims (code_id, user_id, buyer_name, message_id, message_body, claimed_at, status)
      VALUES (p_codigo, p_user, btrim(p_nombre), v_mensaje, p_texto, v_hora, 'espera')
      RETURNING id INTO v_reclamo;
    SELECT count(*) INTO v_lugar FROM public.claims
      WHERE code_id = p_codigo AND status = 'espera' AND (claimed_at, id) <= (v_hora, v_reclamo);
    RETURN jsonb_build_object('estado', 'lista', 'lugar', v_lugar, 'ganadora', v_codigo.last_winner_name);
  END IF;

  RETURN jsonb_build_object('estado', 'agotado');
END;
$$;
--> statement-breakpoint
-- Interna (la usan ofrecer a otra, anular reclamo y el vencimiento de pedidos): la unidad que quedó
-- libre pasa a la primera de la lista de espera, con su pedido y el plazo completo desde ahora. Si no
-- hay nadie esperando, la unidad vuelve a estar disponible (sold - 1).
-- Quien la llama TIENE QUE haber bloqueado antes la fila del código (SELECT … FROM live_codes … FOR
-- UPDATE) y recién después sus pedidos, para respetar el orden de bloqueos y no trabarse con un
-- reclamo que llega en el mismo instante. El FOR UPDATE de acá no cambia nada en ese caso (la fila ya
-- es de esta transacción); solo protege si algún día se la llama sin bloquear.
CREATE FUNCTION public.pasar_a_siguiente(p_codigo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ahora timestamptz;
  v_reclamo public.claims%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_ahora := clock_timestamp();

  SELECT * INTO v_reclamo FROM public.claims
    WHERE code_id = p_codigo AND status = 'espera'
    ORDER BY claimed_at, id
    LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.live_codes SET sold = sold - 1 WHERE id = p_codigo;
    RETURN;
  END IF;

  UPDATE public.claims SET status = 'ganadora' WHERE id = v_reclamo.id;
  UPDATE public.live_codes SET last_winner_name = v_reclamo.buyer_name, last_winner_at = v_ahora
    WHERE id = p_codigo;
  PERFORM public.armar_pedido(v_reclamo.id, v_ahora);
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION
  public.armar_pedido(uuid, timestamptz), public.pasar_a_siguiente(uuid),
  public.reclamar_codigo(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reclamar_codigo(uuid, uuid, text, uuid, text) TO service_role;
