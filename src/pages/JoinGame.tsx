import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";

const JoinGame = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledCode = searchParams.get("code") || "";
  const [roomCode, setRoomCode] = useState(prefilledCode);

  const handleJoin = () => {
    if (roomCode.trim()) {
      navigate(`/lobby/${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4" dir="rtl">
      <motion.div
        className="w-full max-w-md gradient-card border border-border rounded-2xl p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <button
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground mb-6 flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          חזרה
        </button>

        <h1 className="text-3xl font-display font-bold text-glow mb-2 text-primary">
          הצטרף למשחק
        </h1>
        <p className="text-muted-foreground mb-8">הכנס את קוד החדר</p>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">קוד חדר</label>
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="12345"
              className="text-center text-2xl font-display tracking-[0.3em] h-14 bg-secondary border-border"
              maxLength={5}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>
          <Button
            variant="neon"
            className="w-full h-12 text-lg"
            onClick={handleJoin}
            disabled={!roomCode.trim()}
          >
            הצטרף!
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default JoinGame;
