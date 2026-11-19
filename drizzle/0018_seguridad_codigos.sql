-- ===== Restricciones de datos =====
ALTER TABLE public.code_config
  ADD CONSTRAINT code_config_fila_unica CHECK (id = 1),
  ADD CONSTRAINT code_config_positivos CHECK (
    plazo_minutos > 0 AND cartel_ganadora_segundos > 0 AND lista_espera_max > 0 AND voz_umbral_minimo > 0
    AND voz_previo_ms > 0 AND voz_silencio_fin_ms > 0 AND voz_maximo_ms > 0 AND voz_solape_ms > 0
    AND voz_minimo_voz_ms > 0 AND voz_segundos_por_dia > 0
  );
--> statement-breakpoint
INSERT INTO public.code_config (id) VALUES (1);
--> statement-breakpoint
ALTER TABLE public.stores
  ADD CONSTRAINT stores_plazo_pago CHECK (payment_minutes IS NULL OR payment_minutes BETWEEN 5 AND 1440);
--> statement-breakpoint
ALTER TABLE public.live_codes
  ADD CONSTRAINT live_codes_precio CHECK (price_cents > 0),
  ADD CONSTRAINT live_codes_cantidad CHECK (quantity BETWEEN 1 AND 99),
  ADD CONSTRAINT live_codes_vendidos CHECK (sold BETWEEN 0 AND quantity),
  ADD CONSTRAINT live_codes_estado CHECK (status IN ('activo', 'cerrado', 'anulado')),
  ADD CONSTRAINT live_codes_cierre_junto CHECK ((status = 'activo') = (closed_at IS NULL));
--> statement-breakpoint
ALTER TABLE public.claims
  ADD CONSTRAINT claims_estado CHECK (status IN ('ganadora', 'espera', 'anulada', 'caducada'));
--> statement-breakpoint
ALTER TABLE public.orders
  ADD CONSTRAINT orders_estado CHECK (
    status IN ('por_pagar', 'pago_informado', 'en_revision', 'pagado', 'vencido', 'anulado')
  ),
  ADD CONSTRAINT orders_motivo CHECK (
    cancel_reason IS NULL OR cancel_reason IN ('ofrecida_a_otra', 'codigo_anulado', 'reclamo_anulado')
  ),
  ADD CONSTRAINT orders_motivo_junto CHECK ((status = 'anulado') = (cancel_reason IS NOT NULL)),
  ADD CONSTRAINT orders_montos CHECK (
    price_cents > 0 AND (shipping_cents IS NULL OR shipping_cents >= 0)
    AND total_cents = price_cents + coalesce(shipping_cents, 0)
  );
--> statement-breakpoint
ALTER TABLE public.voice_usage ADD CONSTRAINT voice_usage_segundos CHECK (seconds >= 0);
--> statement-breakpoint

-- ===== Funciones (SECURITY DEFINER, search_path vacío) =====
-- Lanza un código en el vivo abierto de la dueña y cierra el que estaba activo.
CREATE FUNCTION public.lanzar_codigo(
  p_vivo uuid, p_palabra text, p_etiqueta text, p_precio integer, p_cantidad integer,
  p_foto text, p_producto uuid, p_por_voz boolean
) RETURNS public.live_codes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_vivo public.live_sessions%ROWTYPE;
  v_palabra text := btrim(coalesce(p_palabra, ''));
  v_etiqueta text := upper(btrim(coalesce(p_etiqueta, '')));
  v_fila public.live_codes%ROWTYPE;
  v_restriccion text;
