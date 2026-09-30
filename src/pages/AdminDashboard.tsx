import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Play, Trash2, ArrowLeft, Settings, BarChart3, QrCode, Edit2, BookOpen, Search, ChevronDown, Eye, Archive, Upload, Image, Video, X, Save, FolderOpen, GripVertical, Music, Volume2, Shuffle, Copy,
} from "lucide-react";
import QRInvite from "@/components/game/QRInvite";
import InvitePlayers from "@/components/game/InvitePlayers";
import ConnectedPlayers from "@/components/game/ConnectedPlayers";
import ThemeToggle from "@/components/ThemeToggle";
import RosterUpload from "@/components/game/RosterUpload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import TelephoneQuestionStage from "@/components/game/TelephoneQuestionStage";
import { toast } from "sonner";

interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  type: "trivia" | "survey";
  timeLimit: number;
  mediaUrl?: string;
  mediaType?: string;
  imageViewTime: number;
  keepImage: boolean;
}

interface BankQuestion {
  id: string;
  category: string;
  folder: string;
  question_text: string;
  options: string[];
  correct_index: number;
  question_type: string;
  time_limit: number;
  media_url?: string;
  media_type?: string;
}

function generateRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(10000 + (values[0] % 90000));
}

function validateQuestionMediaFile(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return "יש לבחור תמונה או וידאו";
  const maxBytes = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return `הקובץ גדול מדי (מקסימום ${isVideo ? "100MB" : "10MB"})`;
  }
  return null;
}

