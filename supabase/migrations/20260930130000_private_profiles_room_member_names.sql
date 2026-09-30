-- Tighten account privacy while keeping room member names visible only inside their rooms.
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
);

DROP VIEW IF EXISTS public.room_player_profiles;
CREATE VIEW public.room_player_profiles
WITH (security_invoker = off) AS
SELECT
  rp.room_id,
  rp.user_id,
  COALESCE(p.display_name, '') AS display_name,
  COALESCE(p.nickname, '') AS nickname,
  p.avatar_url
FROM public.room_players rp
LEFT JOIN public.profiles p ON p.user_id = rp.user_id
WHERE public.is_room_member(rp.room_id, auth.uid());

REVOKE ALL ON public.room_player_profiles FROM anon;
GRANT SELECT ON public.room_player_profiles TO authenticated, service_role;
