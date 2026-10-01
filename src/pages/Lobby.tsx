import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { Users, Copy, Check, QrCode, Phone, RotateCw } from "lucide-react";
import QRInvite from "@/components/game/QRInvite";
import RoomClosedOverlay from "@/components/game/RoomClosedOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Player {
  user_id: string;
  display_name: string;
  nickname: string;
  is_connected: boolean;
  is_phone: boolean;
}

const joinErrorMessage = (message?: string) => {
  if (message?.includes("ROOM_FULL")) return "החדר מלא";
  if (message?.includes("ROOM_CLOSED")) return "החדר כבר נסגר";
  if (message?.includes("ROOM_RATE_LIMIT")) return "בוצעו יותר מדי ניסיונות. נסה שוב בעוד דקה";
  if (message?.includes("ROOM_CODE_INVALID")) return "קוד חדר לא תקין";
  if (message?.includes("ROOM_NOT_FOUND")) return "החדר לא נמצא";
  return "לא ניתן להצטרף לחדר";
};

const Lobby = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState("waiting");
  const [error, setError] = useState<string | null>(null);

  const goToGame = (id: string) => navigate(`/game?room=${id}`);

  useEffect(() => {
    if (!roomCode || !user) return;

    const joinRoom = async () => {
      setError(null);
      const { data, error: joinError } = await supabase.rpc("join_room" as any, {
        _room_code: roomCode.trim(),
      });
      const room = Array.isArray(data) ? data[0] : data;

      if (joinError || !room?.room_id) {
        const message = joinErrorMessage(joinError?.message);
        setError(message);
        toast.error(message);
        return;
      }

      setRoomId(room.room_id);
      setRoomStatus(room.status);
      if (room.status === "playing" || room.status === "paused") {
        goToGame(room.room_id);
      }
    };

    void joinRoom();
  }, [roomCode, user]);

  useEffect(() => {
    if (!roomId) return;

    let disposed = false;
    const fetchPlayers = async () => {
      const { data, error: playersError } = await supabase.rpc("get_room_players" as any, {
        _room_id: roomId,
      });
      if (disposed || playersError) return;

      setPlayers(
        (Array.isArray(data) ? data : []).map((p: any) => ({
          user_id: p.user_id,
          display_name: p.display_name || "שחקן",
          nickname: p.nickname || "",
          is_connected: Boolean(p.is_connected),
          is_phone: Boolean(p.is_phone),
        })),
      );
    };

    void fetchPlayers();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const setup = async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;

      channel = supabase
        .channel(`room:${roomId}`, { config: { private: true } })
        .on("broadcast", { event: "room_presence" }, () => void fetchPlayers())
        .on("broadcast", { event: "room_state" }, (payload) => {
          const state = payload?.payload ?? {};
          if (state.status) setRoomStatus(String(state.status));
          if (state.status === "playing" || state.status === "paused") goToGame(roomId);
          if (state.status === "finished") setRoomStatus("finished");
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void fetchPlayers();
        });
    };

    void setup();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchPlayers();
    };
    window.addEventListener("online", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener("online", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.rpc("set_my_presence" as any, {
        _room_id: roomId,
        _connected: false,
      });
    };
  }, [roomId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/join?code=${roomCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (roomStatus === "finished") return <RoomClosedOverlay />;

  if (error) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center px-4 py-8" dir="rtl">
        <div className="w-full max-w-md gradient-card border border-border rounded-2xl p-8 text-center space-y-5">
          <h1 className="text-2xl font-display font-bold text-destructive">{error}</h1>
          <button
            onClick={() => navigate("/join")}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-xl font-display"
          >
            <RotateCw className="w-4 h-4" /> נסה שוב
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col items-center justify-center px-4 py-8" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <p className="text-muted-foreground text-sm mb-2">קוד חדר</p>
        <div className="flex items-center gap-3 justify-center">
          <h1 className="text-5xl font-display font-bold text-primary text-glow tracking-[0.3em]">{roomCode}</h1>
          <button aria-label="העתק קישור לחדר" onClick={handleCopy} className="text-muted-foreground hover:text-primary transition-colors">
            {copied ? <Check className="w-5 h-5 text-answer-green" /> : <Copy className="w-5 h-5" />}
          </button>
          <button aria-label="הצג קוד QR" onClick={() => setShowQR(!showQR)} className="text-muted-foreground hover:text-primary transition-colors">
            <QrCode className="w-5 h-5" />
          </button>
        </div>
        {showQR && roomCode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
            <QRInvite roomCode={roomCode} />
          </motion.div>
        )}
      </motion.div>

      <motion.div className="w-full max-w-lg gradient-card border border-border rounded-2xl p-6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg text-foreground">משתתפים ({players.length})</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {players.map((p) => (
            <motion.div key={p.user_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-secondary rounded-lg px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-display text-sm">
                {(p.nickname || p.display_name)[0]}
              </div>
              <span className="text-foreground text-sm font-medium truncate">{p.nickname || p.display_name}</span>
              {p.is_phone && <Phone aria-label="שחקן טלפון" className="w-3.5 h-3.5 text-primary shrink-0" />}
              {p.user_id === user?.id && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full mr-auto">אתה</span>}
            </motion.div>
          ))}
        </div>

        {players.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" role="status" aria-label="טוען משתתפים" />
          </div>
        ) : (
          <div aria-live="polite" className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-sm">ממתין למארח להתחיל את המשחק...</span>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Lobby;
