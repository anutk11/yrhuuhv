-- Regular hosts can manage invitations for their own rooms.
DROP POLICY IF EXISTS "Admins can create invitations" ON public.room_invitations;
CREATE POLICY "Hosts can create invitations"
ON public.room_invitations FOR INSERT TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.id = room_id
      AND gr.host_id = auth.uid()
      AND gr.status IN ('waiting','playing','paused')
  )
);

DROP POLICY IF EXISTS "Invitations viewable by inviter" ON public.room_invitations;
CREATE POLICY "Invitations viewable by inviter"
ON public.room_invitations FOR SELECT TO authenticated
USING (
  invited_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);
