import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, ChevronLeft, Trash2, Calendar, Users, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface HistoryEntry {
  id: string;
  room_id: string;
  room_name: string | null;
  room_code: string | null;
  questions_count: number;
  players_count: number;
  rankings: Array<{ user_id: string; score: number; display_name?: string; nickname?: string }>;
  finished_at: string;
}
interface HistoryQuestion {
  question_id: string;
  sort_order: number;
  question_text: string;
  options: string[];
  correct_index: number | null;
}
interface HistoryAnswer {
  question_id: string;
  user_id: string;
  selected_index: number;
  answer_time_ms: number;
  score: number;
  is_correct: boolean;
}

const GameHistory = () => {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<{ questions: HistoryQuestion[]; answers: HistoryAnswer[] } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("game_history" as any)
      .select("*")
      .order("finished_at", { ascending: false });
    if (error) {
      toast.error("שגיאה בטעינת היסטוריה");
    } else {
      setItems((data as unknown as HistoryEntry[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) void load(); }, [user]);

  const openDetails = async (historyId: string) => {
    if (selected === historyId) { setSelected(null); setDetails(null); return; }
    setSelected(historyId);
    setDetailsLoading(true);
    const [{ data: questionRows }, { data: answerRows }] = await Promise.all([
      supabase.from("game_history_questions" as any).select("question_id, sort_order, question_text, options, correct_index").eq("history_id", historyId).order("sort_order"),
      supabase.from("game_history_answers" as any).select("question_id, user_id, selected_index, answer_time_ms, score, is_correct").eq("history_id", historyId),
    ]);
    const ownAnswers = (answerRows || []).filter((a: any) => isAdmin || a.user_id === user?.id);
    setDetails({
      questions: (questionRows || []) as HistoryQuestion[],
      answers: ownAnswers as HistoryAnswer[],
    });
    setDetailsLoading(false);
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק את הרשומה הזו?")) return;
    const { error } = await supabase.from("game_history" as any).delete().eq("id", id);
    if (error) toast.error("שגיאה במחיקה");
    else {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("נמחק");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05060f] via-[#0a0d24] to-[#100926] text-white p-6" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-display font-black flex items-center gap-3">
            <Trophy className="text-amber-400" /> היסטוריית משחקים
          </h1>
          <Link to="/admin">
            <Button variant="outline" className="gap-2">
              <ChevronLeft className="w-4 h-4" /> חזרה
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="text-center text-white/60 py-16">טוען...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-white/60 py-16 border border-white/10 rounded-2xl bg-white/5">
            אין עדיין משחקים שהסתיימו
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((h) => {
              const sorted = [...(h.rankings || [])].sort((a, b) => b.score - a.score);
              const top = sorted.slice(0, 3);
              return (
                <div key={h.id} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <button onClick={() => void openDetails(h.id)} className="text-2xl font-display font-bold text-right hover:text-cyan-300 transition-colors">
                        {h.room_name || "משחק"} {h.room_code ? <span className="text-white/40 text-base">#{h.room_code}</span> : null}
                      </button>
                      <div className="flex gap-4 text-sm text-white/60 mt-1">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(h.finished_at).toLocaleString("he-IL")}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{h.players_count} שחקנים</span>
                        <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" />{h.questions_count} שאלות</span>
                      </div>
                    </div>
                    {(isAdmin || user?.id === h.rankings?.find((p) => p.user_id === user?.id)?.user_id) && h.id && (
                      <button onClick={() => remove(h.id)} className="text-red-400/70 hover:text-red-400 p-2">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {top.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                      {top.map((p, i) => (
                        <div key={p.user_id} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
                          <span className="text-2xl">{["🥇", "🥈", "🥉"][i]}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-display truncate">
                              {p.nickname || p.display_name || `Player ${p.user_id.slice(-4)}`}
                            </div>
                            <div className="font-mono text-cyan-300 text-lg">{p.score}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selected === h.id && (
                    <div className="mt-5 border-t border-white/10 pt-4">
                      {detailsLoading ? (
                        <div className="text-sm text-white/60">טוען פרטי משחק...</div>
                      ) : !details ? (
                        <div className="text-sm text-white/60">אין נתוני snapshot להצגה.</div>
                      ) : (
                        <div className="space-y-3">
                          <h3 className="font-display font-bold text-cyan-300">השאלות והתשובות שלי במשחק</h3>
                          {details.questions.map((q) => {
                            const a = details.answers.find((answer) => answer.question_id === q.question_id);
                            return (
                              <div key={q.question_id} className="rounded-xl bg-black/20 border border-white/10 p-3">
                                <div className="text-sm font-medium mb-2">{q.sort_order + 1}. {q.question_text}</div>
                                {a ? (
                                  <div className="text-xs text-white/70">
                                    תשובה: <span className={a.is_correct ? "text-emerald-300" : "text-red-300"}>{q.options?.[a.selected_index] ?? "—"}</span>
                                    {" · "}ניקוד: <span className="text-cyan-300">{a.score}</span>
                                    {" · "}זמן: {a.answer_time_ms}ms
                                  </div>
                                ) : (
                                  <div className="text-xs text-white/40">לא נענתה</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GameHistory;
