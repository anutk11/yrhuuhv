import { useState } from "react";
import { motion } from "framer-motion";
import { Home, ArrowLeftRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const RoomClosedOverlay = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const handleJoinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    const { data: room } = await supabase
      .from("game_rooms")
      .select("id, status")
      .eq("room_code", code)
      .in("status", ["waiting", "playing"])
      .single();

    if (!room) {
      toast.error("חדר לא נמצא או שהוא כבר לא פעיל");
      setJoining(false);
      return;
    }

    navigate(`/lobby/${code}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center px-4"
      dir="rtl"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="gradient-card border border-border rounded-2xl p-8 max-w-sm w-full text-center space-y-6"
      >
        <div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">
            החדר נסגר
          </h2>
          <p className="text-muted-foreground text-sm">
            המנחה סגר את החדר הזה
          </p>
        </div>

        <div className="space-y-3">
          <Button variant="neon" className="w-full" onClick={() => navigate("/")}>
            <Home className="w-4 h-4" />
            חזרה למסך הבית
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">או הצטרף לחדר אחר</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="קוד חדר"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="bg-secondary border-border text-center font-display tracking-widest"
              maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
            />
            <Button
              variant="neon-outline"
              onClick={handleJoinRoom}
              disabled={!joinCode.trim() || joining}
            >
              <ArrowLeftRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RoomClosedOverlay;
