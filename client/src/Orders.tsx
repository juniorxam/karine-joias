import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, PackageCheck, RefreshCw, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type OrderItem = { id: string; product_name: string; quantity: number; unit_price: number; total_price: number };
type Shipment = { carrier: string | null; service: string | null; tracking_code: string | null; tracking_url: string | null; shipping_status: string; melhor_envio_order_id: string | null; label_url: string | null; melhor_envio_tracking_status: string | null };
type History = { id: string; status: string; note: string | null; created_at: string };

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

const money=(n:number)=>Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=(v:string)=>new Date(v).toLocaleString("pt-BR");

export default function Orders({ ownerId }: { ownerId?: string }) {
  const [orders,setOrders]=useState<Order[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("TODOS");
  const [selected,setSelected]=useState<Order|null>(null);
  const [items,setItems]=useState<OrderItem[]>([]);
  const [shipment,setShipment]=useState<Shipment|null>(null);
  const [history,setHistory]=useState<History[]>([]);
  const [tracking,setTracking]=useState("");
  const [syncingTracking,setSyncingTracking]=useState(false);

  const load=async()=>{
    if(!supabase||!ownerId)return;
    setLoading(true);
    const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,customer_email,customer_phone,total_amount,shipping_amount,shipping_address,status,payment_status,payment_method,created_at").eq("owner_id",ownerId).order("created_at",{ascending:false});
    if(error)toast.error("Não foi possível carregar os pedidos",{description:error.message});
    else setOrders((data??[]) as Order[]);
    setLoading(false);
  };

  useEffect(()=>{void load()},[ownerId]);

  const openOrder=async(order:Order)=>{
    if(!supabase)return;
    setSelected(order); setTracking("");
    const [i,s,h]=await Promise.all([
      supabase.from("order_items").select("id,product_name,quantity,unit_price,total_price").eq("order_id",order.id),
      supabase.from("shipments").select("carrier,service,tracking_code,tracking_url,shipping_status,melhor_envio_order_id,label_url,melhor_envio_tracking_status").eq("order_id",order.id).maybeSingle(),
      supabase.from("order_status_history").select("id,status,note,created_at").eq("order_id",order.id).order("created_at",{ascending:false})
    ]);
    if(i.error||s.error||h.error) toast.error("Não foi possível carregar os detalhes do pedido");
    setItems((i.data||[]) as OrderItem[]); setShipment((s.data||null) as Shipment|null); setHistory((h.data||[]) as History[]);
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

  const syncTracking=async()=>{
    if(!supabase||!selected?.id||!shipment?.melhor_envio_order_id)return;
    setSyncingTracking(true);
    const {error}=await supabase.functions.invoke("melhorenvio-sync-tracking",{body:{order_id:selected.id}});
    setSyncingTracking(false);
    if(error){toast.error("Não foi possível sincronizar o rastreio",{description:error.message});return;}
    toast.success("Rastreio atualizado pelo Melhor Envio");
    await load();
    await openOrder(selected);
  };

  const updateStatus=async(order:Order,status:string)=>{
    if(!supabase)return;

    const allowed: Record<string,string[]> = {
      PENDING_PAYMENT:["CANCELLED"],
      PAID:["PROCESSING","REFUNDED"],
      PROCESSING:["READY_TO_SHIP","REFUNDED"],
      READY_TO_SHIP:["SHIPPED","REFUNDED"],
      SHIPPED:["DELIVERED"],
      DELIVERED:[],
      CANCELLED:[],
      REFUNDED:[]
    };
    if(status===order.status)return;
    if(!(allowed[order.status]||[]).includes(status)){
      toast.error("Transição de status inválida",{
        description:`Não é possível mudar de "${statusLabel[order.status]||order.status}" para "${statusLabel[status]||status}".`
      });
      return;
    }

    // A loja só pode iniciar a preparação depois da confirmação do pagamento.
    if(status==="PROCESSING" && order.payment_status!=="PAID"){
      toast.error("Pagamento ainda não confirmado");
      return;
    }

    if(status==="CANCELLED") {
      const {error}=await supabase.rpc("cancel_order_admin_service",{
        p_order_id: order.id,
        p_owner_id: ownerId
      });
      if(error){
        toast.error("Não foi possível cancelar o pedido",{description:error.message});
        return;
      }
    } else if(status==="REFUNDED") {
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

  const visible=filter==="TODOS"?orders:orders.filter(x=>x.status===filter);
  const icon=(status:string)=>status==="SHIPPED"?<Truck size={16}/>:status==="DELIVERED"?<CheckCircle2 size={16}/>:status==="PAID"||status==="PROCESSING"?<PackageCheck size={16}/>:<Clock3 size={16}/>;

  return <><div className="page-head"><div><p className="eyebrow">E-COMMERCE</p><h2>Pedidos online</h2><p>Acompanhe pagamentos, preparação e entrega dos pedidos da loja.</p></div><button className="secondary" onClick={()=>void load()}><RefreshCw size={14}/> Atualizar</button></div>
    <div className="orders-summary">{["TODOS","PENDING_PAYMENT","PAID","PROCESSING","READY_TO_SHIP","SHIPPED","DELIVERED","CANCELLED"].map(s=><button key={s} className={filter===s?"selected":""} onClick={()=>setFilter(s)}>{s==="TODOS"?"Todos":statusLabel[s]||s}<b>{s==="TODOS"?orders.length:orders.filter(x=>x.status===s).length}</b></button>)}</div>
    <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>
      {loading?<tr><td colSpan={7}>Carregando pedidos...</td></tr>:visible.length===0?<tr><td colSpan={7}>Nenhum pedido encontrado.</td></tr>:visible.map(order=><tr key={order.id}><td><button className="order-link" onClick={()=>void openOrder(order)}><strong>{order.order_number}</strong></button></td><td><strong>{order.customer_name}</strong><small className="order-email">{order.customer_email}</small></td><td>{date(order.created_at)}</td><td><span className="payment-pill">{order.payment_status}</span></td><td><strong>{money(order.total_amount)}</strong></td><td><span className="order-status">{icon(order.status)} {statusLabel[order.status]||order.status}</span></td><td><select className="order-select" value={order.status} onChange={e=>void updateStatus(order,e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{statusLabel[s]||s}</option>)}</select></td></tr>)}
    </tbody></table></div>
    {selected&&<div className="order-detail-backdrop" onMouseDown={()=>setSelected(null)}><aside className="order-detail" onMouseDown={e=>e.stopPropagation()}><button className="close order-close" onClick={()=>setSelected(null)}><X size={18}/></button><p className="eyebrow">PEDIDO ONLINE</p><h2>{selected.order_number}</h2><p className="order-customer"><strong>{selected.customer_name}</strong><br/>{selected.customer_email}<br/>{selected.customer_phone}</p><h3>Itens</h3>{items.map(item=><div className="order-item-row" key={item.id}><span>{item.quantity}× {item.product_name}</span><strong>{money(item.total_price)}</strong></div>)}<div className="order-detail-total"><span>Produtos</span><strong>{money(selected.total_amount-Number(selected.shipping_amount||0))}</strong></div><div className="order-detail-total"><span>Frete</span><strong>{money(Number(selected.shipping_amount||0))}</strong></div><div className="order-detail-total grand"><span>Total</span><strong>{money(selected.total_amount)}</strong></div><h3>Entrega</h3><p>{selected.shipping_address?.address}, {selected.shipping_address?.number}<br/>{selected.shipping_address?.neighborhood}<br/>{selected.shipping_address?.city} - {selected.shipping_address?.state}<br/>CEP {selected.shipping_address?.postal_code}</p><h3>Rastreamento</h3><div className="tracking-edit"><input placeholder="Código de rastreio" value={tracking} onChange={e=>setTracking(e.target.value)}/><button className="primary" onClick={()=>void saveShipment()}>Salvar</button></div>{shipment?.carrier&&<p><strong>Transportadora:</strong> {shipment.carrier}{shipment.service?` — ${shipment.service}`:""}</p>}{shipment?.melhor_envio_order_id&&<p><strong>ID Melhor Envio:</strong> {shipment.melhor_envio_order_id}</p>}{shipment?.melhor_envio_tracking_status&&<p><strong>Status Melhor Envio:</strong> {shipment.melhor_envio_tracking_status}</p>}{shipment?.tracking_url&&<a href={shipment.tracking_url} target="_blank" rel="noreferrer">Abrir rastreio</a>}{shipment?.label_url&&<a href={shipment.label_url} target="_blank" rel="noreferrer">Abrir etiqueta</a>}{shipment?.melhor_envio_order_id&&<button className="secondary" disabled={syncingTracking} onClick={()=>void syncTracking()}>{syncingTracking?"Sincronizando...":"Atualizar pelo Melhor Envio"}</button>}<h3>Histórico</h3>{history.map(h=><div className="history-row" key={h.id}><strong>{statusLabel[h.status]||h.status}</strong><small>{date(h.created_at)}</small></div>)}</aside></div>}
  </>;
}
