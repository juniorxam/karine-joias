import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Content-Type":"application/json"};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL")!;
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return json({error:"Servidor não configurado"},503);
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return json({error:"Não autorizado"},401);
  const admin=createClient(url,key);
  const userClient=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")||key,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser();
  if(!user) return json({error:"Não autorizado"},401);

  const {data:membership}=await admin.from("store_memberships").select("owner_id").eq("user_id",user.id).eq("active",true).order("created_at").limit(1).maybeSingle();
  const ownerId=membership?.owner_id||user.id;
  const {data:owned}=await admin.from("products").select("id").eq("owner_id",ownerId).limit(1);
  if(!owned?.length) return json({error:"Usuário sem loja autorizada"},403);

  if(req.method==="GET"){
    const {data,error}=await admin.from("coupons").select("*").eq("owner_id",ownerId).order("created_at",{ascending:false});
    if(error) throw error;
    return json({coupons:data||[]});
  }

  const body=await req.json();
  if(req.method==="POST"){
    const code=String(body.code||"").trim().toUpperCase();
    const type=String(body.discount_type||"PERCENT");
    const value=Number(body.discount_value);
    if(!/^[A-Z0-9_-]{3,30}$/.test(code)) return json({error:"Código inválido"},400);
    if(!["PERCENT","FIXED"].includes(type)||!Number.isFinite(value)||value<=0||(type==="PERCENT"&&value>100)) return json({error:"Desconto inválido"},400);
    const {data,error}=await admin.from("coupons").insert({code,discount_type:type,discount_value:value,min_order_amount:Math.max(0,Number(body.min_order_amount)||0),starts_at:body.starts_at||null,expires_at:body.expires_at?new Date(body.expires_at+"T23:59:59").toISOString():null,max_uses:body.max_uses?Math.max(1,Number(body.max_uses)):null,active:body.active!==false,owner_id:ownerId}).select().single();
    if(error) return json({error:error.code==="23505"?"Código já existe":error.message},400);
    return json({coupon:data},201);
  }

  if(req.method==="PATCH"){
    const id=String(body.id||"");
    if(!id) return json({error:"Cupom inválido"},400);
    const patch:any={updated_at:new Date().toISOString()};
    for(const key of ["active","discount_value","min_order_amount","max_uses","starts_at","expires_at"]) if(body[key]!==undefined) patch[key]=body[key];
    if(body.discount_value!==undefined) patch.discount_value=Number(body.discount_value);
    if(body.min_order_amount!==undefined) patch.min_order_amount=Math.max(0,Number(body.min_order_amount));
    if(body.max_uses!==undefined) patch.max_uses=body.max_uses===null?null:Math.max(1,Number(body.max_uses));
    if(body.expires_at!==undefined) patch.expires_at=body.expires_at?new Date(body.expires_at+"T23:59:59").toISOString():null;
    const {data,error}=await admin.from("coupons").update(patch).eq("id",id).eq("owner_id",ownerId).select().single();
    if(error) throw error;
    return json({coupon:data});
  }

  if(req.method==="DELETE"){
    const id=String(body.id||"");
    const {error}=await admin.from("coupons").delete().eq("id",id).eq("owner_id",ownerId);
    if(error) throw error;
    return json({ok:true});
  }
  return json({error:"Método não suportado"},405);
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Erro interno"},500);}
});