const AudioUploadField = ({ label, url, uploading, onUpload, onRemove }: {
  label: string; url: string; uploading: boolean;
  onUpload: (f: File) => void; onRemove: () => void;
}) => (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">{label}</label>
    {url ? (
      <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
        <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs text-foreground flex-1 truncate">{label}</span>
        <button onClick={onRemove} className="text-destructive hover:text-destructive/80">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    ) : (
      <label className={`flex items-center justify-center gap-2 border border-dashed border-border rounded-lg px-3 py-2 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
        <Upload className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{uploading ? "מעלה..." : "העלה קובץ"}</span>
        <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      </label>
    )}
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newQ, setNewQ] = useState({ text: "", options: ["", "", "", ""], correctIndex: 0, type: "trivia" as "trivia" | "survey", timeLimit: 15, mediaUrl: "", mediaType: "none" as string, imageViewTime: 5, keepImage: false });
  const [uploading, setUploading] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [showRoomNameInput, setShowRoomNameInput] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [correctWeight, setCorrectWeight] = useState(60);
  const [showEvery, setShowEvery] = useState(2);
  const [defaultTimeLimit, setDefaultTimeLimit] = useState(15);
  const [resultDisplaySeconds, setResultDisplaySeconds] = useState(5);
  const [leaderboardDisplaySeconds, setLeaderboardDisplaySeconds] = useState(5);
  const [bgMusicUrl, setBgMusicUrl] = useState("");
  const [correctSoundUrl, setCorrectSoundUrl] = useState("");
  const [wrongSoundUrl, setWrongSoundUrl] = useState("");
  const [endMusicUrl, setEndMusicUrl] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewPhase, setPreviewPhase] = useState<"answering" | "result">("answering");


  // Active rooms
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  // Question bank state
  const [showBank, setShowBank] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankCategories, setBankCategories] = useState<string[]>([]);
  const [bankFolders, setBankFolders] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
  const [selectedBankFolder, setSelectedBankFolder] = useState<string>("הכל");
  const [bankSearch, setBankSearch] = useState("");

  // Game templates
  const [gameTemplates, setGameTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState("");
  // Load or create room based on URL param
  useEffect(() => {
    if (!user) return;
    const existingRoomId = searchParams.get("room");

    const loadOrCreateRoom = async () => {
      if (existingRoomId) {
        const { data, error } = await supabase
          .from("game_rooms")
          .select("id, room_code, room_name, settings, host_id, status")
          .eq("id", existingRoomId)
          .eq("host_id", user.id)
          .single();

        if (data) {
          setRoomCode(data.room_code);
          setRoomId(data.id);
          setRoomName((data as any).room_name || "");
          const s = data.settings as any;
          if (s) {
            setCorrectWeight(s.correctness_weight ?? 60);
            setShowEvery(s.show_leaderboard_every ?? 2);
            setDefaultTimeLimit(s.default_time_limit ?? 15);
            setResultDisplaySeconds(s.result_display_seconds ?? 5);
            setLeaderboardDisplaySeconds(s.leaderboard_display_seconds ?? 5);
            setBgMusicUrl(s.bg_music_url ?? "");
            setCorrectSoundUrl(s.correct_sound_url ?? "");
            setWrongSoundUrl(s.wrong_sound_url ?? "");
            setEndMusicUrl(s.end_music_url ?? "");
          }
          setLoading(false);
          return;
        }
      }

      // Fetch active rooms for this host
      const { data: rooms } = await supabase
        .from("game_rooms")
        .select("id, room_code, room_name, status, created_at, current_question_index")
        .eq("host_id", user.id)
        .in("status", ["waiting", "playing"])
        .order("created_at", { ascending: false });

      setActiveRooms(rooms || []);
      setShowRoomPicker(true);
      setLoading(false);

    };
    loadOrCreateRoom();
  }, [user, searchParams]);

  const createRoom = async () => {
    if (!user || !roomName.trim()) {
      toast.error("יש להזין שם חדר");
      return;
    }
    let data: any = null;
    let lastError: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateRoomCode();
      const { data: inserted, error } = await supabase
        .from("game_rooms")
        .insert({
          room_code: code,
          host_id: user.id,
          room_name: roomName.trim(),
          settings: { correctness_weight: 60, show_leaderboard_every: 2, default_time_limit: 15 },
        } as any)
        .select()
        .single();

      if (!error) {
        data = inserted;
        lastError = null;
        break;
      }

      lastError = error;
      // 23505 = unique violation on room_code -> try another code
      if (error.code !== "23505") break;
    }

    if (!data) {
      toast.error("שגיאה ביצירת חדר: " + (lastError?.message ?? "לא נמצא קוד חדר פנוי"));
      return;
    }

    setRoomCode(data.room_code);
    setRoomId(data.id);
    setShowRoomNameInput(false);
    setShowRoomPicker(false);
    window.history.replaceState(null, "", `/admin?room=${data.id}`);
    const s = data.settings as any;
    if (s) {
      setCorrectWeight(s.correctness_weight ?? 60);
      setShowEvery(s.show_leaderboard_every ?? 2);
      setDefaultTimeLimit(s.default_time_limit ?? 15);
    }
  };

  const archiveRoom = async (id: string) => {
    if (!confirm("בטוח שברצונך למחוק את החדר הזה? פעולה זו אינה הפיכה.")) return;
    const { error } = await supabase
      .from("game_rooms")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("deleteRoom error", error);
      toast.error("שגיאה במחיקת חדר: " + error.message);
      return;
    }
    setActiveRooms((prev) => prev.filter((r) => r.id !== id));
    toast.success("החדר נמחק בהצלחה");
  };

  // Load questions for room
  useEffect(() => {
    if (!roomId) return;
    const loadQuestions = async () => {
      const { data } = await supabase
        .from("questions")
        .select("*")
        .eq("room_id", roomId)
        .order("sort_order");

      if (data) {
        setQuestions(
          data.map((q: any) => ({
            id: q.id,
            text: q.question_text,
            options: (q.options as string[]) || [],
            correctIndex: q.correct_index,
            type: q.question_type as "trivia" | "survey",
            timeLimit: q.time_limit,
            mediaUrl: q.media_url || "",
            mediaType: q.media_type || "none",
            imageViewTime: q.image_view_time ?? 5,
            keepImage: q.keep_image ?? false,
          }))
        );
      }
    };
    loadQuestions();
  }, [roomId]);

  // Load question bank
  useEffect(() => {
    const loadBank = async () => {
      const { data } = await supabase
        .from("question_bank")
        .select("*")
        .order("category");
      if (data) {
        setBankQuestions(data.map((q: any) => ({
          ...q,
          options: (q.options as string[]) || [],
          folder: q.folder || "כללי",
        })));
        const cats = [...new Set(data.map((q: any) => q.category))];
        setBankCategories(cats);
        const folders = [...new Set(data.map((q: any) => q.folder || "כללי"))];
        setBankFolders(folders.sort((a: string, b: string) => a.localeCompare(b, "he")));
      }
    };
    loadBank();
  }, []);

  // Load templates
  useEffect(() => {
    if (!user) return;
    const loadTemplates = async () => {
      const { data } = await supabase
        .from("game_templates")
        .select("*")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      if (data) setGameTemplates(data);
    };
    loadTemplates();
  }, [user]);

  const saveAsTemplate = async () => {
    if (!user || !roomId || !templateName.trim()) { toast.error("יש להזין שם לתבנית"); return; }
    const { error } = await supabase.from("game_templates").insert({
      created_by: user.id,
      template_name: templateName.trim(),
      settings: {
        correctness_weight: correctWeight,
        show_leaderboard_every: showEvery,
        default_time_limit: defaultTimeLimit,
        result_display_seconds: resultDisplaySeconds,
        leaderboard_display_seconds: leaderboardDisplaySeconds,
        bg_music_url: bgMusicUrl || undefined,
        correct_sound_url: correctSoundUrl || undefined,
        wrong_sound_url: wrongSoundUrl || undefined,
        end_music_url: endMusicUrl || undefined,
      },
      questions: questions.map((q) => ({
        text: q.text, options: q.options, correctIndex: q.correctIndex, type: q.type, timeLimit: q.timeLimit,
        mediaUrl: q.mediaUrl, mediaType: q.mediaType, imageViewTime: q.imageViewTime, keepImage: q.keepImage,
      })),
    } as any);
    if (error) { toast.error("שגיאה בשמירה"); return; }
    toast.success("המשחק נשמר כתבנית!");
    setTemplateName("");
    // Reload templates
    const { data } = await supabase.from("game_templates").select("*").eq("created_by", user.id).order("created_at", { ascending: false });
    if (data) setGameTemplates(data);
  };

  const deleteTemplate = async (templateId: string) => {
    if (!user) return;
    const { error } = await supabase.from("game_templates").delete().eq("id", templateId);
    if (error) { toast.error("שגיאה במחיקת התבנית"); return; }
    toast.success("התבנית נמחקה");
    setGameTemplates((prev: any[]) => prev.filter((t) => t.id !== templateId));
  };

  const duplicateTemplate = async (template: any) => {
    if (!user) return;
    const { data, error } = await supabase.from("game_templates").insert({
      created_by: user.id,
      template_name: `${template.template_name} (עותק)`,
      settings: template.settings,
      questions: template.questions,
    } as any).select().single();
    if (error || !data) { toast.error("שגיאה בשכפול התבנית"); return; }
    setGameTemplates((prev: any[]) => [data, ...prev]);
    toast.success("התבנית שוכפלה");
  };

  const duplicateQuestion = async (q: Question, index: number) => {
    if (!roomId) return;
    const { data, error } = await supabase.from("questions").insert({
      room_id: roomId,
      question_text: q.text,
      options: q.options,
      correct_index: q.correctIndex,
      question_type: q.type,
      time_limit: q.timeLimit,
      sort_order: index + 1,
      media_url: q.mediaUrl || null,
      media_type: q.mediaType || "none",
      image_view_time: q.imageViewTime ?? 5,
      keep_image: q.keepImage ?? false,
    } as any).select().single();
    if (error || !data) { toast.error("שגיאה בשכפול השאלה"); return; }
    const copy: Question = { ...q, id: data.id };
    const reordered = [...questions];
    reordered.splice(index + 1, 0, copy);
    setQuestions(reordered);
    await Promise.all(
      reordered.map((item, i) => i > index + 1
        ? supabase.from("questions").update({ sort_order: i } as any).eq("id", item.id)
        : Promise.resolve()),
    );
    toast.success("השאלה שוכפלה");
  };

  const loadFromTemplate = async (template: any) => {
    if (!roomId) return;
    const tQuestions = template.questions as any[];
    const tSettings = template.settings as any;
    // Delete existing questions
    await supabase.from("questions").delete().eq("room_id", roomId);
    // Insert template questions in a single bulk insert (validated)
    const rowsToInsert = tQuestions
      .map((q: any, i: number) => {
        const options = Array.isArray(q.options) ? q.options.filter((o: string) => (o ?? "").trim()) : [];
        const text = (q.text ?? "").trim();
        const correctIndex = Number(q.correctIndex);
        const timeLimit = Number(q.timeLimit);
        if (!text || options.length < 2) return null;
        const isSurvey = q.type === "survey";
        if (!isSurvey && (
          !Number.isInteger(correctIndex) ||
          correctIndex < 0 ||
          correctIndex >= options.length
        )) return null;
        return {
          room_id: roomId,
          question_text: text,
          options,
          correct_index: isSurvey ? -1 : correctIndex,
          question_type: isSurvey ? "survey" : "trivia",
          time_limit: Number.isFinite(timeLimit) && timeLimit > 0 ? Math.trunc(timeLimit) : 15,
          sort_order: i,
          media_url: q.mediaUrl || null,
          media_type: q.mediaType || "none",
          image_view_time: Number.isFinite(Number(q.imageViewTime)) ? Number(q.imageViewTime) : 5,
          keep_image: q.keepImage ?? false,
        };
      })
      .filter(Boolean)
      .map((row: any, i: number) => ({ ...row, sort_order: i }));

    if (rowsToInsert.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        const { error } = await supabase.from("questions").insert(rowsToInsert.slice(i, i + CHUNK) as any);
        if (error) {
          toast.error(`שגיאה בטעינת התבנית: ${error.message}`);
          return;
        }
      }
    }
    // Update settings
    if (tSettings) {
      setCorrectWeight(tSettings.correctness_weight ?? 60);
      setShowEvery(tSettings.show_leaderboard_every ?? 2);
      setDefaultTimeLimit(tSettings.default_time_limit ?? 15);
      setResultDisplaySeconds(tSettings.result_display_seconds ?? 5);
      setLeaderboardDisplaySeconds(tSettings.leaderboard_display_seconds ?? 5);
      setBgMusicUrl(tSettings.bg_music_url ?? "");
      setCorrectSoundUrl(tSettings.correct_sound_url ?? "");
      setWrongSoundUrl(tSettings.wrong_sound_url ?? "");
      setEndMusicUrl(tSettings.end_music_url ?? "");
    }
    // Reload questions
    const { data } = await supabase.from("questions").select("*").eq("room_id", roomId).order("sort_order");
    if (data) {
      setQuestions(data.map((q: any) => ({
        id: q.id, text: q.question_text, options: (q.options as string[]) || [],
        correctIndex: q.correct_index, type: q.question_type as "trivia" | "survey",
        timeLimit: q.time_limit, mediaUrl: q.media_url || "", mediaType: q.media_type || "none",
        imageViewTime: q.image_view_time ?? 5, keepImage: q.keep_image ?? false,
      })));
    }
    setShowTemplates(false);
    toast.success("התבנית נטענה בהצלחה!");
  };

  const saveQuestionToBank = async (q: Question) => {
    if (!user) return;
    const { error } = await supabase.from("question_bank").insert({
      created_by: user.id,
      question_text: q.text,
      options: q.options,
      correct_index: q.correctIndex,
      question_type: q.type,
      time_limit: q.timeLimit,
      category: "כללי",
      folder: "כללי",
      media_url: q.mediaUrl || null,
      media_type: q.mediaType || "none",
      image_view_time: q.imageViewTime ?? 5,
      keep_image: q.keepImage ?? false,
    } as any);
    if (error) { toast.error("שגיאה בשמירה למאגר"); return; }
    toast.success("השאלה נשמרה למאגר!");
  };


  // Save settings
  const saveSettings = async () => {
    if (!roomId) return;
    await supabase.from("game_rooms").update({
      settings: {
        correctness_weight: correctWeight,
        show_leaderboard_every: showEvery,
        default_time_limit: defaultTimeLimit,
        result_display_seconds: resultDisplaySeconds,
        leaderboard_display_seconds: leaderboardDisplaySeconds,
        bg_music_url: bgMusicUrl || undefined,
        correct_sound_url: correctSoundUrl || undefined,
        wrong_sound_url: wrongSoundUrl || undefined,
        end_music_url: endMusicUrl || undefined,
      },
    }).eq("id", roomId);
  };

  useEffect(() => {
    if (roomId) saveSettings();
  }, [correctWeight, showEvery, defaultTimeLimit, resultDisplaySeconds, leaderboardDisplaySeconds, bgMusicUrl, correctSoundUrl, wrongSoundUrl, endMusicUrl]);

  const handleMediaUpload = async (file: File) => {
    const validation = validateQuestionMediaFile(file);
    if (validation) {
      toast.error(validation);
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("question-media").upload(path, file);
    if (error) {
      toast.error("שגיאה בהעלאת קובץ");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("question-media").getPublicUrl(path);
    const isVideo = file.type.startsWith("video/");
    setNewQ((p) => ({ ...p, mediaUrl: urlData.publicUrl, mediaType: isVideo ? "video" : "image" }));
    setUploading(false);
  };

  const handleAudioUpload = async (file: File, type: "bg" | "correct" | "wrong" | "end") => {
    if (!file.type.startsWith("audio/")) {
      toast.error("יש לבחור קובץ אודיו");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("קובץ האודיו גדול מדי (מקסימום 20MB)");
      return;
    }
    setUploadingAudio(type);
    const ext = file.name.split(".").pop();
    const path = `audio/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("question-media").upload(path, file);
    if (error) { toast.error("שגיאה בהעלאת קובץ אודיו"); setUploadingAudio(null); return; }
    const { data: urlData } = supabase.storage.from("question-media").getPublicUrl(path);
    const url = urlData.publicUrl;
    if (type === "bg") setBgMusicUrl(url);
    else if (type === "correct") setCorrectSoundUrl(url);
    else if (type === "wrong") setWrongSoundUrl(url);
    else if (type === "end") setEndMusicUrl(url);
    setUploadingAudio(null);
    toast.success("הקובץ הועלה בהצלחה!");
  };

  const addOrUpdateQuestion = async () => {
    if (!newQ.text.trim() || newQ.options.some((o) => !o.trim()) || !roomId) return;

    const mediaFields = { media_url: newQ.mediaUrl || null, media_type: newQ.mediaType || "none", image_view_time: newQ.imageViewTime, keep_image: newQ.keepImage };

    if (editingId) {
      const { error } = await supabase.from("questions").update({
        question_text: newQ.text,
        options: newQ.options,
        correct_index: newQ.correctIndex,
        question_type: newQ.type,
        time_limit: newQ.timeLimit,
        ...mediaFields,
      } as any).eq("id", editingId);

      if (!error) {
        setQuestions((prev) =>
          prev.map((q) => q.id === editingId ? { ...q, text: newQ.text, options: [...newQ.options], correctIndex: newQ.correctIndex, type: newQ.type, timeLimit: newQ.timeLimit, mediaUrl: newQ.mediaUrl, mediaType: newQ.mediaType, imageViewTime: newQ.imageViewTime, keepImage: newQ.keepImage } : q)
        );
      }
      setEditingId(null);
    } else {
      const { data, error } = await supabase.from("questions").insert({
        room_id: roomId,
        question_text: newQ.text,
        options: newQ.options,
        correct_index: newQ.correctIndex,
        question_type: newQ.type,
        time_limit: newQ.timeLimit,
        sort_order: questions.length,
        ...mediaFields,
      } as any).select().single();

      if (!error && data) {
        setQuestions((prev) => [...prev, {
          id: data.id,
          text: data.question_text,
          options: data.options as string[],
          correctIndex: data.correct_index,
          type: data.question_type as "trivia" | "survey",
          timeLimit: data.time_limit,
          mediaUrl: (data as any).media_url || "",
          mediaType: (data as any).media_type || "none",
          imageViewTime: (data as any).image_view_time ?? 5,
          keepImage: (data as any).keep_image ?? false,
        }]);
      }
    }

    setNewQ({ text: "", options: ["", "", "", ""], correctIndex: 0, type: "trivia", timeLimit: defaultTimeLimit, mediaUrl: "", mediaType: "none", imageViewTime: 5, keepImage: false });
    setShowForm(false);
  };

  const addFromBank = async (bq: BankQuestion) => {
    if (!roomId) return;
    const { data, error } = await supabase.from("questions").insert({
      room_id: roomId,
      question_text: bq.question_text,
      options: bq.options,
      correct_index: bq.correct_index,
      question_type: bq.question_type,
      time_limit: bq.time_limit,
      sort_order: questions.length,
    }).select().single();

    if (!error && data) {
      setQuestions((prev) => [...prev, {
        id: data.id,
        text: data.question_text,
        options: data.options as string[],
        correctIndex: data.correct_index,
        type: data.question_type as "trivia" | "survey",
        timeLimit: data.time_limit,
        mediaUrl: (data as any).media_url || "",
        mediaType: (data as any).media_type || "none",
        imageViewTime: (data as any).image_view_time ?? 5,
        keepImage: (data as any).keep_image ?? false,
      }]);
      toast.success("השאלה נוספה!");
    }
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from("questions").delete().eq("id", id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleDragEnd = async () => {
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...questions];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dragOverIdx, 0, moved);
    setQuestions(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
    // Update sort_order in DB
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from("questions").update({ sort_order: i } as any).eq("id", reordered[i].id);
    }
  };

  const shuffleQuestions = async () => {
    if (questions.length < 2) return;
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQuestions(shuffled);
    for (let i = 0; i < shuffled.length; i++) {
      await supabase.from("questions").update({ sort_order: i } as any).eq("id", shuffled[i].id);
    }
    toast.success("השאלות עורבבו!");
  };

  const startEditing = (q: Question) => {
    setNewQ({ text: q.text, options: [...q.options], correctIndex: q.correctIndex, type: q.type, timeLimit: q.timeLimit, mediaUrl: q.mediaUrl || "", mediaType: q.mediaType || "none", imageViewTime: q.imageViewTime ?? 5, keepImage: q.keepImage ?? false });
    setEditingId(q.id);
    setShowForm(true);
    setShowBank(false);
  };

  const [showStartChoice, setShowStartChoice] = useState(false);

  const startGame = async (mode: "observer" | "player") => {
    if (!roomId || questions.length === 0) {
      toast.error("הוסף שאלות לפני תחילת המשחק");
      return;
    }
    
    if (mode === "player" && user) {
      // Do not update score/presence directly from the browser.
      const { error: joinError } = await supabase.from("room_players").insert({
        room_id: roomId,
        user_id: user.id,
        is_connected: true,
        score: 0,
      });

      if (joinError?.code === "23505") {
        const { error: presenceError } = await supabase.rpc("touch_room_presence", {
          _room_id: roomId,
          _is_connected: true,
        });
        if (presenceError) {
          toast.error("שגיאה בחיבור מחדש");
          return;
        }
      } else if (joinError) {
        toast.error("שגיאה בהצטרפות כמנחה-שחקן");
        return;
      }
    }

    await supabase.from("game_rooms").update({
      status: "playing",
      current_question_index: -1,
      current_phase: "idle",
      phase_started_at: null,
      phase_duration_seconds: 0,
    }).eq("id", roomId);
    navigate(`/game?room=${roomId}&host=1${mode === "observer" ? "&observe=1" : ""}`);
    setShowStartChoice(false);
  };

  const startTelephoneGame = async () => {
    if (!roomId || questions.length === 0) {
      toast.error("הוסף שאלות לפני תחילת המשחק");
      return;
    }
    await supabase.from("game_rooms").update({
      status: "playing",
      current_question_index: -1,
      current_phase: "idle",
      phase_started_at: null,
      phase_duration_seconds: 0,
    }).eq("id", roomId);
    navigate(`/telephone?room=${roomId}`);
  };

  const filteredBank = bankQuestions.filter((bq) => {
    const matchCategory = selectedCategory === "הכל" || bq.category === selectedCategory;
    const matchFolder = selectedBankFolder === "הכל" || bq.folder === selectedBankFolder || bq.folder.startsWith(selectedBankFolder + "/");
    const matchSearch = !bankSearch || bq.question_text.includes(bankSearch);
    return matchCategory && matchFolder && matchSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Room picker / create screen
  if (showRoomPicker) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center" dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg mx-4 space-y-6"
        >
          {/* Active rooms */}
          {activeRooms.length > 0 && (
            <div className="gradient-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-display text-lg font-bold text-foreground">חדרים פעילים</h2>
              <div className="space-y-3">
                {activeRooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3 border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground font-medium text-sm truncate">{(room as any).room_name || "ללא שם"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-display text-xs text-primary tracking-wider">{room.room_code}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          room.status === "playing"
                            ? "bg-answer-green/20 text-answer-green"
                            : "bg-accent/20 text-accent"
                        }`}>
                          {room.status === "playing" ? "משחק פעיל" : "ממתין"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mr-3">
                      {room.status === "playing" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/game?room=${room.id}&host=1&observe=1`)}
                          className="text-accent hover:text-accent"
                        >
                          <Eye className="w-3.5 h-3.5 ml-1" />
                          צפייה
                        </Button>
                      )}
                      <Button
                        variant="neon-outline"
                        size="sm"
                        onClick={() => {
                          window.history.replaceState(null, "", `/admin?room=${room.id}`);
                          window.location.reload();
                        }}
                      >
                        {room.status === "playing" ? "נהל" : "המשך"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveRoom(room.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create new room */}
          <div className="gradient-card border border-border rounded-2xl p-6 space-y-4">
            <div className="text-center">
              <h2 className="font-display text-lg font-bold text-foreground mb-1">
                {activeRooms.length > 0 ? "צור חדר חדש" : "יצירת חדר חדש"}
              </h2>
              <p className="text-muted-foreground text-sm">בחר שם למשחק שלך</p>
            </div>
            <Input
              placeholder="שם המשחק (לדוגמה: טריוויה חברתית)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="bg-secondary border-border text-center text-lg"
              autoFocus={activeRooms.length === 0}
            />
            <Button variant="neon" className="w-full" onClick={createRoom} disabled={!roomName.trim()}>
              <Play className="w-4 h-4" />
              צור חדר
            </Button>
          </div>

          <RosterUpload />

          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground text-sm w-full text-center block">
            חזרה לדף הבית
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            חזרה
          </button>
          <div className="text-center">
            <p className="font-display text-sm text-foreground mb-0.5">{roomName}</p>
            <p className="text-muted-foreground text-xs mb-1">קוד חדר</p>
            <div className="flex items-center gap-2">
              <p className="font-display text-2xl text-primary text-glow tracking-[0.2em]">{roomCode}</p>
              <button onClick={() => setShowQR(!showQR)} className="text-muted-foreground hover:text-primary">
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="neon-outline"
              size="sm"
              onClick={() => navigate("/admin/history")}
              title="היסטוריית משחקים"
            >
              <span className="text-base">🏆</span>
              היסטוריה
            </Button>
            <Button
              variant="neon-outline"
              size="sm"
              onClick={startTelephoneGame}
              disabled={questions.length === 0}
              title="משחק טלפוני - מסך גדול"
            >
              <span className="text-base">📞</span>
              משחק טלפוני
            </Button>
            <div className="relative">
              <Button variant="neon" size="sm" onClick={() => setShowStartChoice(!showStartChoice)} disabled={questions.length === 0}>
                <Play className="w-4 h-4" />
                התחל משחק
              </Button>
              {showStartChoice && (
                <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-xl p-3 space-y-2 shadow-lg z-50 min-w-[180px]">
                  <button
                    onClick={() => startGame("player")}
                    className="w-full text-sm text-foreground hover:bg-primary/10 rounded-lg px-3 py-2 text-right flex items-center gap-2"
                  >
                    <Play className="w-3.5 h-3.5 text-primary" />
                    משתתף + מנחה
                  </button>
                  <button
                    onClick={() => startGame("observer")}
                    className="w-full text-sm text-foreground hover:bg-accent/10 rounded-lg px-3 py-2 text-right flex items-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5 text-accent" />
                    צופה בלבד
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showQR && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex justify-center mb-8">
            <QRInvite roomCode={roomCode} />
          </motion.div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Questions list */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">שאלות ({questions.length})</h2>
              <div className="flex gap-2 flex-wrap">
                {questions.length > 0 && (
                  <>
                    <Button variant="neon-outline" size="sm" onClick={() => { setPreviewIdx(0); setShowPreview(true); }}>
                      <Eye className="w-4 h-4" />
                      תצוגה מקדימה
                    </Button>
                    <Button variant="neon-outline" size="sm" onClick={shuffleQuestions}>
                      <Shuffle className="w-4 h-4" />
                      ערבב
                    </Button>
                  </>
                )}
                <Button variant="neon-outline" size="sm" onClick={() => { setShowBank(!showBank); setShowForm(false); }}>
                  <BookOpen className="w-4 h-4" />
                  מאגר שאלות
                </Button>
                <Button variant="neon-outline" size="sm" onClick={() => { setEditingId(null); setShowForm(true); setShowBank(false); }}>
                  <Plus className="w-4 h-4" />
                  שאלה חדשה
                </Button>
              </div>
            </div>

            {/* Question Bank Panel */}
            <AnimatePresence>
              {showBank && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="gradient-card border border-accent/30 rounded-xl p-4 space-y-3 overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-accent" />
                    <h3 className="font-display text-sm text-accent">מאגר שאלות</h3>
                  </div>

                  {/* Search & filter */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="חיפוש..."
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        className="bg-secondary border-border pr-9 text-sm"
                      />
                    </div>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground"
                    >
                      <option value="הכל">כל הקטגוריות</option>
                      {bankCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      value={selectedBankFolder}
                      onChange={(e) => setSelectedBankFolder(e.target.value)}
                      className="bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground"
                    >
                      <option value="הכל">כל התיקיות</option>
                      {bankFolders.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bank questions list */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {filteredBank.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">לא נמצאו שאלות</p>
                    ) : (
                      filteredBank.map((bq) => (
                        <div key={bq.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${bq.question_type === "survey" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}`}>
                                {bq.question_type === "survey" ? "סקר" : "טריוויה"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{bq.category}</span>
                            </div>
                            <p className="text-sm text-foreground truncate">{bq.question_text}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => addFromBank(bq)}
                            className="text-primary hover:text-primary mr-2 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            הוסף
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Existing questions */}
            <div className="grid sm:grid-cols-2 gap-4 items-start">
            {questions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                onDragEnd={handleDragEnd}
                className={`gradient-card border rounded-xl p-4 group cursor-grab active:cursor-grabbing transition-all ${
                  dragOverIdx === i && dragIdx !== i ? "border-primary border-2" : "border-border"
                } ${dragIdx === i ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                    <span className="text-xs font-display text-primary">#{i + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${q.type === "survey" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}`}>
                      {q.type === "survey" ? "סקר" : "טריוויה"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{q.timeLimit} שנ׳</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setPreviewIdx(i); setShowPreview(true); }} className="text-muted-foreground hover:text-accent p-1" title="תצוגה מקדימה"><Eye className="w-3.5 h-3.5" /></button>
                    <button onClick={() => saveQuestionToBank(q)} className="text-muted-foreground hover:text-accent p-1" title="שמור למאגר"><Save className="w-3.5 h-3.5" /></button>
                    <button onClick={() => duplicateQuestion(q, i)} className="text-muted-foreground hover:text-primary p-1" title="שכפל שאלה"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => startEditing(q)} className="text-muted-foreground hover:text-primary p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteQuestion(q.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <p className="text-foreground font-medium mb-2">{q.text}</p>
                {q.mediaUrl && q.mediaType === "image" && (
                  <img src={q.mediaUrl} alt="" className="w-full max-h-32 object-contain rounded-lg mb-2" />
                )}
                {q.mediaUrl && q.mediaType === "video" && (
                  <div className="flex items-center gap-2 text-xs text-accent mb-2">
                    <Video className="w-3.5 h-3.5" />
                    <span>סרטון מצורף</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, j) => (
                    <div key={j} className={`text-xs px-3 py-2 rounded-lg ${j === q.correctIndex && q.type === "trivia" ? "bg-answer-green/20 text-answer-green border border-answer-green/30" : "bg-secondary text-muted-foreground"}`}>
                      {opt}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
            </div>


            {/* New question form */}
            {showForm && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="gradient-card border border-primary/30 rounded-xl p-6 space-y-4">
                <h3 className="font-display text-sm text-primary">{editingId ? "עריכת שאלה" : "שאלה חדשה"}</h3>
                <div className="flex gap-2 mb-2">
                  {(["trivia", "survey"] as const).map((t) => (
                    <button key={t} onClick={() => setNewQ((p) => ({ ...p, type: t }))} className={`text-xs px-3 py-1.5 rounded-full font-display ${newQ.type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {t === "trivia" ? "טריוויה" : "סקר"}
                    </button>
                  ))}
                </div>
                <Input placeholder="טקסט השאלה..." value={newQ.text} onChange={(e) => setNewQ((p) => ({ ...p, text: e.target.value }))} className="bg-secondary border-border" />
                <div className="grid grid-cols-2 gap-2">
                  {newQ.options.map((opt, j) => (
                    <div key={j} className="relative">
                      <Input placeholder={`תשובה ${j + 1}`} value={opt} onChange={(e) => { const opts = [...newQ.options]; opts[j] = e.target.value; setNewQ((p) => ({ ...p, options: opts })); }} className="bg-secondary border-border" />
                      {newQ.type === "trivia" && (
                        <button onClick={() => setNewQ((p) => ({ ...p, correctIndex: j }))} className={`absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 ${newQ.correctIndex === j ? "bg-answer-green border-answer-green" : "border-muted-foreground"}`} />
                      )}
                    </div>
                  ))}
                </div>
                {/* Media upload */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">מדיה (תמונה / סרטון)</label>
                  {newQ.mediaUrl ? (
                    <>
                      <div className="flex items-center gap-3 bg-secondary rounded-lg p-3">
                        {newQ.mediaType === "image" ? (
                          <img src={newQ.mediaUrl} alt="" className="w-16 h-16 object-cover rounded" />
                        ) : (
                          <div className="w-16 h-16 bg-accent/20 rounded flex items-center justify-center">
                            <Video className="w-6 h-6 text-accent" />
                          </div>
                        )}
                        <span className="text-xs text-foreground flex-1 truncate">{newQ.mediaType === "image" ? "תמונה" : "סרטון"}</span>
                        <button onClick={() => setNewQ((p) => ({ ...p, mediaUrl: "", mediaType: "none" }))} className="text-destructive hover:text-destructive/80">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {newQ.mediaType === "image" && (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-muted-foreground">זמן צפייה בתמונה:</label>
                            <Input type="number" min={1} max={30} value={newQ.imageViewTime} onChange={(e) => setNewQ((p) => ({ ...p, imageViewTime: Number(e.target.value) }))} className="w-20 bg-secondary border-border text-center" />
                            <span className="text-xs text-muted-foreground">שניות</span>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input type="checkbox" checked={newQ.keepImage} onChange={(e) => setNewQ((p) => ({ ...p, keepImage: e.target.checked }))} className="accent-primary" />
                            השאר תמונה בזמן הצגת השאלות
                          </label>
                        </div>
                      )}
                    </>
                  ) : (
                    <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{uploading ? "מעלה..." : "העלה תמונה או סרטון"}</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleMediaUpload(file);
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">זמן:</label>
                  <Input type="number" min={5} max={60} value={newQ.timeLimit} onChange={(e) => setNewQ((p) => ({ ...p, timeLimit: Number(e.target.value) }))} className="w-20 bg-secondary border-border text-center" />
                  <span className="text-xs text-muted-foreground">שניות</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="neon" size="sm" onClick={addOrUpdateQuestion}>{editingId ? "עדכן" : "הוסף"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>ביטול</Button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            {roomId && <InvitePlayers roomId={roomId} roomCode={roomCode} />}
            {roomId && <ConnectedPlayers roomId={roomId} canRemove />}

            {/* Settings */}
            <div className="gradient-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-primary" />
                <h3 className="font-display text-sm text-foreground">הגדרות ניקוד</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">נכונות ({correctWeight}%)</label>
                  <input type="range" min={0} max={100} value={correctWeight} onChange={(e) => setCorrectWeight(Number(e.target.value))} className="w-full accent-primary" />
                </div>
                <div><label className="text-xs text-muted-foreground">מהירות ({100 - correctWeight}%)</label></div>
                <div className="pt-2 border-t border-border">
                  <label className="text-xs text-muted-foreground">זמן ברירת מחדל</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={5} max={60} value={defaultTimeLimit} onChange={(e) => setDefaultTimeLimit(Number(e.target.value))} className="w-20 bg-secondary border-border text-center" />
                    <span className="text-xs text-muted-foreground">שנ׳</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="gradient-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="font-display text-sm text-foreground">תצוגת דירוג</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">הצג דירוג כל</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={1} value={showEvery} onChange={(e) => setShowEvery(Number(e.target.value))} className="w-20 bg-secondary border-border text-center" />
                    <span className="text-xs text-muted-foreground">שאלות</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-border">
                  <label className="text-xs text-muted-foreground">זמן הצגת תוצאת תשובה</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={1} max={60} value={resultDisplaySeconds} onChange={(e) => setResultDisplaySeconds(Number(e.target.value))} className="w-20 bg-secondary border-border text-center" />
                    <span className="text-xs text-muted-foreground">שנ׳</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-border">
                  <label className="text-xs text-muted-foreground">זמן הצגת דירוג</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={1} max={60} value={leaderboardDisplaySeconds} onChange={(e) => setLeaderboardDisplaySeconds(Number(e.target.value))} className="w-20 bg-secondary border-border text-center" />
                    <span className="text-xs text-muted-foreground">שנ׳</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Settings */}
            <div className="gradient-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Music className="w-4 h-4 text-primary" />
                <h3 className="font-display text-sm text-foreground">הגדרות מוזיקה</h3>
              </div>
              <div className="space-y-3">
                <AudioUploadField label="מוזיקת רקע" url={bgMusicUrl} uploading={uploadingAudio === "bg"} onUpload={(f) => handleAudioUpload(f, "bg")} onRemove={() => setBgMusicUrl("")} />
                <AudioUploadField label="צליל תשובה נכונה" url={correctSoundUrl} uploading={uploadingAudio === "correct"} onUpload={(f) => handleAudioUpload(f, "correct")} onRemove={() => setCorrectSoundUrl("")} />
                <AudioUploadField label="צליל תשובה שגויה" url={wrongSoundUrl} uploading={uploadingAudio === "wrong"} onUpload={(f) => handleAudioUpload(f, "wrong")} onRemove={() => setWrongSoundUrl("")} />
                <AudioUploadField label="מוזיקת סיום משחק" url={endMusicUrl} uploading={uploadingAudio === "end"} onUpload={(f) => handleAudioUpload(f, "end")} onRemove={() => setEndMusicUrl("")} />
              </div>
            </div>

            {/* Game Templates */}
            <div className="gradient-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="w-4 h-4 text-primary" />
                <h3 className="font-display text-sm text-foreground">תבניות משחק</h3>
              </div>
              <div className="space-y-3">
                {/* Save current as template */}
                {questions.length > 0 && (
                  <div className="space-y-2">
                    <Input
                      placeholder="שם התבנית..."
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="bg-secondary border-border text-sm"
                    />
                    <Button variant="neon-outline" size="sm" className="w-full" onClick={saveAsTemplate} disabled={!templateName.trim()}>
                      <Save className="w-3.5 h-3.5" />
                      שמור כתבנית
                    </Button>
                  </div>
                )}
                {/* Load template */}
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowTemplates(!showTemplates)}>
                  <FolderOpen className="w-3.5 h-3.5" />
                  טען תבנית קיימת
                </Button>
                <AnimatePresence>
                  {showTemplates && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                      {gameTemplates.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">אין תבניות שמורות</p>
                      ) : (
                        gameTemplates.map((t: any) => (
                          <div key={t.id} className="flex items-center gap-1">
                            <button
                              onClick={() => loadFromTemplate(t)}
                              className="flex-1 text-right bg-secondary/50 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                            >
                              <p className="font-medium text-xs">{t.template_name}</p>
                              <p className="text-[10px] text-muted-foreground">{(t.questions as any[])?.length || 0} שאלות</p>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); duplicateTemplate(t); }}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="שכפל תבנית"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="מחק תבנית"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question preview modal — mirrors the live telephone game screen */}
      <AnimatePresence>
        {showPreview && questions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-6xl rounded-3xl overflow-hidden border border-primary/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              {(() => {
                const idx = Math.min(previewIdx, questions.length - 1);
                const q = questions[idx];
                const isSurvey = q.type === "survey";
                const phase = previewPhase === "result" ? (isSurvey ? "survey-result" : "result") : "answering";
                // demo distribution so the result view looks like the real thing
                const base = [4, 3, 2, 1];
                const votes = q.options.map((_, j) => base[(j - (q.correctIndex ?? 0) + 4) % 4]);
                const correct = votes[q.correctIndex ?? 0] ?? 0;
                const wrong = votes.reduce((a, b) => a + b, 0) - correct;
                return (
                  <div className="relative bg-gradient-to-br from-[#05060f] via-[#0a0d24] to-[#100926] text-white flex flex-col px-4 md:px-8 py-4 h-[78vh]">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-600/20 blur-3xl" />
                      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-3xl" />
                    </div>

                    {/* Header — same layout as the game */}
                    <div className="relative shrink-0 flex items-center justify-between mb-2 md:mb-3 gap-3 flex-wrap">
                      <div className="text-xl font-display text-white/60">
                        שאלה <span className="text-white font-bold">{idx + 1}</span> / {questions.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewPhase("answering")}
                          className={`px-4 py-2 rounded-xl border font-display text-sm transition-colors ${previewPhase === "answering" ? "bg-cyan-500/30 border-cyan-400/60 text-cyan-100" : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20"}`}
                        >
                          שלב מענה
                        </button>
                        <button
                          onClick={() => setPreviewPhase("result")}
                          className={`px-4 py-2 rounded-xl border font-display text-sm transition-colors ${previewPhase === "result" ? "bg-fuchsia-500/30 border-fuchsia-400/60 text-fuchsia-100" : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20"}`}
                        >
                          שלב תוצאות
                        </button>
                        <button onClick={() => setShowPreview(false)} className="p-2 rounded-xl bg-white/10 border border-white/20 text-white/70 hover:bg-white/20">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-cyan-400/40 rounded-2xl px-4 py-2">
                        <span className="font-mono text-2xl md:text-3xl font-black text-cyan-300">{previewPhase === "result" ? votes.reduce((a, b) => a + b, 0) : 0}</span>
                        <span className="text-xl md:text-2xl text-white/70 font-display">/ 10</span>
                        <span className="mr-1 text-base md:text-lg text-white/80 font-display">ענו</span>
                      </div>
                    </div>

                    <TelephoneQuestionStage
                      question={q as any}
                      phase={phase}
                      timeLeft={q.timeLimit}
                      totalTime={q.timeLimit}
                      voteCounts={previewPhase === "result" ? votes : q.options.map(() => 0)}
                      correctCount={correct}
                      wrongCount={wrong}
                    />

                    <div className="relative shrink-0 mt-3 flex items-center justify-between gap-2">
                      <Button variant="neon-outline" size="sm" disabled={previewIdx === 0} onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}>
                        הקודמת
                      </Button>
                      <span className="text-xs text-white/50 font-display">תצוגה מקדימה — זהה למסך המשחק</span>
                      <Button variant="neon-outline" size="sm" disabled={previewIdx >= questions.length - 1} onClick={() => setPreviewIdx((i) => Math.min(questions.length - 1, i + 1))}>
                        הבאה
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
