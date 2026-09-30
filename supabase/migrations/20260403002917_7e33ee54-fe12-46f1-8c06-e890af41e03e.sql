ALTER TABLE public.game_rooms
ADD COLUMN IF NOT EXISTS current_phase text NOT NULL DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS phase_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS phase_duration_seconds integer NOT NULL DEFAULT 0;

UPDATE public.game_rooms
SET current_phase = COALESCE(current_phase, CASE WHEN status = 'waiting' THEN 'idle' ELSE 'reading' END),
    phase_duration_seconds = COALESCE(phase_duration_seconds, 0),
    phase_started_at = COALESCE(phase_started_at, CASE WHEN current_question_index >= 0 THEN now() ELSE NULL END);

CREATE OR REPLACE FUNCTION public.sync_room_phase(
  _room_id uuid,
  _expected_question_index integer,
  _expected_phase text,
  _next_phase text,
  _phase_duration_seconds integer,
  _next_question_index integer DEFAULT NULL,
  _next_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _updated_rows integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.game_rooms gr
      WHERE gr.id = _room_id
        AND gr.host_id = _uid
    )
    OR EXISTS (
      SELECT 1
      FROM public.room_players rp
      WHERE rp.room_id = _room_id
        AND rp.user_id = _uid
    )
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.game_rooms gr
  SET current_phase = _next_phase,
      phase_duration_seconds = GREATEST(_phase_duration_seconds, 0),
      phase_started_at = now(),
      current_question_index = COALESCE(_next_question_index, gr.current_question_index),
      status = COALESCE(_next_status, gr.status),
      updated_at = now()
  WHERE gr.id = _room_id
    AND gr.current_question_index = _expected_question_index
    AND gr.current_phase = _expected_phase;

  GET DIAGNOSTICS _updated_rows = ROW_COUNT;
  RETURN _updated_rows > 0;
END;
$$;