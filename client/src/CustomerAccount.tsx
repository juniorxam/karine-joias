import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock3, CreditCard, Eye, Package, ShieldCheck, Truck, UserRound, X, Save, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type StatusHistory = { id:string; status:string; note?:string|null; created_at:string };
type Order = {
  id:string; order_number:string; total_amount:number; subtotal_amount:number; shipping_amount:number; discount_amount:number;
  payment_status:string; status:string; created_at:string; payment_url?:string|null;
  shipping_address?: { postal_code?:string; address?:string; number?:string; complement?:string; neighborhood?:string; city?:string; state?:string; shipping_option?:{service?:string;price?:number} }|null;
  order_items?: Array<{id:string;product_name:string;quantity:number;unit_price:number;total_price:number}>;
  shipments?: Array<{carrier?:string|null;service?:string|null;tracking_code?:string|null;tracking_url?:string|null;shipping_status?:string|null}>;
  order_status_history?: StatusHistory[];
};

const statusLabels:Record<string,string>={PENDING_PAYMENT:"Aguardando pagamento",PAID:"Pagamento confirmado",PROCESSING:"Em preparação",READY_TO_SHIP:"Pronto para envio",SHIPPED:"Pedido enviado",DELIVERED:"Entregue",CANCELLED:"Pedido cancelado",REFUNDED:"Pedido reembolsado"};
const paymentLabels:Record<string,string>={PENDING:"Pagamento pendente",PAID:"Pagamento confirmado",APPROVED:"Pagamento confirmado",IN_PROCESS:"Pagamento em análise",REFUNDED:"Pagamento reembolsado",FAILED:"Pagamento recusado",REJECTED:"Pagamento recusado"};
const money=(value:number)=>Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const displayStatus=(status:string)=>statusLabels[status]||status;
const orderSteps=["PENDING_PAYMENT","PAID","PROCESSING","READY_TO_SHIP","SHIPPED","DELIVERED"];

