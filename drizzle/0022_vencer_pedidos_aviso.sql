-- vencer_pedidos deja registrado por qué un pedido venció sin pasar la prenda a la siguiente
-- (antes el primer error se descartaba y la compradora de la lista quedaba salteada sin aviso).
CREATE OR REPLACE FUNCTION public.vencer_pedidos() RETURNS integer
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
      RAISE WARNING 'vencer_pedidos: pedido % vencido sin pasar a la siguiente: %', v_id, SQLERRM;
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
REVOKE EXECUTE ON FUNCTION public.vencer_pedidos() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.vencer_pedidos() TO service_role;
