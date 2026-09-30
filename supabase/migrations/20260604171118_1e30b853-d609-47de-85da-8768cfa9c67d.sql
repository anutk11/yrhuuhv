ALTER TABLE public.game_rooms DROP CONSTRAINT IF EXISTS game_rooms_status_check;
ALTER TABLE public.game_rooms
ADD CONSTRAINT game_rooms_status_check
CHECK (status = ANY (ARRAY['waiting'::text, 'playing'::text, 'paused'::text, 'finished'::text]));