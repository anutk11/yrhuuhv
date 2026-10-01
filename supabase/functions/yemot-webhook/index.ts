// Yemot phone webhook — unified single-endpoint flow ("No Routing" architecture)
// IMPORTANT: All Supabase clients and per-request state MUST be created inside
// Deno.serve to prevent variable leakage between concurrent invocations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Login responses
const LOGIN_ASK_CODE = "read=f-100=val,no,5,5,10,no,no";
const LOGIN_INVALID = "read=f-101=val,no,5,5,10,no,no";

// Yemot's confirmation switch is the 15th `read` value, not one of the
// trailing values commonly used in the short form. Keep all positions
// explicit so a one-digit answer is submitted immediately, without M1353
// ("press 1 to confirm"). Position 10 limits valid keys to 1-4.
function singleDigitRead(file: string, param: string, timeoutSeconds: number): string {
  const values = [
    param, "no", "1", "1", String(timeoutSeconds), "No",
    "", "", "", "1234", "1", "Ok", "", "", "no",
  ];
  return `read=${file}=${values.join(",")}`;
}

function loginSuccessResponse(param: string): string {
  return singleDigitRead("f-102", param, 60);
}

// Game responses
const GAME_FINISHED = "id_list_message=f-999&go_to_folder=hangup";
const GAME_ERROR = "id_list_message=f-999&go_to_folder=hangup";
// Safe reject for unauthenticated callers
const UNAUTHORIZED = "id_list_message=f-999&go_to_folder=hangup";

// Generates a fresh, one-time variable name for each `read` we issue.
// Yemot keeps previously-filled variables in memory, so reusing a name causes
// stale values to be resent. A unique token per read makes every keypress
// unambiguous.
function newAnswerParam(questionIndex: number): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `a${Math.max(0, questionIndex)}x${rand}`;
}

// Short read windows keep the one-time token fresh: the phone re-polls every
// few seconds, so the token it holds almost always belongs to the question
// currently on screen (prevents "press twice" when questions advance).
function gameWaitingResponse(param: string): string {
  return singleDigitRead("f-200", param, 60);
}

function gamePlayingResponse(param: string): string {
  return singleDigitRead("f-200", param, 60);
}

function answerReceivedResponse(param: string): string {
  return singleDigitRead("f-201", param, 60);
}


