-- Lanzado por error: solo si nadie pagó ni informó un pago todavía.
-- Orden de bloqueos (lo siguen todas las funciones del código en vivo): primero la fila del código
-- en live_codes, después los pedidos de ese código. Así un "Ya pagué" que llega en el mismo instante
-- espera a que termine la anulación (o la anulación ve el pedido ya informado) y nunca queda un código
-- anulado con un pedido informado o pagado.
CREATE OR REPLACE FUNCTION public.anular_codigo(p_codigo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_codigo public.live_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_codigo FROM public.live_codes WHERE id = p_codigo FOR UPDATE;
  IF NOT FOUND OR NOT public.es_duena_de(v_codigo.store_id) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = 'P0001';
  END IF;
  IF v_codigo.status = 'anulado' THEN RETURN; END IF;
  PERFORM 1 FROM public.orders WHERE code_id = p_codigo FOR UPDATE;
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
REVOKE EXECUTE ON FUNCTION public.anular_codigo(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.anular_codigo(uuid) TO authenticated;
