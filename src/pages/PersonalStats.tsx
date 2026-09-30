import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Gamepad2, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PersonalStats = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_personal_game_stats" as any, { _user_id: user.id });
      if (error) toast.error("לא ניתן לטעון את הסטטיסטיקות");
      else setStats(data?.[0] || null);
      setLoading(false);
    })();
  }, [user]);

  const cards = [
    ["משחקים", stats?.games_played ?? 0, Gamepad2],
    ["משחקים שיצרתי", stats?.games_hosted ?? 0, BarChart3],
    ["תשובות נכונות", stats?.total_correct ?? 0, Target],
    ["שיא נקודות", stats?.best_score ?? 0, Trophy],
  ];

  return <div className="min-h-screen gradient-hero p-6" dir="rtl">
    <div className="max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/")}><ArrowLeft className="w-4 h-4" /> חזרה</Button>
      <div className="text-center my-8">
        <h1 className="text-3xl font-display font-black text-foreground">הסטטיסטיקות שלי</h1>
        <p className="text-muted-foreground">סיכום המשחקים שהשתתפת בהם והמשחקים שיצרת</p>
      </div>
      {loading ? <div className="text-center text-muted-foreground">טוען...</div> :
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(([label,value,Icon]: any) => <div key={label} className="gradient-card border border-border rounded-2xl p-5 text-center">
            <Icon className="w-7 h-7 mx-auto mb-3 text-primary" />
            <div className="text-2xl font-display font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>)}
          <div className="gradient-card border border-border rounded-2xl p-5 text-center sm:col-span-2">
            <div className="text-xs text-muted-foreground">ממוצע נקודות למשחק</div>
            <div className="text-2xl font-display font-bold text-foreground mt-2">{Number(stats?.average_score ?? 0).toFixed(1)}</div>
          </div>
          <div className="gradient-card border border-border rounded-2xl p-5 text-center sm:col-span-2">
            <div className="text-xs text-muted-foreground">סה״כ תשובות</div>
            <div className="text-2xl font-display font-bold text-foreground mt-2">{stats?.total_answers ?? 0}</div>
          </div>
        </div>}
    </div>
  </div>;
};
export default PersonalStats;