BEGIN
  -- Un lanzamiento por vivo a la vez: así nunca quedan dos códigos activos.
  PERFORM pg_advisory_xact_lock(hashtextextended('lanzar_codigo:' || p_vivo::text, 0));

  SELECT * INTO v_vivo FROM public.live_sessions WHERE id = p_vivo FOR SHARE;
  IF NOT FOUND OR NOT public.es_duena_de(v_vivo.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_vivo.ended_at IS NOT NULL THEN RAISE EXCEPTION 'cerrado' USING ERRCODE = 'P0001'; END IF;

  IF char_length(v_palabra) NOT BETWEEN 1 AND 40 OR v_palabra <> lower(v_palabra)
    OR char_length(v_etiqueta) NOT BETWEEN 1 AND 40
    OR p_precio IS NULL OR p_precio <= 0
    OR p_cantidad IS NULL OR p_cantidad NOT BETWEEN 1 AND 99
    OR (p_foto IS NOT NULL AND p_foto !~ (
      '^' || v_vivo.store_id::text
      || '/codigos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    ))
    OR (p_producto IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products WHERE id = p_producto AND store_id = v_vivo.store_id
    ))
  THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.live_codes WHERE live_session_id = p_vivo AND word = v_palabra) THEN
    RAISE EXCEPTION 'palabra_repetida' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.live_codes SET status = 'cerrado', closed_at = now()
    WHERE live_session_id = p_vivo AND status = 'activo';

  BEGIN
    INSERT INTO public.live_codes (
      live_session_id, store_id, word, label, price_cents, quantity, photo_path, product_id, by_voice
    ) VALUES (
      p_vivo, v_vivo.store_id, v_palabra, v_etiqueta, p_precio, p_cantidad, p_foto, p_producto,
      coalesce(p_por_voz, false)
    ) RETURNING * INTO v_fila;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
      IF v_restriccion = 'live_codes_vivo_palabra_unique' THEN
        RAISE EXCEPTION 'palabra_repetida' USING ERRCODE = 'P0001';
      END IF;
      RAISE;
  END;
  RETURN v_fila;
END;
$$;
--> statement-breakpoint
-- El código deja de recibir reclamos. Los reclamos y la lista de espera siguen valiendo.
CREATE FUNCTION public.cerrar_codigo(p_codigo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND OR NOT public.es_duena_de(v_store) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.live_codes SET status = 'cerrado', closed_at = now()
    WHERE id = p_codigo AND status = 'activo';
END;
$$;
--> statement-breakpoint
-- Lanzado por error: solo si nadie pagó ni informó un pago todavía.
CREATE FUNCTION public.anular_codigo(p_codigo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo public.live_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_codigo FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND OR NOT public.es_duena_de(v_codigo.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_codigo.status = 'anulado' THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE code_id = p_codigo AND status IN ('pago_informado', 'en_revision', 'pagado')
  ) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.live_codes SET status = 'anulado', closed_at = coalesce(closed_at, now()) WHERE id = p_codigo;
  UPDATE public.orders SET status = 'anulado', cancel_reason = 'codigo_anulado', updated_at = now()
    WHERE code_id = p_codigo AND status = 'por_pagar';
  UPDATE public.claims SET status = 'anulada'
    WHERE code_id = p_codigo AND status IN ('ganadora', 'espera');
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION
  public.lanzar_codigo(uuid, text, text, integer, integer, text, uuid, boolean),
  public.cerrar_codigo(uuid), public.anular_codigo(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  public.lanzar_codigo(uuid, text, text, integer, integer, text, uuid, boolean),
  public.cerrar_codigo(uuid), public.anular_codigo(uuid) TO authenticated;
--> statement-breakpoint

-- ===== RLS y permisos =====
ALTER TABLE public.code_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.code_config, public.live_codes, public.claims, public.orders, public.payment_reports,
  public.voice_usage FROM anon, authenticated;
--> statement-breakpoint
GRANT ALL ON public.code_config, public.live_codes, public.claims, public.orders, public.payment_reports,
  public.voice_usage TO service_role;
--> statement-breakpoint
-- Solo lectura: todos los cambios pasan por las funciones de arriba (y las de las tareas siguientes).
GRANT SELECT ON public.live_codes TO anon, authenticated;
GRANT SELECT ON public.claims, public.orders, public.payment_reports TO authenticated;
--> statement-breakpoint
CREATE POLICY "Códigos del vivo abierto" ON public.live_codes FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.live_sessions v WHERE v.id = live_session_id AND v.ended_at IS NULL));
CREATE POLICY "Mis códigos" ON public.live_codes FOR SELECT TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
CREATE POLICY "Mis reclamos" ON public.claims FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Reclamos de mi puesto" ON public.claims FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.live_codes c WHERE c.id = code_id AND (SELECT public.es_duena_de(c.store_id))
  ));
--> statement-breakpoint
CREATE POLICY "Mis pedidos" ON public.orders FOR SELECT TO authenticated
  USING (buyer_id = (SELECT auth.uid()));
CREATE POLICY "Pedidos de mi puesto" ON public.orders FOR SELECT TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
CREATE POLICY "Mis pedidos" ON public.payment_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = (SELECT auth.uid())));
CREATE POLICY "Pedidos de mi puesto" ON public.payment_reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id AND (SELECT public.es_duena_de(o.store_id))
  ));
--> statement-breakpoint

-- ===== Tiempo real =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_codes, public.claims, public.orders;
