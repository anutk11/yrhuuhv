
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
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _updated_rows integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.game_rooms gr
      WHERE gr.id = _room_id AND gr.host_id = _uid
    )
    OR EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = _room_id AND rp.user_id = _uid
    )
  ) THEN
    RETURN false;
  END IF;

  -- Only transition if room is actively playing (not paused or finished)
  UPDATE public.game_rooms gr
  SET current_phase = _next_phase,
      phase_duration_seconds = GREATEST(_phase_duration_seconds, 0),
      phase_started_at = now(),
      current_question_index = COALESCE(_next_question_index, gr.current_question_index),
      status = COALESCE(_next_status, gr.status),
      updated_at = now()
  WHERE gr.id = _room_id
    AND gr.current_question_index = _expected_question_index
    AND gr.current_phase = _expected_phase
    AND gr.status = 'playing';

  GET DIAGNOSTICS _updated_rows = ROW_COUNT;
  RETURN _updated_rows > 0;
END;
$function$;
