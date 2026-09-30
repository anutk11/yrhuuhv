import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, WifiOff, X, Phone } from "lucide-react";
import { toast } from "sonner";
import { fetchRosterMap, isPhoneUserId, phoneFromUserId, rosterNameForUser, formatPhone } from "@/lib/phoneRoster";

interface Player {
  user_id: string;
  is_connected: boolean;
  score: number;
  display_name: string;
  nickname: string;
  is_phone: boolean;
}

interface ConnectedPlayersProps {
  roomId: string;
  canRemove?: boolean;
}

const ConnectedPlayers = ({ roomId, canRemove = false }: ConnectedPlayersProps) => {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data: rps, error } = await supabase
        .from("room_players")
        .select("user_id, is_connected, score")
        .eq("room_id", roomId);

      if (error) {
        console.error("ConnectedPlayers fetch error", error);
        return;
      }
      if (!rps) return;

      const { data: profilesData } = await supabase
        .from("room_player_profiles" as any)
        .select("user_id, display_name, nickname")
        .eq("room_id", roomId);

      const profileMap = new Map(
        (profilesData || []).map((p: any) => [p.user_id, p])
      );

      const phoneUserIds = rps.filter((p: any) => !profileMap.has(p.user_id) && isPhoneUserId(p.user_id));
      const rosterMap = await fetchRosterMap(
        phoneUserIds.map((p: any) => phoneFromUserId(p.user_id) || "")
      );

      setPlayers(
        rps.map((p: any) => {
          const profile: any = profileMap.get(p.user_id);
          const isPhone = !profile;
          const rosterName = isPhone ? rosterNameForUser(p.user_id, rosterMap) : null;
          const phoneDigits = isPhone ? phoneFromUserId(p.user_id) : null;
          const fallback = isPhone && phoneDigits
            ? formatPhone(phoneDigits)
            : `Player ${p.user_id.slice(-4)}`;
          return {
            user_id: p.user_id,
            is_connected: p.is_connected,
            score: p.score,
            display_name: rosterName || profile?.display_name || fallback,
            nickname: rosterName || profile?.nickname || "",
            is_phone: isPhone,
          };
        })
      );
    };

    fetchPlayers();

    const channel = supabase
      .channel(`room-players-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => fetchPlayers()
      )
      .subscribe();

    const interval = window.setInterval(fetchPlayers, 3000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [roomId]);

  const removePlayer = async (userId: string) => {
    const { error } = await supabase
      .from("room_players")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", userId);
    if (error) toast.error("שגיאה בהסרת שחקן");
    else toast.success("השחקן הוסר");
  };

  return (
    <div className="gradient-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm text-foreground">משתתפים מחוברים</h3>
        <span className="text-xs text-primary font-display">
          {players.filter((p) => p.is_connected).length}/{players.length}
        </span>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {players.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            אין משתתפים עדיין
          </p>
        ) : (
          players.map((player) => (
            <div
              key={player.user_id}
              className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2 text-sm group"
            >
              <div className="flex items-center gap-2">
                {player.is_connected ? (
                  <Wifi className="w-3 h-3 text-answer-green" />
                ) : (
                  <WifiOff className="w-3 h-3 text-destructive" />
                )}
                <span className="text-foreground">
                  {player.nickname || player.display_name}
                </span>
                {player.is_phone && (
                  <Phone className="w-3 h-3 text-primary" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xs text-primary">{player.score}</span>
                {canRemove && (
                  <button
                    onClick={() => removePlayer(player.user_id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 p-0.5"
                    title="הסר שחקן"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ConnectedPlayers;
