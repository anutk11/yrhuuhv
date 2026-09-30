import { useState, useEffect, useRef, useCallback, DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Plus, Search, Trash2, Edit2, FolderPlus, Folder, FolderOpen, BookOpen, Upload, Video, X, Save, FileSpreadsheet, ChevronLeft, ChevronDown, GripVertical, AlertTriangle, Tag, Copy, Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Papa from "papaparse";
import AIQuestionGenerator from "@/components/game/AIQuestionGenerator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BankQuestion {
  id: string;
  category: string;
  folder: string;
  question_text: string;
  options: string[];
  correct_index: number;
  question_type: string;
  time_limit: number;
  media_url?: string | null;
  media_type?: string | null;
  image_view_time: number;
  keep_image: boolean;
  bank_scope: "private" | "central";
  owner_id: string | null;
  source_question_id?: string | null;
}

/* ─── Folder tree helpers ─── */
interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  questionCount: number;
}
interface PersistedFolder {
  path: string;
  scope: "private" | "central";
}

const SEPARATOR = "/";

function buildFolderTree(folderPaths: string[], questions: BankQuestion[]): FolderNode[] {
  const root: FolderNode[] = [];
  const pathSet = new Set(folderPaths);

  // Ensure parent paths exist
  for (const p of folderPaths) {
    const parts = p.split(SEPARATOR);
    for (let i = 1; i < parts.length; i++) {
      pathSet.add(parts.slice(0, i).join(SEPARATOR));
    }
  }

  const sorted = [...pathSet].sort((a, b) => a.localeCompare(b, "he"));

  const findOrCreate = (nodes: FolderNode[], parts: string[], depth: number, fullPath: string): FolderNode => {
    let node = nodes.find((n) => n.name === parts[depth]);
    if (!node) {
      const currentPath = parts.slice(0, depth + 1).join(SEPARATOR);
      node = { name: parts[depth], path: currentPath, children: [], questionCount: 0 };
      nodes.push(node);
    }
    if (depth < parts.length - 1) {
      return findOrCreate(node.children, parts, depth + 1, fullPath);
    }
    return node;
  };

  for (const p of sorted) {
    const parts = p.split(SEPARATOR);
    findOrCreate(root, parts, 0, p);
  }

  // Count questions per exact folder
  for (const q of questions) {
    const countInNode = (nodes: FolderNode[]) => {
      for (const n of nodes) {
        if (q.folder === n.path) n.questionCount++;
        countInNode(n.children);
      }
    };
    countInNode(root);
  }

  return root;
}

function getAllDescendantPaths(node: FolderNode): string[] {
  let paths = [node.path];
  for (const child of node.children) {
    paths = paths.concat(getAllDescendantPaths(child));
  }
  return paths;
}

