
-- Add unique constraint for upsert support on room_players
ALTER TABLE public.room_players ADD CONSTRAINT room_players_room_user_unique UNIQUE (room_id, user_id);
