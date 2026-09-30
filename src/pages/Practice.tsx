import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Q={id:string;question_text:string;options:string[];correct_index:number;question_type:string};

const Practice = () => {
  const navigate=useNavigate();
  const {user}=useAuth();
  const [bank,setBank]=useState<Q[]>([]);
  const [index,setIndex]=useState(0);
  const [selected,setSelected]=useState<number|null>(null);
  const [score,setScore]=useState(0);
  const [finished,setFinished]=useState(false);
  const [loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    const {data}=await supabase.from("question_bank").select("id,question_text,options,correct_index,question_type").eq("status","published");
    const qs=((data||[]) as any[]).filter(q=>q.question_type==="trivia" && Array.isArray(q.options) && q.options.length>=2);
    for(let i=qs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[qs[i],qs[j]]=[qs[j],qs[i]];}
    setBank(qs.slice(0,10)); setIndex(0); setSelected(null); setScore(0); setFinished(false); setLoading(false);
  };
  useEffect(()=>{void load();},[user]);

  const current=bank[index];
  const answer=(i:number)=>{
    if(selected!==null||!current)return;
    setSelected(i);
    if(i===current.correct_index)setScore(s=>s+1);
  };
  const next=()=>{
    if(index>=bank.length-1)setFinished(true);
    else {setIndex(i=>i+1);setSelected(null);}
  };

  if(loading)return <div className="min-h-screen gradient-hero flex items-center justify-center text-muted-foreground">טוען שאלות...</div>;
  return <div className="min-h-screen gradient-hero p-6" dir="rtl">
    <div className="max-w-3xl mx-auto">
      <Button variant="ghost" onClick={()=>navigate("/")}><ArrowLeft className="w-4 h-4"/> חזרה</Button>
      {finished ? <div className="gradient-card border border-border rounded-2xl p-10 text-center mt-10">
        <Check className="w-12 h-12 mx-auto text-answer-green mb-4"/>
        <h1 className="text-3xl font-display font-black text-foreground">סיימת!</h1>
        <p className="text-muted-foreground mt-2">ענית נכון על {score} מתוך {bank.length} שאלות</p>
        <Button className="mt-6" onClick={()=>void load()}><RotateCcw className="w-4 h-4"/> תרגול חדש</Button>
      </div> :
      current ? <div className="mt-8 gradient-card border border-border rounded-2xl p-6">
        <div className="text-xs text-muted-foreground mb-3">תרגול · שאלה {index+1} מתוך {bank.length}</div>
        <h1 className="text-xl font-display font-bold text-foreground mb-6">{current.question_text}</h1>
        <div className="grid sm:grid-cols-2 gap-3">
          {current.options.map((o,i)=><button key={i} disabled={selected!==null} onClick={()=>answer(i)} className={`text-right p-4 rounded-xl border transition-colors ${selected===null?"bg-secondary border-border hover:border-primary":"bg-secondary border-border"} ${selected!==null&&i===current.correct_index?"border-answer-green text-answer-green":selected===i&&i!==current.correct_index?"border-destructive text-destructive":""}`}>{o}</button>)}
        </div>
        {selected!==null&&<Button className="mt-6" onClick={next}>המשך</Button>}
      </div> :
      <div className="text-center mt-12 text-muted-foreground">אין שאלות טריוויה זמינות לתרגול.</div>}
    </div>
  </div>;
};
export default Practice;
