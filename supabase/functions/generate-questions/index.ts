// Admin-only AI trivia question generator (Lovable AI Gateway, Responses API, streamed).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  topic: z.string().trim().min(2).max(4000),
  count: z.number().int().min(1).max(15),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

const QuestionSchema = z.object({
  question_text: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correct_index: z.number().int().min(0).max(3),
});

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question_text", "options", "correct_index"],
        properties: {
          question_text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Admins only" }, 403);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, 400);
  const { topic, count, difficulty } = parsed.data;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI is not configured" }, 500);

  const difficultyHe = { easy: "קלה", medium: "בינונית", hard: "קשה" }[difficulty];
  const prompt =
    `צור בדיוק ${count} שאלות טריוויה בעברית ברמת קושי ${difficultyHe} על הנושא או הטקסט הבא.\n` +
    `לכל שאלה 4 תשובות קצרות (עד 6 מילים), תשובה נכונה אחת בלבד, correct_index בין 0 ל-3, ופזר את מיקום התשובה הנכונה.\n` +
    `שאלות קצרות וברורות שמתאימות להקראה במסך גדול. החזר JSON לפי הסכמה.\n\nנושא/טקסט:\n${topic}`;

  let upstream: Response;
  try {
    upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [{ role: "user", content: prompt }],
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "trivia_questions", strict: true, schema: outputSchema } },
      }),
    });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("gateway fetch failed", e);
    return json({ error: "AI service unreachable" }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.error("gateway error", upstream.status, text);
    let message = "שגיאה ביצירת השאלות";
    try { message = JSON.parse(text)?.error?.message || JSON.parse(text)?.message || message; } catch { /* ignore */ }
    if (upstream.status === 429) message = "יותר מדי בקשות, נסו שוב בעוד רגע";
    if (upstream.status === 402) message = "נגמרו קרדיטי ה-AI בסביבת העבודה";
    return json({ error: message }, upstream.status);
  }

  // Consume SSE and accumulate output text
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let streamError: string | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "response.output_text.delta") output += evt.delta ?? "";
        else if (evt.type === "error" || evt.type === "response.failed") {
          streamError = evt.error?.message || evt.response?.error?.message || "AI error";
        }
      } catch { /* ignore partial */ }
    }
  }

  if (streamError) return json({ error: streamError }, 502);
  if (!output.trim()) return json({ error: "ה-AI לא החזיר שאלות" }, 502);

  let raw: any;
  try { raw = JSON.parse(output); } catch { return json({ error: "תשובת AI לא תקינה" }, 502); }
  const questions = (Array.isArray(raw?.questions) ? raw.questions : [])
    .map((q: unknown) => QuestionSchema.safeParse(q))
    .filter((r: any) => r.success)
    .map((r: any) => r.data);

  if (questions.length === 0) return json({ error: "לא נוצרו שאלות תקינות" }, 502);
  return json({ questions });
});
