ALTER FUNCTION public.advance_room_question(uuid, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.sync_room_phase(uuid, integer, text, text, integer, integer, text) SECURITY INVOKER;