export default function CustomerAccount({onBack}:{onBack:()=>void}){
  const [session,setSession]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [mode,setMode]=useState<"login"|"signup"|"reset"|"new-password">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [orders,setOrders]=useState<Order[]>([]);
  const [selected,setSelected]=useState<Order|null>(null);
  const [activeTab,setActiveTab]=useState<"overview"|"orders"|"profile">("overview");
  const [search,setSearch]=useState("");
  const [orderFilter,setOrderFilter]=useState("ALL");
  const [profileName,setProfileName]=useState("");
  const [profilePhone,setProfilePhone]=useState("");
  const [profileBusy,setProfileBusy]=useState(false);
  const [confirmationSent,setConfirmationSent]=useState(false);
  const [loginConfirmationNeeded,setLoginConfirmationNeeded]=useState(false);\n  const [signupAccountExists,setSignupAccountExists]=useState(false);

  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    let mounted=true;
    supabase.auth.getSession().then(({data})=>{
      if(!mounted)return;
      setSession(data.session);
      if(data.session?.user?.email)setEmail(data.session.user.email);
      setProfileName(String(data.session?.user?.user_metadata?.full_name||""));
      setProfilePhone(String(data.session?.user?.user_metadata?.phone||""));
      setLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{
      if(!mounted)return;
      setSession(next);
      if(next?.user?.email)setEmail(next.user.email);
      setProfileName(String(next?.user?.user_metadata?.full_name||""));
      setProfilePhone(String(next?.user?.user_metadata?.phone||""));
      if(event==="PASSWORD_RECOVERY")setMode("new-password");
    });
    return()=>{mounted=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!session?.user?.id||!supabase){setOrders([]);return;}
    let cancelled=false;
    (async()=>{
      const {data,error}=await supabase.from("orders")
        .select("id,order_number,total_amount,subtotal_amount,shipping_amount,discount_amount,payment_status,status,created_at,payment_url,shipping_address,order_items(id,product_name,quantity,unit_price,total_price),shipments(carrier,service,tracking_code,tracking_url,shipping_status),order_status_history(id,status,note,created_at)")
        .eq("customer_user_id",session.user.id)
        .order("created_at",{ascending:false});
      if(cancelled)return;
      if(error){toast.error("Não foi possível carregar seus pedidos",{description:error.message});return;}
      setOrders(((data||[]) as Order[]).map(order=>({...order,order_status_history:[...(order.order_status_history||[])].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())})));
    })();
    return()=>{cancelled=true;};
  },[session?.user?.id]);

  const filteredOrders=useMemo(()=>orders.filter(order=>{
    const q=search.trim().toLowerCase();
    return (!q||order.order_number.toLowerCase().includes(q))&&(orderFilter==="ALL"||order.status===orderFilter);
  }),[orders,search,orderFilter]);
  const latestOrder=orders[0];
  const activeOrders=orders.filter(o=>!["DELIVERED","CANCELLED","REFUNDED"].includes(o.status));
  const totalSpent=orders.reduce((sum,o)=>sum+Number(o.total_amount||0),0);

  const submitAuth=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!supabase)return;
    setBusy(true);
    try{
      if(mode==="reset"){
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:window.location.origin+"/minha-conta"});
        if(error)throw error;
        toast.success("E-mail de recuperação enviado",{description:"Confira sua caixa de entrada e abra o link para criar uma nova senha."});
        setMode("login"); return;
      }
      if(mode==="new-password"){
        if(password.length<6)throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
        if(password!==confirmPassword)throw new Error("As senhas não conferem.");
        const {error}=await supabase.auth.updateUser({password});
        if(error)throw error;
        setPassword("");setConfirmPassword("");setMode("login");
        toast.success("Senha atualizada com sucesso");
        return;
      }
      if(mode==="signup"){
        if(password.length<6)throw new Error("A senha deve ter pelo menos 6 caracteres.");
        const {data,error}=await supabase.auth.signUp({
          email:email.trim().toLowerCase(),
          password,
          options:{emailRedirectTo:window.location.origin+"/minha-conta"}
        });
        if(error){
          const message=error.message.toLowerCase();
          if(message.includes("already registered")||message.includes("already exists")||message.includes("user already")||message.includes("email already")){
            setSignupAccountExists(true);
            return;
          }
          throw error;
        }
        setSignupAccountExists(false);
        if(data.session){
          setConfirmationSent(false);
          toast.success("Conta criada com sucesso");
        }else{
          setConfirmationSent(true);
          toast.success("Conta criada",{description:"Confira seu e-mail para confirmar o cadastro."});
        }
      }else{
        const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
        if(error){
          const message=error.message.toLowerCase();
          if(message.includes("email not confirmed")||message.includes("email not verified")||message.includes("email confirmation")){
            setLoginConfirmationNeeded(true);
            return;
          }
          throw error;
        }
        setLoginConfirmationNeeded(false);
        toast.success("Login realizado");
      }
    }catch(error){toast.error("Não foi possível continuar",{description:error instanceof Error?error.message:"Verifique seus dados."});}
    finally{setBusy(false);}
  };

  const resendConfirmation=async()=>{
    if(!supabase||!email.trim())return;
    setBusy(true);
    try{
      const {error}=await supabase.auth.resend({
        type:"signup",
        email:email.trim().toLowerCase(),
        options:{emailRedirectTo:window.location.origin+"/minha-conta"}
      });
      if(error)throw error;
      toast.success("E-mail de confirmação reenviado",{description:"Confira também a pasta de spam ou promoções."});
    }catch(error){
      toast.error("Não foi possível reenviar o e-mail",{description:error instanceof Error?error.message:"Tente novamente em alguns instantes."});
    }finally{setBusy(false);}
  };

  const saveProfile=async()=>{
    if(!supabase||!session?.user)return;
    if(profileName.trim().length<2)return toast.error("Informe seu nome completo.");
    setProfileBusy(true);
    try{
      const {data,error}=await supabase.auth.updateUser({data:{full_name:profileName.trim(),phone:profilePhone.replace(/\D/g,"")}});
      if(error)throw error;
      setSession((current:any)=>current?{...current,user:data.user}:current);
      toast.success("Perfil atualizado");
    }catch(error){toast.error("Não foi possível salvar o perfil",{description:error instanceof Error?error.message:"Tente novamente."});}
    finally{setProfileBusy(false);}
  };

  if(loading)return <main className="customer-account-page"><section className="customer-card"><p>Carregando sua conta...</p></section></main>;

  if(!session || mode==="new-password")return <main className="customer-account-page"><section className="customer-card customer-auth-card">
    <button className="customer-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button>
    <div className="customer-icon">{mode==="new-password"?<LockKeyhole size={25}/>:<UserRound size={25}/>}</div>
    <p className="store-kicker">MINHA CONTA</p>
    <h1>{mode==="login"?"Entrar na Violetta":mode==="signup"?"Criar minha conta":mode==="reset"?"Recuperar senha":"Criar nova senha"}</h1>
    <p>{mode==="login"?"Acompanhe seus pedidos, pagamentos e entregas em um só lugar.":mode==="signup"?"Crie sua conta para acompanhar automaticamente suas compras.":mode==="reset"?"Informe seu e-mail e enviaremos um link seguro.":"Defina uma nova senha para proteger sua conta."}</p>
    <form onSubmit={submitAuth} className="customer-form">
      {mode!=="new-password"&&<label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>}
      {mode!=="reset"&&<label>{mode==="new-password"?"Nova senha":"Senha"}<input type="password" autoComplete={mode==="new-password"?"new-password":"current-password"} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} /></label>}
      {mode==="new-password"&&<label>Confirmar nova senha<input type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} /></label>}
      <button className="store-primary-cta" disabled={busy}>{busy?"Aguarde…":mode==="login"?"Entrar":mode==="signup"?"Criar conta":mode==="reset"?"Enviar link":"Salvar nova senha"}</button>
    </form>
    {mode==="login"&&loginConfirmationNeeded&&<div className="customer-security-badge" style={{marginTop:14}}>
      <X size={17}/>
      <span><strong>Este e-mail ainda não foi confirmado.</strong> Confirme seu cadastro para entrar na sua conta.</span>
      <button type="button" className="customer-text-button" onClick={resendConfirmation} disabled={busy}>{busy?"Enviando…":"Reenviar confirmação"}</button>
    </div>}
    {mode==="login"&&<><button className="customer-text-button" onClick={()=>{setLoginConfirmationNeeded(false);setMode("reset")}}>Esqueci minha senha</button><p className="customer-auth-switch">Ainda não tem conta? <button onClick={()=>{setLoginConfirmationNeeded(false);setSignupAccountExists(false);setMode("signup")}}>Criar conta</button></p></>}
    {mode==="signup"&&signupAccountExists&&<div className="customer-security-badge" style={{marginTop:14}}><X size={17}/><span><strong>Este e-mail já possui uma conta.</strong> Você já está cadastrado na Violetta. Entre na sua conta ou recupere sua senha se não lembrar dela.</span><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}><button type="button" className="customer-text-button" onClick={()=>{setSignupAccountExists(false);setMode("login")}}>Entrar</button><button type="button" className="customer-text-button" onClick={()=>{setSignupAccountExists(false);setMode("reset")}}>Recuperar senha</button></div></div>}\n    {mode==="signup"&&confirmationSent&&<div className="customer-security-badge" style={{marginTop:14}}>
      <Check size={17}/>
      <span>Enviamos o e-mail de confirmação para <strong>{email}</strong>. Abra o link para ativar sua conta.</span>
      <button type="button" className="customer-text-button" onClick={resendConfirmation} disabled={busy}>{busy?"Enviando…":"Reenviar e-mail"}</button>
    </div>}
    {mode==="signup"&&<p className="customer-auth-switch">Já tem conta? <button onClick={()=>{setSignupAccountExists(false);setMode("login")}}>Entrar</button></p>}
    {mode==="reset"&&<p className="customer-auth-switch"><button onClick={()=>setMode("login")}>Voltar para o login</button></p>}
  </section></main>;

  return <main className="customer-account-page"><section className="customer-card customer-account-shell">
    <div className="customer-account-topbar"><button className="customer-back" onClick={onBack}><ArrowLeft size={16}/> Voltar à loja</button><button className="customer-logout" onClick={async()=>{await supabase?.auth.signOut();setSelected(null);}}>Sair</button></div>
    <div className="customer-profile-hero"><div className="customer-avatar"><UserRound size={26}/></div><div className="customer-profile-copy"><p className="store-kicker">MINHA CONTA</p><h1>Olá, {profileName||session.user.email?.split("@")[0]||"cliente"} ✨</h1><span>{session.user.email}</span></div><div className="customer-trust"><ShieldCheck size={18}/><span>Conta protegida</span></div></div>
    {!selected&&<div className="customer-tabs">
      <button className={activeTab==="overview"?"active":""} onClick={()=>setActiveTab("overview")}>Visão geral</button>
      <button className={activeTab==="orders"?"active":""} onClick={()=>setActiveTab("orders")}>Meus pedidos <b>{orders.length}</b></button>
      <button className={activeTab==="profile"?"active":""} onClick={()=>setActiveTab("profile")}>Meu perfil</button>
    </div>}

    {selected?<div className="customer-order-detail">
      <button className="customer-back" onClick={()=>setSelected(null)}><ArrowLeft size={16}/> Voltar aos pedidos</button>
      <div className="customer-order-title"><div><p className="store-kicker">DETALHES DO PEDIDO</p><h2>{selected.order_number}</h2><small>{new Date(selected.created_at).toLocaleString("pt-BR")}</small></div><strong>{money(selected.total_amount)}</strong></div>
      <div className="customer-timeline">{[["PENDING_PAYMENT","Pedido recebido",Package],["PAID","Pagamento confirmado",CreditCard],["PROCESSING","Em preparação",Clock3],["READY_TO_SHIP","Pronto para envio",Package],["SHIPPED","Enviado",Truck],["DELIVERED","Entregue",Check]].map(([key,label,Icon],i)=>{
        const history=selected.order_status_history||[];
        const event=history.find(item=>item.status===key);
        const current=orderSteps.indexOf(selected.status);
        const done=i<=current;
        return <div className={"customer-step "+(done?"done":"")} key={String(key)}><span className="customer-step-dot"><Icon size={15}/></span><div><strong>{String(label)}</strong><small>{event?new Date(event.created_at).toLocaleString("pt-BR"):done?"Concluído":"Aguardando"}</small></div>{i<5&&<span className="customer-step-line"/>}</div>;
      })}</div>
      <div className="customer-status-box"><strong>{displayStatus(selected.status)}</strong><span>{paymentLabels[selected.payment_status]||selected.payment_status}</span></div>
      <div className="customer-detail-grid">
        <div className="customer-detail-panel"><h3>Produtos</h3><div className="customer-order-items">{(selected.order_items||[]).map(item=><div key={item.id}><span>{item.quantity}× {item.product_name}</span><strong>{money(Number(item.total_price||item.unit_price*item.quantity))}</strong></div>)}</div></div>
        <div className="customer-detail-panel"><h3>Resumo</h3><div className="customer-summary-row"><span>Subtotal</span><strong>{money(selected.subtotal_amount)}</strong></div><div className="customer-summary-row"><span>Frete</span><strong>{Number(selected.shipping_amount)>0?money(selected.shipping_amount):"À parte / grátis"}</strong></div>{Number(selected.discount_amount)>0&&<div className="customer-summary-row"><span>Desconto</span><strong>- {money(selected.discount_amount)}</strong></div>}<div className="customer-total"><span>Total</span><strong>{money(selected.total_amount)}</strong></div></div>
      </div>
      {selected.shipping_address&&<div className="customer-detail-panel" style={{marginTop:14}}><h3>Entrega</h3><p>{selected.shipping_address.shipping_option?.service||"Entrega"} · {selected.shipping_address.address||""}{selected.shipping_address.number?", "+selected.shipping_address.number:""}{selected.shipping_address.complement?" · "+selected.shipping_address.complement:""}</p><small>{selected.shipping_address.neighborhood||""} · {selected.shipping_address.city||""}/{selected.shipping_address.state||""} · CEP {selected.shipping_address.postal_code||""}</small></div>}
      {selected.order_status_history?.length&&<div className="customer-detail-panel" style={{marginTop:14}}><h3>Histórico do pedido</h3>{selected.order_status_history.map(event=><div className="customer-summary-row" key={event.id}><span>{displayStatus(event.status)}{event.note?" · "+event.note:""}</span><small>{new Date(event.created_at).toLocaleString("pt-BR")}</small></div>)}</div>}
      {selected.shipments?.[0]?.tracking_code&&<div className="customer-tracking"><Truck size={20}/><div><strong>{selected.shipments[0].carrier||"Entrega"}</strong><span>{selected.shipments[0].tracking_code}</span>{selected.shipments[0].tracking_url&&<a href={selected.shipments[0].tracking_url} target="_blank" rel="noreferrer">Acompanhar entrega ↗</a>}</div></div>}
      {!["PAID","APPROVED"].includes(String(selected.payment_status||"").toUpperCase())&&selected.payment_url&&<a className="checkout-submit customer-pay" href={selected.payment_url}>Continuar pagamento</a>}
    </div>
    :activeTab==="overview"?<div>
      <div className="customer-metrics"><div><Package/><span>Pedidos</span><strong>{orders.length}</strong></div><div><Truck/><span>Em andamento</span><strong>{activeOrders.length}</strong></div><div><CreditCard/><span>Total comprado</span><strong>{money(totalSpent)}</strong></div></div>
      {latestOrder?<div className="customer-latest"><div className="customer-section-head"><div><p className="store-kicker">COMPRA MAIS RECENTE</p><h2>{latestOrder.order_number}</h2></div><button onClick={()=>setSelected(latestOrder)}>Ver pedido <Eye size={16}/></button></div><div className="customer-latest-meta"><span>{new Date(latestOrder.created_at).toLocaleDateString("pt-BR")}</span><b>{displayStatus(latestOrder.status)}</b><strong>{money(latestOrder.total_amount)}</strong></div></div>:<div className="customer-empty"><Package size={30}/><h3>Você ainda não tem pedidos.</h3><p>Faça sua primeira compra e acompanhe tudo por aqui.</p><button className="store-primary-cta" onClick={onBack}>Começar a comprar</button></div>}
    </div>
    :activeTab==="orders"?<div>
      <div className="customer-orders-toolbar"><input placeholder="Buscar por número do pedido..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={orderFilter} onChange={e=>setOrderFilter(e.target.value)}><option value="ALL">Todos os status</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      {!filteredOrders.length?<div className="customer-empty"><Package size={28}/><h3>Nenhum pedido encontrado.</h3><p>Tente alterar a busca ou o filtro.</p></div>:<div className="customer-orders-list">{filteredOrders.map(order=><button className="customer-order-row" key={order.id} onClick={()=>setSelected(order)}><span className="customer-order-icon"><Package size={19}/></span><span className="customer-order-main"><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString("pt-BR")} · {displayStatus(order.status)}</small></span><strong>{money(order.total_amount)}</strong><span className="customer-order-arrow">›</span></button>)}</div>}
    </div>
    :<div className="customer-profile-panel"><div className="customer-detail-panel"><p className="store-kicker">DADOS DA CONTA</p><h2>Meu perfil</h2><div className="customer-form"><label>Nome completo<input value={profileName} onChange={e=>setProfileName(e.target.value)} autoComplete="name"/></label><label>WhatsApp<input value={profilePhone} onChange={e=>setProfilePhone(e.target.value)} autoComplete="tel"/></label><label>E-mail<input value={session.user.email||""} readOnly/></label><button className="store-primary-cta" onClick={saveProfile} disabled={profileBusy}><Save size={16}/>{profileBusy?"Salvando…":"Salvar dados"}</button></div></div><div className="customer-detail-panel"><p className="store-kicker">SEGURANÇA</p><h2>Sua conta</h2><p>Você pode sair da conta a qualquer momento ou usar a recuperação de senha na tela de login.</p><div className="customer-security-badge"><LockKeyhole size={17}/><span>Autenticação por e-mail e senha</span></div></div></div>}
  </section></main>;
}
