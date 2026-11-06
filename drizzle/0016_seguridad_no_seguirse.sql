-- La dueña no puede seguir su propio puesto (antes la pantalla ofrecía el botón y la base lo dejaba).
DELETE FROM public.follows f USING public.stores s WHERE s.id = f.store_id AND s.owner_id = f.user_id;
--> statement-breakpoint
DROP POLICY "Cada persona sigue por sí misma" ON public.follows;
--> statement-breakpoint
CREATE POLICY "Cada persona sigue por sí misma, pero no a su puesto" ON public.follows FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = (SELECT auth.uid()))
);