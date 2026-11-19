-- El pedido (Fase 1, Parte 4, Tarea 3): entrega, "Ya pagué", confirmación de la feriante,
-- ofrecer a otra, más tiempo, anular reclamo y vencimientos.
-- Orden de bloqueos (el mismo que anular_codigo y reclamar_codigo): primero la fila del código en
-- live_codes, después el pedido, después los reclamos. El estado del pedido se vuelve a leer recién con
-- los bloqueos tomados. Nunca se bloquea live_sessions con FOR UPDATE.

-- ===== pasar_a_siguiente: no le da la prenda a nadie si el código está anulado =====
-- Sí la pasa si el código está cerrado o el vivo terminó: la feriante revisa los pagos después del vivo.
CREATE OR REPLACE FUNCTION public.pasar_a_siguiente(p_codigo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ahora timestamptz;
  v_estado text;
  v_reclamo public.claims%ROWTYPE;
BEGIN
  SELECT status INTO v_estado FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND OR v_estado = 'anulado' THEN RETURN; END IF;
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

-- ===== Internas =====
-- Bloquea el código del pedido y después el pedido, y devuelve el pedido ya bloqueado (con todos sus
-- campos nulos si no existe). El code_id de un pedido nunca cambia: se puede leer antes de bloquear.
CREATE FUNCTION public.bloquear_pedido(p_pedido uuid) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo uuid;
  v_pedido public.orders%ROWTYPE;
BEGIN
  SELECT code_id INTO v_codigo FROM public.orders WHERE id = p_pedido;
  IF NOT FOUND THEN RETURN v_pedido; END IF;
  PERFORM 1 FROM public.live_codes WHERE id = v_codigo FOR UPDATE;
  SELECT * INTO v_pedido FROM public.orders WHERE id = p_pedido FOR UPDATE;
  RETURN v_pedido;
END;
$$;
--> statement-breakpoint
-- Vence un pedido por pagar con el plazo cumplido. Con p_pasar, la prenda pasa a la siguiente de la
-- lista; sin p_pasar (cuando pasarla falló), la prenda queda libre. Devuelve si lo venció.
CREATE FUNCTION public.vencer_pedido(p_pedido uuid, p_pasar boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR v_pedido.status <> 'por_pagar' OR v_pedido.deadline > now() THEN
    RETURN false;
  END IF;
  UPDATE public.orders SET status = 'vencido', updated_at = now() WHERE id = p_pedido;
  UPDATE public.claims SET status = 'caducada' WHERE id = v_pedido.claim_id;
  IF p_pasar THEN
    PERFORM public.pasar_a_siguiente(v_pedido.code_id);
  ELSE
    UPDATE public.live_codes SET sold = sold - 1 WHERE id = v_pedido.code_id AND sold > 0;
  END IF;
  RETURN true;
END;
$$;
--> statement-breakpoint

-- ===== De la compradora =====
-- Elige la entrega antes de pagar: el envío puede sumar costo al total.
CREATE FUNCTION public.elegir_entrega(p_pedido uuid, p_tipo public.delivery_kind) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
  v_opcion public.store_delivery_options%ROWTYPE;
  v_envio integer;
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR v_pedido.buyer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_pedido.status <> 'por_pagar' THEN RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_opcion FROM public.store_delivery_options
    WHERE store_id = v_pedido.store_id AND kind = p_tipo AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001'; END IF;
  IF p_tipo = 'shipping' THEN
    v_envio := CASE v_opcion.shipping_mode
      WHEN 'free' THEN 0
      WHEN 'fixed' THEN v_opcion.shipping_cost_cents
      ELSE NULL -- a coordinar: lo arregla con la feriante
    END;
    IF v_opcion.shipping_mode = 'fixed' AND v_envio IS NULL THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.orders
    SET delivery_kind = p_tipo, shipping_cents = v_envio, total_cents = price_cents + coalesce(v_envio, 0),
        updated_at = now()
    WHERE id = p_pedido
    RETURNING * INTO v_pedido;
  RETURN v_pedido;
END;
$$;
--> statement-breakpoint
-- "Ya pagué": con el comprobante ya subido a su carpeta y el WhatsApp para coordinar la entrega.
-- Si el plazo venció (aunque el vencimiento automático no haya pasado todavía), se rechaza.
CREATE FUNCTION public.informar_pago(p_pedido uuid, p_comprobante text, p_whatsapp text) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
  v_digitos text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR v_pedido.buyer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  -- clock_timestamp(): la hora de ahora, después de esperar los bloqueos (now() es la del comienzo).
  IF v_pedido.status <> 'por_pagar' OR v_pedido.deadline <= clock_timestamp() OR v_pedido.delivery_kind IS NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001';
  END IF;
  IF p_comprobante IS NULL OR p_comprobante !~ (
      '^' || v_pedido.buyer_id::text || '/' || v_pedido.id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    )
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'comprobantes' AND name = p_comprobante)
    OR char_length(coalesce(p_whatsapp, '')) > 30
    OR char_length(v_digitos) NOT BETWEEN 8 AND 15
  THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payment_reports (order_id, proof_path) VALUES (p_pedido, p_comprobante);
  UPDATE public.orders
    SET status = 'pago_informado', buyer_whatsapp = v_digitos, reported_at = now(), updated_at = now()
    WHERE id = p_pedido
    RETURNING * INTO v_pedido;
  RETURN v_pedido;
END;
$$;
--> statement-breakpoint
-- El WhatsApp que usó la última vez, para no pedírselo de nuevo.
CREATE FUNCTION public.ultimo_whatsapp() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT buyer_whatsapp FROM public.orders
    WHERE buyer_id = (SELECT auth.uid()) AND buyer_whatsapp IS NOT NULL
    ORDER BY coalesce(reported_at, created_at) DESC
    LIMIT 1;
$$;
--> statement-breakpoint
-- Los datos de la entrega elegida. La compradora los ve recién con el pedido pagado (la dirección
-- exacta solo la ve quien ya pagó); la dueña, siempre.
CREATE FUNCTION public.datos_entrega(p_pedido uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
  v_es_duena boolean;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_pedido FROM public.orders WHERE id = p_pedido;
  IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001'; END IF;
  v_es_duena := public.es_duena_de(v_pedido.store_id);
  IF NOT v_es_duena AND v_pedido.buyer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_es_duena AND v_pedido.status <> 'pagado' THEN RETURN '{}'::jsonb; END IF;

  IF v_pedido.delivery_kind = 'pickup' THEN
    SELECT jsonb_build_object('direccion', pickup_address, 'horarios', pickup_hours) INTO v_resultado
      FROM public.store_private_info WHERE store_id = v_pedido.store_id;
  ELSIF v_pedido.delivery_kind IS NOT NULL THEN
    SELECT jsonb_build_object('nota', note) INTO v_resultado
      FROM public.store_delivery_options WHERE store_id = v_pedido.store_id AND kind = v_pedido.delivery_kind;
  END IF;
  RETURN coalesce(v_resultado, '{}'::jsonb);
END;
$$;
--> statement-breakpoint

-- ===== De la dueña del puesto =====
-- Le llegó la plata (la revisó en su banco).
CREATE FUNCTION public.confirmar_pago(p_pedido uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR NOT public.es_duena_de(v_pedido.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_pedido.status NOT IN ('pago_informado', 'en_revision') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.orders SET status = 'pagado', confirmed_at = now(), updated_at = now() WHERE id = p_pedido;
END;
$$;
--> statement-breakpoint
-- "No me llegó el pago": queda en revisión hasta que lo aclaren por WhatsApp.
CREATE FUNCTION public.rechazar_pago(p_pedido uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR NOT public.es_duena_de(v_pedido.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_pedido.status <> 'pago_informado' THEN RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.orders SET status = 'en_revision', updated_at = now() WHERE id = p_pedido;
END;
$$;
--> statement-breakpoint
-- La prenda pasa a la siguiente de la lista (o vuelve a estar disponible). Cuenta como falta.
CREATE FUNCTION public.ofrecer_a_otra(p_pedido uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR NOT public.es_duena_de(v_pedido.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_pedido.status NOT IN ('por_pagar', 'pago_informado', 'en_revision') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.orders SET status = 'anulado', cancel_reason = 'ofrecida_a_otra', updated_at = now()
    WHERE id = p_pedido;
  UPDATE public.claims SET status = 'caducada' WHERE id = v_pedido.claim_id;
  PERFORM public.pasar_a_siguiente(v_pedido.code_id);
END;
$$;
--> statement-breakpoint
-- Más plazo para pagar: +15 min, +1 hora o +24 horas. Si ya venció, cuenta desde ahora.
CREATE FUNCTION public.dar_mas_tiempo(p_pedido uuid, p_minutos integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pedido public.orders%ROWTYPE;
BEGIN
  v_pedido := public.bloquear_pedido(p_pedido);
  IF v_pedido.id IS NULL OR NOT public.es_duena_de(v_pedido.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF p_minutos IS NULL OR p_minutos NOT IN (15, 60, 1440) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;
  IF v_pedido.status <> 'por_pagar' THEN RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.orders
    SET deadline = greatest(deadline, clock_timestamp()) + make_interval(mins => p_minutos), updated_at = now()
    WHERE id = p_pedido;
END;
$$;
--> statement-breakpoint
-- Reclamo por error (por ejemplo, alguien que no quería comprar): la ganadora pierde la prenda sin
-- falta y pasa a la siguiente; un reclamo en la lista de espera simplemente sale de la lista.
CREATE FUNCTION public.anular_reclamo(p_reclamo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo uuid;
  v_store uuid;
  v_reclamo public.claims%ROWTYPE;
  v_pedido public.orders%ROWTYPE;
BEGIN
  SELECT code_id INTO v_codigo FROM public.claims WHERE id = p_reclamo;
  IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001'; END IF;
  SELECT store_id INTO v_store FROM public.live_codes WHERE id = v_codigo FOR UPDATE;
  IF NOT public.es_duena_de(v_store) THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_pedido FROM public.orders WHERE claim_id = p_reclamo FOR UPDATE;
  SELECT * INTO v_reclamo FROM public.claims WHERE id = p_reclamo FOR UPDATE;

  IF v_reclamo.status = 'espera' THEN
    UPDATE public.claims SET status = 'anulada' WHERE id = p_reclamo;
    RETURN;
  END IF;
  IF v_reclamo.status <> 'ganadora' OR v_pedido.id IS NULL
    OR v_pedido.status NOT IN ('por_pagar', 'pago_informado', 'en_revision')
  THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.orders SET status = 'anulado', cancel_reason = 'reclamo_anulado', updated_at = now()
    WHERE id = v_pedido.id;
  UPDATE public.claims SET status = 'anulada' WHERE id = p_reclamo;
  PERFORM public.pasar_a_siguiente(v_codigo);
END;
$$;
--> statement-breakpoint

-- ===== Del sistema =====
-- Cada minuto: los pedidos por pagar con el plazo cumplido vencen (cuenta como falta) y la prenda pasa
-- a la siguiente. Cada pedido va por separado: si uno falla (por ejemplo, el puesto se quedó sin alias y
-- no se le puede armar el pedido a la siguiente), ese pedido vence igual con la prenda libre y el resto
-- sigue. Devuelve cuántos venció.
CREATE FUNCTION public.vencer_pedidos() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_vencidos integer := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.orders WHERE status = 'por_pagar' AND deadline <= now() ORDER BY deadline
  LOOP
    BEGIN
      IF public.vencer_pedido(v_id, true) THEN v_vencidos := v_vencidos + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        IF public.vencer_pedido(v_id, false) THEN v_vencidos := v_vencidos + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'vencer_pedidos: no se pudo vencer el pedido %: %', v_id, SQLERRM;
      END;
    END;
  END LOOP;
  RETURN v_vencidos;
END;
$$;
--> statement-breakpoint

-- ===== Permisos de las funciones =====
-- Las internas no las llama nadie desde afuera (ni siquiera el servidor con la clave de servicio).
REVOKE EXECUTE ON FUNCTION
  public.armar_pedido(uuid, timestamptz), public.pasar_a_siguiente(uuid), public.bloquear_pedido(uuid),
  public.vencer_pedido(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION
  public.elegir_entrega(uuid, public.delivery_kind), public.informar_pago(uuid, text, text),
  public.ultimo_whatsapp(), public.datos_entrega(uuid), public.confirmar_pago(uuid), public.rechazar_pago(uuid),
  public.ofrecer_a_otra(uuid), public.dar_mas_tiempo(uuid, integer), public.anular_reclamo(uuid),
  public.vencer_pedidos() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  public.elegir_entrega(uuid, public.delivery_kind), public.informar_pago(uuid, text, text),
  public.ultimo_whatsapp(), public.datos_entrega(uuid), public.confirmar_pago(uuid), public.rechazar_pago(uuid),
  public.ofrecer_a_otra(uuid), public.dar_mas_tiempo(uuid, integer), public.anular_reclamo(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.vencer_pedidos() TO service_role;
--> statement-breakpoint

-- ===== Comprobantes (Supabase Storage, bucket privado) =====
-- Ruta: <compradora>/<pedido>/<uuid>.(webp|jpg). Solo los ven la compradora y la dueña del puesto.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes', 'comprobantes', false, 5242880, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE POLICY "La compradora sube el comprobante de su pedido" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = (storage.foldername(name))[2] AND o.buyer_id = (SELECT auth.uid())
        AND o.status = 'por_pagar'
    )
  );
CREATE POLICY "La compradora ve sus comprobantes" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "La dueña ve los comprobantes de su puesto" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id::text = (storage.foldername(name))[2] AND o.buyer_id::text = (storage.foldername(name))[1]
        AND (SELECT public.es_duena_de(o.store_id))
    )
  );
--> statement-breakpoint

-- ===== Vencimiento automático =====
SELECT cron.schedule('vencer-pedidos', '* * * * *', $$SELECT public.vencer_pedidos()$$);
