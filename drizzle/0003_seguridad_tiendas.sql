-- ===== Restricciones de datos =====
ALTER TABLE public.stores
  ADD CONSTRAINT stores_handle_formato CHECK (
    char_length(handle) BETWEEN 3 AND 30
    AND handle ~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
    AND handle <> ALL (ARRAY['admin','administrador','api','auth','cuenta','diseno','invitacion','soporte','ayuda','tuferia','tuferialive','tuferia.live','oficial','seguidos','compras','puesto','tienda','vivo','envivo'])
  ),
  ADD CONSTRAINT stores_textos CHECK (
    char_length(btrim(name)) BETWEEN 2 AND 60
    AND char_length(category) <= 40 AND char_length(zone) <= 40
    AND char_length(coalesce(description, '')) <= 300
    AND char_length(coalesce(live_schedule_note, '')) <= 80
  ),
  ADD CONSTRAINT stores_paso CHECK (onboarding_step BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE public.invitations ADD CONSTRAINT invitations_textos CHECK (
  char_length(token) >= 32 AND char_length(coalesce(note, '')) <= 80
);
--> statement-breakpoint
ALTER TABLE public.store_private_info ADD CONSTRAINT store_private_info_textos CHECK (
  (payment_alias IS NULL OR payment_alias ~ '^[A-Za-z0-9.-]{6,20}$')
  AND (payment_holder IS NULL OR char_length(btrim(payment_holder)) BETWEEN 3 AND 80)
  AND (pickup_address IS NULL OR char_length(pickup_address) BETWEEN 5 AND 120)
  AND char_length(coalesce(pickup_hours, '')) <= 80
);
--> statement-breakpoint
ALTER TABLE public.store_delivery_options ADD CONSTRAINT store_delivery_options_reglas CHECK (
  char_length(coalesce(note, '')) <= 80
  AND (kind = 'shipping' OR (shipping_mode IS NULL AND shipping_cost_cents IS NULL))
  AND (shipping_mode IS DISTINCT FROM 'fixed' OR shipping_cost_cents > 0)
  AND (shipping_mode = 'fixed' OR shipping_cost_cents IS NULL)
);
--> statement-breakpoint
ALTER TABLE public.products ADD CONSTRAINT products_reglas CHECK (
  char_length(btrim(name)) BETWEEN 2 AND 60
  AND char_length(coalesce(description, '')) <= 200
  AND price_cents > 0 AND price_cents <= 100000000
  AND quantity BETWEEN 0 AND 999
);
--> statement-breakpoint
ALTER TABLE public.product_photos ADD CONSTRAINT product_photos_posicion CHECK (position BETWEEN 0 AND 3);
--> statement-breakpoint

-- ===== Funciones de ayuda (SECURITY DEFINER, search_path vacío) =====
CREATE FUNCTION public.es_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()));
$$;
--> statement-breakpoint
CREATE FUNCTION public.es_duena_de(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = (SELECT auth.uid()));
$$;
--> statement-breakpoint
CREATE FUNCTION public.contar_seguidores(p_store uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.follows WHERE store_id = p_store;
$$;
--> statement-breakpoint
CREATE FUNCTION public.estado_invitacion(p_token text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN i.id IS NULL OR i.revoked_at IS NOT NULL THEN 'invalida'
    WHEN i.used_at IS NOT NULL THEN 'usada'
    WHEN i.expires_at < now() THEN 'vencida'
    ELSE 'valida'
  END
  FROM (SELECT 1) AS uno LEFT JOIN public.invitations i ON i.token = p_token;
$$;
--> statement-breakpoint
CREATE FUNCTION public.canjear_invitacion(
  p_token text, p_handle text, p_name text, p_category text, p_zone text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.invitations%ROWTYPE;
  v_store uuid;
  v_restriccion text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sin_sesion' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_inv FROM public.invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR v_inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invitacion_invalida' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.used_at IS NOT NULL THEN RAISE EXCEPTION 'invitacion_usada' USING ERRCODE = 'P0001'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'invitacion_vencida' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.stores WHERE owner_id = v_uid) THEN
    RAISE EXCEPTION 'ya_tiene_tienda' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    INSERT INTO public.stores (owner_id, handle, name, category, zone, onboarding_step)
    VALUES (v_uid, lower(btrim(p_handle)), btrim(p_name), btrim(p_category), btrim(p_zone), 2)
    RETURNING id INTO v_store;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_restriccion = CONSTRAINT_NAME;
      IF v_restriccion = 'stores_owner_id_unique' THEN
        RAISE EXCEPTION 'ya_tiene_tienda' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'handle_tomado' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'handle_invalido' USING ERRCODE = 'P0001';
  END;
  INSERT INTO public.store_private_info (store_id) VALUES (v_store);
  UPDATE public.invitations SET used_by = v_uid, used_at = now() WHERE id = v_inv.id;
  RETURN v_store;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.controlar_cambio_tienda() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.handle IS DISTINCT FROM OLD.handle THEN
    IF OLD.handle_changed_at IS NOT NULL AND OLD.handle_changed_at > now() - interval '30 days' THEN
      RAISE EXCEPTION 'handle_cambio_reciente' USING ERRCODE = 'P0001';
    END IF;
    NEW.handle_changed_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER al_cambiar_tienda BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.controlar_cambio_tienda();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.es_admin(), public.es_duena_de(uuid), public.contar_seguidores(uuid),
  public.estado_invitacion(text), public.canjear_invitacion(text, text, text, text, text),
  public.controlar_cambio_tienda() FROM PUBLIC;
--> statement-breakpoint
-- es_duena_de se usa en políticas que también evalúan las visitantes (para ellas siempre da falso)
GRANT EXECUTE ON FUNCTION public.contar_seguidores(uuid), public.estado_invitacion(text), public.es_duena_de(uuid)
  TO anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.es_admin(), public.canjear_invitacion(text, text, text, text, text) TO authenticated;
--> statement-breakpoint

-- ===== RLS y permisos por tabla =====
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_private_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_delivery_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.platform_admins, public.invitations, public.stores, public.store_private_info,
  public.store_delivery_options, public.products, public.product_photos, public.follows FROM anon, authenticated;
--> statement-breakpoint
-- service_role (solo servidor y pruebas) necesita permisos explícitos en este proyecto
GRANT ALL ON public.platform_admins, public.invitations, public.stores, public.store_private_info,
  public.store_delivery_options, public.products, public.product_photos, public.follows TO service_role;
--> statement-breakpoint
GRANT SELECT ON public.platform_admins TO authenticated;
CREATE POLICY "Cada admin se ve a sí mismo" ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (revoked_at) ON public.invitations TO authenticated;
CREATE POLICY "Admins leen invitaciones" ON public.invitations FOR SELECT TO authenticated USING ((SELECT public.es_admin()));
CREATE POLICY "Admins crean invitaciones" ON public.invitations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_admin()) AND created_by = (SELECT auth.uid()));
CREATE POLICY "Admins anulan invitaciones" ON public.invitations FOR UPDATE TO authenticated
  USING ((SELECT public.es_admin())) WITH CHECK ((SELECT public.es_admin()));
