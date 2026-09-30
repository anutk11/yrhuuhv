
CREATE OR REPLACE FUNCTION public.rewind_question(_room_id uuid, _question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_id uuid;
  ans RECORD;
BEGIN
  -- Verify caller is host
  SELECT host_id INTO _host_id FROM game_rooms WHERE id = _room_id;
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the host can rewind questions';
  END IF;

  -- Subtract each player's score for this question
  FOR ans IN
    SELECT user_id, score FROM game_answers
    WHERE room_id = _room_id AND question_id = _question_id
  LOOP
    UPDATE room_players
    SET score = GREATEST(0, score - ans.score)
    WHERE room_id = _room_id AND user_id = ans.user_id;
  END LOOP;

  -- Delete answers for this question
  DELETE FROM game_answers
  WHERE room_id = _room_id AND question_id = _question_id;
END;
$$;
