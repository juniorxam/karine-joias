import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Método não permitido"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({error:"Não autorizado"},401);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    if(!url||!serviceKey) return json({error:"Servidor não configurado"},503);
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const token=auth.replace(/^Bearer\s+/,"");
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user) return json({error:"Sessão inválida"},401);

    let actorRole:"owner"|"developer"|null=null;
    let ownerId:string|null=null;
    if((await admin.from("storefront_settings").select("owner_id").eq("store_slug","violetta").eq("owner_id",user.id).limit(1).maybeSingle()).data?.owner_id){
      ownerId=user.id; actorRole="owner";
    }else{
      const {data:membership}=await admin.from("store_memberships").select("owner_id,role").eq("user_id",user.id).eq("active",true).in("role",["developer"]).limit(1).maybeSingle();
      ownerId=membership?.owner_id||null;
      if(ownerId) actorRole="developer";
    }
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"list");

    // O próprio vendedor pode concluir a troca obrigatória da senha inicial.
    if(action==="complete_initial_password"){
      const {data:membership,error:membershipError}=await admin.from("store_memberships").select("id,owner_id,role,active,must_change_password").eq("user_id",user.id).eq("active",true).eq("role","seller").limit(1).maybeSingle();
      if(membershipError) return json({error:"Não foi possível validar o acesso."},500);
      if(!membership?.must_change_password) return json({error:"Não há troca de senha inicial pendente."},400);
      const {error}=await admin.from("store_memberships").update({must_change_password:false}).eq("id",membership.id);
      if(error) return json({error:"A senha foi atualizada, mas não foi possível concluir a ativação. Tente novamente."},500);
      return json({ok:true,message:"Senha inicial alterada com sucesso."});
    }

    if(!ownerId||!actorRole) return json({error:"Sua conta não está autorizada a administrar a equipe desta loja."},403);
    const targetUserId=String(body?.user_id||"").trim();
    const requestedRole=String(body?.role||"seller") as "seller"|"developer";
    if(!["seller","developer"].includes(requestedRole)) return json({error:"Perfil inválido."},400);
    if(actorRole==="developer" && requestedRole!=="seller") return json({error:"Desenvolvedores só podem cadastrar vendedores."},403);

    const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(listError) return json({error:"Não foi possível consultar os usuários: "+listError.message},500);
    const users=list?.users||[];

    const audit=async(actionName:string,rowId:string|null,oldData:any=null,newData:any=null)=>{
      await admin.from("audit_logs").insert({owner_id:ownerId,actor_user_id:user.id,action:actionName,table_name:"store_memberships",row_id:rowId,old_data:oldData,new_data:newData});
    };

    if(action==="list"){
      const {data:members,error:membersError}=await admin.from("store_memberships").select("id,user_id,role,active,created_at,must_change_password").eq("owner_id",ownerId).order("created_at",{ascending:true});
      if(membersError) return json({error:"Não foi possível carregar a equipe: "+membersError.message},500);
      const owner=users.find((u:any)=>u.id===ownerId);
      const rows=[
        {user_id:ownerId,email:owner?.email||"",role:"owner",active:true,created_at:owner?.created_at||null,email_confirmed:!!owner?.email_confirmed_at,last_sign_in_at:owner?.last_sign_in_at||null},
        ...(members||[]).filter((m:any)=>m.user_id!==ownerId).map((m:any)=>{const u=users.find((x:any)=>x.id===m.user_id);return {membership_id:m.id,user_id:m.user_id,email:u?.email||"Usuário sem e-mail",role:m.role,active:m.active,created_at:m.created_at,must_change_password:!!m.must_change_password,email_confirmed:!!u?.email_confirmed_at,last_sign_in_at:u?.last_sign_in_at||null};})
      ];
      return json({ok:true,members:rows});
    }

    if(action==="revoke"){
      if(!targetUserId||targetUserId===ownerId) return json({error:"Não é possível revogar a proprietária."},400);
      const {data:old}=await admin.from("store_memberships").select("id,user_id,role,active").eq("owner_id",ownerId).eq("user_id",targetUserId).maybeSingle();
      if(!old) return json({error:"Membro não encontrado."},404);
      if(actorRole==="developer" && old.role!=="seller") return json({error:"Você só pode administrar vendedores."},403);
      const {error}=await admin.from("store_memberships").update({active:false}).eq("id",old.id);
      if(error) return json({error:"Não foi possível revogar o acesso: "+error.message},500);
      await audit("REVOKE_TEAM_MEMBER",targetUserId,old,{...old,active:false});
      return json({ok:true,message:"Acesso revogado com sucesso."});
    }

    if(action==="change_role"){
      if(actorRole!=="owner") return json({error:"Somente a proprietária pode alterar perfis."},403);
      if(!targetUserId||targetUserId===ownerId) return json({error:"Usuário inválido."},400);
      const {data:old}=await admin.from("store_memberships").select("id,user_id,role,active").eq("owner_id",ownerId).eq("user_id",targetUserId).maybeSingle();
      if(!old) return json({error:"Membro não encontrado."},404);
      const {data:updated,error}=await admin.from("store_memberships").update({role:requestedRole,active:true}).eq("id",old.id).select("id,user_id,role,active").single();
      if(error) return json({error:"Não foi possível alterar o perfil: "+error.message},500);
      await audit("CHANGE_TEAM_ROLE",targetUserId,old,updated);
      return json({ok:true,message:"Perfil atualizado com sucesso.",member:updated});
    }

    if(action==="resend"){
      if(!targetUserId||targetUserId===ownerId) return json({error:"Usuário inválido para reenvio."},400);
      const {data:membership}=await admin.from("store_memberships").select("id,role,active").eq("owner_id",ownerId).eq("user_id",targetUserId).maybeSingle();
      if(!membership) return json({error:"Membro não encontrado."},404);
      if(actorRole==="developer" && membership.role!=="seller") return json({error:"Você só pode administrar vendedores."},403);
      const target=users.find((u:any)=>u.id===targetUserId);
      if(!target?.email) return json({error:"Não foi possível localizar o e-mail."},404);
      if(target.email_confirmed_at) return json({error:"Esta conta já foi ativada. Ela pode entrar normalmente."},400);
      const invite=await admin.auth.admin.inviteUserByEmail(target.email,{redirectTo:"https://violetta.com.br/gestao?type=invite"});
      if(invite.error) return json({error:"Não foi possível reenviar o convite: "+invite.error.message},400);
      await admin.from("store_memberships").update({active:true}).eq("id",membership.id);
      return json({ok:true,message:"Convite reenviado para "+target.email+"."});
    }

    if(action==="grant"){
      const email=String(body?.email||"").trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Informe um e-mail válido."},400);
      if(String(user.email||"").toLowerCase()===email) return json({error:"Informe um e-mail diferente do seu."},400);
      if(actorRole==="developer" && requestedRole!=="seller") return json({error:"Você só pode cadastrar vendedores."},403);

      const existing=users.find((item:any)=>String(item.email||"").toLowerCase()===email);
      let memberId:string|undefined=existing?.id;
      let invited=false;
      const {data:oldMembership}=memberId
        ? await admin.from("store_memberships").select("id,role,active,must_change_password").eq("owner_id",ownerId).eq("user_id",memberId).maybeSingle()
        : {data:null};
      const {data:otherMembership}=memberId
        ? await admin.from("store_memberships").select("owner_id,role,active").eq("user_id",memberId).neq("owner_id",ownerId).eq("active",true).maybeSingle()
        : {data:null};
      if(otherMembership) return json({error:"Este usuário já está vinculado a outra loja."},409);
      if(existing && !oldMembership) return json({error:"Este e-mail já possui uma conta. Para cadastrar uma nova vendedora com senha inicial, use um e-mail ainda não cadastrado."},409);
      if(oldMembership?.active) return json({error:"Esta pessoa já está cadastrada e ativa na equipe."},409);

      if(requestedRole==="seller"){
        if(!memberId){
          const created=await admin.auth.admin.createUser({email,password:"123456",email_confirm:true});
          if(created.error) return json({error:"Não foi possível criar a conta da vendedora: "+created.error.message},400);
          memberId=created.data.user?.id;
        }else{
          const reset=await admin.auth.admin.updateUserById(memberId,{password:"123456",email_confirm:true});
          if(reset.error) return json({error:"Não foi possível preparar a senha inicial: "+reset.error.message},400);
        }
      }else if(!memberId){
        const invite=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:"https://violetta.com.br/gestao?type=invite"});
        if(invite.error) return json({error:"O Supabase não conseguiu enviar o convite: "+invite.error.message},400);
        memberId=invite.data.user?.id; invited=true;
      }
      if(!memberId) throw new Error("Não foi possível identificar o usuário.");

      const membershipPayload:any={owner_id:ownerId,user_id:memberId,role:requestedRole,active:true};
      if(requestedRole==="seller") membershipPayload.must_change_password=true;
      const {data:membership,error:membershipError}=await admin.from("store_memberships").upsert(membershipPayload,{onConflict:"owner_id,user_id"}).select("id,user_id,role,active,must_change_password").single();
      if(membershipError) return json({error:"Não foi possível vincular o usuário à loja: "+membershipError.message},500);
      await audit(oldMembership?"UPDATE_TEAM_MEMBER":"ADD_TEAM_MEMBER",memberId,oldMembership,membership);
      return json({ok:true,email,invited,message:requestedRole==="seller"?"Vendedora cadastrada. Senha inicial: 123456. A troca será obrigatória no primeiro acesso.":invited?"Convite enviado e perfil atribuído.":"Perfil atribuído à conta existente.",member:membership});
    }

    return json({error:"Ação não reconhecida."},400);
  }catch(error){
    console.error("manage-store-access error",error);
    return json({error:error instanceof Error?error.message:"Não foi possível concluir a operação."},500);
  }
});