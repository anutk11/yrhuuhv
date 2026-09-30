import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Trash2, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface GenQ {
  question_text: string;
  options: string[];
  correct_index: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folders: string[];
  categories: string[];
  defaultFolder: string;
  onSaved: () => void;
}

const TIME_PRESETS = [15, 20, 30, 45, 60];

const AIQuestionGenerator = ({ open, onOpenChange, folders, categories, defaultFolder, onSaved }: Props) => {
  const { user } = useAuth();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [timeLimit, setTimeLimit] = useState(15);
  const [folder, setFolder] = useState(defaultFolder);
  const [category, setCategory] = useState("כללי");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<GenQ[]>([]);

  const generate = async () => {
    if (topic.trim().length < 2) { toast.error("יש להזין נושא"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-questions", {
        body: { topic: topic.trim(), count, difficulty },
      });
      if (error) {
        let msg = "שגיאה ביצירת השאלות";
        try { const body = await (error as any).context?.json(); if (body?.error) msg = body.error; } catch { /* ignore */ }
        toast.error(msg);
        return;
      }
      if (!data?.questions?.length) { toast.error(data?.error || "לא נוצרו שאלות"); return; }
      setResults(data.questions);
    } finally {
      setLoading(false);
    }
  };

  const update = (i: number, patch: Partial<GenQ>) =>
    setResults((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const saveAll = async () => {
    if (!user) return;
    const rows = results
      .filter((q) => q.question_text.trim() && q.options.every((o) => o.trim()))
      .map((q) => ({
        created_by: user.id,
        owner_id: user.id,
        bank_scope: "private",
        source_question_id: null,
        question_text: q.question_text.trim(),
        options: q.options.map((o) => o.trim()),
        correct_index: q.correct_index,
        question_type: "trivia",
        time_limit: timeLimit,
        folder: folder || "כללי",
        category: category.trim() || "כללי",
      }));
    if (rows.length === 0) { toast.error("אין שאלות תקינות לשמירה"); return; }
    setSaving(true);
    const { error } = await supabase.from("question_bank").insert(rows as any);
    setSaving(false);
    if (error) { toast.error("שגיאה בשמירה: " + error.message); return; }
    toast.success(`${rows.length} שאלות נשמרו למאגר`);
    setResults([]);
    setTopic("");
    onSaved();
    onOpenChange(false);
  };

  const folderOptions = [...new Set([...folders, folder || "כללי"])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto text-right">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="w-5 h-5 text-primary" /> מחולל שאלות AI
          </DialogTitle>
          <DialogDescription>הזינו נושא או הדביקו טקסט, והמערכת תיצור שאלות טריוויה לעריכה ושמירה.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="לדוגמה: היסטוריה של ירושלים, או הדביקו כאן טקסט מקור..."
            rows={3}
            maxLength={4000}
            className="w-full rounded-md bg-secondary border border-border p-3 text-sm text-foreground"
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-muted-foreground">מספר שאלות</span>
              <Input type="number" min={1} max={15} value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                className="bg-secondary border-border" />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">רמת קושי</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full h-10 bg-secondary border border-border rounded-md px-2 text-foreground">
                <option value="easy">קלה</option>
                <option value="medium">בינונית</option>
                <option value="hard">קשה</option>
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-muted-foreground">זמן לשאלה</span>
              <div className="flex gap-1 flex-wrap">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" onClick={() => setTimeLimit(t)}
                    className={`px-2 py-1.5 rounded-md font-display ${timeLimit === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label className="space-y-1">
              <span className="text-muted-foreground">תיקייה</span>
              <select value={folder} onChange={(e) => setFolder(e.target.value)}
                className="w-full h-10 bg-secondary border border-border rounded-md px-2 text-foreground">
                {folderOptions.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">קטגוריה</span>
              <Input list="ai-cats" value={category} onChange={(e) => setCategory(e.target.value)} className="bg-secondary border-border" />
              <datalist id="ai-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          </div>
          <Button variant="neon" className="w-full" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "יוצר שאלות..." : results.length ? "צור מחדש" : "צור שאלות"}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">לחצו על עיגול כדי לסמן תשובה נכונה. ניתן לערוך כל שדה.</p>
            {results.map((q, i) => (
              <div key={i} className="border border-border rounded-xl p-3 space-y-2 bg-secondary/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-display text-primary">#{i + 1}</span>
                  <Input value={q.question_text} onChange={(e) => update(i, { question_text: e.target.value })} className="bg-secondary border-border" />
                  <button onClick={() => setResults((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive p-1" title="הסר">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, j) => (
                    <div key={j} className="relative">
                      <Input value={opt}
                        onChange={(e) => update(i, { options: q.options.map((o, k) => (k === j ? e.target.value : o)) })}
                        className="bg-secondary border-border text-sm pl-8" />
                      <button onClick={() => update(i, { correct_index: j })}
                        className={`absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 ${q.correct_index === j ? "bg-answer-green border-answer-green" : "border-muted-foreground"}`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="neon" className="w-full" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור {results.length} שאלות למאגר
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AIQuestionGenerator;
