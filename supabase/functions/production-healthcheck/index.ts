import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Content-Type":"application/json"};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({error:"Não autorizado"},401);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
    if(!url||!serviceKey) return json({error:"Supabase não configurado"},503);
    const userClient=createClient(url,anonKey||serviceKey,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user) return json({error:"Não autorizado"},401);

    const admin=createClient(url,serviceKey);
    const checks:any[]=[];
    const add=(name:string,ok:boolean,detail:string,critical=false)=>checks.push({name,ok,detail,critical});

    const siteUrl=Deno.env.get("PUBLIC_SITE_URL")||"";
    add("Domínio da loja",/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(siteUrl),siteUrl?"PUBLIC_SITE_URL configurada":"PUBLIC_SITE_URL ausente",true);

    const mpToken=Deno.env.get("MP_ACCESS_TOKEN")||"";
    const mpWebhook=Deno.env.get("MP_WEBHOOK_KEY")||"";
    add("Mercado Pago · access token",!!mpToken,mpToken?"Configurado":"Ausente",true);
    add("Mercado Pago · webhook secret",!!mpWebhook,mpWebhook?"Configurado":"Ausente",true);

    if(mpToken){
      const r=await fetch("https://api.mercadopago.com/v1/payment_methods",{headers:{Authorization:`Bearer ${mpToken}`,Accept:"application/json"}});
      add("Mercado Pago · API",r.ok,`HTTP ${r.status}`,true);
    }else add("Mercado Pago · API",false,"Não testado",true);

    const meToken=Deno.env.get("MELHOR_ENVIO_TOKEN")||"";
    const ua=Deno.env.get("MELHOR_ENVIO_USER_AGENT")||"";
    add("Melhor Envio · token",!!meToken,meToken?"Configurado":"Ausente",true);
    add("Melhor Envio · User-Agent",!!ua&&ua.includes("@"),ua?"Configurado":"Ausente ou sem e-mail",true);

    const senderKeys=["NAME","EMAIL","PHONE","DOCUMENT","ADDRESS","NUMBER","DISTRICT","CITY","POSTAL_CODE","STATE"];
    const missing=senderKeys.filter(k=>!Deno.env.get(`MELHOR_ENVIO_SENDER_${k}`));
    add("Melhor Envio · remetente",missing.length===0,missing.length?`Campos ausentes: ${missing.join(", ")}`:"Todos os campos essenciais configurados",true);

    if(meToken){
      const r=await fetch("https://melhorenvio.com.br/api/v2/me/companies",{headers:{Authorization:`Bearer ${meToken}`,Accept:"application/json","User-Agent":ua}});
      let detail=`HTTP ${r.status}`;
      if(r.ok){const data=await r.json();detail=`API autenticada · ${Array.isArray(data)?data.length:0} loja(s) retornada(s)`;}
      add("Melhor Envio · API",r.ok,detail,true);
    }else add("Melhor Envio · API",false,"Não testado",true);

    const {count:products}=await admin.from("products").select("id",{count:"exact",head:true});
    const {count:orders}=await admin.from("orders").select("id",{count:"exact",head:true});
    add("Catálogo",Number(products||0)>0,`${Number(products||0)} produto(s) cadastrado(s)`,true);
    add("Pedidos",true,`${Number(orders||0)} pedido(s) no banco; o teste real pode ser feito sem afetar pedidos existentes`);

    const critical=checks.filter(x=>x.critical&&!x.ok);
    return json({ok:critical.length===0,checked_at:new Date().toISOString(),checks});
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro no diagnóstico"},500);}
});