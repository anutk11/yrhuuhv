import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Send, X, Mail, Link2 } from "lucide-react";

interface InvitePlayersProps {
  roomId: string;
  roomCode: string;
}

const InvitePlayers = ({ roomId, roomCode }: InvitePlayersProps) => {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  const joinLink = `${window.location.origin}/join?code=${roomCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink);
    toast.success("הקישור הועתק!");
  };

  const handleInvite = async () => {
    if (!email.trim() || !user) return;
    setSending(true);

    try {
      const { error } = await supabase.from("room_invitations").insert({
        room_id: roomId,
        email: email.trim(),
        invited_by: user.id,
      });

      if (error) throw error;

      setInvitedEmails((prev) => [...prev, email.trim()]);
      setEmail("");
      toast.success(`הזמנה נשלחה ל-${email.trim()}`);
    } catch (error: any) {
      toast.error(error.message || "שגיאה בשליחת הזמנה");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInvite();
    }
  };

  return (
    <div className="gradient-card border border-border rounded-xl p-4 space-y-4">
      <h3 className="font-display text-sm text-foreground flex items-center gap-2">
        <Mail className="w-4 h-4 text-primary" />
        הזמן משתתפים
      </h3>

      {/* Copy link */}
      <div className="flex gap-2">
        <Input
          value={joinLink}
          readOnly
          className="bg-secondary border-border text-xs"
        />
        <Button variant="neon-outline" size="sm" onClick={handleCopyLink}>
          <Link2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Email invite */}
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="כתובת מייל..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-secondary border-border"
        />
        <Button variant="neon" size="sm" onClick={handleInvite} disabled={!email.trim() || sending}>
          <Send className="w-3 h-3" />
        </Button>
      </div>

      {/* Invited list */}
      {invitedEmails.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">הוזמנו:</p>
          {invitedEmails.map((e, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-1.5 text-xs"
            >
              <span className="text-foreground">{e}</span>
              <span className="text-answer-green">✓</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvitePlayers;
