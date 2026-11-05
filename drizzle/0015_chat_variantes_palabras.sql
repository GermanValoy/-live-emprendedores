-- Variantes que pidió el dueño (2026-11-05): el moderador busca palabras enteras, así que cada forma va aparte.
INSERT INTO public.chat_blocked_words (word) VALUES
  ('culiau'), ('culiaos'), ('culiaus'), ('culiados'), ('culiadas'),
  ('cajetas'),
  ('chota'), ('chotos'), ('chotas')
ON CONFLICT DO NOTHING;