import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { isStaticDeployment, startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { shouldPreferLocalProgress } from "@/lib/progressSync";
import { createQuestionOrder, isValidQuestionOrder, resolveQuestionOrder } from "@/lib/questionOrder";
import { createFreshProgressState } from "@/lib/progressReset";
import { applyAlternativeOrder, createAlternativeOrders, resolveAlternativeOrders, isValidAlternativeOrder } from "@/lib/alternativeOrder";
import { referenceQuestions } from "@/data/referenceQuestions";
import { BarChart3, BookOpenCheck, Brain, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Clock3, FileText, Flag, Gauge, LayoutDashboard, ListChecks, Loader2, LogIn, LogOut, RotateCcw, Settings2, Sparkles, Target, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type Axis = "Gestão pública" | "Pessoas e redes" | "Políticas públicas" | "Auditoria e legislação";
type Question = { id:number; axis:Axis; topic:string; difficulty:"Fácil"|"Média"|"Difícil"; prompt:string; options:string[]; correct:number; explanation:string; analysis:string[]; source:string };
type Answer = { selected:number; correct:boolean; axis:Axis; topic:string; difficulty:Question["difficulty"]; analysis?:string[] };

const axisMeta: Record<Axis,{short:string;color:string}> = {
  "Gestão pública": { short:"Gestão", color:"#2A6680" },
  "Pessoas e redes": { short:"Pessoas", color:"#54B99A" },
  "Políticas públicas": { short:"Políticas", color:"#D69A52" },
  "Auditoria e legislação": { short:"Auditoria", color:"#D56B62" },
};

const axisMap: Record<string, Axis> = {
  "Eixo 1 — Gestão pública e estratégia": "Gestão pública",
  "Eixo 2 — Gestão de pessoas e redes": "Pessoas e redes",
  "Eixo 3 — Políticas públicas e gestão do SUS": "Políticas públicas",
  "Eixo 4 — Auditoria e legislação aplicada": "Auditoria e legislação",
};

const blueprints = referenceQuestions.map((item, index) => ({
  id: index + 1,
  axis: axisMap[item.axis],
  topic: item.topic,
  difficulty: item.difficulty,
  prompt: item.prompt,
  options: item.options,
  correct: item.correct,
  explanation: item.explanation,
  analysis: item.analysis,
  source: item.source,
}));

const questionById = new Map(blueprints.map((q) => [q.id, q]));

const initialStore = () => {
  try { return JSON.parse(localStorage.getItem("ses-to-simulado") || "null"); } catch { return null; }
};

const publicAsset = (fileName: string) => `${import.meta.env.BASE_URL}assets/${fileName}`;

export default function Home(){
  function handleLogin(){
    if (isStaticDeployment) {
      toast.info("Modo local ativo", { description: "O GitHub Pages salva seu progresso apenas neste navegador." });
      return;
    }
    startLogin();
  }

  const saved = useMemo(initialStore, []);
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const progressQuery = trpc.progress.get.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const saveProgress = trpc.progress.save.useMutation();
  const clearProgress = trpc.progress.clear.useMutation();
  const [questionOrder,setQuestionOrder] = useState<number[]>(() => {
    return resolveQuestionOrder(saved?.questionOrder, Object.keys(saved?.answers || {}).length > 0, blueprints.length);
  });
  const [alternativeOrders,setAlternativeOrders] = useState<Record<number,number[]>>(() => resolveAlternativeOrders(saved?.alternativeOrders, Object.keys(saved?.answers || {}).length > 0, blueprints));
  const questions = useMemo(() => questionOrder.map(id => questionById.get(id)!).filter(Boolean).map(question => applyAlternativeOrder(question, alternativeOrders[question.id] ?? question.options.map((_, index) => index))), [questionOrder, alternativeOrders]);
  const [view,setView] = useState<"dashboard"|"simulado"|"desempenho"|"erros"|"fontes">(saved?.view || "dashboard");
  const [current,setCurrent] = useState<number>(saved?.current || 0);
  const [answers,setAnswers] = useState<Record<number,Answer>>(saved?.answers || {});
  const [started,setStarted] = useState<boolean>(saved?.started || false);
  const [showFeedback,setShowFeedback] = useState<boolean>(saved?.showFeedback || false);
  const [selected,setSelected] = useState<number|null>(saved?.selected ?? null);
  const [startTime,setStartTime] = useState<number>(saved?.startTime || Date.now());
  const [elapsed,setElapsed] = useState(0);
  const [localChangedAt,setLocalChangedAt] = useState<number>(saved?.localChangedAt || Date.now());
  const [cloudLoaded,setCloudLoaded] = useState(false);
  const [syncStatus,setSyncStatus] = useState<"local"|"loading"|"synced"|"error">("local");
  const [command,setCommand] = useState("");
  const [showSettings,setShowSettings] = useState(false);
  const snapshot = useMemo(() => ({view,current,answers,started,showFeedback,selected,startTime,localChangedAt,questionOrder,alternativeOrders}), [view,current,answers,started,showFeedback,selected,startTime,localChangedAt,questionOrder,alternativeOrders]);

  useEffect(()=>{ localStorage.setItem("ses-to-simulado",JSON.stringify(snapshot)); },[snapshot]);
  useEffect(()=>{
    if (!isAuthenticated || progressQuery.isLoading || cloudLoaded) return;
    setSyncStatus("loading");
    if (progressQuery.isError) {
      setSyncStatus("error");
      setCloudLoaded(true);
      toast.error("Não foi possível carregar o progresso em nuvem", { description: "Seu progresso local foi preservado e não será sobrescrito." });
      return;
    }
    if (progressQuery.data?.payload) {
      try {
        const remote = JSON.parse(progressQuery.data.payload);
        const remoteUpdatedAt = progressQuery.data.updatedAt ? new Date(progressQuery.data.updatedAt).getTime() : 0;
        const localIsNewer = shouldPreferLocalProgress(Number(snapshot.localChangedAt || 0), remoteUpdatedAt, Object.keys(snapshot.answers).length > 0);
        if (localIsNewer) {
          saveProgress.mutate({ payload: JSON.stringify(snapshot) }, { onSuccess: () => setSyncStatus("synced"), onError: () => setSyncStatus("error") });
          setSyncStatus("synced");
          toast.success("Progresso local mantido", { description: "A versão mais recente deste dispositivo foi sincronizada." });
        } else if (remote && typeof remote === "object") {
          if (remote.view) setView(remote.view);
          if (typeof remote.current === "number") setCurrent(remote.current);
          if (remote.answers) setAnswers(remote.answers);
          if (typeof remote.started === "boolean") setStarted(remote.started);
          if (typeof remote.showFeedback === "boolean") setShowFeedback(remote.showFeedback);
          if (typeof remote.selected === "number" || remote.selected === null) setSelected(remote.selected);
          if (typeof remote.startTime === "number") setStartTime(remote.startTime);
          if (typeof remote.localChangedAt === "number") setLocalChangedAt(remote.localChangedAt);
          if (isValidQuestionOrder(remote.questionOrder, blueprints.length)) setQuestionOrder(remote.questionOrder);
          setAlternativeOrders(resolveAlternativeOrders(remote.alternativeOrders, Object.keys(remote.answers || {}).length > 0, blueprints));
          setSyncStatus("synced");
          toast.success("Progresso sincronizado", { description: "Seu estudo em nuvem foi carregado nesta sessão." });
        }
      } catch { setSyncStatus("error"); toast.error("Não foi possível ler o progresso salvo na nuvem."); }
    } else {
      saveProgress.mutate({ payload: JSON.stringify(snapshot) }, {
        onSuccess: () => setSyncStatus("synced"),
        onError: () => { setSyncStatus("error"); toast.error("Falha ao criar seu progresso em nuvem", { description: "O progresso local foi preservado." }); },
      });
    }
    setCloudLoaded(true);
  }, [isAuthenticated, progressQuery.isLoading, progressQuery.data, progressQuery.isError, cloudLoaded]);
  useEffect(()=>{
    if (!isAuthenticated || !cloudLoaded || syncStatus === "error") return;
    const timer = window.setTimeout(() => {
      saveProgress.mutate({ payload: JSON.stringify(snapshot) }, {
        onSuccess: () => setSyncStatus("synced"),
        onError: () => { setSyncStatus("error"); toast.error("Falha ao salvar na nuvem", { description: "O progresso continua disponível localmente." }); },
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [snapshot, isAuthenticated, cloudLoaded, syncStatus]);
  useEffect(()=>{ const t=setInterval(()=>setElapsed(Math.floor((Date.now()-startTime)/1000)),1000); return ()=>clearInterval(t); },[startTime]);

  const answered = Object.keys(answers).length;
  const correct = Object.values(answers).filter(a=>a.correct).length;
  const score = answered ? Math.round(correct/answered*100) : 0;
  const q = questions[current];
  const axisStats = (Object.keys(axisMeta) as Axis[]).map(axis=>{const list=Object.values(answers).filter(a=>a.axis===axis);return {name:axisMeta[axis].short,axis,acertos:list.filter(a=>a.correct).length,respondidas:list.length,percent:list.length?Math.round(list.filter(a=>a.correct).length/list.length*100):0,color:axisMeta[axis].color};});
  const topicErrors = Object.entries(answers).filter(([,a])=>!a.correct).reduce<Record<string,number>>((acc,[,a])=>{acc[a.topic]=(acc[a.topic]||0)+1;return acc;},{});
  const errorList = Object.entries(topicErrors).sort((a,b)=>b[1]-a[1]);
  const pie = [{name:"Acertos",value:correct,color:"#54B99A"},{name:"Erros",value:answered-correct,color:"#D56B62"},{name:"Pendentes",value:50-answered,color:"#DCE8E5"}];
  const formatTime=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  function begin(){setStarted(true);setView("simulado");setStartTime(Date.now());setLocalChangedAt(Date.now());toast.success("Simulado iniciado",{description:"Responda uma questão por vez. O progresso é salvo automaticamente."});}
  function choose(i:number){if(showFeedback)return;setSelected(i);setLocalChangedAt(Date.now());}
  function submit(){if(selected===null)return;const isCorrect=selected===q.correct;setAnswers(prev=>({...prev,[q.id]:{selected,correct:isCorrect,axis:q.axis,topic:q.topic,difficulty:q.difficulty,analysis:q.analysis}}));setShowFeedback(true);setLocalChangedAt(Date.now());toast(isCorrect?"Resposta correta":"Resposta registrada",{description:isCorrect?"Excelente. Continue nesse ritmo.":"O erro foi salvo no seu caderno de revisão."});}
  function next(){setShowFeedback(false);setSelected(null);setCurrent(Math.min(questions.length-1,current+1));setLocalChangedAt(Date.now());}
  function previous(){setShowFeedback(false);setSelected(null);setCurrent(Math.max(0,current-1));setLocalChangedAt(Date.now());}
  function reset(){
    const confirmed = window.confirm("Apagar todo o histórico de respostas, acertos, erros e progresso? As questões e sua conta serão mantidas.");
    if (!confirmed) return;
    const resetLocalState = () => {
      const fresh = createFreshProgressState(blueprints.length, Date.now());
      localStorage.removeItem("ses-to-simulado");
      setQuestionOrder(fresh.questionOrder);
      setAlternativeOrders(createAlternativeOrders(blueprints));
      setAnswers({}); setCurrent(fresh.current); setStarted(fresh.started); setShowFeedback(fresh.showFeedback); setSelected(fresh.selected);
      setView(fresh.view); setStartTime(fresh.startTime); setElapsed(fresh.elapsed); setLocalChangedAt(fresh.localChangedAt);
      setSyncStatus(isAuthenticated ? "synced" : "local");
      setShowSettings(false);
      toast.success("Histórico apagado",{description:"O simulado foi reiniciado com uma nova ordem de questões."});
    };
    if (!isAuthenticated) { resetLocalState(); return; }
    setSyncStatus("loading");
    clearProgress.mutate(undefined, {
      onSuccess: resetLocalState,
      onError: () => { setSyncStatus("error"); toast.error("Não foi possível apagar o histórico na nuvem",{description:"Seu progresso não foi alterado."}); },
    });
  }
  function go(v:typeof view){setView(v); if(v==="simulado"&&!started)begin();}
  function runCommand(raw:string){
    const value = raw.trim().toUpperCase();
    if (!value) return;
    if (value === "PAINEL" || value === "DASHBOARD") go("dashboard");
    else if (value === "REVISÃO" || value === "REVISAO" || value === "REFAZER") go(value === "REFAZER" ? "erros" : "desempenho");
    else if (value === "SIMULADO" || value === "CONTINUAR") go("simulado");
    else if (value === "FONTES") go("fontes");
    else if (value === "FINALIZAR") go("desempenho");
    else if (value === "PAUSA") toast("Sessão pausada",{description:"Seu progresso continua salvo. Retome quando quiser."});
    else toast.info("Comando não reconhecido",{description:"Use PAINEL, REVISÃO, REFAZER, SIMULADO ou FONTES."});
    setCommand("");
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src={publicAsset("brand-mark.svg")} alt=""/><div><span>SIMULADO</span><strong>GESTOR EM SAÚDE</strong></div></div>
      <div className="exam-tag">SES-TO · 2026</div>
      <nav className="nav">{[["dashboard","Visão geral",LayoutDashboard],["simulado","Simulado",ListChecks],["desempenho","Desempenho",BarChart3],["erros","Caderno de erros",BookOpenCheck],["fontes","Fontes de estudo",FileText]].map(([id,label,Icon])=><button key={id as string} className={view===id?"active":""} onClick={()=>go(id as typeof view)}><Icon size={18}/><span>{label as string}</span>{id==="erros"&&errorList.length>0&&<b>{errorList.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="mini-progress"><span>Progresso geral</span><strong>{answered}/50</strong><Progress value={answered/50*100}/></div><button className="reset-link" onClick={reset} disabled={clearProgress.isPending}><RotateCcw size={15}/> {clearProgress.isPending?"Apagando histórico…":"Apagar histórico"}</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-title"><div className="topbar-mark"><img src={publicAsset("brand-mark.svg")} alt=""/></div><div><span className="eyebrow">PAINEL DE PREPARAÇÃO</span><h1>{view==="dashboard"?"Seu próximo ganho está nos erros recorrentes.":view==="simulado"?"Simulado específico · Questões FGV":view==="desempenho"?"Desempenho por eixo do edital":view==="erros"?"Caderno de erros": "Fontes que sustentam o estudo"}</h1></div></div><div className="top-actions"><div className="time-chip"><Clock3 size={16}/><span>{formatTime(elapsed)}</span></div>{authLoading?<Loader2 size={17} className="spin"/>:isAuthenticated?<div className="user-chip"><span>{user?.name || user?.email || "Conta conectada"}</span><button onClick={()=>logout()} aria-label="Sair"><LogOut size={14}/></button></div>:<Button variant="outline" onClick={handleLogin}><LogIn size={15}/> {isStaticDeployment ? "Usar modo local" : "Entrar para salvar"}</Button>}{isAuthenticated&&<span className={`sync-indicator ${syncStatus}`} title="Status da sincronização">{syncStatus==="loading"?"Sincronizando…":syncStatus==="error"?"Não sincronizado":"Sincronizado"}</span>}<Button variant="outline" size="icon" aria-label="Abrir configurações" onClick={()=>setShowSettings(v=>!v)}><Settings2 size={17}/></Button></div></header>
      <div className="reference-command-bar"><span><strong>Comandos:</strong> PAINEL · REVISÃO · REFAZER · SIMULADO · PAUSA · CONTINUAR · FONTES · FINALIZAR</span><form onSubmit={(event)=>{event.preventDefault();runCommand(command);}}><input value={command} onChange={(event)=>setCommand(event.target.value)} placeholder="Digite um comando" aria-label="Digite um comando"/><button type="submit">Executar</button></form></div>
      {showSettings&&<section className="settings-panel" aria-label="Configurações da conta"><div><span className="section-kicker">MINHA CONTA</span><h2>Controle do seu estudo</h2><p>{isAuthenticated ? "Seu progresso está vinculado à conta e sincronizado entre dispositivos." : isStaticDeployment ? "Neste endereço, o progresso fica salvo neste navegador." : "Entre para salvar o progresso e continuar em qualquer dispositivo."}</p></div><div className="settings-actions">{isAuthenticated?<span className="settings-status">● {syncStatus==="error"?"Sincronização com erro":"Conta conectada"}</span>:<Button onClick={handleLogin}><LogIn size={15}/> {isStaticDeployment ? "Usar modo local" : "Entrar para salvar"}</Button>}<button className="danger-button" onClick={reset} disabled={clearProgress.isPending}><RotateCcw size={15}/> {clearProgress.isPending?"Apagando histórico…":"Apagar histórico de respostas"}</button></div><small>Esta ação preserva sua conta e as questões, mas remove respostas, acertos, erros, pontuação, tempo e a ordem atual.</small></section>}
      {view==="dashboard"&&<Dashboard answered={answered} correct={correct} score={score} axisStats={axisStats} pie={pie} begin={begin} go={go} errorList={errorList} reset={reset} resetPending={clearProgress.isPending}/>} 
      {view==="simulado"&&<Quiz questions={questions} q={q} current={current} answers={answers} selected={selected} showFeedback={showFeedback} choose={choose} submit={submit} next={next} previous={previous} score={score} answered={answered} goTo={(index)=>{setCurrent(index);setShowFeedback(Boolean(answers[questions[index].id]));setSelected(answers[questions[index].id]?.selected ?? null);}}/>} 
      {view==="desempenho"&&<Performance axisStats={axisStats} answered={answered} correct={correct} score={score} pie={pie}/>} 
      {view==="erros"&&<Errors errorList={errorList} answers={answers} questions={questions}/>} 
      {view==="fontes"&&<Sources/>}
    </main>
  </div>
}

function Dashboard({answered,correct,score,axisStats,pie,begin,go,errorList,reset,resetPending}:{answered:number;correct:number;score:number;axisStats:any[];pie:any[];begin:()=>void;go:(v:any)=>void;errorList:any[];reset:()=>void;resetPending:boolean}){
 return <div className="content"><section className="hero-panel"><div><span className="section-kicker">PLANO DE 50 QUESTÕES</span><h2>Resolver. Corrigir.<br/><em>Revisar com método.</em></h2><p>Uma bateria específica de Gestor em Saúde, dividida em quatro eixos do edital e acompanhada por métricas que mostram o que estudar depois.</p><div className="hero-actions"><Button onClick={begin} className="primary-btn"><Target size={17}/> {answered?`Retomar da questão ${String(Math.min(answered+1,50)).padStart(2,"0")}`:"Resolver questão 01"}</Button><button className="text-btn" onClick={()=>go("fontes")}>Ver fontes oficiais <ChevronRight size={16}/></button></div></div><div className="hero-art"><img src={publicAsset("study-illustration.svg")} alt="Ilustração editorial de estudo em saúde"/></div></section>
 <section className="progress-control panel"><div><span className="section-kicker">CONTROLE DO PROGRESSO</span><h3>Começar uma nova tentativa</h3><p>Apague respostas, acertos, erros, tempo e a ordem atual para iniciar novamente. Sua conta e as questões permanecem salvas.</p></div><button className="danger-button" onClick={reset} disabled={resetPending}><RotateCcw size={15}/> {resetPending?"Apagando histórico…":"Apagar histórico de respostas"}</button></section>
 <section className="stat-grid"><div className="stat-card"><div className="stat-icon teal"><Gauge size={18}/></div><span>Aproveitamento</span><strong>{score}%</strong><small>{correct} acertos de {answered||0} respondidas</small></div><div className="stat-card"><div className="stat-icon blue"><ListChecks size={18}/></div><span>Progresso</span><strong>{answered}<small>/50</small></strong><small>questões concluídas</small></div><div className="stat-card"><div className="stat-icon coral"><BookOpenCheck size={18}/></div><span>Para revisar</span><strong>{errorList.length}</strong><small>tópicos no caderno de erros</small></div><div className="stat-card accent-card"><div className="mini-brand-mark"><img src={publicAsset("brand-mark.svg")} alt=""/></div><span>Meta de segurança</span><strong>80%</strong><div className="tiny-line"><i style={{width:`${Math.min(score/80*100,100)}%`}}></i></div><small>{score>=80?"Meta atingida":"Continue acumulando consistência"}</small></div></section>
 <section className="dashboard-grid"><div className="panel axis-panel"><div className="panel-head"><div><span className="section-kicker">MAPA DO EDITAL</span><h3>Desempenho por eixo</h3></div><button onClick={()=>go("desempenho")} className="link-btn">Abrir relatório <ChevronRight size={15}/></button></div>{axisStats.map(a=><div className="axis-row" key={a.axis}><div className="axis-label"><span className="axis-dot" style={{background:a.color}}></span><span>{a.axis}</span><b>{a.respondidas?`${a.percent}%`:"—"}</b></div><div className="axis-track"><span style={{width:`${a.respondidas?a.percent:0}%`,background:a.color}}></span></div><small>{a.respondidas}/{a.axis==="Gestão pública"?18:a.axis==="Pessoas e redes"?12:a.axis==="Políticas públicas"?8:12} questões</small></div>)}</div><div className="panel pie-panel"><div className="panel-head"><div><span className="section-kicker">VISÃO RÁPIDA</span><h3>Placar atual</h3></div><Sparkles size={18} color="#54B99A"/></div><div className="pie-wrap"><ResponsiveContainer width="52%" height={170}><PieChart><Pie data={pie} dataKey="value" innerRadius={53} outerRadius={75} paddingAngle={3} stroke="none">{pie.map(p=><Cell key={p.name} fill={p.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="pie-center"><strong>{score}%</strong><span>aproveitamento</span></div></div><div className="legend">{pie.map(p=><div key={p.name}><i style={{background:p.color}}></i><span>{p.name}</span><b>{p.value}</b></div>)}</div></div></section>
 <section className="review-plan panel"><div className="panel-head"><div><span className="section-kicker">PRÓXIMA REVISÃO</span><h3>Plano baseado nos seus erros</h3></div><button onClick={()=>go("erros")} className="link-btn">Abrir caderno <ChevronRight size={15}/></button></div>{errorList.length===0?<p className="review-empty">Responda algumas questões para gerar automaticamente uma fila de revisão por tema.</p>:<div className="review-plan-grid">{errorList.slice(0,3).map(([topic,count],index)=><div className="review-item" key={topic}><span className="review-rank">0{index+1}</span><div><strong>{topic}</strong><small>{count} {count===1?"erro registrado":"erros registrados"} · revise hoje</small></div><span className="review-count">{count}</span></div>)}</div>}</section>
 <section className="study-line"><div className="line-head"><div><span className="section-kicker">RITMO DE PREPARAÇÃO</span><h3>Da primeira questão à reta final</h3></div><span className="line-note"><Flag size={13}/> 3 de 4 fases acompanhadas</span></div><div className="line"><div className="line-fill" style={{width:`${Math.min(answered/50*100,100)}%`}}></div>{["Diagnóstico","Cobertura","Consolidação","Reta final"].map((x,i)=><div className={`line-step ${answered>=([0,12,32,50][i])?"done":""}`} key={x}><span>{i+1}</span><small>{x}</small></div>)}</div></section>
 </div>
}

function Quiz({questions,q,current,answers,selected,showFeedback,choose,submit,next,previous,score,answered,goTo}:{questions:Question[];q:Question;current:number;answers:Record<number,Answer>;selected:number|null;showFeedback:boolean;choose:(i:number)=>void;submit:()=>void;next:()=>void;previous:()=>void;score:number;answered:number;goTo:(index:number)=>void}){
 const existing=answers[q.id]; const picked=selected!==null?selected:existing?.selected??null;
 return <div className="quiz-layout"><section className="quiz-main"><div className="question-meta"><div><span className="question-number">QUESTÃO {String(q.id).padStart(2,"0")}</span><Badge className="axis-badge">{q.axis}</Badge><Badge variant="outline">{q.difficulty}</Badge></div><span className="question-topic">{q.topic}</span></div><div className="question-card"><div className="prompt">{q.prompt}</div><div className="options">{q.options.map((op,i)=><button key={op} className={`option ${picked===i?"selected":""} ${showFeedback&&i===q.correct?"correct":""} ${showFeedback&&picked===i&&i!==q.correct?"wrong":""}`} onClick={()=>choose(i)}><span className="option-letter">{String.fromCharCode(65+i)}</span><span>{op}</span>{showFeedback&&i===q.correct&&<CheckCircle2 className="option-state" size={19}/>} {showFeedback&&picked===i&&i!==q.correct&&<XCircle className="option-state" size={19}/>}</button>)}</div><div className="question-footer"><span><CircleHelp size={16}/> Escolha uma alternativa para continuar</span><span>{q.source}</span></div></div>{showFeedback&&<div className={`feedback ${picked===q.correct?"good":"bad"}`}><div className="feedback-title">{picked===q.correct?<><CheckCircle2 size={20}/> Resposta correta</>:<><XCircle size={20}/> Resposta registrada para revisão</>}</div><p>{q.explanation}</p><div className="alternative-analysis"><strong>Análise das alternativas</strong>{q.analysis.map((note,index)=><div className={`analysis-row ${index===q.correct?"analysis-correct":""} ${index===picked?"analysis-picked":""}`} key={`${q.id}-analysis-${index}`}><b>{String.fromCharCode(65+index)}</b><span>{note}</span></div>)}</div><div className="feedback-source"><FileText size={15}/> Base: {q.source}</div></div>}<div className="quiz-actions"><Button variant="outline" onClick={previous} disabled={current===0}><ChevronLeft size={16}/> Anterior</Button>{!showFeedback?<Button onClick={submit} disabled={selected===null} className="primary-btn">Confirmar resposta <ChevronRight size={16}/></Button>:<Button onClick={next} className="primary-btn">{current===49?"Ver resultado":"Próxima questão"} <ChevronRight size={16}/></Button>}</div></section><aside className="quiz-rail"><div className="rail-summary"><span className="section-kicker">PROGRESSO</span><strong>{answered}<small>/50</small></strong><Progress value={answered/50*100}/><div className="rail-score"><span>Aproveitamento</span><b>{score}%</b></div></div><div className="rail-questions"><div className="rail-title"><span>Mapa de questões</span><span>{current+1}/50</span></div><div className="question-grid">{questions.map((item,i)=>{const a=answers[item.id];return <button key={item.id} onClick={()=>goTo(i)} className={`${i===current?"current":""} ${a?.correct?"answered-correct":""} ${a&&!a.correct?"answered-wrong":""}`} title={`Questão ${item.id}`}>{item.id}</button>})}</div></div><div className="rail-tip"><Brain size={17}/><span><b>Nota de campo</b> Corrija o raciocínio, não apenas a letra.</span></div></aside></div>
}

function Performance({axisStats,answered,correct,score,pie}:{axisStats:any[];answered:number;correct:number;score:number;pie:any[]}){return <div className="content"><div className="performance-head"><div><span className="section-kicker">ANÁLISE DE DESEMPENHO</span><h2>Seu estudo em números</h2><p>Use os dados para decidir o que revisar na próxima sessão.</p></div><div className="score-display"><span>APROVEITAMENTO</span><strong>{score}%</strong><small>{correct} acertos · {answered} respondidas</small></div></div><div className="chart-grid"><div className="panel chart-panel"><div className="panel-head"><div><span className="section-kicker">POR EIXO</span><h3>Onde está sua força</h3></div></div><ResponsiveContainer width="100%" height={280}><BarChart data={axisStats} layout="vertical" margin={{left:5,right:20}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#DCE8E5"/><XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} stroke="#8AA0A0"/><YAxis dataKey="name" type="category" width={72} stroke="#5C7575"/><Tooltip formatter={(v)=>[`${v}%`,"Aproveitamento"]}/><Bar dataKey="percent" radius={[0,3,3,0]}>{axisStats.map(a=><Cell key={a.axis} fill={a.color}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="panel chart-panel"><div className="panel-head"><div><span className="section-kicker">COMPOSIÇÃO</span><h3>Placar atual</h3></div></div><div className="big-pie"><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={pie} dataKey="value" innerRadius={72} outerRadius={100} paddingAngle={4} stroke="none">{pie.map(p=><Cell key={p.name} fill={p.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div><strong>{score}%</strong><span>acertos sobre respondidas</span></div></div></div></div><div className="panel insight-panel"><div className="insight-icon"><Sparkles size={20}/></div><div><span className="section-kicker">LEITURA DO MOMENTO</span><h3>{score>=80?"Você atingiu a meta de segurança.":score>=60?"A base está se formando; agora é hora de fechar lacunas.":"O próximo ganho está em revisar os fundamentos."}</h3><p>O painel é uma bússola, não um julgamento. Compare seu desempenho por eixo e retorne aos tópicos com erros repetidos.</p></div></div></div>}

function Errors({errorList,answers,questions}:{errorList:any[];answers:Record<number,Answer>;questions:Question[]}){const wrong=questions.filter(q=>answers[q.id]&&!answers[q.id].correct);return <div className="content"><div className="performance-head"><div><span className="section-kicker">REVISÃO ATIVA</span><h2>O erro vira próxima ação</h2><p>Esta lista é criada automaticamente quando uma resposta não coincide com o gabarito.</p></div><div className="error-count"><strong>{wrong.length}</strong><span>questões para revisar</span></div></div>{wrong.length===0?<div className="empty-state"><BookOpenCheck size={34}/><h3>Seu caderno ainda está vazio</h3><p>Comece o simulado e cada erro ficará organizado por tópico.</p></div>:<div className="error-layout"><div className="panel error-list">{wrong.map(q=><div className="error-row" key={q.id}><div className="error-q">{String(q.id).padStart(2,"0")}</div><div><div className="error-title">{q.topic}</div><div className="error-meta">{q.axis} · {q.difficulty}</div></div><Badge variant="outline">Revisar</Badge></div>)}</div><div className="panel error-summary"><span className="section-kicker">TÓPICOS RECORRENTES</span><h3>Onde concentrar a próxima sessão</h3>{errorList.slice(0,5).map(([topic,count])=><div className="topic-bar" key={topic}><div><span>{topic}</span><b>{count}</b></div><Progress value={Math.min(count/3*100,100)}/></div>)}</div></div>}</div>}

function Sources(){const sources=[['Edital retificado SES-TO 2026','Prova, pesos, critérios e os 31 tópicos específicos.','FGV','https://conhecimento.fgv.br/sites/default/files/concursos/edital-retificado-ses-to_retificado.pdf'],['Gestão do SUS','Planejamento, gestão compartilhada e instrumentos do SUS.','Ministério da Saúde','https://www.gov.br/saude/pt-br/acesso-a-informacao/gestao-do-sus'],['Auditoria do SUS','Fases, evidências, achados, relatórios e recomendações.','DenaSUS','https://www.gov.br/saude/pt-br/composicao/denasus/sna/publicacoes/auditoria-do-sus-orientacoes-basicas'],['Lei nº 14.133/2021','Licitações, contratos, planejamento e fiscalização.','Planalto','https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm'],['Gestão por competências','Competências, desenvolvimento e limites no setor público.','ENAP','https://bibliotecadigital.enap.gov.br/bitstream/1/2522/1/Gcomp%20-%20ApostilaCE.pdf'],['Normas consolidadas do MS','Portarias GM/MS nº 1 a 6/2017 por tema.','Ministério da Saúde','https://www.gov.br/saude/pt-br/acesso-a-informacao/institucional/legislacao/como-consultar/normas-consolidadas']];return <div className="content"><div className="performance-head"><div><span className="section-kicker">BASE DE ESTUDO</span><h2>Fontes que sustentam o treino</h2><p>Use a fonte primária para validar conceitos antes de transformar um erro em anotação.</p></div><Button variant="outline" onClick={()=>toast.info("Fontes organizadas",{description:"Você pode abrir cada referência em uma nova aba."})}><FileText size={16}/> Checklist de fontes</Button></div><div className="source-grid">{sources.map(([title,desc,org,url])=><a className="source-card" href={url} target="_blank" rel="noreferrer" key={title}><div className="source-mark"><FileText size={18}/></div><div><span>{org}</span><h3>{title}</h3><p>{desc}</p><small>abrir fonte <ChevronRight size={14}/></small></div></a>)}</div><div className="source-note"><CircleHelp size={18}/><span>O banco inicial é um protótipo de treinamento. Para uso como material definitivo, valide cada questão e comentário no edital e nas fontes oficiais vigentes.</span></div></div>}
