// Authentication is checked here; game mutation/scoring is atomic in the
// service-role-only record_game_answer RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);

    const { room_id, question_id, selected_index } = body as {
      room_id?: unknown;
      question_id?: unknown;
      selected_index?: unknown;
    };

    if (
      typeof room_id !== "string" ||
      typeof question_id !== "string" ||
      !Number.isInteger(selected_index) ||
      selected_index < 0 ||
      selected_index > 3
    ) {
      return json({ error: "Invalid params" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await adminClient.rpc("record_game_answer", {
      _room_id: room_id,
      _question_id: question_id,
      _user_id: userData.user.id,
      _selected_index: selected_index,
      _allow_late: false,
    });

    if (error) {
      const message = error.message || "Answer rejected";
      const status =
        /not in room|authentication/i.test(message) ? 403 :
        /phase closed|question not active|invalid question|invalid answer|future question/i.test(message) ? 409 :
        400;
      return json({ error: message }, status);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) return json({ error: "Answer rejected" }, 409);

    return json({
      ok: true,
      score: Number(row.score ?? 0),
      is_correct: Boolean(row.is_correct),
      duplicate: Boolean(row.duplicate),
      answer_time_ms: Number(row.answer_time_ms ?? 0),
    });
  } catch (err) {
    console.error("submit-answer error:", err);
    return json({ error: "Server error" }, 500);
  }
});
