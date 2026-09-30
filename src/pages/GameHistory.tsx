import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, ChevronLeft, Trash2, Calendar, Users, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

const GameHistory = () => {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { void load(); }, []);

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
                      <h2 className="text-2xl font-display font-bold">
                        {h.room_name || "משחק"} {h.room_code ? <span className="text-white/40 text-base">#{h.room_code}</span> : null}
                      </h2>
                      <div className="flex gap-4 text-sm text-white/60 mt-1">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(h.finished_at).toLocaleString("he-IL")}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{h.players_count} שחקנים</span>
                        <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" />{h.questions_count} שאלות</span>
                      </div>
                    </div>
                    <button onClick={() => remove(h.id)} className="text-red-400/70 hover:text-red-400 p-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
