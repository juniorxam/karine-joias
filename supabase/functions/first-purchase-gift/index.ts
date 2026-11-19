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
  const {data,error}=await db.rpc("issue_violetta_first_purchase_coupon",{p_name:name,p_phone:phone});
  if(error) throw new Error(error.message);
  return Response.json(data,{headers:cors});
 }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:"Não foi possível gerar o presente."}),{status:400,headers:{...cors,"Content-Type":"application/json"}})}
});