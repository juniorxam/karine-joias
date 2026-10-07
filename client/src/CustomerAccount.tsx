import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock3, CreditCard, Eye, LogIn, Package, ShieldCheck, Truck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type Order = {
  id: string;
  order_number: string;
  total_amount: number;
  subtotal_amount: number;
  shipping_amount: number;
  discount_amount: number;
  payment_status: string;
  status: string;
  created_at: string;
  payment_url?: string | null;
  order_items?: Array<{ id:string; product_name:string; quantity:number; unit_price:number; total_price:number }>;
  shipments?: Array<{ carrier?:string|null; service?:string|null; tracking_code?:string|null; tracking_url?:string|null; shipping_status?:string|null }>;
};

const statusLabels: Record<string,string> = {
  PENDING_PAYMENT:"Aguardando pagamento",
  PAID:"Pagamento confirmado",
  PROCESSING:"Em preparação",
  READY_TO_SHIP:"Pronto para envio",
  SHIPPED:"Pedido enviado",
  DELIVERED:"Entregue",
  CANCELLED:"Pedido cancelado",
  REFUNDED:"Pedido reembolsado",
};
const paymentLabels: Record<string,string> = {
  PENDING:"Pagamento pendente",
  PAID:"Pagamento confirmado",
  APPROVED:"Pagamento confirmado",
  IN_PROCESS:"Pagamento em análise",
  REFUNDED:"Pagamento reembolsado",
  FAILED:"Pagamento recusado",
  REJECTED:"Pagamento recusado",
};
const money=(value:number)=>Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export default function CustomerAccount({ onBack }:{onBack:()=>void}) {
  const [session,setSession]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [mode,setMode]=useState<"login"|"signup"|"reset">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [orders,setOrders]=useState<Order[]>([]);
  const [selected,setSelected]=useState<Order|null>(null);
  const [activeTab,setActiveTab]=useState<"overview"|"orders">("overview");
  const [search,setSearch]=useState("");
  const [orderFilter,setOrderFilter]=useState("ALL");

  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session?.user?.id||!supabase){setOrders([]);return;}
    let cancelled=false;
    (async()=>{
      const {data,error}=await supabase.from("orders")
        .select("id,order_number,total_amount,subtotal_amount,shipping_amount,discount_amount,payment_status,status,created_at,payment_url,order_items(id,product_name,quantity,unit_price,total_price),shipments(carrier,service,tracking_code,tracking_url,shipping_status)")
        .eq("customer_user_id",session.user.id)
        .order("created_at",{ascending:false});
      if(cancelled)return;
      if(error){toast.error("Não foi possível carregar seus pedidos",{description:error.message});return;}
      setOrders((data||[]) as Order[]);
    })();
    return()=>{cancelled=true;};
  },[session?.user?.id]);

  const filteredOrders=orders.filter(order => {
    const matchesSearch=!search.trim() || order.order_number.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus=orderFilter==="ALL" || order.status===orderFilter;
    return matchesSearch && matchesStatus;
  });
  const latestOrder=orders[0];
  const activeOrders=orders.filter(o=>!["DELIVERED","CANCELLED","REFUNDED"].includes(o.status));
  const totalSpent=orders.reduce((sum,o)=>sum+Number(o.total_amount||0),0);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!supabase)return;
    setBusy(true);
    try{
      if(mode==="reset"){
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:window.location.origin+"/minha-conta"});
        if(error)throw error;
        toast.success("E-mail de recuperação enviado");
        return;
      }
      if(mode==="signup"){
        const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password});
        if(error)throw error;
        if(data.session)toast.success("Conta criada com sucesso");
        else toast.success("Conta criada",{description:"Confira seu e-mail para confirmar o cadastro, se a confirmação estiver ativada."});
      }else{
        const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
        if(error)throw error;
        toast.success("Login realizado");
      }
    }catch(error){toast.error("Não foi possível continuar",{description:error instanceof Error?error.message:"Verifique seus dados."});}
    finally{setBusy(false);}
  };

  if(loading)return <main className="customer-account-page"><section className="customer-card"><p>Carregando sua conta...</p></section></main>;

  if(!session)return <main className="customer-account-page"><section className="customer-card customer-auth-card">
    <button className="customer-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button>
    <div className="customer-icon"><UserRound size={25}/></div>
    <p className="store-kicker">MINHA CONTA</p>
    <h1>{mode==="login"?"Entrar na Violetta":mode==="signup"?"Criar minha conta":"Recuperar senha"}</h1>
    <p>{mode==="login"?"Acompanhe seus pedidos, pagamentos e entregas em um só lugar.":mode==="signup"?"Crie sua conta para acompanhar automaticamente suas compras.":"Informe seu e-mail e enviaremos um link para redefinir sua senha."}</p>
    <form onSubmit={submit} className="customer-form">
      <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
      {mode!=="reset"&&<label>Senha<i  return <main className="customer-account-page"><section className="customer-card customer-account-shell">
    <div className="customer-account-topbar">
      <button className="customer-back" onClick={onBack}><ArrowLeft size={16}/> Voltar à loja</button>
      <button className="customer-logout" onClick={async()=>{await supabase?.auth.signOut();setSelected(null);}}>Sair</button>
    </div>
    <div className="customer-profile-hero">
      <div className="customer-avatar"><UserRound size={26}/></div>
      <div className="customer-profile-copy"><p className="store-kicker">MINHA CONTA</p><h1>Olá, {session.user.email?.split("@")[0] || "cliente"} ✨</h1><span>{session.user.email}</span></div>
      <div className="customer-trust"><ShieldCheck size={18}/><span>Conta protegida</span></div>
    </div>

    {!selected && <div className="customer-tabs">
      <button className={activeTab==="overview"?"active":""} onClick={()=>setActiveTab("overview")}>Visão geral</button>
      <button className={activeTab==="orders"?"active":""} onClick={()=>setActiveTab("orders")}>Meus pedidos <b>{orders.length}</b></button>
    </div>}

    {selected?<div className="customer-order-detail">
      <button className="customer-back" onClick={()=>setSelected(null)}><ArrowLeft size={16}/> Voltar aos pedidos</button>
      <div className="customer-order-title"><div><p className="store-kicker">DETALHES DO PEDIDO</p><h2>{selected.order_number}</h2><small>{new Date(selected.created_at).toLocaleString("pt-BR")}</small></div><strong>{money(selected.total_amount)}</strong></div>
      <div className="customer-timeline">
        {[
          ["PENDING_PAYMENT","Pedido recebido",Package],
          ["PAID","Pagamento confirmado",CreditCard],
          ["PROCESSING","Em preparação",Clock3],
          ["SHIPPED","Enviado",Truck],
          ["DELIVERED","Entregue",Check],
        ].map(([key,label,Icon],i)=>{
          const orderSteps=["PENDING_PAYMENT","PAID","PROCESSING","READY_TO_SHIP","SHIPPED","DELIVERED"];
          const current=Math.max(orderSteps.indexOf(selected.status),selected.payment_status==="APPROVED"||selected.payment_status==="PAID"?1:0);
          const step=orderSteps.indexOf(key as string);
          const done=current>=step;
          return <div className={`customer-step ${done?"done":""}`} key={String(key)}><span className="customer-step-dot"><Icon size={15}/></span><div><strong>{label}</strong><small>{done?"Concluído":"Aguardando"}</small></div>{i<4&&<span className="customer-step-line"/>}</div>
        })}
      </div>
      <div className="customer-status-box"><strong>{statusLabels[selected.status]||selected.status}</strong><span>{paymentLabels[selected.payment_status]||selected.payment_status}</span></div>
      <div className="customer-detail-grid">
        <div className="customer-detail-panel"><h3>Produtos</h3><div className="customer-order-items">{(selected.order_items||[]).map(item=><div key={item.id}><span>{item.quantity}× {item.product_name}</span><strong>{money(Number(item.total_price||item.unit_price*item.quantity))}</strong></div>)}</div></div>
        <div className="customer-detail-panel"><h3>Resumo</h3><div className="customer-summary-row"><span>Subtotal</span><strong>{money(selected.subtotal_amount)}</strong></div><div className="customer-summary-row"><span>Frete</span><strong>{money(selected.shipping_amount)}</strong></div>{Number(selected.discount_amount)>0&&<div className="customer-summary-row"><span>Desconto</span><strong>- {money(selected.discount_amount)}</strong></div>}<div className="customer-total"><span>Total</span><strong>{money(selected.total_amount)}</strong></div></div>
      </div>
      {selected.shipments?.[0]?.tracking_code&&<div className="customer-tracking"><Truck size={20}/><div><strong>{selected.shipments[0].carrier||"Entrega"}</strong><span>{selected.shipments[0].tracking_code}</span>{selected.shipments[0].tracking_url&&<a href={selected.shipments[0].tracking_url} target="_blank" rel="noreferrer">Acompanhar entrega ↗</a>}</div></div>}
      {!["PAID","APPROVED"].includes(String(selected.payment_status||"").toUpperCase())&&selected.payment_url&&<a className="checkout-submit customer-pay" href={selected.payment_url}>Continuar pagamento</a>}
    </div>:activeTab==="overview"?<div>
      <div className="customer-metrics"><div><Package/><span>Pedidos</span><strong>{orders.length}</strong></div><div><Truck/><span>Em andamento</span><strong>{activeOrders.length}</strong></div><div><CreditCard/><span>Total comprado</span><strong>{money(totalSpent)}</strong></div></div>
      {latestOrder?<div className="customer-latest"><div className="customer-section-head"><div><p className="store-kicker">COMPRA MAIS RECENTE</p><h2>{latestOrder.order_number}</h2></div><button onClick={()=>setSelected(latestOrder)}>Ver pedido <Eye size={16}/></button></div><div className="customer-latest-meta"><span>{new Date(latestOrder.created_at).toLocaleDateString("pt-BR")}</span><b>{statusLabels[latestOrder.status]||latestOrder.status}</b><strong>{money(latestOrder.total_amount)}</strong></div></div>:<div className="customer-empty"><Package size={30}/><h3>Você ainda não tem pedidos.</h3><p>Faça sua primeira compra e acompanhe tudo por aqui.</p><button className="store-primary-cta" onClick={onBack}>Começar a comprar</button></div>}
    </div>:<div>
      <div className="customer-orders-toolbar"><input placeholder="Buscar por número do pedido..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={orderFilter} onChange={e=>setOrderFilter(e.target.value)}><option value="ALL">Todos os status</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      {!filteredOrders.length?<div className="customer-empty"><Package size={28}/><h3>Nenhum pedido encontrado.</h3><p>Tente alterar a busca ou o filtro.</p></div>:<div className="customer-orders-list">{filteredOrders.map(order=><button className="customer-order-row" key={order.id} onClick={()=>setSelected(order)}><span className="customer-order-icon"><Package size={19}/></span><span className="customer-order-main"><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString("pt-BR")} · {statusLabels[order.status]||order.status}</small></span><strong>{money(order.total_amount)}</strong><span className="customer-order-arrow">›</span></button>)}</div>}
    </div>}
  </section></main>;mpra, estando logado, o pedido aparecerá automaticamente aqui.</p><button className="store-primary-cta" onClick={onBack}>Começar a comprar</button></div>:<div className="customer-orders-list">{orders.map(order=><button className="customer-order-row" key={order.id} onClick={()=>setSelected(order)}><span className="customer-order-icon"><Package size={19}/></span><span className="customer-order-main"><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString("pt-BR")} · {statusLabels[order.status]||order.status}</small></span><strong>{money(order.total_amount)}</strong><span className="customer-order-arrow">›</span></button>)}</div>}
    </>}
  </section></main>;
}
