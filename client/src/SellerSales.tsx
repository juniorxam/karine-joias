import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShoppingBag, Clock3, CheckCircle2, MessageCircle, ChevronDown, ChevronUp, TrendingUp, CircleDollarSign, CalendarDays, CreditCard, X, Eye } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type SellerOrder = {
  id: string; order_number: string; customer_name: string; customer_email: string | null;
  customer_phone: string | null; total_amount: number; shipping_amount: number | null;
  status: string; payment_status: string; payment_method: string | null; created_at: string;
  shipping_address: Record<string, any> | null;
};
const money = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string) => new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const orderStatus: Record<string, string> = { PENDING_PAYMENT:"Aguardando pagamento", PAID:"Pago", PROCESSING:"Em preparação", READY_TO_SHIP:"Pronto para envio", SHIPPED:"Enviado", DELIVERED:"Entregue", CANCELLED:"Cancelado", REFUNDED:"Reembolsado" };
const payStatus: Record<string, string> = { PENDING:"Pendente", IN_PROCESS:"Em análise", PAID:"Pago", APPROVED:"Pago", FAILED:"Falhou", CANCELLED:"Cancelado", REFUNDED:"Reembolsado" };
const paymentMethod: Record<string, string> = { pix:"PIX", credit_card:"Cartão de crédito", debit_card:"Cartão de débito", cash:"Dinheiro", transfer:"Transferência" };
const paid = (o: SellerOrder) => ["PAID","APPROVED"].includes(String(o.payment_status).toUpperCase());
const closed = (o: SellerOrder) => ["DELIVERED","CANCELLED","REFUNDED"].includes(String(o.status).toUpperCase());
const css: Record<string, React.CSSProperties> = {
  card:{background:"#fff",border:"1px solid #eee5e8",borderRadius:18,padding:20,minWidth:0,boxShadow:"0 6px 24px rgba(95,54,68,.035)"},
  muted:{color:"#8a7d82",fontSize:12}, label:{fontSize:12,color:"#85777d",fontWeight:600}, value:{fontSize:25,fontWeight:700,letterSpacing:"-.7px",color:"#35272d",display:"block",marginTop:10},
  icon:{width:42,height:42,borderRadius:13,display:"grid",placeItems:"center",background:"#fff0f5",color:"#bd6d8a",flexShrink:0},
  pill:{fontSize:11,fontWeight:700,borderRadius:20,padding:"5px 9px",display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap" as const}
};
export default function SellerSales({ ownerId }: { ownerId: string }) {
  const [orders,setOrders] = useState<SellerOrder[]>([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [filter,setFilter] = useState("ABERTOS");
  const [query,setQuery] = useState("");
  const [selected,setSelected] = useState<string|null>(null);
  const [period,setPeriod] = useState<7|30|0>(7);
  const load = useCallback(async(quiet=false) => {
    if(!supabase||!ownerId){setLoading(false);return;}
    if(quiet)setRefreshing(true);else setLoading(true);
    const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,customer_email,customer_phone,total_amount,shipping_amount,status,payment_status,payment_method,created_at,shipping_address").eq("owner_id",ownerId).order("created_at",{ascending:false}).limit(200);
    if(error)toast.error("Não foi possível carregar as vendas",{description:error.message});else setOrders((data||[]) as SellerOrder[]);
    setLoading(false);setRefreshing(false);
  },[ownerId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!supabase||!ownerId)return;const channel=supabase.channel("seller-sales-"+ownerId).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"owner_id=eq."+ownerId},()=>{void load(true);}).subscribe();return()=>{void supabase?.removeChannel(channel);};},[ownerId,load]);

  const periodOrders=useMemo(()=>{if(!period)return orders;const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-(period-1));return orders.filter(o=>new Date(o.created_at)>=start);},[orders,period]);
  const paidOrders=periodOrders.filter(paid);
  const revenue=paidOrders.reduce((s,o)=>s+Number(o.total_amount||0),0);
  const pending=periodOrders.filter(o=>["PENDING","IN_PROCESS"].includes(String(o.payment_status).toUpperCase())).length;
  const openCount=orders.filter(o=>!closed(o)).length;
  const average=paidOrders.length?revenue/paidOrders.length:0;
  const chartData=useMemo(()=>{const count=period||30;const days: {key:string,label:string,total:number,orders:number}[]=[];for(let i=count-1;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=d.toLocaleDateString("en-CA");days.push({key,label:d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),total:0,orders:0});}for(const o of orders){const key=new Date(o.created_at).toLocaleDateString("en-CA");const day=days.find(d=>d.key===key);if(day){day.orders++;if(paid(o))day.total+=Number(o.total_amount||0);}}return days;},[orders,period]);
  const statusCounts=useMemo(()=>[{label:"Aguardando pagamento",count:orders.filter(o=>["PENDING_PAYMENT"].includes(o.status)||["PENDING","IN_PROCESS"].includes(String(o.payment_status).toUpperCase())).length,color:"#d69b45"},{label:"Em preparação",count:orders.filter(o=>["PROCESSING","READY_TO_SHIP"].includes(o.status)).length,color:"#bd7a96"},{label:"Enviados",count:orders.filter(o=>["SHIPPED"].includes(o.status)).length,color:"#7897b2"},{label:"Concluídos",count:orders.filter(o=>o.status==="DELIVERED").length,color:"#739b83"}],[orders]);
  const visible=useMemo(()=>orders.filter(o=>{const q=query.trim().toLowerCase();const matchQ=!q||[o.order_number,o.customer_name,o.customer_email||"",o.customer_phone||""].some(v=>v.toLowerCase().includes(q));const ps=String(o.payment_status).toUpperCase();const match=filter==="TODOS"||filter==="ABERTOS"?! (filter==="ABERTOS"&&closed(o)) : filter==="PAGOS"?paid(o):filter==="PENDENTES"?["PENDING","IN_PROCESS"].includes(ps):o.status===filter;return matchQ&&match;}),[orders,query,filter]);
  const openWhatsApp=(o:SellerOrder)=>{const phone=String(o.customer_phone||"").replace(/\D/g,"");if(!phone)return toast.error("Este cliente não tem telefone cadastrado.");const message=`Olá, ${o.customer_name}! Aqui é da Violetta. Estou entrando em contato sobre o pedido ${o.order_number}.`;window.open("https://wa.me/"+(phone.startsWith("55")?phone:"55"+phone)+"?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");};
  const address=(o:SellerOrder)=>{const a=o.shipping_address||{};return [a.address||a.street||a.logradouro,a.number||a.numero,a.complement,a.neighborhood||a.bairro,a.city||a.cidade,a.state||a.estado,a.postal_code||a.cep].filter(Boolean).join(", ");};
  const badge=(label:string,color:string,bg:string)=><span style={{...css.pill,color,background:bg}}><span style={{width:6,height:6,borderRadius:9,background:color}}/>{label}</span>;

  return <div className="content seller-sales" style={{maxWidth:1600}}>
    <div className="page-head sales-page-head" style={{alignItems:"center",marginBottom:24}}>
      <div><p className="eyebrow">VIOLETTA · PAINEL DE INTELIGÊNCIA</p><h2 style={{marginBottom:8}}>Visão geral das vendas</h2><p>Acompanhe faturamento, pagamentos e pedidos em um só lugar.</p></div>
      <button className="ghost" type="button" onClick={()=>void load(true)} disabled={refreshing} style={{display:"inline-flex",alignItems:"center",gap:8,borderRadius:10,padding:"11px 15px"}}><RefreshCw size={16} className={refreshing?"animate-spin":""}/>{refreshing?"Atualizando…":"Atualizar dados"}</button>
    </div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,color:"#4a3941",display:"flex",alignItems:"center",gap:8}}><CalendarDays size={16} color="#bd6d8a"/> Indicadores do período</div>
      <div className="sales-period-switch" style={{display:"flex",gap:5,padding:4,background:"#f1e9ec",borderRadius:11}}>
        {([{v:7,l:"7 dias"},{v:30,l:"30 dias"},{v:0,l:"Todo período"}] as const).map(p=><button key={p.v} type="button" onClick={()=>setPeriod(p.v)} style={{border:0,borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,background:period===p.v?"#fff":"transparent",color:period===p.v?"#a85474":"#84777c",boxShadow:period===p.v?"0 2px 8px #5d31400c":"none"}}>{p.l}</button>)}
      </div>
    </div>
    <div className="sales-metrics-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(205px,1fr))",gap:14,marginBottom:18}}>
      <div style={css.card}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><span style={css.label}>Faturamento confirmado</span><div style={css.icon}><CircleDollarSign size={21}/></div></div><strong style={css.value}>{money(revenue)}</strong><div style={{...css.muted,marginTop:8}}>Pagamentos aprovados no período</div></div>
      <div style={css.card}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><span style={css.label}>Pedidos recebidos</span><div style={{...css.icon,background:"#f1f1fb",color:"#7776b2"}}><ShoppingBag size={21}/></div></div><strong style={css.value}>{periodOrders.length}</strong><div style={{...css.muted,marginTop:8}}>Dentro do período selecionado</div></div>
      <div style={css.card}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><span style={css.label}>Ticket médio pago</span><div style={{...css.icon,background:"#edf6ef",color:"#6c9477"}}><TrendingUp size={21}/></div></div><strong style={css.value}>{money(average)}</strong><div style={{...css.muted,marginTop:8}}>{paidOrders.length} pedido(s) com pagamento confirmado</div></div>
      <div style={css.card}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><span style={css.label}>Precisam de atenção</span><div style={{...css.icon,background:"#fff4e7",color:"#c18a42"}}><Clock3 size={21}/></div></div><strong style={css.value}>{openCount}</strong><div style={{...css.muted,marginTop:8}}>{pending} pagamento(s) aguardando confirmação no período</div></div>
    </div>

    <div className="sales-charts-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1.65fr) minmax(260px,1fr)",gap:16,marginBottom:18}}>
      <section style={css.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:18}}><div><h3 style={{fontSize:16,margin:"0 0 5px",color:"#3c2e34"}}>Evolução do faturamento</h3><p style={{...css.muted,margin:0}}>Somente pedidos com pagamento aprovado</p></div><span style={{...css.pill,color:"#7d8d79",background:"#edf4ed"}}><TrendingUp size={13}/> Confirmado</span></div>
        <div style={{height:245,width:"100%"}}>{loading?<p style={css.muted}>Carregando gráfico…</p>:<ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:8,right:8,left:0,bottom:0}}><defs><linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c77896" stopOpacity={0.24}/><stop offset="95%" stopColor="#c77896" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#f0e9ec" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="label" tick={{fontSize:11,fill:"#9b8d93"}} axisLine={false} tickLine={false} minTickGap={18}/><YAxis tick={{fontSize:11,fill:"#9b8d93"}} axisLine={false} tickLine={false} width={48} tickFormatter={v=>v===0?"R$ 0":`R$${v>=1000?(v/1000).toFixed(1)+"k":v}`}/><Tooltip formatter={(v:any)=>[money(Number(v)),"Faturamento"]} labelStyle={{color:"#59424b"}} contentStyle={{border:"1px solid #eee2e7",borderRadius:12,fontSize:12,boxShadow:"0 8px 25px #512b3a12"}}/><Area type="monotone" dataKey="total" stroke="#bd6d8a" strokeWidth={2.5} fill="url(#salesGradient)" activeDot={{r:5,strokeWidth:0}}/></AreaChart></ResponsiveContainer>}</div>
      </section>
      <section style={css.card}>
        <div style={{marginBottom:22}}><h3 style={{fontSize:16,margin:"0 0 5px",color:"#3c2e34"}}>Situação dos pedidos</h3><p style={{...css.muted,margin:0}}>Distribuição dos últimos 200 pedidos</p></div>
        <div style={{display:"grid",gap:19}}>{statusCounts.map(s=>{const total=Math.max(orders.length,1);const pct=Math.round(s.count/total*100);return <div key={s.label}><div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:8,fontSize:12}}><span style={{color:"#6c5e64"}}>{s.label}</span><strong style={{color:"#3c2e34"}}>{s.count} <span style={{fontWeight:500,color:"#9b8d93"}}>({pct}%)</span></strong></div><div style={{height:7,borderRadius:9,background:"#f3edf0",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:s.color,borderRadius:9,transition:"width .3s"}}/></div></div>})}</div>
        <div style={{marginTop:24,padding:13,borderRadius:12,background:"#fff6f9",display:"flex",gap:10,alignItems:"center"}}><Eye size={17} color="#b86685"/><span style={{fontSize:11,lineHeight:1.5,color:"#8c6574"}}>Painel de acompanhamento em modo de leitura. Alterações operacionais continuam no painel administrativo.</span></div>
      </section>
    </div>

    <section style={{...css.card,padding:0,overflow:"hidden"}}>
      <div style={{padding:"21px 22px 17px",borderBottom:"1px solid #f0e8eb",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <div><h3 style={{fontSize:17,margin:"0 0 5px",color:"#3c2e34"}}>Pedidos recentes</h3><p style={{...css.muted,margin:0}}>Selecione um pedido para ver os detalhes e entrar em contato com o cliente.</p></div>
        <div style={{position:"relative",minWidth:230,flex:"0 1 330px"}}><Search size={16} color="#a18d96" style={{position:"absolute",left:13,top:13}}/><input aria-label="Buscar pedido" placeholder="Buscar pedido, cliente ou telefone" value={query} onChange={e=>setQuery(e.target.value)} style={{padding:"11px 12px 11px 38px",width:"100%",border:"1px solid #eadfe4",borderRadius:10,background:"#fffafc",fontSize:12}}/></div>
      </div>
      <div className="sales-filter-row" style={{display:"flex",gap:7,flexWrap:"wrap",padding:"14px 22px",borderBottom:"1px solid #f4edf0"}}>
        {[["ABERTOS","Em aberto"],["TODOS","Todos"],["PAGOS","Pagos"],["PENDENTES","Pendentes"],["READY_TO_SHIP","Prontos para envio"]].map(([v,l])=><button key={v} type="button" onClick={()=>setFilter(v)} style={{border:filter===v?"1px solid #e6b7c8":"1px solid #eee5e9",background:filter===v?"#fff0f5":"#fff",color:filter===v?"#a85474":"#83757b",padding:"8px 12px",borderRadius:9,fontSize:11,fontWeight:700}}>{l}</button>)}
      </div>
      {loading?<div style={{padding:35,textAlign:"center",color:"#95858d"}}>Carregando pedidos…</div>:visible.length===0?<div style={{padding:"48px 20px",textAlign:"center"}}><div style={{...css.icon,margin:"0 auto 12px",width:52,height:52}}><ShoppingBag size={24}/></div><h3 style={{margin:"0 0 6px",color:"#493740",fontSize:16}}>Nenhum pedido encontrado</h3><p style={{...css.muted,margin:0}}>Tente alterar os filtros ou a busca.</p></div>:
      <div>{visible.map(o=>{const isOpen=selected===o.id;const isPaid=paid(o);const os=String(o.status||"").toUpperCase();const ps=String(o.payment_status||"").toUpperCase();const statusColor=isPaid?["DELIVERED"].includes(os)?"#56846a":"#6b8c75":["CANCELLED","FAILED","REFUNDED"].includes(ps)||os==="CANCELLED"?"#b85e66":"#b8863c";const statusBg=isPaid?"#edf6ef":["CANCELLED","FAILED","REFUNDED"].includes(ps)||os==="CANCELLED"?"#fff0ef":"#fff5e7";
      return <div key={o.id} style={{borderBottom:"1px solid #f2eaed"}}>
        <button className="sales-order-row" type="button" onClick={()=>setSelected(isOpen?null:o.id)} style={{display:"grid",gridTemplateColumns:"minmax(0,1.7fr) minmax(100px,.8fr) minmax(100px,.7fr) 28px",alignItems:"center",gap:14,width:"100%",padding:"17px 22px",border:0,background:isOpen?"#fff9fb":"#fff",color:"inherit",cursor:"pointer",textAlign:"left"}}>
          <div style={{display:"flex",gap:12,alignItems:"center",minWidth:0}}><div style={{...css.icon,width:40,height:40,borderRadius:12,background:isPaid?"#edf6ef":"#fff4e7",color:isPaid?"#6c9477":"#c18a42"}}>{isPaid?<CheckCircle2 size={19}/>:<ShoppingBag size={19}/>}</div><div style={{minWidth:0}}><strong style={{display:"block",fontSize:13,color:"#493740"}}>Pedido #{o.order_number}</strong><span style={{display:"block",fontSize:12,color:"#776870",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.customer_name}</span><span style={{display:"block",fontSize:10,color:"#a18e97",marginTop:3}}>{date(o.created_at)}</span></div></div>
          <div>{badge(orderStatus[os]||o.status||"Sem status",statusColor,statusBg)}</div>
          <div style={{textAlign:"right"}}><strong style={{fontSize:14,color:"#3d2d35",display:"block"}}>{money(Number(o.total_amount))}</strong><span style={{fontSize:11,color:isPaid?"#6c9477":"#b8863c",display:"block",marginTop:4}}>{payStatus[ps]||o.payment_status||"Pagamento não informado"}</span></div>
          <span style={{color:"#aa929c"}}>{isOpen?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</span>
        </button>
        {isOpen&&<div className="sales-order-details" style={{margin:"0 22px 18px 74px",padding:18,border:"1px solid #f0e2e8",borderRadius:14,background:"#fffafd"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"16px 20px"}}>
            <div><span style={css.label}>Forma de pagamento</span><p style={{fontSize:13,color:"#493740",margin:"6px 0 0",display:"flex",alignItems:"center",gap:7}}><CreditCard size={15} color="#bd6d8a"/>{paymentMethod[String(o.payment_method||"").toLowerCase()]||o.payment_method||"Não informado"}</p></div>
            <div><span style={css.label}>Frete</span><p style={{fontSize:13,color:"#493740",margin:"6px 0 0"}}>{money(Number(o.shipping_amount||0))}</p></div>
            <div><span style={css.label}>E-mail</span><p style={{fontSize:13,color:"#493740",margin:"6px 0 0",overflowWrap:"anywhere"}}>{o.customer_email||"Não informado"}</p></div>
            <div><span style={css.label}>Telefone</span><p style={{fontSize:13,color:"#493740",margin:"6px 0 0"}}>{o.customer_phone||"Não informado"}</p></div>
            <div style={{gridColumn:"1 / -1"}}><span style={css.label}>Endereço de entrega</span><p style={{fontSize:13,color:"#493740",margin:"6px 0 0"}}>{address(o)||"Endereço não informado"}</p></div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>{o.customer_phone&&<button className="primary" type="button" onClick={()=>openWhatsApp(o)} style={{display:"inline-flex",alignItems:"center",gap:7,borderRadius:9,padding:"10px 13px",fontSize:12}}><MessageCircle size={15}/> Conversar no WhatsApp</button>}<button className="ghost" type="button" onClick={()=>void load(true)} style={{display:"inline-flex",alignItems:"center",gap:7,borderRadius:9,padding:"10px 13px",fontSize:12}}><RefreshCw size={15}/> Atualizar dados</button><button className="ghost" type="button" onClick={()=>setSelected(null)} style={{display:"inline-flex",alignItems:"center",gap:7,borderRadius:9,padding:"10px 13px",fontSize:12}}><X size={15}/> Fechar detalhes</button></div>
        </div>}
      </div>})}
      <div style={{padding:"13px 22px",background:"#fffafd",display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",fontSize:11,color:"#98868f"}}><span>Exibindo {visible.length} de {orders.length} pedidos carregados</span><span><span style={{display:"inline-block",width:7,height:7,borderRadius:9,background:"#6c9477",marginRight:6}}/>Atualização automática quando disponível</span></div>
      </div>}
    </section>
    <p style={{fontSize:11,color:"#a18e97",marginTop:14,lineHeight:1.6}}>Os indicadores consideram até 200 pedidos mais recentes carregados do banco de dados. O faturamento exibido é o total bruto dos pedidos com pagamento aprovado; não representa lucro líquido nem desconta taxas, custos ou estornos parciais.</p>
  </div>;
}
