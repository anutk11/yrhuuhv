import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Users, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AnswerStatsProps {
  questionId: string | null;
  roomId: string | null;
  totalPlayers: number;
  phase: string;
}

const AnswerStats = ({ questionId, roomId, totalPlayers, phase }: AnswerStatsProps) => {
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [pulse, setPulse] = useState(false);
  const prevAnswered = useRef(0);

  const fetchStats = useCallback(async () => {
    if (!questionId || !roomId) return;
    const { data, error } = await supabase.rpc("get_question_answer_stats", {
      _room_id: roomId,
      _question_id: questionId,
    });
    if (error || !data) return;
    const row = Array.isArray(data) ? data[0] : data;
    setAnswered(Number(row?.answered ?? 0));
    setCorrect(Number(row?.correct ?? 0));
    setWrong(Number(row?.wrong ?? 0));
  }, [questionId, roomId]);

  useEffect(() => {
    setAnswered(0);
    setCorrect(0);
    setWrong(0);
    prevAnswered.current = 0;
  }, [questionId]);

  useEffect(() => {
    if (!questionId || !roomId) return;
    void fetchStats();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    const setup = async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel = supabase.channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "answer_count" }, () => void fetchStats())
        .subscribe();
    };
    void setup();

    return () => {
      disposed = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [questionId, roomId, fetchStats]);

  useEffect(() => {
    if (answered > prevAnswered.current) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 600);
      prevAnswered.current = answered;
      return () => window.clearTimeout(t);
    }
    prevAnswered.current = answered;
  }, [answered]);

  const showResults = phase === "result" || phase === "survey-result";

  return (
    <div className="flex flex-col gap-3 text-sm">
      <motion.div
        className="flex items-center gap-2 text-muted-foreground"
        animate={pulse ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Users aria-hidden="true" className="w-5 h-5" />
        <span className="font-display text-base">{answered}/{totalPlayers} ענו</span>
      </motion.div>
      <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: totalPlayers > 0 ? Math.min(100, answered / totalPlayers * 100) + "%" : "0%" }}
          transition={{ duration: 0.3 }}
        />
      </div>
      {showResults && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex flex-col gap-2 pt-2 border-t border-border mt-1"
        >
          <div className="flex items-center gap-2 text-answer-green"><Check aria-hidden="true" className="w-5 h-5" /><span className="font-display text-base">{correct} הצליחו</span></div>
          <div className="flex items-center gap-2 text-destructive"><X aria-hidden="true" className="w-5 h-5" /><span className="font-display text-base">{wrong} טעו</span></div>
        </motion.div>
      )}
    </div>
  );
};

export default AnswerStats;
