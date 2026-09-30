CREATE OR REPLACE FUNCTION public.advance_room_question(
  _room_id uuid,
  _from_index integer,
  _to_index integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _updated_rows integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.id = _room_id
      AND gr.host_id = _uid
  ) THEN
    RAISE EXCEPTION 'Only the host can advance questions';
  END IF;

  UPDATE public.game_rooms gr
  SET current_question_index = _to_index,
      updated_at = now()
  WHERE gr.id = _room_id
    AND gr.status = 'playing'
    AND gr.current_question_index = _from_index;

  GET DIAGNOSTICS _updated_rows = ROW_COUNT;
  RETURN _updated_rows > 0;
END;
$$;

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
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _updated_rows integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.id = _room_id
      AND gr.host_id = _uid
  ) THEN
    RAISE EXCEPTION 'Only the host can change the game phase';
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
    AND gr.current_phase = _expected_phase
    AND gr.status = 'playing';

  GET DIAGNOSTICS _updated_rows = ROW_COUNT;
  RETURN _updated_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_room_question(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_room_phase(uuid, integer, text, text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_room_question(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_room_phase(uuid, integer, text, text, integer, integer, text) TO authenticated, service_role;