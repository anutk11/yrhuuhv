import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Zap, Users, BarChart3, Trophy, LogOut, BookOpen, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

const Landing = () => {
  const navigate = useNavigate();
  const { user, isAdmin, profile, signOut } = useAuth();

  return (
    <div className="min-h-screen gradient-hero flex flex-col relative" dir="rtl">
      <div className="absolute top-2 left-2 z-50">
        <ThemeToggle />
      </div>
      {/* Top bar */}
      {user && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-display text-sm">
              {(profile?.nickname || profile?.display_name || "?")[0]}
            </div>
            <span className="text-sm text-foreground">{profile?.nickname || profile?.display_name}</span>
            {isAdmin && (
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-display">
                מנהל
              </span>
            )}
          </div>
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-7xl font-display font-bold mb-4 tracking-tight">
            <span className="gradient-neon-text">TRIVIA</span>
            <span className="text-foreground">LIVE</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-md mx-auto mb-10">
            טריוויה וסקרים אינטראקטיביים בזמן אמת. צור משחק, הזמן חברים, ותתחיל לשחק!
          </p>
        </motion.div>

        <motion.div
          className="flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {user ? (
            <>
              {isAdmin && (
                <Button variant="neon-outline" size="lg" className="text-lg px-8 py-6" onClick={() => navigate("/admin")}>
                  <Users className="w-5 h-5" />
                  צור משחק חדש
                </Button>
              )}
              <Button variant="neon" size="lg" className="text-lg px-8 py-6" onClick={() => navigate("/join")}>
                <Zap className="w-5 h-5" />
                הצטרף למשחק
              </Button>
              <div className="flex gap-3 w-full sm:w-auto flex-wrap">
                <Button variant="secondary" size="lg" className="flex-1 sm:flex-initial text-base px-6 py-5" onClick={() => navigate("/bank")}>
                  <BookOpen className="w-5 h-5" />
                  מאגר שאלות
                </Button>
                <Button variant="secondary" size="lg" className="flex-1 sm:flex-initial text-base px-6 py-5" onClick={() => navigate("/history")}>
                  <BarChart3 className="w-5 h-5" />
                  היסטוריית משחקים
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="neon" size="lg" className="text-lg px-8 py-6" onClick={() => navigate("/auth")}>
                <Zap className="w-5 h-5" />
                התחבר / הירשם
              </Button>
            </>
          )}
        </motion.div>
      </div>

      {/* Features */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto px-4 pb-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
      >
        {[
          { icon: Zap, title: "בזמן אמת", desc: "סנכרון מיידי בין כל המשתתפים" },
          { icon: BarChart3, title: "סקרים חיים", desc: "צפה בתוצאות מתעדכנות בשידור חי" },
          { icon: Trophy, title: "ניקוד חכם", desc: "מהירות + נכונות = הניקוד הגבוה ביותר" },
        ].map((f, i) => (
          <div key={i} className="gradient-card rounded-lg border border-border p-6 text-center">
            <f.icon className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-display text-sm font-semibold mb-1 text-foreground">{f.title}</h3>
            <p className="text-muted-foreground text-sm">{f.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default Landing;
