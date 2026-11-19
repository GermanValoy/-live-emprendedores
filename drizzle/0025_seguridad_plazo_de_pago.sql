-- La dueña elige cuánto tiempo tiene quien gana para pagar (la política "La dueña edita su tienda" ya limita a su fila;
-- el CHECK stores_plazo_pago acota el valor entre 5 y 1440 minutos).
GRANT UPDATE (payment_minutes) ON public.stores TO authenticated;
