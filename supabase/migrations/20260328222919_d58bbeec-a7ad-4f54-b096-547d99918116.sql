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
  SET current_question_index = _to_index,
      updated_at = now()
  WHERE gr.id = _room_id
    AND gr.status = 'playing'
    AND gr.current_question_index = _from_index;

  GET DIAGNOSTICS _updated_rows = ROW_COUNT;
  RETURN _updated_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_room_question(uuid, integer, integer) TO authenticated;