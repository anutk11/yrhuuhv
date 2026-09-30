import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { Users, Copy, Check, QrCode, Phone } from "lucide-react";
import QRInvite from "@/components/game/QRInvite";
import RoomClosedOverlay from "@/components/game/RoomClosedOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fetchRosterMap, isPhoneUserId, phoneFromUserId, rosterNameForUser, formatPhone } from "@/lib/phoneRoster";

interface Player {
  user_id: string;
  display_name: string;
  nickname: string;
  is_connected: boolean;
  is_phone: boolean;
}

const Lobby = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState("waiting");
  // When the game starts we navigate to /game, which unmounts the lobby.
  // In that case the player is still connected and must not be marked offline.
  const keepConnectedRef = useRef(false);
  const goToGame = (id: string) => {
    keepConnectedRef.current = true;
    navigate(`/game?room=${id}`);
  };

  // Find room by code and register player
  useEffect(() => {
    if (!roomCode || !user) return;

    const joinRoom = async () => {
      const { data, error: roomError } = await supabase.rpc("find_room_by_code", {
        _room_code: roomCode.trim(),
      });
      const room = Array.isArray(data) ? data[0] : data;

      if (roomError || !room?.id) {
        toast.error("חדר לא נמצא או שאינו פתוח להצטרפות");
        navigate("/join");
        return;
      }

      setRoomStatus(room.status);

      if (room.status === "playing" || room.status === "paused") {
        goToGame(room.id);
        return;
      }

      const { error: joinError } = await supabase.from("room_players").insert(
        { room_id: room.id, user_id: user.id, is_connected: true }
      );

      if (joinError?.code === "23505") {
        const { error: presenceError } = await supabase.rpc("touch_room_presence", {
          _room_id: room.id,
          _is_connected: true,
        });
        if (presenceError) {
          toast.error("שגיאה בחיבור מחדש לחדר");
          return;
        }
      } else if (joinError) {
        console.error("Lobby joinRoom insert error", joinError);
        toast.error("שגיאה בהצטרפות לחדר");
        return;
      }

      setRoomId(room.id);
    };

    void joinRoom();
  }, [roomCode, user, navigate]);

  useEffect(() => {
    if (!roomId) return;

    const fetchPlayers = async () => {
      const { data: rps, error: roomPlayersError } = await supabase
        .from("room_players")
        .select("user_id, is_connected, joined_at")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (roomPlayersError) {
        console.error("Lobby fetch room_players error", roomPlayersError);
        return;
      }

      if (!rps) return;

      const userIds = [...new Set(rps.map((p) => p.user_id).filter(Boolean))];
      let profilesData: Array<{ user_id: string; display_name: string; nickname: string }> = [];

      if (userIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, display_name, nickname")
          .in("user_id", userIds);

        if (profilesError) {
          console.error("Lobby fetch profiles error", profilesError);
        } else {
          profilesData = profileRows || [];
        }
      }

      const profileMap = new Map(
        profilesData.map((profile) => [profile.user_id, profile])
      );

      const phonePlayers = rps.filter((p) => !profileMap.has(p.user_id) && isPhoneUserId(p.user_id));
      const rosterMap = await fetchRosterMap(
        phonePlayers.map((p) => phoneFromUserId(p.user_id) || "")
      );

      setPlayers(
        rps.map((player) => {
          const profile = profileMap.get(player.user_id);
          const isPhone = !profile;
          const rosterName = isPhone ? rosterNameForUser(player.user_id, rosterMap) : null;
          const phoneDigits = isPhone ? phoneFromUserId(player.user_id) : null;
          const fallback = isPhone && phoneDigits
            ? formatPhone(phoneDigits)
            : `Player ${player.user_id.slice(-4)}`;
          return {
            user_id: player.user_id,
            display_name: rosterName || profile?.display_name?.trim() || fallback,
            nickname: rosterName || profile?.nickname?.trim() || "",
            is_connected: player.is_connected,
            is_phone: isPhone,
          };
        })
      );
    };

    void fetchPlayers();

    const channel = supabase
      .channel(`lobby-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => void fetchPlayers()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const d = payload.new as any;
          setRoomStatus(d.status);
          if (d.status === "playing") {
            goToGame(roomId);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void fetchPlayers();
        }
      });

    const interval = window.setInterval(() => {
      void fetchPlayers();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [roomId, navigate]);

  useEffect(() => {
    if (!roomId) return;

    const syncRoomState = async () => {
      const { data: room } = await supabase
        .from("game_rooms")
        .select("status")
        .eq("id", roomId)
        .maybeSingle();

      if (!room) return;

      setRoomStatus(room.status);
      if (room.status === "playing") {
        goToGame(roomId);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncRoomState();
      }
    };

    const interval = window.setInterval(() => {
      void syncRoomState();
    }, 3000);

    window.addEventListener("focus", syncRoomState);
    window.addEventListener("online", syncRoomState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncRoomState);
      window.removeEventListener("online", syncRoomState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomId, navigate]);

  // Disconnect on unmount — unless we're moving into the live game
  useEffect(() => {
    return () => {
      if (keepConnectedRef.current) return;
      if (roomId && user) {
        void supabase.rpc("touch_room_presence", {
          _room_id: roomId,
          _is_connected: false,
        });
      }
    };
  }, [roomId, user]);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/join?code=${roomCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (roomStatus === "finished") {
    return <RoomClosedOverlay />;
  }

  return (
    <div className="min-h-screen gradient-hero flex flex-col items-center justify-center px-4 py-8" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <p className="text-muted-foreground text-sm mb-2">קוד חדר</p>
        <div className="flex items-center gap-3 justify-center">
          <h1 className="text-5xl font-display font-bold text-primary text-glow tracking-[0.3em]">
            {roomCode}
          </h1>
          <button onClick={handleCopy} className="text-muted-foreground hover:text-primary transition-colors">
            {copied ? <Check className="w-5 h-5 text-answer-green" /> : <Copy className="w-5 h-5" />}
          </button>
          <button onClick={() => setShowQR(!showQR)} className="text-muted-foreground hover:text-primary transition-colors">
            <QrCode className="w-5 h-5" />
          </button>
        </div>

        {showQR && roomCode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4"
          >
            <QRInvite roomCode={roomCode} />
          </motion.div>
        )}
      </motion.div>

      <motion.div
        className="w-full max-w-lg gradient-card border border-border rounded-2xl p-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg text-foreground">
            משתתפים ({players.length})
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {players.map((p) => (
            <motion.div
              key={p.user_id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-secondary rounded-lg px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-display text-sm">
                {(p.nickname || p.display_name)[0]}
              </div>
              <span className="text-foreground text-sm font-medium">{p.nickname || p.display_name}</span>
              {p.is_phone && (
                <Phone className="w-3.5 h-3.5 text-primary" />
              )}
              {p.user_id === user?.id && (
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full mr-auto">
                  אתה
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {players.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
          <span className="text-sm">ממתין למארח להתחיל את המשחק...</span>
        </div>
      </motion.div>
    </div>
  );
};

export default Lobby;
