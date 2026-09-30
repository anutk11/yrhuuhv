
CREATE TABLE public.player_roster (
  phone_number text PRIMARY KEY,
  player_name text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_roster TO authenticated;
GRANT ALL ON public.player_roster TO service_role;

ALTER TABLE public.player_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view roster"
  ON public.player_roster FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert roster"
  ON public.player_roster FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roster"
  ON public.player_roster FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roster"
  ON public.player_roster FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_player_roster_updated_at
  BEFORE UPDATE ON public.player_roster
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
