CREATE TABLE public.phone_call_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pending_param text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

GRANT ALL ON public.phone_call_state TO service_role;

ALTER TABLE public.phone_call_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages phone call state"
ON public.phone_call_state FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_phone_call_state_updated_at
BEFORE UPDATE ON public.phone_call_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();