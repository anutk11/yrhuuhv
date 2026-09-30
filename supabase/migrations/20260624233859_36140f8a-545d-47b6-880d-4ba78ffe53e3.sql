
CREATE TABLE public.game_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  room_name text,
  room_code text,
  host_id uuid NOT NULL,
  questions_count integer NOT NULL DEFAULT 0,
  players_count integer NOT NULL DEFAULT 0,
  rankings jsonb NOT NULL DEFAULT '[]'::jsonb,
  finished_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_history TO authenticated;
GRANT ALL ON public.game_history TO service_role;

ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view their own history"
  ON public.game_history FOR SELECT
  TO authenticated
  USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own history"
  ON public.game_history FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id);

CREATE INDEX idx_game_history_host ON public.game_history(host_id, finished_at DESC);
CREATE INDEX idx_game_history_room ON public.game_history(room_id);

-- Trigger function: snapshot final standings when a room flips to "finished"
CREATE OR REPLACE FUNCTION public.snapshot_game_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rankings jsonb;
  _qcount integer;
  _pcount integer;
BEGIN
  IF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN
    SELECT COUNT(*) INTO _qcount FROM public.questions WHERE room_id = NEW.id;

    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t.score) DESC), '[]'::jsonb), COUNT(*)
      INTO _rankings, _pcount
    FROM (
      SELECT rp.user_id, rp.score, p.display_name, p.nickname
      FROM public.room_players rp
      LEFT JOIN public.profiles p ON p.user_id = rp.user_id
      WHERE rp.room_id = NEW.id
    ) t;

    INSERT INTO public.game_history
      (room_id, room_name, room_code, host_id, questions_count, players_count, rankings, finished_at)
    VALUES
      (NEW.id, NEW.name, NEW.room_code, NEW.host_id, _qcount, COALESCE(_pcount, 0), COALESCE(_rankings, '[]'::jsonb), now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_game_history ON public.game_rooms;
CREATE TRIGGER trg_snapshot_game_history
AFTER UPDATE ON public.game_rooms
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_game_history();
