import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Users, History, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  nickname: string;
  role: "admin" | "user";
  created_at: string;
  last_sign_in_at: string | null;
}

interface AuditEntry {
  id: string;
  question_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  bank_scope: string | null;
  actor_id: string | null;
  created_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

const AdminManagement = () => {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: userRows, error: userError }, { data: auditRows, error: auditError }] = await Promise.all([
      supabase.rpc("admin_list_users" as any),
      supabase.from("question_bank_audit_log" as any)
        .select("id, question_id, action, bank_scope, actor_id, created_at, old_data, new_data")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (userError) toast.error("שגיאה בטעינת המשתמשים");
    else setUsers((userRows || []) as AdminUser[]);

    if (auditError) toast.error("שגיאה בטעינת Audit Log");
    else setAudit((auditRows || []) as unknown as AuditEntry[]);

    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin]);

  const deleteUser = async (targetId: string, label: string) => {
    if (!user || targetId === user.id) {
      toast.error("אי אפשר למחוק את המשתמש הנוכחי");
      return;
    }
    if (!confirm(`למחוק לצמיתות את המשתמש "${label}" ואת הנתונים השייכים אליו? פעולה זו אינה הפיכה.`)) return;
    const { error } = await supabase.rpc("admin_delete_user" as any, { _user_id: targetId });
    if (error) {
      toast.error("שגיאה במחיקת המשתמש: " + error.message);
      return;
    }
    toast.success("המשתמש נמחק");
    await load();
  };

  const setRole = async (targetId: string, role: "admin" | "user") => {
    if (!user || targetId === user.id && role === "user") {
      toast.error("אי אפשר להסיר לעצמך הרשאת מנהל");
      return;
    }
    const { error } = await supabase.rpc("admin_set_user_role" as any, {
      _user_id: targetId,
      _role: role,
    });
    if (error) {
      toast.error("שגיאה בעדכון ההרשאה");
      return;
    }
    toast.success("הרשאת המשתמש עודכנה");
    await load();
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center" dir="rtl">
        <div className="gradient-card border border-border rounded-2xl p-8 text-center">
          <h2 className="font-display text-2xl text-destructive mb-3">אין הרשאה</h2>
          <p className="text-muted-foreground">דף זה מיועד למנהלי המערכת.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4" /> חזרה
          </button>
          <div className="text-center">
            <h1 className="text-3xl font-display font-black text-foreground">ניהול מערכת</h1>
            <p className="text-muted-foreground text-sm">משתמשים, הרשאות ו־Audit Log</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> רענן
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <section className="gradient-card border border-border rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> משתמשים ({users.length})
            </h2>
            <div className="space-y-2 max-h-[650px] overflow-y-auto">
              {users.map((item) => (
                <div key={item.user_id} className="rounded-xl bg-secondary/50 border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.nickname || item.display_name || "ללא שם"}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.email}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        נרשם: {new Date(item.created_at).toLocaleString("he-IL")}
                        {item.last_sign_in_at ? ` · כניסה אחרונה: ${new Date(item.last_sign_in_at).toLocaleString("he-IL")}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-1 rounded-full ${item.role === "admin" ? "bg-amber-500/15 text-amber-300" : "bg-primary/10 text-primary"}`}>
                        {item.role === "admin" ? "מנהל" : "משתמש"}
                      </span>
                      {item.role === "admin" ? (
                        <Button variant="ghost" size="sm" disabled={item.user_id === user?.id} onClick={() => void setRole(item.user_id, "user")}>
                          הורד למשתמש
                        </Button>
                      ) : (
                        <Button variant="neon-outline" size="sm" onClick={() => void setRole(item.user_id, "admin")}>
                          <Shield className="w-3.5 h-3.5" /> מנהל
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" disabled={item.user_id === user?.id} onClick={() => void deleteUser(item.user_id, item.nickname || item.display_name || item.email)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && users.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">אין משתמשים.</p>}
            </div>
          </section>

          <section className="gradient-card border border-border rounded-2xl p-5">
            <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <History className="w-5 h-5 text-accent" /> Audit Log — מאגר השאלות
            </h2>
            <div className="space-y-2 max-h-[650px] overflow-y-auto">
              {audit.map((entry) => {
                const actor = entry.actor_id ? entry.actor_id.slice(-8) : "system";
                const actionLabel = entry.action === "INSERT" ? "יצירה" : entry.action === "UPDATE" ? "עדכון" : "מחיקה";
                return (
                  <div key={entry.id} className="rounded-xl bg-secondary/50 border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-display text-foreground">{actionLabel}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${entry.bank_scope === "central" ? "text-amber-300 bg-amber-500/10" : "text-primary bg-primary/10"}`}>
                          {entry.bank_scope || "unknown"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{new Date(entry.created_at).toLocaleString("he-IL")}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">שאלה: {entry.question_id?.slice(-8) || "—"} · מבצע: {actor}</p>
                  </div>
                );
              })}
              {!loading && audit.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">אין פעולות מתועדות עדיין.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminManagement;
