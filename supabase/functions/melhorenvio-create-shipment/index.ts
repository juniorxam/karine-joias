import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Content-Type":"application/json"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return json({error:"Não autorizado"},401);
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), token=Deno.env.get("MELHOR_ENVIO_TOKEN"), ua=Deno.env.get("MELHOR_ENVIO_USER_AGENT");
  if(!url||!key||!token||!ua) return json({error:"Melhor Envio não configurado no servidor"},503);

  const sender={
    name:Deno.env.get("MELHOR_ENVIO_SENDER_NAME")||"",
    email:Deno.env.get("MELHOR_ENVIO_SENDER_EMAIL")||"",
    phone:Deno.env.get("MELHOR_ENVIO_SENDER_PHONE")||"",
    document:Deno.env.get("MELHOR_ENVIO_SENDER_DOCUMENT")||"",
    address:Deno.env.get("MELHOR_ENVIO_SENDER_ADDRESS")||"",
    number:Deno.env.get("MELHOR_ENVIO_SENDER_NUMBER")||"",
    district:Deno.env.get("MELHOR_ENVIO_SENDER_DISTRICT")||"",
    city:Deno.env.get("MELHOR_ENVIO_SENDER_CITY")||"",
    postal_code:Deno.env.get("MELHOR_ENVIO_SENDER_POSTAL_CODE")||"",
    state_abbr:Deno.env.get("MELHOR_ENVIO_SENDER_STATE")||"TO",
    complement:Deno.env.get("MELHOR_ENVIO_SENDER_COMPLEMENT")||"",
  };
  if(!sender.name||!sender.email||!sender.phone||!sender.document||!sender.address||!sender.number||!sender.district||!sender.city||!sender.postal_code)
    return json({error:"Dados do remetente do Melhor Envio não configurados"},503);

  const admin=createClient(url,key);
  const userClient=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")||key,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser();
  if(!user) return json({error:"Não autorizado"},401);

  const {order_id}=await req.json();
  if(!order_id) return json({error:"Pedido inválido"},400);

  const {data:order}=await admin.from("orders").select("id,order_number,owner_id,status,customer_name,customer_email,customer_phone,shipping_address,shipping_amount,total_amount").eq("id",order_id).eq("owner_id",user.id).maybeSingle();
  if(!order) return json({error:"Pedido não encontrado"},404);
  if(!["READY_TO_SHIP","SHIPPED"].includes(order.status)) return json({error:"O pedido precisa estar pronto para envio"},400);

  const {data:shipment}=await admin.from("shipments").select("*").eq("order_id",order.id).maybeSingle();
  if(shipment?.melhor_envio_order_id) return json({shipment},200);

  const addr=order.shipping_address||{};
  const option=addr.shipping_option||{};
  const service=Number(option.id);
  if(!Number.isInteger(service)||service<=0) return json({error:"Serviço Melhor Envio não encontrado no pedido"},400);

  const {data:items,error:itemError}=await admin.from("order_items").select("product_id,product_name,quantity,unit_price").eq("order_id",order.id);
  if(itemError||!items?.length) return json({error:"Itens do pedido não encontrados"},400);

  const ids=items.map((x:any)=>x.product_id);
  const {data:products,error:prodError}=await admin.from("products").select("id,weight_grams,package_height_cm,package_width_cm,package_length_cm").in("id",ids);
  if(prodError||!products||products.length!==ids.length) return json({error:"Dimensões dos produtos não encontradas"},400);
  const map=new Map(products.map((p:any)=>[Number(p.id),p]));
  let weight=0,height=0,width=0,length=0;
  const declaredProducts:any[]=[];
  for(const item of items){
    const p=map.get(Number(item.product_id)); const q=Number(item.quantity);
    weight += Math.max(.1,Number(p.weight_grams||200)/1000)*q;
    height=Math.max(height,Number(p.package_height_cm||5)); width=Math.max(width,Number(p.package_width_cm||10)); length+=Number(p.package_length_cm||15);
    declaredProducts.push({name:String(item.product_name),quantity:String(q),unitary_value:String(Number(item.unit_price||0))});
  }

  const quotedPackages = Array.isArray(option.packages) ? option.packages : [];\n  if (quotedPackages.length > 1 && [1,2,17].includes(service)) return json({error:"A cotação retornou múltiplos volumes para um serviço que exige etiquetas separadas. Gere uma nova cotação com outro serviço."},400);\n  const quotedVolumes = quotedPackages.map((pkg:any)=>({\n    height:Number(pkg?.dimensions?.height||5),\n    width:Number(pkg?.dimensions?.width||10),\n    length:Number(pkg?.dimensions?.length||15),\n    weight:Number(pkg?.weight||0.1),\n  }));\n\n  const payload={
    service,
    from:{...sender},
    to:{
      name:String(order.customer_name),email:String(order.customer_email),phone:String(order.customer_phone),
      address:String(addr.address||""),number:String(addr.number||""),complement:String(addr.complement||""),
      district:String(addr.neighborhood||""),city:String(addr.city||""),postal_code:String(addr.postal_code||""),
      country_id:"BR",state_abbr:String(addr.state||"").slice(0,2).toUpperCase(),document:String(addr.recipient_code||"").replace(/\D/g,"")
    },
    products:declaredProducts,
    volumes:quotedVolumes.length ? quotedVolumes : [{height,width,length,weight}],
    options:{
      platform:"Karine Joias",
      reminder:`Pedido ${order.order_number}`,
      insurance_value:Math.max(0,Number(order.total_amount||0)-Number(order.shipping_amount||0)),
      receipt:false,own_hand:false,reverse:false,
      tags:[{tag:order.order_number,url:null}]
    }
  };

  if(!payload.to.address||!payload.to.number||!payload.to.district||!payload.to.city||!/^\\d{8}$/.test(payload.to.postal_code.replace(/\\D/g,"")))\n    return json({error:"Endereço do destinatário incompleto"},400);\n  if(!/^\\d{11}$/.test(payload.to.document))\n    return json({error:"Documento do destinatário inválido"},400);

  const response=await fetch("https://www.melhorenvio.com.br/api/v2/me/cart",{method:"POST",headers:{Accept:"application/json",Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":ua},body:JSON.stringify(payload)});
  const result=await response.json();
  if(!response.ok){console.error("Melhor Envio cart:",response.status,result);return json({error:"Melhor Envio recusou a criação do envio",details:result},502);}
  const melhorId=String(result?.id||result?.order_id||"");
  if(!melhorId) return json({error:"Melhor Envio não retornou o ID da etiqueta",details:result},502);

  const {data:saved,error:saveError}=await admin.from("shipments").upsert({order_id:order.id,carrier:option.company||null,service:option.service||null,melhor_envio_order_id:melhorId,shipping_status:"cart",updated_at:new Date().toISOString()},{onConflict:"order_id"}).select("*").single();
  if(saveError) throw saveError;
  return json({shipment:saved,melhor_envio_response:result});
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro ao criar envio"},500);}
});
