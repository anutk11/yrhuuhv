
-- Add FK from room_players.user_id to profiles.user_id
ALTER TABLE public.room_players 
ADD CONSTRAINT room_players_user_id_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Add current question index to game_rooms
ALTER TABLE public.game_rooms ADD COLUMN current_question_index integer NOT NULL DEFAULT -1;

-- Create game_answers table
CREATE TABLE public.game_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  selected_index integer NOT NULL,
  answer_time_ms integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, user_id)
);

ALTER TABLE public.game_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can insert own answers"
ON public.game_answers FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Answers viewable by room participants"
ON public.game_answers FOR SELECT TO authenticated
USING (true);

-- Enable realtime for game_answers only (others already added)
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_answers;
