import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const body=await req.json(), customer=body.customer||{}, shipping=body.shipping||{}, items=Array.isArray(body.items)?body.items:[];
  if(items.length<1||items.length>30) throw new Error("Carrinho inválido");
  if(!customer.name||String(customer.name).trim().length<2) throw new Error("Nome inválido");
  const email=String(customer.email||"").trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido");
  if(!customer.phone||String(customer.phone).replace(/\D/g,"").length<10) throw new Error("Telefone inválido");
  const shippingAmount=Math.max(0,Number(shipping.shipping_option?.price)||0);
  const shippingMeta=shipping.shipping_option||null;
  const url=Deno.env.get("SUPABASE_URL")!, key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
  if(!url||!key) throw new Error("Servidor não configurado");
  const db=createClient(url,key);
  const {data:owner}=await db.from("products").select("owner_id").limit(1).single();
  if(!owner?.owner_id) throw new Error("Loja sem proprietário");
  const {data,error}=await db.rpc("create_store_order_service",{p_owner_id:owner.owner_id,p_customer:{name:String(customer.name).trim(),email,phone:String(customer.phone).trim()},p_shipping:{...shipping,shipping_option:shippingMeta},p_items:items,p_payment_method:"PENDING"});
  if(error) throw error;
  const order=Array.isArray(data)?data[0]:data;
  if(!order?.id) throw new Error("Pedido não criado");
  const total=Number(order.total_amount)+shippingAmount;
  const {data:updated,error:updateError}=await db.from("orders").update({shipping_amount:shippingAmount,total_amount:total}).eq("id",order.id).select("id,order_number,total_amount").single();
  if(updateError) throw updateError;
  return new Response(JSON.stringify(updated),{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){console.error(e);return new Response(JSON.stringify({error:e instanceof Error?e.message:"Erro ao criar pedido"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});}
});