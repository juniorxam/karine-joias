import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShoppingBag, Clock3, CheckCircle2, Package, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type SellerOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  total_amount: number;
  shipping_amount: number | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
  shipping_address: Record<string, any> | null;
};

const money = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string) => new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const orderStatus: Record<string, string> = {
  PENDING_PAYMENT: "Aguardando pagamento", PAID: "Pago", PROCESSING: "Em preparação",
  READY_TO_SHIP: "Pronto para envio", SHIPPED: "Enviado", DELIVERED: "Entregue",
  CANCELLED: "Cancelado", REFUNDED: "Reembolsado"
};
const payStatus: Record<string, string> = {
  PENDING: "Aguardando pagamento", IN_PROCESS: "Em análise", PAID: "Pago",
  APPROVED: "Pago", FAILED: "Falhou", CANCELLED: "Cancelado", REFUNDED: "Reembolsado"
};
const paymentMethod: Record<string, string> = { pix: "PIX", credit_card: "Cartão de crédito", debit_card: "Cartão de débito", cash: "Dinheiro", transfer: "Transferência" };

export default function SellerSales({ ownerId }: { ownerId: string }) {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("ABERTOS");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase || !ownerId) { setLoading(false); return; }
    if (quiet) setRefreshing(true); else setLoading(true);
    const { data, error } = await supabase.from("orders")
      .select("id,order_number,customer_name,customer_email,customer_phone,total_amount,shipping_amount,status,payment_status,payment_method,created_at,shipping_address")
      .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(200);
    if (error) toast.error("Não foi possível carregar as vendas", { description: error.message });
    else setOrders((data || []) as SellerOrder[]);
    setLoading(false); setRefreshing(false);
  }, [ownerId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !ownerId) return;
    const channel = supabase.channel("seller-sales-" + ownerId)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "owner_id=eq." + ownerId }, () => { void load(true); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [ownerId, load]);

  const visible = useMemo(() => orders.filter((o) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [o.order_number, o.customer_name, o.customer_email || "", o.customer_phone || ""].some(v => v.toLowerCase().includes(q));
    const closed = ["DELIVERED", "CANCELLED", "REFUNDED"].includes(o.status);
    const matchesFilter = filter === "TODOS" || (filter === "ABERTOS" ? !closed : filter === "PAGOS" ? ["PAID", "APPROVED"].includes(String(o.payment_status).toUpperCase()) : filter === "PENDENTES" ? ["PENDING", "IN_PROCESS"].includes(String(o.payment_status).toUpperCase()) : o.status === filter);
    return matchesQuery && matchesFilter;
  }), [orders, query, filter]);

  const paidTotal = orders.filter(o => ["PAID", "APPROVED"].includes(String(o.payment_status).toUpperCase())).reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const openCount = orders.filter(o => !["DELIVERED", "CANCELLED", "REFUNDED"].includes(o.status)).length;
  const pendingCount = orders.filter(o => ["PENDING", "IN_PROCESS"].includes(String(o.payment_status).toUpperCase())).length;

  const openWhatsApp = (o: SellerOrder) => {
    const phone = String(o.customer_phone || "").replace(/\D/g, "");
    if (!phone) return toast.error("Este cliente não tem telefone cadastrado.");
    const message = `Olá, ${o.customer_name}! Aqui é da Violetta. Estou entrando em contato sobre o pedido ${o.order_number}.`;
    window.open("https://wa.me/" + (phone.startsWith("55") ? phone : "55" + phone) + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  };

  const address = (o: SellerOrder) => {
    const a = o.shipping_address || {};
    return [a.address || a.street || a.logradouro, a.number || a.numero, a.complement, a.neighborhood || a.bairro, a.city || a.cidade, a.state || a.estado, a.postal_code || a.cep]
      .filter(Boolean).join(", ");
  };

  return <div className="content">
    <div className="page-head">
      <div><p className="eyebrow">ATENDIMENTO E PEDIDOS</p><h2>Monitoramento de vendas</h2><p>Acompanhe pedidos online e pagamentos sem acessar os relatórios administrativos.</p></div>
      <button className="ghost" type="button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={16} /> {refreshing ? "Atualizando…" : "Atualizar"}</button>
    </div>
    <div className="dashboard-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",marginBottom:20}}>
      <div className="stat" style={{minHeight:120}}><div className="stat-icon"><ShoppingBag size={20}/></div><span>Pedidos recebidos</span><strong>{orders.length}</strong><small>Últimos 200 pedidos</small></div>
      <div className="stat" style={{minHeight:120}}><div className="stat-icon"><Clock3 size={20}/></div><span>Em aberto</span><strong>{openCount}</strong><small>Precisam de acompanhamento</small></div>
      <div className="stat" style={{minHeight:120}}><div className="stat-icon"><CheckCircle2 size={20}/></div><span>Vendas pagas</span><strong>{money(paidTotal)}</strong><small>Valor bruto dos pedidos pagos</small></div>
      <div className="stat" style={{minHeight:120}}><div className="stat-icon"><Package size={20}/></div><span>Pagamentos pendentes</span><strong>{pendingCount}</strong><small>Aguardando confirmação</small></div>
    </div>
    <div className="panel">
      <div className="panel-head" style={{gap:12,flexWrap:"wrap"}}>
        <div><h2>Pedidos da loja</h2><p>Os novos pedidos aparecem automaticamente quando a conexão em tempo real está disponível.</p></div>
        <div style={{position:"relative",minWidth:220,flex:"1 1 240px",maxWidth:360}}><Search size={16} style={{position:"absolute",left:12,top:13}}/><input aria-label="Buscar pedido" placeholder="Buscar nº, cliente ou telefone" value={query} onChange={e=>setQuery(e.target.value)} style={{paddingLeft:36,width:"100%"}}/></div>
      </div>
      <div className="tabs" style={{flexWrap:"wrap",marginBottom:18}}>
        {[["ABERTOS","Em aberto"],["TODOS","Todos"],["PAGOS","Pagos"],["PENDENTES","Pendentes"],["READY_TO_SHIP","Prontos para envio"]].map(([value,label])=><button key={value} type="button" className={filter===value?"primary":"ghost"} onClick={()=>setFilter(value)}>{label}</button>)}
      </div>
      {loading ? <p>Carregando pedidos…</p> : visible.length === 0 ? <div className="empty-state"><ShoppingBag size={28}/><h3>Nenhum pedido encontrado</h3><p>Quando os clientes fizerem pedidos na loja, eles aparecerão aqui.</p></div> :
        <div className="simple-list">{visible.map(o => {
          const isOpen = selected === o.id;
          const paid = ["PAID","APPROVED"].includes(String(o.payment_status).toUpperCase());
          return <div className="simple-list-row" key={o.id} style={{display:"block",padding:"16px 0"}}>
            <button type="button" onClick={()=>setSelected(isOpen?null:o.id)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",border:0,background:"transparent",color:"inherit",cursor:"pointer",padding:0}}>
              <div className="stat-icon" style={{flexShrink:0}}>{paid?<CheckCircle2 size={20}/>:<ShoppingBag size={20}/>}</div>
              <div style={{flex:1,minWidth:0}}><strong>Pedido #{o.order_number}</strong><small style={{display:"block",marginTop:4}}>{o.customer_name} · {date(o.created_at)}</small><small style={{display:"block",marginTop:4}}>{orderStatus[o.status] || o.status} · {payStatus[String(o.payment_status).toUpperCase()] || o.payment_status}</small></div>
              <div style={{textAlign:"right",whiteSpace:"nowrap"}}><strong>{money(o.total_amount)}</strong><small style={{display:"block",marginTop:4}}>{isOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</small></div>
            </button>
            {isOpen && <div style={{marginTop:16,padding:16,borderRadius:12,background:"var(--surface-muted, rgba(128,128,128,.08))"}}>
              <div className="form-grid">
                <div><small>Pagamento</small><p style={{margin:"4px 0 12px"}}>{paymentMethod[String(o.payment_method || "").toLowerCase()] || o.payment_method || "Não informado"}</p></div>
                <div><small>Frete</small><p style={{margin:"4px 0 12px"}}>{money(Number(o.shipping_amount || 0))}</p></div>
                <div><small>E-mail</small><p style={{margin:"4px 0 12px",overflowWrap:"anywhere"}}>{o.customer_email || "Não informado"}</p></div>
                <div><small>Telefone</small><p style={{margin:"4px 0 12px"}}>{o.customer_phone || "Não informado"}</p></div>
                <div style={{gridColumn:"1 / -1"}}><small>Endereço de entrega</small><p style={{margin:"4px 0 12px"}}>{address(o) || "Endereço não informado"}</p></div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{o.customer_phone && <button className="primary" type="button" onClick={()=>openWhatsApp(o)}><MessageCircle size={16}/> Falar com cliente</button>}<button className="ghost" type="button" onClick={()=>void load(true)}><RefreshCw size={16}/> Atualizar pedido</button></div>
            </div>}
          </div>;
        })}</div>}
    </div>
  </div>;
}
