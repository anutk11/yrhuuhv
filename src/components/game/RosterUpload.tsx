import { useEffect, useRef, useState } from "react";
import { Upload, Users, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ParsedRow {
  phone_number: string;
  player_name: string;
}

interface ParseResult {
  rows: ParsedRow[];
  duplicates: number;
  skipped: number;
}

/** Normalize a raw phone cell to a local Israeli-style digits string, or null if invalid. */
function normalizeNumber(raw: string): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  s = s.replace(/^\+?972/, "0");
  const digits = s.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  if (digits.length === 9 && !digits.startsWith("0")) return `0${digits}`;
  return digits;
}

function parseCsv(text: string): ParseResult {
  // Strip BOM, split lines, ignore blanks
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], duplicates: 0, skipped: 0 };

  // Detect header
  const splitLine = (line: string) => {
    // Simple CSV: support comma or tab; quoted fields with commas
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if ((ch === "," || ch === "\t") && !inQuotes) {
        out.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  let phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("טלפון") || h.includes("מספר"));
  let nameIdx = header.findIndex((h) => h.includes("name") || h.includes("שם"));
  let startIdx = 1;
  if (phoneIdx === -1 || nameIdx === -1) {
    // No header — assume first column phone, second name
    phoneIdx = 0;
    nameIdx = 1;
    startIdx = 0;
  }

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let skipped = 0;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitLine(lines[i]);
    const rawPhone = (parts[phoneIdx] || "").trim();
    const name = (parts[nameIdx] || "").trim();
    if (!name) { skipped++; continue; }

    // A cell may contain several numbers: "052-111 / 053-222"
    const candidates = rawPhone.split(/[/;|]/).map((c) => normalizeNumber(c)).filter(Boolean) as string[];
    if (candidates.length === 0) { skipped++; continue; }

    let added = false;
    for (const phone of candidates) {
      if (seen.has(phone)) { duplicates++; continue; }
      seen.add(phone);
      rows.push({ phone_number: phone, player_name: name });
      added = true;
    }
    if (!added) continue;
  }
  return { rows, duplicates, skipped };
}


const RosterUpload = () => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const refreshCount = async () => {
    const { count: c, error } = await supabase
      .from("player_roster")
      .select("*", { count: "exact", head: true });
    if (error) {
      console.error("roster count error", error);
      return;
    }
    setCount(c ?? 0);
  };

  useEffect(() => {
    void refreshCount();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const { rows, duplicates, skipped } = parseCsv(text);
      if (rows.length === 0) {
        toast.error("לא נמצאו מספרי טלפון תקינים בקובץ");
        return;
      }
      const payload = rows.map((r) => ({
        ...r,
        uploaded_by: user?.id ?? null,
      }));

      const CHUNK = 200;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { error } = await supabase
          .from("player_roster")
          .upsert(payload.slice(i, i + CHUNK), { onConflict: "phone_number" });
        if (error) {
          console.error("roster upsert error", error);
          toast.error(`שגיאה בהעלאת הרשימה: ${error.message}`);
          return;
        }
      }

      const extras: string[] = [];
      if (duplicates > 0) extras.push(`${duplicates} כפולים הוסרו`);
      if (skipped > 0) extras.push(`${skipped} שורות דולגו`);
      toast.success(
        `הועלו ${rows.length} שחקנים לרשימה${extras.length ? ` (${extras.join(", ")})` : ""}`
      );
      await refreshCount();

    } catch (e) {
      console.error(e);
      toast.error("שגיאה בקריאת הקובץ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clearRoster = async () => {
    if (!confirm("למחוק את כל רשימת השחקנים?")) return;
    const { error } = await supabase
      .from("player_roster")
      .delete()
      .gte("phone_number", "");
    if (error) {
      toast.error("שגיאה במחיקה");
      return;
    }
    toast.success("הרשימה נמחקה");
    await refreshCount();
  };

  return (
    <div className="gradient-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="font-display text-sm text-foreground">רשימת שחקנים (טלפונים)</h3>
        {count !== null && (
          <span className="text-xs text-muted-foreground mr-auto">
            {count} שחקנים ברשימה
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        העלה קובץ CSV עם העמודות <code>phone_number,player_name</code> כדי שהשמות יוצגו במקום מספרי הטלפון.
      </p>
      <div className="flex items-center gap-2">
        <label className={`flex-1 flex items-center justify-center gap-2 border border-dashed border-border rounded-lg px-3 py-2 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {uploading ? "מעלה..." : "העלה CSV"}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
        {(count ?? 0) > 0 && (
          <Button variant="ghost" size="sm" onClick={clearRoster} className="text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default RosterUpload;