--> statement-breakpoint
GRANT SELECT ON public.stores TO anon, authenticated;
GRANT UPDATE (handle, name, category, zone, description, live_schedule_note, avatar_path, cover_path, onboarding_step)
  ON public.stores TO authenticated;
CREATE POLICY "Tiendas públicas" ON public.stores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "La dueña edita su tienda" ON public.stores FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.store_private_info TO authenticated;
CREATE POLICY "Solo la dueña ve sus datos privados" ON public.store_private_info FOR SELECT TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "Solo la dueña crea sus datos privados" ON public.store_private_info FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "Solo la dueña edita sus datos privados" ON public.store_private_info FOR UPDATE TO authenticated
  USING ((SELECT public.es_duena_de(store_id))) WITH CHECK ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
GRANT SELECT ON public.store_delivery_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_delivery_options TO authenticated;
CREATE POLICY "Entregas públicas" ON public.store_delivery_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "La dueña crea entregas" ON public.store_delivery_options FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña edita entregas" ON public.store_delivery_options FOR UPDATE TO authenticated
  USING ((SELECT public.es_duena_de(store_id))) WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña borra entregas" ON public.store_delivery_options FOR DELETE TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
CREATE POLICY "Productos visibles para todos" ON public.products FOR SELECT TO anon, authenticated
  USING (visible OR (SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña crea productos" ON public.products FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña edita productos" ON public.products FOR UPDATE TO authenticated
  USING ((SELECT public.es_duena_de(store_id))) WITH CHECK ((SELECT public.es_duena_de(store_id)));
CREATE POLICY "La dueña borra productos" ON public.products FOR DELETE TO authenticated
  USING ((SELECT public.es_duena_de(store_id)));
--> statement-breakpoint
GRANT SELECT ON public.product_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_photos TO authenticated;
CREATE POLICY "Fotos de productos visibles" ON public.product_photos FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));
CREATE POLICY "La dueña agrega fotos" ON public.product_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (SELECT public.es_duena_de(p.store_id))));
CREATE POLICY "La dueña edita fotos" ON public.product_photos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (SELECT public.es_duena_de(p.store_id))));
CREATE POLICY "La dueña borra fotos" ON public.product_photos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (SELECT public.es_duena_de(p.store_id))));
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
CREATE POLICY "Cada persona ve a quién sigue" ON public.follows FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Cada persona sigue por sí misma" ON public.follows FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Cada persona deja de seguir por sí misma" ON public.follows FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint

-- ===== Fotos (Supabase Storage) =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tienda-fotos', 'tienda-fotos', true, 1048576, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE POLICY "La dueña ve los archivos de su tienda" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tienda-fotos' AND (SELECT public.es_duena_de(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "La dueña sube a su carpeta" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tienda-fotos' AND (SELECT public.es_duena_de(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "La dueña borra de su carpeta" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tienda-fotos' AND (SELECT public.es_duena_de(((storage.foldername(name))[1])::uuid)));
