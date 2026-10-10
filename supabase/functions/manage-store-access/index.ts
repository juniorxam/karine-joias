import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://violetta.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!url || !serviceKey) return json({ error: "Servidor não configurado" }, 503);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const userClient = createClient(url, anonKey || serviceKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (userError || !user) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const ownerId = String(body?.owner_id || "").trim();
    if (!uuid.test(ownerId)) return json({ error: "Loja inválida" }, 400);

    // O proprietário é identificado pelo próprio auth.uid. Desenvolvedores
    // ativos podem consultar e operar a equipe da loja, mas nunca revogar acessos.
    let accessRole: "owner" | "developer" | null = user.id === ownerId ? "owner" : null;
    if (!accessRole) {
      const { data: membership, error: membershipLookupError } = await admin
        .from("store_memberships")
        .select("role")
        .eq("owner_id", ownerId)
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (membershipLookupError) return json({ error: "Não foi possível validar o acesso" }, 500);
      if (membership?.role === "developer") accessRole = "developer";
    }
    if (!accessRole) return json({ error: "Você não tem permissão para gerenciar esta loja" }, 403);

    const { data: memberships, error: membershipsError } = await admin
      .from("store_memberships")
      .select("owner_id,user_id,role,active,created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (membershipsError) return json({ error: "Não foi possível consultar a equipe" }, 500);

    if (action === "list") {
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: "Não foi possível consultar os usuários" }, 500);
      const usersById = new Map((users?.users || []).map((item) => [item.id, item]));
      const ownerMember = { owner_id: ownerId, user_id: ownerId, role: "owner", active: true, created_at: null };
      const rows = [ownerMember, ...(memberships || [])]
        .filter((item, index, all) => all.findIndex((candidate) => candidate.user_id === item.user_id) === index)
        .map((item) => {
          const account = usersById.get(item.user_id);
          return {
            user_id: item.user_id,
            email: account?.email || "",
            role: item.role,
            active: item.active,
            email_confirmed: Boolean(account?.email_confirmed_at),
            last_sign_in_at: account?.last_sign_in_at || null,
            created_at: item.created_at,
          };
        });
      return json({ ok: true, members: rows });
    }

    if (!["grant", "resend", "revoke"].includes(action)) return json({ error: "Ação inválida" }, 400);
    if (action === "revoke" && accessRole !== "owner") return json({ error: "Somente a proprietária pode revogar acessos" }, 403);

    if (action === "grant") {
      const email = String(body?.email || "").trim().toLowerCase();
      const role = String(body?.role || "seller").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe um e-mail válido" }, 400);
      if (!['seller', 'developer'].includes(role)) return json({ error: "Perfil inválido" }, 400);

      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = users?.users?.find((item) => String(item.email || "").toLowerCase() === email);
      let memberId = existing?.id;
      let invited = false;
      if (!memberId) {
        const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: "https://violetta.com.br/gestao" });
        if (invite.error || !invite.data.user?.id) return json({ error: "Não foi possível enviar o convite" }, 400);
        memberId = invite.data.user.id;
        invited = true;
      }

      const { error } = await admin.from("store_memberships").upsert(
        { owner_id: ownerId, user_id: memberId, role, active: true },
        { onConflict: "owner_id,user_id" },
      );
      if (error) return json({ error: "Não foi possível salvar o acesso" }, 500);
      return json({ ok: true, email, invited, message: invited ? "Convite enviado e acesso concedido." : "Acesso concedido à conta existente." });
    }

    const userId = String(body?.user_id || "").trim();
    if (!uuid.test(userId) || userId === ownerId) return json({ error: "Usuário inválido" }, 400);
    const member = (memberships || []).find((item) => item.user_id === userId);
    if (!member) return json({ error: "Acesso não encontrado" }, 404);

    if (action === "revoke") {
      const { error } = await admin.from("store_memberships").update({ active: false }).eq("owner_id", ownerId).eq("user_id", userId);
      if (error) return json({ error: "Não foi possível revogar o acesso" }, 500);
      return json({ ok: true, message: "Acesso revogado." });
    }

    const account = await admin.auth.admin.getUserById(userId);
    const email = String(account.data.user?.email || "").trim().toLowerCase();
    if (!email) return json({ error: "E-mail do usuário não encontrado" }, 404);
    const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: "https://violetta.com.br/gestao" });
    if (invite.error) return json({ error: "Não foi possível reenviar o convite" }, 400);
    return json({ ok: true, message: "Convite reenviado." });
  } catch (error) {
    console.error("manage-store-access failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Não foi possível concluir a operação" }, 500);
  }
});
