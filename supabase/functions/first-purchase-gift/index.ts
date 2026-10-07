import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) throw new Error("Servidor não configurado");
  const body=await req.json(); const name=String(body.name??"").trim(); const phone=digits(body.phone);
  if(name.length<2||name.length>120) throw new Error("Nome inválido");
  if(!/^\d{10,13}$/.test(phone)) throw new Error("WhatsApp inválido");
  const db=createClient(url,key);
  const {data:settings,error:settingsError}=await db.from("first_purchase_settings").select("*").eq("owner_id",ownerId).maybeSingle(); if(settingsError) throw settingsError; if(settings?.enabled===false) throw new Error("O presente de primeira compra está temporariamente indisponível"); const cfg=settings||{reward_type:"PERCENT",reward_value:10,gift_description:null,validity_days:30,min_order_amount:0}; const existing=await db.from("first_purchase_leads").select("id,coupon_id").eq("owner_id",OWNER_ID).eq("phone",phone).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data?.coupon_id){
    const coupon=await db.from("coupons").select("code,discount_type,discount_value,expires_at,min_order_amount,gift_description").eq("id",existing.data.coupon_id).maybeSingle();
    if(coupon.error) throw coupon.error;
    if(coupon.data) return new Response(JSON.stringify({coupon_code:coupon.data.code,reward_type:coupon.data.discount_type,reward_value:Number(coupon.data.discount_value),expires_at:coupon.data.expires_at,gift_description:cfg.gift_description,existing:true}),{headers:{...cors,"Content-Type":"application/json"}});
  }
  const suffix=crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
  const code="VIOLE10-"+suffix;
  const expires=new Date(Date.now()+Number(cfg.validity_days||30)*24*60*60*1000).toISOString();
  const {data:coupon,error:couponError}=await db.from("coupons").insert({owner_id:ownerId,code,discount_type:cfg.reward_type,discount_value:Number(cfg.reward_value)||0,min_order_amount:Number(cfg.min_order_amount)||0,gift_description:cfg.gift_description||null,starts_at:new Date().toISOString(),expires_at:expires,max_uses:1,used_count:0,active:true}).select("id,code,discount_type,discount_value,expires_at,min_order_amount").single();
  if(couponError) throw couponError;
  const {error:leadError}=await db.from("first_purchase_leads").insert({owner_id:OWNER_ID,name,phone,coupon_id:coupon.id});
  if(leadError){await db.from("coupons").delete().eq("id",coupon.id);throw leadError;}
  return new Response(JSON.stringify({coupon_code:coupon.code,reward_type:coupon.discount_type,reward_value:Number(coupon.discount_value),expires_at:coupon.expires_at,gift_description:cfg.gift_description,existing:false}),{headers:{...cors,"Content-Type":"application/json"}});
 }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:"Não foi possível gerar o presente."}),{status:400,headers:{...cors,"Content-Type":"application/json"}})}
});