/* ─── Folder tree component ─── */
const FolderTreeItem = ({
  node, selectedFolder, onSelect, onDelete, depth = 0,
  onDragOver, onDrop, dragOverFolder,
}: {
  node: FolderNode;
  selectedFolder: string;
  onSelect: (path: string) => void;
  onDelete: (node: FolderNode) => void;
  depth?: number;
  onDragOver: (e: DragEvent, path: string) => void;
  onDrop: (e: DragEvent, path: string) => void;
  dragOverFolder: string | null;
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedFolder === node.path;
  const isDragOver = dragOverFolder === node.path;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-xs font-display transition-colors group ${
          isSelected ? "bg-primary text-primary-foreground" : isDragOver ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`}
        style={{ paddingRight: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.path)}
        onDragOver={(e) => onDragOver(e, node.path)}
        onDrop={(e) => onDrop(e, node.path)}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="p-0.5">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {isSelected ? <FolderOpen className="w-3.5 h-3.5 shrink-0" /> : <Folder className="w-3.5 h-3.5 shrink-0" />}
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-[10px] opacity-60">{node.questionCount}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node); }}
          className={`p-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? "text-primary-foreground hover:text-destructive" : "text-muted-foreground hover:text-destructive"}`}
          title="מחק תיקייה"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.path}
              node={child}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
              onDelete={onDelete}
              depth={depth + 1}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragOverFolder={dragOverFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main Component ─── */
const QuestionBank = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [persistedFolders, setPersistedFolders] = useState<PersistedFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("הכל");
  const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
  const [searchText, setSearchText] = useState("");
  const [bankView, setBankView] = useState<"all" | "private" | "central">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderNode | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [parentForNewFolder, setParentForNewFolder] = useState<string>("");
  const [showAI, setShowAI] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [newQ, setNewQ] = useState({
    question_text: "",
    options: ["", "", "", ""],
    correct_index: 0,
    question_type: "trivia" as string,
    time_limit: 15,
    category: "כללי",
    folder: "כללי",
    media_url: "" as string,
    media_type: "none" as string,
    image_view_time: 5,
    keep_image: false,
  });

  useEffect(() => {
    void loadQuestions();
    void loadPersistedFolders();
  }, []);

  const loadPersistedFolders = async () => {
    const { data } = await supabase.from("question_folders").select("path").order("path");
    if (data) {
      setPersistedFolders(data.map((row) => ({
        path: row.path,
        scope: row.scope === "central" ? "central" : "private",
      })).filter((row) => row.path));
    }
  };

  const loadQuestions = async () => {
    // Fetch all questions (Supabase defaults to 1000 rows)
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from("question_bank")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const qs = allData.map((q: any) => ({
      ...q,
      options: (q.options as string[]) || [],
      folder: q.folder || "כללי",
      bank_scope: q.bank_scope === "central" ? "central" : "private",
      owner_id: q.owner_id || null,
    }));
    setQuestions(qs);
  };

  const scopedQuestions: BankQuestion[] = questions.filter((q) => bankView === "all" || q.bank_scope === bankView);
  const visiblePersistedFolders = persistedFolders
    .filter((folder) => bankView === "all" || folder.scope === bankView)
    .map((folder) => folder.path);
  const folderPaths = [...new Set([
    ...visiblePersistedFolders,
    ...scopedQuestions.map((q) => q.folder),
  ])];
  const folderTree = buildFolderTree(folderPaths, scopedQuestions);
  const allCategories = [...new Set(scopedQuestions.map((q) => q.category))].sort((a, b) => a.localeCompare(b, "he"));

  const handleMediaUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("question-media").upload(path, file);
    if (error) { toast.error("שגיאה בהעלאת קובץ"); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("question-media").getPublicUrl(path);
    const isVideo = file.type.startsWith("video/");
    setNewQ((p) => ({ ...p, media_url: urlData.publicUrl, media_type: isVideo ? "video" : "image" }));
    setUploading(false);
  };

  const saveQuestion = async () => {
    if (!newQ.question_text.trim() || newQ.options.some((o) => !o.trim()) || !user) return;
    const editingQuestion = editingId ? questions.find((q) => q.id === editingId) : null;
    const editingCentral = !!editingQuestion && editingQuestion.bank_scope === "central";
    if (editingCentral && !isAdmin) {
      toast.error("רק מנהל יכול לערוך שאלה מרכזית");
      return;
    }

    const payload = {
      question_text: newQ.question_text,
      options: newQ.options,
      correct_index: newQ.correct_index,
      question_type: newQ.question_type,
      time_limit: newQ.time_limit,
      category: newQ.category,
      folder: newQ.folder,
      media_url: newQ.media_url || null,
      media_type: newQ.media_type || "none",
      image_view_time: newQ.image_view_time,
      keep_image: newQ.keep_image,
      created_by: (editingCentral || (!editingId && bankView === "central" && isAdmin)) ? user.id : user.id,
      bank_scope: editingCentral || (!editingId && bankView === "central" && isAdmin) ? "central" : "private",
      owner_id: editingCentral || (!editingId && bankView === "central" && isAdmin) ? null : user.id,
      source_question_id: editingCentral ? (editingQuestion?.source_question_id ?? null) : null,
    };
    if (editingId) {
      const { created_by, bank_scope, owner_id, source_question_id, ...updatePayload } = payload;
      const { error } = await supabase.from("question_bank").update(updatePayload as any).eq("id", editingId);
      if (error) { toast.error("שגיאה בעדכון"); return; }
      toast.success("השאלה עודכנה");
    } else {
      const { error } = await supabase.from("question_bank").insert(payload as any);
      if (error) { toast.error("שגיאה בשמירה"); return; }
      toast.success("השאלה נשמרה למאגר");
    }
    setEditingId(null);
    setShowForm(false);
    resetForm();
    loadQuestions();
  };

  const publishToCentral = async (q: BankQuestion) => {
    if (!user || !isAdmin || q.bank_scope !== "private") return;
    const { error } = await supabase.from("question_bank").insert({
      created_by: user.id,
      owner_id: null,
      bank_scope: "central",
      source_question_id: q.id,
      question_text: q.question_text,
      options: q.options,
      correct_index: q.correct_index,
      question_type: q.question_type,
      time_limit: q.time_limit,
      category: q.category,
      folder: q.folder,
      media_url: q.media_url || null,
      media_type: q.media_type || "none",
      image_view_time: q.image_view_time ?? 5,
      keep_image: q.keep_image ?? false,
    } as any);
    if (error) {
      toast.error(error.code === "23505" ? "השאלה כבר פורסמה למרכז" : "שגיאה בפרסום למאגר המרכזי");
      return;
    }
    toast.success("השאלה פורסמה במאגר המרכזי");
    loadQuestions();
  };

  const deleteQuestion = async (id: string) => {
    const q = questions.find((item) => item.id === id);
    if (!q) return;
    if (q.bank_scope === "central" && !isAdmin) {
      toast.error("רק מנהל יכול למחוק שאלה מהמאגר המרכזי");
      return;
    }
    if (!confirm("למחוק שאלה זו מהמאגר?")) return;
    const { error } = await supabase.from("question_bank").delete().eq("id", id);
    if (error) {
      toast.error("שגיאה במחיקת השאלה");
      return;
    }
    setQuestions((prev) => prev.filter((item) => item.id !== id));
    toast.success("השאלה נמחקה");
  };

  const duplicateBankQuestion = async (q: BankQuestion) => {
    if (!user) return;
    const { error } = await supabase.from("question_bank").insert({
      created_by: user.id,
      owner_id: user.id,
      bank_scope: "private",
      source_question_id: q.bank_scope === "central" ? q.id : (q.source_question_id || null),
      question_text: q.question_text,
      options: q.options,
      correct_index: q.correct_index,
      question_type: q.question_type,
      time_limit: q.time_limit,
      category: q.category,
      folder: q.folder,
      media_url: q.media_url || null,
      media_type: q.media_type || "none",
      image_view_time: q.image_view_time ?? 5,
      keep_image: q.keep_image ?? false,
    } as any);
    if (error) { toast.error("שגיאה בשכפול"); return; }
    toast.success("השאלה שוכפלה");
    loadQuestions();
  };

  const startEditing = (q: BankQuestion) => {
    if (q.bank_scope === "central" && !isAdmin) {
      toast.error("שאלות במאגר המרכזי ניתנות לעריכה רק למנהל");
      return;
    }
    setNewQ({
      question_text: q.question_text,
      options: [...q.options],
      correct_index: q.correct_index,
      question_type: q.question_type,
      time_limit: q.time_limit,
      category: q.category,
      folder: q.folder,
      media_url: q.media_url || "",
      media_type: q.media_type || "none",
      image_view_time: q.image_view_time ?? 5,
      keep_image: q.keep_image ?? false,
    });
    setEditingId(q.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setNewQ({
      question_text: "", options: ["", "", "", ""], correct_index: 0,
      question_type: "trivia", time_limit: 15, category: "כללי",
      folder: selectedFolder === "הכל" ? "כללי" : selectedFolder,
      media_url: "", media_type: "none", image_view_time: 5, keep_image: false,
    });
  };

  const createFolder = () => {
    if (!newFolderName.trim() || !user) return;
    const name = newFolderName.trim();
    const fullPath = parentForNewFolder ? parentForNewFolder + SEPARATOR + name : name;
    const scope = bankView === "central" && isAdmin ? "central" : "private";
    const ownerId = scope === "central" ? null : user.id;
    void supabase.from("question_folders")
      .insert({ path: fullPath, created_by: user.id, owner_id: ownerId, scope } as any)
      .then(({ error }) => {
        if (error) {
          toast.error("שגיאה ביצירת התיקייה");
          return;
        }
        setPersistedFolders((prev) => prev.some((folder) => folder.path === fullPath && folder.scope === scope)
          ? prev
          : [...prev, { path: fullPath, scope }]);
        setSelectedFolder(fullPath);
        toast.success(`התיקייה "${name}" נוצרה`);
      });
    setNewFolderName("");
    setShowNewFolder(false);
    setParentForNewFolder("");
  };

  /* ─── Delete folder ─── */
  const confirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    const paths = getAllDescendantPaths(deletingFolder);
    if (!isAdmin && bankView === "central") {
      toast.error("אי אפשר למחוק תיקייה מהמאגר המרכזי");
      return;
    }
    const deletingScope = bankView === "central" && isAdmin ? "central" : "private";
    const affectedQuestions = questions.filter((q) => paths.includes(q.folder) && q.bank_scope === deletingScope);
    if (affectedQuestions.length > 0) {
      const { error } = await supabase.from("question_bank").delete().in("id", affectedQuestions.map((q) => q.id));
      if (error) { toast.error("שגיאה במחיקת התיקייה"); return; }
    }
    const { error: folderError } = await supabase.from("question_folders").delete().in("path", paths).eq("scope", deletingScope);
    if (folderError) {
      toast.error("שגיאה במחיקת התיקייה");
      return;
    }
    toast.success(`התיקייה "${deletingFolder.name}" ו-${affectedQuestions.length} שאלות נמחקו`);
    if (paths.includes(selectedFolder)) setSelectedFolder("הכל");
    setPersistedFolders((prev) => prev.filter((folder) => !(paths.includes(folder.path) && folder.scope === deletingScope)));
    setDeletingFolder(null);
    void loadQuestions();
  };

  /* ─── Delete category ─── */
  const confirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    const affected = questions.filter((q) => q.category === deletingCategory);
    if (affected.length > 0) {
      const { error } = await supabase.from("question_bank").delete().in("id", affected.map((q) => q.id));
      if (error) { toast.error("שגיאה במחיקת הקטגוריה"); return; }
    }
    toast.success(`הקטגוריה "${deletingCategory}" ו-${affected.length} שאלות נמחקו`);
    if (selectedCategory === deletingCategory) setSelectedCategory("הכל");
    setDeletingCategory(null);
    loadQuestions();
  };


  /* ─── Drag & Drop ─── */
  const handleDragStart = (e: DragEvent, questionId: string) => {
    e.dataTransfer.setData("questionId", questionId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDragOver = useCallback((e: DragEvent, folderPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolder(folderPath);
  }, []);

  const handleFolderDrop = useCallback(async (e: DragEvent, targetFolder: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const questionId = e.dataTransfer.getData("questionId");
    if (!questionId) return;

    const q = questions.find((q) => q.id === questionId);
    if (!q || q.folder === targetFolder) return;

    const { error } = await supabase.from("question_bank").update({ folder: targetFolder } as any).eq("id", questionId);
    if (error) { toast.error("שגיאה בהעברת השאלה"); return; }
    toast.success(`השאלה הועברה ל"${targetFolder}"`);
    loadQuestions();
  }, [questions]);

  /* ─── CSV Import ─── */
  const handleCsvImport = (file: File) => {
    if (!user) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        const payload: any[] = [];
        let skipped = 0;

        for (const row of rows) {
          const text = String(row["question"] || row["שאלה"] || row["question_text"] || "").trim();
          if (!text) { skipped++; continue; }
          const options = [
            row["option1"] || row["תשובה1"] || row["a"] || "",
            row["option2"] || row["תשובה2"] || row["b"] || "",
            row["option3"] || row["תשובה3"] || row["c"] || "",
            row["option4"] || row["תשובה4"] || row["d"] || "",
          ].map((o) => String(o).trim()).filter((o) => o.length > 0);
          if (options.length < 2) { skipped++; continue; }

          const type = String(row["type"] || row["סוג"] || "trivia").toLowerCase().includes("survey") ? "survey" : "trivia";

          const rawCorrect = parseInt(String(row["correct"] ?? row["correct_index"] ?? row["תשובה_נכונה"] ?? "0"), 10);
          if (type === "trivia" && (Number.isNaN(rawCorrect) || rawCorrect < 0 || rawCorrect > options.length - 1)) {
            skipped++;
            continue;
          }

          const rawTime = parseInt(String(row["time_limit"] ?? row["זמן"] ?? "15"), 10);
          const timeLimit = Number.isNaN(rawTime) || rawTime <= 0 ? 15 : rawTime;

          payload.push({
            created_by: user.id,
            owner_id: user.id,
            bank_scope: "private",
            source_question_id: null,
            question_text: text,
            options,
            correct_index: type === "survey" ? -1 : rawCorrect,
            question_type: type,
            time_limit: timeLimit,
            folder: String(row["folder"] || row["תיקייה"] || (selectedFolder === "הכל" ? "כללי" : selectedFolder)),
            category: String(row["category"] || row["קטגוריה"] || "כללי"),
          });
        }

        if (payload.length === 0) {
          toast.error("לא נמצאו שאלות תקינות בקובץ");
          return;
        }

        const CHUNK = 200;
        let imported = 0;
        for (let i = 0; i < payload.length; i += CHUNK) {
          const slice = payload.slice(i, i + CHUNK);
          const { error } = await supabase.from("question_bank").insert(slice as any);
          if (error) {
            toast.error(`שגיאה בייבוא: ${error.message}`);
            break;
          }
          imported += slice.length;
        }

        if (imported > 0) {
          toast.success(`יובאו ${imported} שאלות בהצלחה!${skipped > 0 ? ` (${skipped} שורות דולגו)` : ""}`);
        }
        loadQuestions();
      },
      error: () => toast.error("שגיאה בקריאת הקובץ"),
    });
  };

  /* ─── Filtered questions ─── */
  const filtered = scopedQuestions.filter((q) => {
    const matchFolder = selectedFolder === "הכל" || q.folder === selectedFolder || q.folder.startsWith(selectedFolder + SEPARATOR);
    const matchCategory = selectedCategory === "הכל" || q.category === selectedCategory;
    const matchSearch = !searchText || q.question_text.includes(searchText);
    return matchFolder && matchCategory && matchSearch;
  });

  /* ─── All folder paths for the folder selector in form ─── */
  const allFolderPaths = [...new Set([...folderPaths, selectedFolder === "הכל" ? "כללי" : selectedFolder])].sort((a, b) => a.localeCompare(b, "he"));

  return (
    <div className="min-h-screen gradient-hero" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          {([
            ["all", "כל השאלות"],
            ["private", "המאגר שלי"],
            ["central", "המאגר המרכזי"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setBankView(value); setSelectedFolder("הכל"); setSelectedCategory("הכל"); }}
              className={`px-4 py-2 rounded-xl text-sm font-display border transition-colors ${bankView === value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            חזרה
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="font-display text-xl font-bold text-foreground">מאגר שאלות</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="neon-outline" size="sm" onClick={() => csvInputRef.current?.click()}>
              <FileSpreadsheet className="w-4 h-4" />
              ייבוא CSV
            </Button>
            <input ref={csvInputRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); e.target.value = ""; }}
            />
            <Button variant="neon-outline" size="sm" onClick={() => setShowAI(true)} disabled={bankView === "central" && !isAdmin}>
              <Sparkles className="w-4 h-4" />
              מחולל AI
            </Button>
            <Button variant="neon" size="sm" onClick={() => { setEditingId(null); resetForm(); setShowForm(true); }} disabled={bankView === "central" && !isAdmin}>
              <Plus className="w-4 h-4" />
              שאלה חדשה
            </Button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* ─── Sidebar: Folder Tree ─── */}
          <div className="w-56 shrink-0 space-y-2">
            <div
              onClick={() => setSelectedFolder("הכל")}
              onDragOver={(e) => { e.preventDefault(); }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs font-display transition-colors ${
                selectedFolder === "הכל" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="flex-1">הכל</span>
              <span className="text-[10px] opacity-60">{scopedQuestions.length}</span>
            </div>

            {folderTree.map((node) => (
              <FolderTreeItem
                key={node.path}
                node={node}
                selectedFolder={selectedFolder}
                onSelect={setSelectedFolder}
                onDelete={(n) => setDeletingFolder(n)}
                onDragOver={handleFolderDragOver}
                onDrop={handleFolderDrop}
                dragOverFolder={dragOverFolder}
              />
            ))}

            {/* New folder */}
            {showNewFolder ? (
              <div className="space-y-1 px-2">
                {parentForNewFolder && (
                  <span className="text-[10px] text-muted-foreground">בתוך: {parentForNewFolder}</span>
                )}
                <div className="flex items-center gap-1">
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="שם תיקייה..."
                    className="h-7 text-xs bg-secondary border-border"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && createFolder()}
                  />
                  <button onClick={createFolder} className="text-primary text-xs">✓</button>
                  <button onClick={() => { setShowNewFolder(false); setParentForNewFolder(""); }} className="text-muted-foreground text-xs">✗</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <button
                  onClick={() => { setParentForNewFolder(""); setShowNewFolder(true); }}
                  className="text-xs px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-1 w-full"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  תיקייה חדשה
                </button>
                {selectedFolder !== "הכל" && (
                  <button
                    onClick={() => { setParentForNewFolder(selectedFolder); setShowNewFolder(true); }}
                    className="text-xs px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-1 w-full"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    תת-תיקייה ב"{selectedFolder.split(SEPARATOR).pop()}"
                  </button>
                )}
              </div>
            )}

            {/* ─── Categories section ─── */}
            <div className="border-t border-border mt-3 pt-3">
              <p className="text-[10px] text-muted-foreground font-display uppercase tracking-wider px-2 mb-1">קטגוריות</p>
              <div
                onClick={() => setSelectedCategory("הכל")}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs font-display transition-colors ${
                  selectedCategory === "הכל" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="flex-1">כל הקטגוריות</span>
                <span className="text-[10px] opacity-60">{questions.length}</span>
              </div>
              {allCategories.map((cat) => {
                const count = questions.filter((q) => q.category === cat).length;
                return (
                  <div
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs font-display transition-colors ${
                      selectedCategory === cat ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate">{cat}</span>
                    <span className="text-[10px] opacity-60">{count}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingCategory(cat); }}
                      className={`p-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${selectedCategory === cat ? "text-accent-foreground hover:text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                      title="מחק קטגוריה"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Main content ─── */}
          <div className="flex-1 min-w-0">
            {/* Search */}
            <div className="relative mb-6">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="חיפוש שאלות..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="bg-secondary border-border pr-10" />
            </div>

            {/* Question Form */}
            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="gradient-card border border-primary/30 rounded-xl p-6 space-y-4 mb-6 overflow-hidden"
                >
                  <h3 className="font-display text-sm text-primary">{editingId ? "עריכת שאלה" : "שאלה חדשה למאגר"}</h3>

                  <div className="flex gap-2">
                    {(["trivia", "survey"] as const).map((t) => (
                      <button key={t} onClick={() => setNewQ((p) => ({ ...p, question_type: t }))} className={`text-xs px-3 py-1.5 rounded-full font-display ${newQ.question_type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {t === "trivia" ? "טריוויה" : "סקר"}
                      </button>
                    ))}
                  </div>

                  <Input placeholder="טקסט השאלה..." value={newQ.question_text} onChange={(e) => setNewQ((p) => ({ ...p, question_text: e.target.value }))} className="bg-secondary border-border" />

                  <div className="grid grid-cols-2 gap-2">
                    {newQ.options.map((opt, j) => (
                      <div key={j} className="relative">
                        <Input placeholder={`תשובה ${j + 1}`} value={opt} onChange={(e) => { const opts = [...newQ.options]; opts[j] = e.target.value; setNewQ((p) => ({ ...p, options: opts })); }} className="bg-secondary border-border" />
                        {newQ.question_type === "trivia" && (
                          <button onClick={() => setNewQ((p) => ({ ...p, correct_index: j }))} className={`absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 ${newQ.correct_index === j ? "bg-answer-green border-answer-green" : "border-muted-foreground"}`} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Media upload */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">מדיה (תמונה / סרטון)</label>
                    {newQ.media_url ? (
                      <>
                        <div className="flex items-center gap-3 bg-secondary rounded-lg p-3">
                          {newQ.media_type === "image" ? (
                            <img src={newQ.media_url} alt="" className="w-16 h-16 object-cover rounded" />
                          ) : (
                            <div className="w-16 h-16 bg-accent/20 rounded flex items-center justify-center">
                              <Video className="w-6 h-6 text-accent" />
                            </div>
                          )}
                          <span className="text-xs text-foreground flex-1 truncate">{newQ.media_type === "image" ? "תמונה" : "סרטון"}</span>
                          <button onClick={() => setNewQ((p) => ({ ...p, media_url: "", media_type: "none" }))} className="text-destructive">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {newQ.media_type === "image" && (
                          <div className="space-y-2 mt-2">
                            <div className="flex items-center gap-3">
                              <label className="text-xs text-muted-foreground">זמן צפייה:</label>
                              <Input type="number" min={1} max={30} value={newQ.image_view_time} onChange={(e) => setNewQ((p) => ({ ...p, image_view_time: Number(e.target.value) }))} className="w-20 bg-secondary border-border text-center" />
                              <span className="text-xs text-muted-foreground">שניות</span>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                              <input type="checkbox" checked={newQ.keep_image} onChange={(e) => setNewQ((p) => ({ ...p, keep_image: e.target.checked }))} className="accent-primary" />
                              השאר תמונה בזמן הצגת השאלות
                            </label>
                          </div>
                        )}
                      </>
                    ) : (
                      <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{uploading ? "מעלה..." : "העלה תמונה או סרטון"}</span>
                        <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleMediaUpload(file); }} />
                      </label>
                    )}
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">זמן:</label>
                      <Input type="number" min={5} max={60} value={newQ.time_limit} onChange={(e) => setNewQ((p) => ({ ...p, time_limit: Number(e.target.value) }))} className="w-20 bg-secondary border-border text-center" />
                      <span className="text-xs text-muted-foreground">שנ׳</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">תיקייה:</label>
                      <select
                        value={newQ.folder}
                        onChange={(e) => setNewQ((p) => ({ ...p, folder: e.target.value }))}
                        className="bg-secondary border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                      >
                        {allFolderPaths.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">קטגוריה:</label>
                      <Input value={newQ.category} onChange={(e) => setNewQ((p) => ({ ...p, category: e.target.value }))} className="w-24 bg-secondary border-border text-center text-xs" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="neon" size="sm" onClick={saveQuestion}>
                      <Save className="w-3.5 h-3.5" />
                      {editingId ? "עדכן" : "שמור למאגר"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>ביטול</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Questions list */}
            <div className="space-y-3" onDragOver={(e) => e.preventDefault()}>
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">אין שאלות {selectedFolder !== "הכל" ? `בתיקייה "${selectedFolder}"` : "במאגר"}</p>
                </div>
              ) : (
                filtered.map((q) => (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="gradient-card border border-border rounded-xl p-4 group cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e: any) => handleDragStart(e, q.id)}
                    onDragEnd={() => setDragOverFolder(null)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${q.question_type === "survey" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}`}>
                          {q.question_type === "survey" ? "סקר" : "טריוויה"}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Folder className="w-2.5 h-2.5" /> {q.folder}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{q.category}</span>
                        <span className="text-[10px] text-muted-foreground">{q.time_limit} שנ׳</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${q.bank_scope === "central" ? "bg-amber-500/15 text-amber-300" : "bg-primary/10 text-primary"}`}>{q.bank_scope === "central" ? "מרכזי" : "שלי"}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => duplicateBankQuestion(q)} className="text-muted-foreground hover:text-primary p-1" title={q.bank_scope === "central" ? "העתק למאגר שלי" : "שכפל"}><Copy className="w-3.5 h-3.5" /></button>
                        {(q.bank_scope === "private" || isAdmin) && (
                          <>
                            {isAdmin && q.bank_scope === "private" && (
                              <button onClick={() => void publishToCentral(q)} className="text-muted-foreground hover:text-amber-300 p-1" title="פרסם במאגר המרכזי">⬆</button>
                            )}
                            <button onClick={() => startEditing(q)} className="text-muted-foreground hover:text-primary p-1" title="ערוך"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteQuestion(q.id)} className="text-muted-foreground hover:text-destructive p-1" title="מחק"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-foreground font-medium mb-2">{q.question_text}</p>
                    {q.media_url && q.media_type === "image" && (
                      <img src={q.media_url} alt="" className="w-full max-h-24 object-contain rounded-lg mb-2" />
                    )}
                    {q.media_url && q.media_type === "video" && (
                      <div className="flex items-center gap-2 text-xs text-accent mb-2">
                        <Video className="w-3.5 h-3.5" />
                        <span>סרטון מצורף</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, j) => (
                        <div key={j} className={`text-xs px-3 py-1.5 rounded-lg ${j === q.correct_index && q.question_type === "trivia" ? "bg-answer-green/20 text-answer-green border border-answer-green/30" : "bg-secondary text-muted-foreground"}`}>
                          {opt}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AIQuestionGenerator
        open={showAI}
        onOpenChange={setShowAI}
        folders={allFolderPaths}
        categories={allCategories}
        defaultFolder={selectedFolder === "הכל" ? "כללי" : selectedFolder}
        onSaved={loadQuestions}
      />

      {/* Delete folder confirmation dialog */}
      <AlertDialog open={!!deletingFolder} onOpenChange={(open) => { if (!open) setDeletingFolder(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              מחיקת תיקייה
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingFolder && (() => {
                const paths = getAllDescendantPaths(deletingFolder);
                const count = questions.filter((q) => paths.includes(q.folder)).length;
                const subCount = deletingFolder.children.length;
                return (
                  <>
                    האם למחוק את התיקייה <strong>"{deletingFolder.name}"</strong>?
                    {subCount > 0 && <><br />התיקייה מכילה {subCount} תת-תיקיות.</>}
                    {count > 0 && <><br /><span className="text-destructive font-semibold">{count} שאלות יימחקו לצמיתות!</span></>}
                    {count === 0 && <><br />התיקייה ריקה.</>}
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              מחק תיקייה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete category confirmation dialog */}
      <AlertDialog open={!!deletingCategory} onOpenChange={(open) => { if (!open) setDeletingCategory(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              מחיקת קטגוריה
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCategory && (() => {
                const count = questions.filter((q) => q.category === deletingCategory).length;
                return (
                  <>
                    האם למחוק את הקטגוריה <strong>"{deletingCategory}"</strong>?
                    {count > 0
                      ? <><br /><span className="text-destructive font-semibold">{count} שאלות יימחקו לצמיתות!</span></>
                      : <><br />הקטגוריה ריקה.</>}
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              מחק קטגוריה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuestionBank;
