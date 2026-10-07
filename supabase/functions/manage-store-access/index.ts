import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json",
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Método não permitido"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({error:"Não autorizado"},401);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
    if(!url||!serviceKey) return json({error:"Servidor não configurado"},503);

    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const userClient=createClient(url,anonKey||serviceKey,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await userClient.auth.getUser(auth.replace(/^Bearer\\s+/,""));
    if(userError||!user) return json({error:"Sessão inválida"},401);

    const isOwner=user.id===OWNER_ID;
    const {data:membership}=await admin.from("store_memberships").select("role").eq("owner_id",OWNER_ID).eq("user_id",user.id).eq("active",true).maybeSingle();
    if(!isOwner && membership?.role!=="owner") return json({error:"Somente a proprietária pode gerenciar acessos."},403);

    const body=await req.json().catch(()=>({}));
    const email=String(body?.email||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Informe um e-mail válido."},400);

    const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(listError) return json({error:"Não foi possível consultar os usuários: "+listError.message},500);
    const existing=list?.users?.find((item:any)=>String(item.email||"").toLowerCase()===email);

    let memberId=existing?.id;
    let invited=false;
    if(!memberId){
      const invite=await admin.auth.admin.inviteUserByEmail(email);
      if(invite.error) return json({error:"O Supabase não conseguiu enviar o convite: "+invite.error.message},400);
      memberId=invite.data.user?.id;
      invited=true;
    }
    if(!memberId) throw new Error("Não foi possível identificar o usuário.");

    const {error:membershipError}=await admin.from("store_memberships").upsert(
      {owner_id:user.id,user_id:memberId,role:"manager",active:true},
      {onConflict:"owner_id,user_id"}
    );
    if(membershipError) return json({error:"Não foi possível vincular o usuário à loja: "+membershipError.message},500);

    return json({ok:true,email,invited,message:invited?"Convite enviado e acesso concedido.":"Acesso concedido à conta existente."});
  }catch(error){
    console.error(error);
    return json({error:error instanceof Error?error.message:"Não foi possível conceder o acesso."},500);
  }
});