import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, PackageCheck, RefreshCw, ShieldCheck, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type OrderItem = { id: string; product_name: string; quantity: number; unit_price: number; total_price: number };
type Shipment = { carrier: string | null; service: string | null; tracking_code: string | null; tracking_url: string | null; shipping_status: string; melhor_envio_order_id: string | null; label_url: string | null; melhor_envio_tracking_status: string | null; melhor_envio_label_status: string | null };
type History = { id: string; status: string; note: string | null; created_at: string };
type PaymentEvent = { id: string; provider: string | null; provider_event_id: string | null; event_type: string | null; payload: Record<string, any> | null; created_at: string };
type PaymentDetails = {
  provider: string | null;
  provider_id: string | null;
  payment_url: string | null;
  method: string | null;
  status: string | null;
  status_detail: string | null;
  transaction_id: string | null;
  amount: number | null;
  net_amount: number | null;
  installments: number | null;
  payer_email: string | null;
  payer_name: string | null;
  external_reference: string | null;
  date_approved: string | null;
  expiration_date: string | null;
  events: PaymentEvent[];
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  payment_provider: string | null;
  payment_provider_id: string | null;
  payment_url: string | null;
  created_at: string;
  shipping_address: any;
  shipping_amount: number;
};

const statusOptions = ["PENDING_PAYMENT", "PAID", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

const statusLabel: Record<string,string> = {
  PENDING_PAYMENT:"Aguardando pagamento", PAID:"Pago", PROCESSING:"Em preparação",
  READY_TO_SHIP:"Pronto para envio", SHIPPED:"Enviado", DELIVERED:"Entregue",
  CANCELLED:"Cancelado", REFUNDED:"Reembolsado"
};

const statusTransitions: Record<string,string[]> = {
  PENDING_PAYMENT:["CANCELLED"],
  PAID:["PROCESSING","REFUNDED"],
  PROCESSING:["READY_TO_SHIP","REFUNDED"],
  READY_TO_SHIP:["SHIPPED","REFUNDED"],
  SHIPPED:["DELIVERED"],
  DELIVERED:[],
  CANCELLED:[],
  REFUNDED:[]
};

const money=(n:number)=>Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=(v:string)=>new Date(v).toLocaleString("pt-BR");
const paymentMethodLabel=(id:string|null|undefined)=>{const map:Record<string,string>={pix:"PIX",credit_card:"Cartão de crédito",debit_card:"Cartão de débito",account_money:"Saldo Mercado Pago",bank_transfer:"Transferência bancária",ticket:"Boleto"};return id?map[id]||id:"—";};
const paymentStatusLabel=(id:string|null|undefined)=>{const map:Record<string,string>={PAID:"Pago",PENDING:"Pendente",APPROVED:"Aprovado",REFUNDED:"Reembolsado",FAILED:"Falhou",CANCELLED:"Cancelado",REJECTED:"Recusado",IN_PROCESS:"Em análise"};return id?map[String(id).toUpperCase()]||id:"—";};
const paymentPayload=(payload:Record<string,any>|null)=>{if(!payload)return {}; const nested=payload.data && typeof payload.data==="object"?payload.data:{}; return {...payload,...nested};};

export default function Orders({ ownerId }: { ownerId?: string }) {
  const [orders,setOrders]=useState<Order[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("TODOS");
  const [paymentFilter,setPaymentFilter]=useState("TODOS");
  const [period,setPeriod]=useState("TODOS");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState("RECENTES");
  const [selected,setSelected]=useState<Order|null>(null);
  const [items,setItems]=useState<OrderItem[]>([]);
  const [shipment,setShipment]=useState<Shipment|null>(null);
  const [history,setHistory]=useState<History[]>([]);
  const [payment,setPayment]=useState<PaymentDetails|null>(null);
  const [tracking,setTracking]=useState("");
  const [healthLoading,setHealthLoading]=useState(false);
  const [health,setHealth]=useState<{ok:boolean;checked_at:string;checks:Array<{name:string;ok:boolean;detail?:string;status?:number;count?:number;message?:string}>}|null>(null);

  const load=async()=>{
    if(!supabase||!ownerId)return;
    setLoading(true);
    const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,customer_email,customer_phone,total_amount,shipping_amount,shipping_address,status,payment_status,payment_method,payment_provider,payment_provider_id,payment_url,created_at").eq("owner_id",ownerId).order("created_at",{ascending:false});
    if(error)toast.error("Não foi possível carregar os pedidos",{description:error.message});
    else setOrders((data??[]) as Order[]);
    setLoading(false);
  };

  useEffect(()=>{void load()},[ownerId]);

  useEffect(()=>{
    if(!selected)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape")setSelected(null);
    };
    window.addEventListener("keydown",onKeyDown);
    return()=>window.removeEventListener("keydown",onKeyDown);
  },[selected]);

  const copyText=async(value:string,label:string)=>{
    try{
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    }catch{
      toast.error(`Não foi possível copiar ${label.toLowerCase()}`);
    }
  };

  const openWhatsApp=(order:Order)=>{
    const phone=String(order.customer_phone||"").replace(/\D/g,"");
    if(!phone){toast.error("Cliente sem telefone cadastrado");return;}
    const message=`Olá, ${order.customer_name}. Sobre o pedido ${order.order_number} da Violetta, estou entrando em contato para atualizar você sobre o seu pedido.`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
  };

  const runProductionHealthcheck=async()=>{
    if(!supabase)return;
    setHealthLoading(true);
    const {data,error}=await supabase.functions.invoke("production-healthcheck",{body:{}});
    setHealthLoading(false);
    if(error){toast.error("Diagnóstico não executado",{description:error.message});return;}
    setHealth(data as typeof health);
    if(data?.ok) toast.success("Diagnóstico concluído: ambiente apto nos itens verificados");
    else toast.error("Diagnóstico encontrou pendências");
  };

  const openOrder=async(order:Order)=>{
    if(!supabase)return;
    setSelected(order); setTracking("");
    const [i,s,h,p]=await Promise.all([
      supabase.from("order_items").select("id,product_name,quantity,unit_price,total_price").eq("order_id",order.id),
      supabase.from("shipments").select("carrier,service,tracking_code,tracking_url,shipping_status,melhor_envio_order_id,label_url,melhor_envio_tracking_status,melhor_envio_label_status").eq("order_id",order.id).maybeSingle(),
      supabase.from("order_status_history").select("id,status,note,created_at").eq("order_id",order.id).order("created_at",{ascending:false}),
      supabase.from("payment_events").select("id,provider,provider_event_id,event_type,payload,created_at").eq("order_id",order.id).order("created_at",{ascending:false})
    ]);
    if(i.error||s.error||h.error||p.error) toast.error("Não foi possível carregar os detalhes do pedido");
    setItems((i.data||[]) as OrderItem[]); setShipment((s.data||null) as Shipment|null); setHistory((h.data||[]) as History[]);
    const latest=paymentPayload((p.data?.[0]?.payload||null) as Record<string,any>|null);
    setPayment({
      provider: order.payment_provider || latest.provider || null,
      provider_id: order.payment_provider_id || (latest.id?String(latest.id):null),
      payment_url: order.payment_url || latest.point_of_interaction?.transaction_data?.ticket_url || null,
      method: latest.payment_method_id || latest.payment_type_id || order.payment_method || null,
      status: latest.status || order.payment_status || null,
      status_detail: latest.status_detail || null,
      transaction_id: latest.transaction_details?.transaction_id || latest.point_of_interaction?.transaction_data?.e2e_id || null,
      amount: latest.transaction_amount ?? null,
      net_amount: latest.transaction_details?.net_received_amount ?? null,
      installments: latest.installments ?? null,
      payer_email: latest.payer?.email || null,
      payer_name: [latest.payer?.first_name,latest.payer?.last_name].filter(Boolean).join(" ") || latest.additional_info?.payer?.first_name || null,
      external_reference: latest.external_reference || null,
      date_approved: latest.date_approved || null,
      expiration_date: latest.date_of_expiration || null,
      events: (p.data||[]) as PaymentEvent[]
    });
    setTracking(s.data?.tracking_code||"");
  };

  const saveShipment=async()=>{
    if(!supabase||!selected)return;
    const {error}=await supabase.rpc("save_order_shipment_service",{
      p_order_id: selected.id,
      p_owner_id: ownerId,
      p_tracking_code: tracking.trim(),
      p_carrier: shipment?.carrier||null,
      p_service: shipment?.service||null,
      p_tracking_url: shipment?.tracking_url||null,
      p_melhor_envio_order_id: shipment?.melhor_envio_order_id||null,
      p_label_url: shipment?.label_url||null
    });
    if(error){toast.error("Não foi possível salvar o rastreio",{description:error.message});return;}
    toast.success(tracking.trim() && selected.status==="READY_TO_SHIP" ? "Rastreamento salvo e pedido enviado" : "Rastreamento atualizado");
    await load();
    await openOrder({...selected,status:tracking.trim() && selected.status==="READY_TO_SHIP"?"SHIPPED":selected.status});
  };

  const updateStatus=async(order:Order,status:string)=>{
    if(!supabase)return;

    if(status===order.status)return;
    const allowed = statusTransitions;
    if(!(allowed[order.status]||[]).includes(status)){
      toast.error("Transição de status inválida",{
        description:`Não é possível mudar de "${statusLabel[order.status]||order.status}" para "${statusLabel[status]||status}".`
      });
      return;
    }

    // A loja só pode iniciar a preparação depois da confirmação do pagamento.
    if(status==="PROCESSING" && !["PAID","APPROVED"].includes(String(order.payment_status||"").toUpperCase())){
      toast.error("Pagamento ainda não confirmado");
      return;
    }

    if(status==="CANCELLED") {
      if(["PAID","APPROVED"].includes(String(order.payment_status||"").toUpperCase())){
        toast.error("Pedido pago não pode ser cancelado diretamente", {description:"Use o fluxo de reembolso para pedidos já pagos."});
        return;
      }
      const {error}=await supabase.rpc("cancel_order_admin_service",{
        p_order_id: order.id,
        p_owner_id: ownerId
      });
      if(error){
        toast.error("Não foi possível cancelar o pedido",{description:error.message});
        return;
      }
    } else if(status==="REFUNDED") {
      if(!["PAID","APPROVED"].includes(String(order.payment_status||"").toUpperCase())){
        toast.error("Só é possível reembolsar um pagamento confirmado");
        return;
      }
      const {error}=await supabase.functions.invoke("admin-refund",{
        body:{order_id:order.id}
      });
      if(error){
        toast.error("Não foi possível reembolsar",{description:error.message});
        return;
      }
    } else {
      const {error}=await supabase.rpc("update_order_status_service",{
        p_order_id: order.id,
        p_owner_id: ownerId,
        p_status: status
      });
      if(error){
        toast.error("Não foi possível atualizar",{description:error.message});
        return;
      }
    }

    setOrders(v=>v.map(x=>x.id===order.id?{...x,status}:x));
    toast.success("Pedido atualizado");
    await openOrder({...order,status});
  };

  const visible=orders.filter(x=>{const statusOk=filter==="TODOS"||x.status===filter;const paymentOk=paymentFilter==="TODOS"||String(x.payment_status||"").toUpperCase()===paymentFilter;const queryOk=!query.trim()||`${x.order_number} ${x.customer_name} ${x.customer_email}`.toLowerCase().includes(query.toLowerCase());const days=period==="TODOS"?Infinity:Number(period);const periodOk=period==="TODOS"||((Date.now()-new Date(x.created_at).getTime())<=days*86400000);return statusOk&&paymentOk&&queryOk&&periodOk;});
  const totalVisible=visible.reduce((sum,x)=>sum+Number(x.total_amount||0),0);
  const paidVisible=visible.filter(x=>["PAID","APPROVED"].includes(String(x.payment_status||"").toUpperCase())).reduce((sum,x)=>sum+Number(x.total_amount||0),0);
  const pendingVisible=visible.filter(x=>["PENDING","IN_PROCESS"].includes(String(x.payment_status||"").toUpperCase())).reduce((sum,x)=>sum+Number(x.total_amount||0),0);
  const openVisible=visible.filter(x=>!["DELIVERED","CANCELLED","REFUNDED"].includes(x.status)).length;
  const attentionVisible=visible.filter(x=>
    ["PENDING_PAYMENT","PAID","PROCESSING","READY_TO_SHIP"].includes(x.status) ||
    ["PENDING","IN_PROCESS"].includes(String(x.payment_status||"").toUpperCase())
  ).length;
  const sortedVisible=[...visible].sort((a,b)=>{
    if(sort==="MAIOR_VALOR") return Number(b.total_amount||0)-Number(a.total_amount||0);
    if(sort==="MENOR_VALOR") return Number(a.total_amount||0)-Number(b.total_amount||0);
    if(sort==="CLIENTE") return a.customer_name.localeCompare(b.customer_name,"pt-BR");
    return new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
  });
  const quickFilter=(type:"ATTENTION"|"READY"|"PENDING")=>{
    setFilter("TODOS");
    setPaymentFilter(type==="PENDING"?"PENDING":"TODOS");
    setPeriod("TODOS");
    setQuery("");
    if(type==="READY")setFilter("READY_TO_SHIP");
    if(type==="ATTENTION")setPaymentFilter("PENDING");
  };
  const exportVisibleCsv=()=>{
    const header=["Pedido","Cliente","E-mail","Data","Pagamento","Método","Total","Status"];
    const rows=sortedVisible.map(x=>[x.order_number,x.customer_name,x.customer_email,date(x.created_at),paymentStatusLabel(x.payment_status),paymentMethodLabel(x.payment_method),Number(x.total_amount||0).toFixed(2),statusLabel[x.status]||x.status]);
    const csv=[header,...rows].map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="pedidos-violetta.csv"; a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const resetFilters=()=>{setFilter("TODOS");setPaymentFilter("TODOS");setPeriod("TODOS");setQuery("");setSort("RECENTES");};
  const timeline=[...(history||[]).map(h=>({kind:"status",date:h.created_at,title:statusLabel[h.status]||h.status,detail:h.note||"Atualização do pedido"})),...(payment?.events||[]).map(e=>({kind:"payment",date:e.created_at,title:e.event_type||"Evento de pagamento",detail:e.provider_event_id?((e.provider||"Mercado Pago")+" · "+e.provider_event_id):(e.provider||"Mercado Pago")}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());

  const refreshSelected=async()=>{
    if(!selected)return;
    await load();
    const current=orders.find(x=>x.id===selected.id)||selected;
    await openOrder(current);
    toast.success("Detalhes atualizados");
  };

  const openCustomerWhatsApp=()=>{if(!selected)return;openWhatsApp(selected);};  const openStatusWhatsApp=(order:Order)=>{
    const phone=String(order.customer_phone||"").replace(/\D/g,"");
    if(!phone){toast.error("Cliente sem telefone cadastrado");return;}
    const label=statusLabel[order.status]||order.status;
    const message="Olá, "+order.customer_name+"! Sobre o pedido "+order.order_number+" da Violetta: o status atual é \""+label+"\". Se precisar de alguma informação, estou à disposição.";
    window.open("https://wa.me/55"+phone+"?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");
  };

  const copyAddress=async(order:Order)=>{
    const a=order.shipping_address||{};
    const text=[a.address&&a.number?a.address+", "+a.number:a.address,a.complement,a.neighborhood,a.city&&a.state?a.city+" - "+a.state:a.city,a.postal_code?"CEP "+a.postal_code:null].filter(Boolean).join("\n");
    if(!text){toast.error("Endereço não disponível");return;}
    await copyText(text,"Endereço");
  };
  const icon=(status:string)=>status==="SHIPPED"?<Truck size={16}/>:status==="DELIVERED"?<CheckCircle2 size={16}/>:status==="PAID"||status==="PROCESSING"?<PackageCheck size={16}/>:<Clock3 size={16}/>;

  return <><div className="page-head"><div><p className="eyebrow">E-COMMERCE</p><h2>Pedidos online</h2><p>Acompanhe pagamentos, preparação e entrega dos pedidos da loja.</p></div><div style={{display:"flex",gap:8,alignItems:"center"}}><button className="secondary" onClick={()=>void runProductionHealthcheck()} disabled={healthLoading}><ShieldCheck size={14}/> {healthLoading?"Diagnosticando...":"Diagnóstico de produção"}</button><button className="secondary" onClick={()=>void load()}><RefreshCw size={14}/> Atualizar</button></div></div>
    {health&&<section style={{margin:"0 0 18px",padding:16,border:"1px solid rgba(0,0,0,.1)",borderRadius:14,background:"rgba(255,255,255,.7)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:10}}><strong>{health.ok?"Produção sem falhas críticas":"Produção com pendências"}</strong><small>{new Date(health.checked_at).toLocaleString("pt-BR")}</small></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>{(health.checks||[]).map((check)=><div key={check.name} style={{padding:"10px 12px",borderRadius:10,border:"1px solid rgba(0,0,0,.08)"}}><div style={{fontWeight:700}}>{check.ok?"✓":"!"} {check.name}</div><small>{check.detail||check.message||"Verificado"}</small></div>)}</div></section>}
    <div className="orders-kpi-grid">
      <div className="stat orders-stat"><small>Pedidos filtrados</small><strong>{visible.length}</strong><span>{openVisible} em andamento · {attentionVisible} com atenção</span></div>
      <div className="stat orders-stat orders-stat-money"><small>Faturamento filtrado</small><strong>{money(totalVisible)}</strong><span>ticket médio {visible.length?money(totalVisible/visible.length):money(0)}</span></div>
      <div className="stat orders-stat orders-stat-money"><small>Pagamentos confirmados</small><strong>{money(paidVisible)}</strong><span>{visible.filter(x=>["PAID","APPROVED"].includes(String(x.payment_status||"").toUpperCase())).length} pedidos</span></div>
      <div className="stat orders-stat orders-stat-money"><small>Pagamentos pendentes</small><strong>{money(pendingVisible)}</strong><span>{visible.filter(x=>["PENDING","IN_PROCESS"].includes(String(x.payment_status||"").toUpperCase())).length} pedidos</span></div>
    </div>
    <div className="orders-summary">{["TODOS","PENDING_PAYMENT","PAID","PROCESSING","READY_TO_SHIP","SHIPPED","DELIVERED","CANCELLED","REFUNDED"].map(s=><button key={s} className={filter===s?"selected":""} onClick={()=>setFilter(s)}>{s==="TODOS"?"Todos":statusLabel[s]||s}<b>{s==="TODOS"?orders.length:orders.filter(x=>x.status===s).length}</b></button>)}</div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}><button className="secondary" onClick={()=>quickFilter("ATTENTION")}>Pendentes</button><button className="secondary" onClick={()=>quickFilter("READY")}>Prontos para envio</button><button className="secondary" onClick={()=>quickFilter("PENDING")}>Pagamento pendente</button><button className="secondary" onClick={exportVisibleCsv}>Exportar CSV</button></div><div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) 160px 160px 170px auto",gap:8,marginBottom:14}}><input placeholder="Buscar pedido, cliente ou e-mail" value={query} onChange={e=>setQuery(e.target.value)}/><select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}><option value="TODOS">Todos pagamentos</option><option value="PAID">Pago</option><option value="PENDING">Pendente</option><option value="REFUNDED">Reembolsado</option><option value="FAILED">Falhou</option></select><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="TODOS">Todo período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="RECENTES">Mais recentes</option><option value="MAIOR_VALOR">Maior valor</option><option value="MENOR_VALOR">Menor valor</option><option value="CLIENTE">Cliente (A-Z)</option></select><button className="secondary" onClick={resetFilters}>Limpar filtros</button></div>
    <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>
      {loading?<tr><td colSpan={7}>Carregando pedidos...</td></tr>:visible.length===0?<tr><td colSpan={7}>Nenhum pedido encontrado.</td></tr>:sortedVisible.map(order=><tr key={order.id}><td><button className="order-link" onClick={()=>void openOrder(order)}><strong>{order.order_number}</strong></button></td><td><strong>{order.customer_name}</strong><small className="order-email">{order.customer_email}</small></td><td>{date(order.created_at)}</td><td><span className="payment-pill">{paymentStatusLabel(order.payment_status)}</span></td><td><strong>{money(order.total_amount)}</strong></td><td><span className="order-status">{icon(order.status)} {statusLabel[order.status]||order.status}</span></td><td><div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <select className="order-select" value={order.status} onChange={e=>void updateStatus(order,e.target.value)}>{statusOptions.filter(s=>s===order.status||(statusTransitions[order.status]||[]).includes(s)).map(s=><option key={s} value={s}>{statusLabel[s]||s}</option>)}</select>
        <button className="secondary" title="Abrir pedido" onClick={()=>void openOrder(order)}>Abrir</button>
        <button className="secondary" title="Copiar número do pedido" onClick={()=>void copyText(order.order_number,"Número do pedido")}>Copiar</button>
        <button className="secondary" title="WhatsApp do cliente" onClick={()=>openWhatsApp(order)}>WhatsApp</button>
      </div></td></tr>)}
    </tbody></table></div>
    {selected&&<div className="order-detail-backdrop" onMouseDown={()=>setSelected(null)}><aside className="order-detail" onMouseDown={e=>e.stopPropagation()}><button className="close order-close" onClick={()=>setSelected(null)}><X size={18}/></button><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,paddingRight:34}}><p className="eyebrow" style={{margin:0}}>PEDIDO ONLINE</p><button className="secondary" onClick={()=>void refreshSelected()} title="Atualizar detalhes"><RefreshCw size={14}/> Atualizar</button></div><h2>{selected.order_number}</h2><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}><span className="payment-pill">{String(selected.shipping_address?.shipping_option?.service||"").includes("Retirada no local") ? "Retirada no local" : Number(selected.shipping_amount||0)===0 ? "Frete a combinar" : "Frete " + money(Number(selected.shipping_amount||0))}</span></div><p className="order-customer"><strong>{selected.customer_name}</strong><br/>{selected.customer_email}<br/>{selected.customer_phone}</p><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}><button className="secondary" onClick={()=>void copyText(selected.order_number,"Número do pedido")}>Copiar pedido</button><button className="secondary" onClick={()=>openWhatsApp(selected)}>WhatsApp</button><button className="secondary" onClick={()=>void copyAddress(selected)}>Copiar endereço</button><button className="secondary" onClick={()=>openStatusWhatsApp(selected)}>Mensagem de status</button>{payment?.payment_url&&<button className="secondary" onClick={()=>window.open(payment.payment_url as string,"_blank","noopener,noreferrer")}>Abrir pagamento</button>}</div><h3>Itens</h3>{items.map(item=><div className="order-item-row" key={item.id}><span>{item.quantity}× {item.product_name}</span><strong>{money(item.total_price)}</strong></div>)}<div className="order-detail-total"><span>Produtos</span><strong>{money(selected.total_amount-Number(selected.shipping_amount||0))}</strong></div><div className="order-detail-total"><span>Frete</span><strong>{Number(selected.shipping_amount||0)===0 ? "À parte" : money(Number(selected.shipping_amount||0))}</strong></div><div className="order-detail-total grand"><span>Total</span><strong>{money(selected.total_amount)}</strong></div><h3>Pagamento</h3><div style={{padding:"12px 14px",border:"1px solid rgba(0,0,0,.08)",borderRadius:12,background:"rgba(0,0,0,.02)",marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
        <div><small>Provedor</small><strong style={{display:"block"}}>{payment?.provider==="mercadopago"?"Mercado Pago":payment?.provider||"—"}</strong></div>
        <div><small>Status</small><strong style={{display:"block"}}>{payment?.status||"—"}{payment?.status_detail?(" · "+payment.status_detail):""}</strong></div>
        <div><small>Método</small><strong style={{display:"block"}}>{paymentMethodLabel(payment?.method)}</strong></div>
        <div><small>ID do pagamento</small><strong style={{display:"block",wordBreak:"break-all"}}>{payment?.provider_id||"—"}</strong>{payment?.provider_id&&<button className="secondary" style={{marginTop:4}} onClick={()=>void copyText(payment.provider_id as string,"ID do pagamento")}>Copiar</button>}</div><div><small>ID transação</small><strong style={{display:"block",wordBreak:"break-all"}}>{payment?.transaction_id||"—"}</strong></div>
        <div><small>Valor processado</small><strong style={{display:"block"}}>{payment?.amount!=null?money(payment.amount):"—"}</strong></div>
        <div><small>Valor líquido</small><strong style={{display:"block"}}>{payment?.net_amount!=null?money(payment.net_amount):"—"}</strong></div>
        <div><small>Parcelas</small><strong style={{display:"block"}}>{payment?.installments??"—"}</strong></div>
        <div><small>Referência externa</small><strong style={{display:"block",wordBreak:"break-all"}}>{payment?.external_reference||"—"}</strong></div>
      </div>
      {(payment?.payer_name||payment?.payer_email)&&<p style={{margin:"12px 0 0"}}><strong>Pagador:</strong> {payment?.payer_name||"—"}{payment?.payer_email?(" · "+payment.payer_email):""}</p>}
      {(payment?.date_approved||payment?.expiration_date)&&<p style={{margin:"8px 0 0"}}><small>{payment?.date_approved?("Aprovado em "+date(payment.date_approved)):""}{payment?.expiration_date?(" · Expira em "+date(payment.expiration_date)):""}</small></p>}
      {payment?.payment_url&&<p style={{margin:"12px 0 0"}}><a href={payment.payment_url} target="_blank" rel="noreferrer">Abrir pagamento/checkout do Mercado Pago ↗</a></p>}
      <h4 style={{margin:"16px 0 8px"}}>Eventos do pagamento</h4>
      {payment?.events?.length ? payment.events.map(e=><div key={e.id} style={{padding:"8px 0",borderTop:"1px solid rgba(0,0,0,.06)"}}><strong>{e.event_type||"Evento"}</strong><small style={{display:"block"}}>{e.provider||"Mercado Pago"} · {e.provider_event_id||"sem ID"} · {date(e.created_at)}</small></div>) : <small>Nenhum evento registrado para este pedido.</small>}
    </div><h3>Entrega</h3><p>{selected.shipping_address?.address}, {selected.shipping_address?.number}<br/>{selected.shipping_address?.neighborhood}<br/>{selected.shipping_address?.city} - {selected.shipping_address?.state}<br/>CEP {selected.shipping_address?.postal_code}</p><h3>Entrega e frete</h3><div style={{padding:"12px 14px",border:"1px solid rgba(0,0,0,.08)",borderRadius:12,background:"rgba(0,0,0,.02)",marginBottom:16}}><strong>{String(selected.shipping_address?.shipping_option?.service||"").includes("Retirada no local") ? "Retirada no local" : Number(selected.shipping_amount||0)===0 ? "Frete a combinar" : "Frete calculado"}</strong><p style={{margin:"6px 0 0"}}>{String(selected.shipping_address?.shipping_option?.service||"").includes("Retirada no local") ? "Cliente fará a retirada no local, sem cobrança de frete." : String(selected.shipping_address?.shipping_option?.service||"").includes("Entrega em Palmas") ? "Entrega em Palmas: frete calculado automaticamente pela distância." : "O frete não foi calculado automaticamente e será negociado diretamente com a loja."}</p></div><h3>Rastreamento</h3><div className="tracking-edit"><input placeholder="Código de rastreio (opcional)" value={tracking} onChange={e=>setTracking(e.target.value)}/><button className="primary" onClick={()=>void saveShipment()}>Salvar</button>{tracking&&<button className="secondary" onClick={()=>void copyText(tracking,"Código de rastreio")}>Copiar</button>}</div>{shipment?.carrier&&<p><strong>Transportadora:</strong> {shipment.carrier}{shipment.service ? " — " + shipment.service : ""}</p>}{shipment?.tracking_url&&<a href={shipment.tracking_url} target="_blank" rel="noreferrer">Abrir rastreio</a>}{shipment?.label_url&&<a href={shipment.label_url} target="_blank" rel="noreferrer">Abrir etiqueta</a>}<h3>Linha do tempo</h3>{timeline.length?timeline.map((event,index)=><div className="history-row" key={event.kind+"-"+event.date+"-"+index}><strong>{event.kind==="payment"?"💳 ":""}{event.title}</strong><small>{date(event.date)} · {event.detail}</small></div>):<small>Nenhuma movimentação registrada.</small>}</aside></div>}
  </>;
}