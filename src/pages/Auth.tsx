import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";

const Auth = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("התחברת בהצלחה!");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName, nickname },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("נרשמת בהצלחה! בדוק את המייל שלך לאימות.");
      }
    } catch (error: any) {
      toast.error(error.message || "שגיאה בהתחברות");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4" dir="rtl">
      <motion.div
        className="w-full max-w-md gradient-card border border-border rounded-2xl p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">
            <span className="gradient-neon-text">TRIVIA</span>
            <span className="text-foreground">LIVE</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            {isLogin ? "התחבר לחשבון שלך" : "צור חשבון חדש"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">שם תצוגה</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="השם שלך"
                  className="bg-secondary border-border"
                  required={!isLogin}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">כינוי</label>
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="ניקנייים"
                  className="bg-secondary border-border"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">אימייל</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="bg-secondary border-border"
              required
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">סיסמה</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-secondary border-border"
              required
              minLength={6}
            />
          </div>
          <Button variant="neon" className="w-full h-12 text-lg" type="submit" disabled={loading}>
            <Zap className="w-5 h-5" />
            {loading ? "..." : isLogin ? "התחבר" : "הירשם"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <span className="relative bg-card px-3 text-xs text-muted-foreground">או</span>
          </div>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            type="button"
            onClick={async () => {
              const { error } = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              if (error) toast.error(error.message || "שגיאה בהתחברות עם Google");
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            התחבר עם Google
          </Button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-primary hover:underline"
          >
            {isLogin ? "אין לך חשבון? הירשם" : "יש לך חשבון? התחבר"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
