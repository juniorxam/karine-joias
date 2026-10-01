import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

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

  const load=async()=>{
    if(!supabase||!ownerId)return;
    setLoading(true);
    const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,customer_email,customer_phone,total_amount,status,payment_status,payment_method,created_at").eq("owner_id",ownerId).order("created_at",{ascending:false});
    if(error)toast.error("Não foi possível carregar os pedidos",{description:error.message});
    else setOrders((data??[]) as Order[]);
    setLoading(false);
  };

  useEffect(()=>{void load()},[ownerId]);

  const updateStatus=async(order:Order,status:string)=>{
    if(!supabase)return;
    const {error}=await supabase.from("orders").update({status,updated_at:new Date().toISOString()}).eq("id",order.id).eq("owner_id",ownerId);
    if(error)toast.error("Não foi possível atualizar",{description:error.message});
    else { setOrders(v=>v.map(x=>x.id===order.id?{...x,status}:x)); toast.success("Pedido atualizado"); }
  };

  const visible=filter==="TODOS"?orders:orders.filter(x=>x.status===filter);
  const icon=(status:string)=>status==="SHIPPED"?<Truck size={16}/>:status==="DELIVERED"?<CheckCircle2 size={16}/>:status==="PAID"||status==="PROCESSING"?<PackageCheck size={16}/>:<Clock3 size={16}/>;

  return <><div className="page-head"><div><p className="eyebrow">E-COMMERCE</p><h2>Pedidos online</h2><p>Acompanhe pagamentos, preparação e entrega dos pedidos da loja.</p></div><button className="secondary" onClick={()=>void load()}><RefreshCw size={14}/> Atualizar</button></div>
    <div className="orders-summary">{["TODOS","PENDING_PAYMENT","PAID","PROCESSING","READY_TO_SHIP","SHIPPED","DELIVERED","CANCELLED"].map(s=><button key={s} className={filter===s?"selected":""} onClick={()=>setFilter(s)}>{s==="TODOS"?"Todos":statusLabel[s]||s}<b>{s==="TODOS"?orders.length:orders.filter(x=>x.status===s).length}</b></button>)}</div>
    <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>
      {loading?<tr><td colSpan={7}>Carregando pedidos...</td></tr>:visible.length===0?<tr><td colSpan={7}>Nenhum pedido encontrado.</td></tr>:visible.map(order=><tr key={order.id}><td><strong>{order.order_number}</strong></td><td><strong>{order.customer_name}</strong><small className="order-email">{order.customer_email}</small></td><td>{date(order.created_at)}</td><td><span className="payment-pill">{order.payment_status}</span></td><td><strong>{money(order.total_amount)}</strong></td><td><span className="order-status">{icon(order.status)} {statusLabel[order.status]||order.status}</span></td><td><select className="order-select" value={order.status} onChange={e=>void updateStatus(order,e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{statusLabel[s]||s}</option>)}</select></td></tr>)}
    </tbody></table></div>
  </>;
}