async function rememberPendingParam(
  supabase: any,
  reqId: string,
  roomId: string,
  userId: string,
  questionIndex: number,
): Promise<string> {
  const nextParam = newAnswerParam(questionIndex);
  const { error } = await supabase
    .from("phone_call_state")
    .upsert(
      { room_id: roomId, user_id: userId, pending_param: nextParam, issued_at: new Date().toISOString() },
      { onConflict: "room_id,user_id" },
    );
  if (error) console.error(`[${reqId}] pending_param upsert failed:`, error);
  return nextParam;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = aa.length ^ bb.length;
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function phoneToUserId(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-12).padStart(12, "0");
  return `00000000-0000-0000-0000-${digits}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? "••••" + digits.slice(-4) : "••••";
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Per-request request id for correlatable logs
  const reqId = crypto.randomUUID().slice(0, 8);

  // PER-REQUEST Supabase client (no shared global state)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`[${reqId}] missing backend environment variables`);
    return textResponse(LOGIN_ASK_CODE);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Shared-secret authentication ----
  // Prefer the x-yemot-token header. Query-string fallback is kept only for
  // Yemot deployments that cannot send custom headers. Never log either token.
  const expectedToken = Deno.env.get("YEMOT_WEBHOOK_TOKEN");
  try {
    const authUrl = new URL(req.url);
    const providedToken =
      req.headers.get("x-yemot-token") ??
      authUrl.searchParams.get("token") ??
      "";

    if (!expectedToken || !constantTimeEqual(providedToken, expectedToken)) {
      console.error(`[${reqId}] unauthorized webhook call`);
      return textResponse(UNAUTHORIZED, 401);
    }
  } catch {
    return textResponse(UNAUTHORIZED, 401);
  }

  try {
    const url = new URL(req.url);
    const apiPhone = url.searchParams.get("ApiPhone");
    const val = url.searchParams.get("val");

    if (!apiPhone) return textResponse(GAME_ERROR);

    if (!/^\d{9,15}$/.test(apiPhone.replace(/\D/g, ""))) {
      console.warn(`[${reqId}] invalid phone format`);
      return textResponse(GAME_ERROR);
    }

    const digitsPhone = apiPhone.replace(/\D/g, "");
    const userId = phoneToUserId(digitsPhone);

    // One DB round-trip for active-room polling.
    const { data: pollData, error: pollError } = await supabase.rpc("phone_poll_state", {
      _user_id: userId,
    });
    const poll = Array.isArray(pollData) ? pollData[0] : pollData;
    if (pollError) console.error(`[${reqId}] phone poll failed`);

    const room = poll?.room_id ? {
      id: poll.room_id,
      status: poll.status,
      current_question_index: poll.current_question_index ?? -1,
      current_phase: poll.current_phase ?? "",
      phase_started_at: poll.phase_started_at,
      phase_ends_at: poll.phase_ends_at,
      phase_duration_seconds: poll.phase_duration_seconds ?? 0,
      _player_score: poll.player_score ?? 0,
      _pending_param: poll.pending_param ?? null,
      _answered_current: Boolean(poll.answered_current),
    } : null;
    // ===== GAME FLOW =====
    if (room?.id) {
      if (room?.status === "finished") return textResponse(GAME_FINISHED);

      const roomId: string = room.id;
      const currentIdx: number = room.current_question_index ?? -1;

      // Issue a brand-new read variable on EVERY response, and remember it.
      // The next request is then read from exactly the variable we handed out,
      // so a keypress made a moment before a question change is still accepted
      // (no double press) and stale retained values are never re-consumed.
      const issueNextParam = async (): Promise<string> =>
        rememberPendingParam(supabase, reqId, roomId, userId, currentIdx);

      // Reconnection only updates presence; score remains server-owned.
      await supabase
        .from("room_players")
        .update({ is_connected: true, last_seen: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", userId);

      if (room.status === "waiting") {
        return textResponse(gameWaitingResponse(await issueNextParam()));
      }

      // A returning caller (fresh call, no answer tokens in the URL): if they
      // already answered the active question, tell them it was received and
      // let them wait; otherwise hand out a fresh keypad read immediately.
      const hasAnyAnswerToken = Array.from(url.searchParams.keys()).some((k) => /^a\d+x/i.test(k));
      if (!hasAnyAnswerToken && !url.searchParams.get("idle") && currentIdx >= 0) {
        const { data: curQ } = await supabase
          .from("questions").select("id")
          .eq("room_id", roomId).eq("sort_order", currentIdx).maybeSingle();
        if (curQ?.id) {
          const { data: already } = await supabase
            .from("game_answers").select("id")
            .eq("room_id", roomId).eq("question_id", curQ.id).eq("user_id", userId).maybeSingle();
          console.log(`[${reqId}] reconnect qIdx=${currentIdx} answered=${!!already} phase=${room.current_phase}`);
          if (already) return textResponse(answerReceivedResponse(await issueNextParam()));
        }
        return textResponse(gamePlayingResponse(await issueNextParam()));
      }

      // playing — read the value from the variable we issued last time
      const { data: callState } = await supabase
        .from("phone_call_state")
        .select("pending_param")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle();

      const expectedParam: string | null = callState?.pending_param ?? room._pending_param ?? null;

      // Yemot may submit a keypress from the immediately preceding `read`
      // after a timeout/re-poll has already replaced pending_param in the DB.
      // Read the actual one-time answer variable carried by this request rather
      // than requiring it to equal the latest stored token. The token itself
      // encodes its question index and duplicate answers remain DB-protected.
      // Yemot RETAINS every previously-filled variable, so a request can carry
      // a0x..., a1x..., a2x... all at once. Never take the first match (that is
      // always question 1's stale value) — prefer the token we issued last, and
      // otherwise the token with the HIGHEST question index.
      const answerEntries = Array.from(url.searchParams.entries())
        .filter(([key, value]) => /^a\d+x[a-z0-9]+$/i.test(key) && /^[1-4]$/.test(value))
        .map(([key, value]) => ({
          key,
          value,
          idx: parseInt(key.match(/^a(\d+)x/i)?.[1] ?? "-1", 10),
        }))
        .sort((a, b) => b.idx - a.idx);

      const submittedAnswerEntry =
        (expectedParam ? answerEntries.find((e) => e.key === expectedParam) : null) ??
        answerEntries[0] ??
        null;
      const submittedParam = submittedAnswerEntry?.key ?? null;
      const expectedAnswerValue = submittedAnswerEntry?.value ?? null;
      const idleAnswerValue = currentIdx === 0 ? url.searchParams.get("idle") : null;
      const answerValue = expectedAnswerValue || idleAnswerValue;


      if (!answerValue || !/^[1-4]$/.test(answerValue)) {
        console.log(`[${reqId}] no valid answer param qIdx=${currentIdx}`);
        return textResponse(gamePlayingResponse(await issueNextParam()));
      }

      // The one-time param encodes the question index it was issued for.
      // Presses for the current question are accepted during reading/answering.
      // A press carrying the PREVIOUS question's token is a "late" press that
      // was physically made while that question was on screen (the room simply
      // advanced in the meantime) — we still record it for that question so the
      // player never has to press twice.
      const phaseNow: string = room.current_phase ?? "";
      const curIdx = Math.max(0, currentIdx);
      const answerParam = submittedParam ?? expectedParam;
      const paramIdxMatch = answerParam?.match(/^a(\d+)x/);
      const paramIdx = paramIdxMatch ? parseInt(paramIdxMatch[1], 10) : (idleAnswerValue ? 0 : -1);
      const acceptablePhase = phaseNow === "answering" || phaseNow === "reading";

      // Any token issued for the current question or for an EARLIER one is a
      // valid press: extra phases (leaderboard/stats) make the phone's token
      // lag by more than one question, which previously dropped the press
      // entirely from question 3 onwards.
      if (paramIdx < 0 || paramIdx > curIdx) {
        console.log(`[${reqId}] press ignored phase=${phaseNow} paramIdx=${paramIdx} curIdx=${currentIdx}`);
        return textResponse(gamePlayingResponse(await issueNextParam()));
      }

      // Candidate questions this press may belong to: the question the token
      // was issued for first, then the current question (the phone may simply
      // still hold an old token). Falling back keeps single-keypress behavior.
      const candidates: number[] = [];
      if (paramIdx !== curIdx) candidates.push(paramIdx);
      if (acceptablePhase || paramIdx === curIdx) candidates.push(curIdx);

      // ---- Save answer with strictly local scope ----
      const selectedIndex: number = parseInt(answerValue, 10) - 1;

      let targetIdx = -1;
      let questionRow: any = null;

      for (const cand of candidates) {
        const { data: qRow, error: qErr } = await supabase
          .from("questions")
          .select("id, correct_index, time_limit, question_type")
          .eq("room_id", roomId)
          .eq("sort_order", cand)
          .maybeSingle();
        if (qErr) {
          console.error(`[${reqId}] question fetch error:`, qErr);
          return textResponse(gamePlayingResponse(await issueNextParam()));
        }
        if (!qRow) continue;

        const { data: existingAns } = await supabase
          .from("game_answers")
          .select("id")
          .eq("room_id", roomId)
          .eq("question_id", qRow.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (existingAns) {
          console.log(`[${reqId}] already answered qIdx=${cand}, trying next candidate`);
          continue;
        }

        targetIdx = cand;
        questionRow = qRow;
        break;
      }

      if (!questionRow) {
        console.log(`[${reqId}] no open question for press, candidates=${candidates.join(",")}`);
        return textResponse(answerReceivedResponse(await issueNextParam()));
      }

      const isCurrentTarget = targetIdx === curIdx;

      console.log(`[${reqId}] answer start user=${userId} room=${roomId} qIdx=${targetIdx} late=${!isCurrentTarget} param=${answerParam} sel=${selectedIndex} phase=${phaseNow}`);

      const isCurrentTarget = targetIdx === curIdx;

      console.log(
        `[${reqId}] answer accepted qIdx=${targetIdx} late=${!isCurrentTarget} sel=${selectedIndex} phase=${phaseNow}`,
      );

      const { data: recorded, error: recordErr } = await supabase.rpc("record_game_answer", {
        _room_id: roomId,
        _question_id: questionRow.id,
        _user_id: userId,
        _selected_index: selectedIndex,
        _allow_late: !isCurrentTarget,
      });

      if (recordErr || !recorded) {
        console.error(`[${reqId}] record_game_answer failed:`, recordErr);
        return textResponse(gamePlayingResponse(await issueNextParam()));
      }

      const row = Array.isArray(recorded) ? recorded[0] : recorded;
      console.log(
        `[${reqId}] recorded qIdx=${targetIdx} score=${Number(row?.score ?? 0)} correct=${Boolean(row?.is_correct)}`,
      );

      return textResponse(answerReceivedResponse(await issueNextParam()));
    }

    // ===== LOGIN FLOW =====
    if (!val) return textResponse(LOGIN_ASK_CODE);
    if (!/^\d{5,6}$/.test(val)) {
      await supabase.rpc("allow_phone_login_attempt", { _phone: digitsPhone });
      return textResponse(LOGIN_INVALID);
    }

    try {
      const { data: targetRoom, error: roomErr } = await supabase
        .from("game_rooms")
        .select("id, status")
        .eq("room_code", val)
        .in("status", ["waiting", "playing", "paused"])
        .maybeSingle();
      if (roomErr || !targetRoom?.id) {
        const { data: allowed } = await supabase.rpc("allow_phone_login_attempt", { _phone: digitsPhone });
        if (allowed === false) return textResponse(UNAUTHORIZED, 429);
        return textResponse(LOGIN_INVALID);
      }

      const { data: existing } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", targetRoom.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) {
        const { error: insErr } = await supabase.from("room_players").insert({
          room_id: targetRoom.id,
          user_id: userId,
          is_connected: true,
          score: 0,
        });
        if (insErr) {
          console.error(`[${reqId}] insert player failed`);
          return textResponse(LOGIN_INVALID);
        }
      } else {
        await supabase
          .from("room_players")
          .update({ is_connected: true, last_seen: new Date().toISOString() })
          .eq("room_id", targetRoom.id)
          .eq("user_id", userId);
      }

      const loginParam = await rememberPendingParam(supabase, reqId, targetRoom.id, userId, 0);
      return textResponse(loginSuccessResponse(loginParam));
    } catch (loginErr) {
      console.error(`[${reqId}] login flow threw, re-asking for code:`, loginErr);
      return textResponse(LOGIN_ASK_CODE);
    }
  } catch (err) {
    console.error(`[${reqId}] yemot-webhook error:`, err);
    return textResponse(LOGIN_ASK_CODE);
  }
});
