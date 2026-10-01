import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_KEY = __ENV.SUPABASE_PUBLISHABLE_KEY;
const HOST_TOKEN = __ENV.HOST_TOKEN;
const PLAYER_TOKENS = JSON.parse(__ENV.PLAYER_TOKENS_JSON || "[]");

export const options = {
  scenarios: {
    target: { executor: "constant-vus", vus: 9000, duration: "90s", gracefulStop: "10s" },
  },
  thresholds: { http_req_failed: ["rate<0.05"], http_req_duration: ["p(95)<1500"] },
};

function authHeaders(token) {
  return { apikey: SUPABASE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" };
}

function rpc(path, token, body) {
  return http.post(SUPABASE_URL + "/rest/v1/rpc/" + path, JSON.stringify(body), {
    headers: authHeaders(token),
    tags: { endpoint: path },
  });
}

function rest(path, token, method, body) {
  return http.request(method, SUPABASE_URL + "/rest/v1/" + path, body ? JSON.stringify(body) : null, {
    headers: { ...authHeaders(token), Prefer: "return=representation" },
  });
}

export function setup() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !HOST_TOKEN || PLAYER_TOKENS.length < 30) {
    throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, HOST_TOKEN and at least 30 PLAYER_TOKENS_JSON entries.");
  }

  const rooms = [];
  for (let r = 0; r < 300; r++) {
    const created = rpc("create_game_room", HOST_TOKEN, {
      _room_name: "loadtest-" + r,
      _settings: { default_time_limit: 60, result_display_seconds: 5, leaderboard_display_seconds: 5, allow_late_press: true },
    });
    check(created, { "room created": (x) => x.status === 200 });
    if (created.status !== 200) throw new Error("Room creation failed at " + r + ": " + created.status);
    const room = created.json();
    const row = Array.isArray(room) ? room[0] : room;

    const questions = Array.from({ length: 20 }, (_, q) => ({
      room_id: row.id,
      question_text: "Load test question " + (q + 1),
      options: ["א", "ב", "ג", "ד"],
      correct_index: q % 4,
      question_type: "trivia",
      time_limit: 60,
      sort_order: q,
      media_url: null,
      media_type: null,
      image_view_time: 5,
      keep_image: false,
    }));
    const inserted = rest("questions", HOST_TOKEN, "POST", questions);
    check(inserted, { "20 questions inserted": (x) => x.status >= 200 && x.status < 300 });
    if (inserted.status < 200 || inserted.status >= 300) throw new Error("Question insert failed at " + r + ": " + inserted.status);

    const start = rpc("host_start_game", HOST_TOKEN, { _room_id: row.id });
    check(start, { "room started": (x) => x.status === 200 });
    rooms.push({ id: row.id, code: row.room_code });
  }
  return { rooms };
}

export default function (data) {
  const roomIndex = Math.floor((__VU - 1) / 30);
  const playerIndex = (__VU - 1) % 30;
  const room = data.rooms[roomIndex];
  const token = PLAYER_TOKENS[playerIndex];
  if (!room || !token) return;

  const joined = rpc("join_room", token, { _room_code: room.code });
  check(joined, { "join_room ok": (x) => x.status === 200 });

  const wsUrl = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(SUPABASE_KEY) + "&vsn=1.0.0";
  const socket = ws.connect(wsUrl, {}, function (socket) {
    socket.send(JSON.stringify({
      topic: "realtime:room:" + room.id,
      event: "phx_join",
      payload: { config: { private: true, broadcast: { ack: false, self: false }, presence: { key: "" } }, access_token: token },
      ref: "1",
    }));
    socket.on("message", function () {});
    sleep(4);

    // Fetch the current question id, then submit through the authenticated edge function.
    const qs = http.get(SUPABASE_URL + "/rest/v1/questions?room_id=eq." + room.id + "&select=id,sort_order&order=sort_order.asc&limit=1", {
      headers: authHeaders(token),
      tags: { endpoint: "current-question" },
    });
    const qrows = qs.json();
    const qid = Array.isArray(qrows) && qrows[0] ? qrows[0].id : null;
    if (qid) {
      const answer = http.post(SUPABASE_URL + "/functions/v1/submit-answer", JSON.stringify({ room_id: room.id, question_id: qid, selected_index: playerIndex % 4 }), {
        headers: authHeaders(token),
        tags: { endpoint: "submit-answer" },
      });
      check(answer, { "answer endpoint reachable": (x) => [200, 400, 409].includes(x.status) });
    }
    sleep(1);
    socket.close();
  });
  check(socket, { "realtime connected": (x) => x && x.status === 101 });
}

export function teardown(data) {
  if (__ENV.KEEP_ROOMS === "1" || !data?.rooms) return;
  for (const room of data.rooms) rest("game_rooms?id=eq." + room.id, HOST_TOKEN, "DELETE");
}