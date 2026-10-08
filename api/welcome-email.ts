import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char] ?? char));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  try {
    const auth = req.headers.authorization;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!auth || !supabaseUrl || !supabaseAnon || !resendKey) {
      return res.status(500).json({ error: "Servidor não configurado." });
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return res.status(401).json({ error: "Não autorizado." });

    const name = String(req.body?.name ?? user.user_metadata?.full_name ?? user.email.split("@")[0]).trim() || "cliente";
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bem-vindo à Violetta</title></head><body style="margin:0;background:#fff0f5;font-family:Arial,Helvetica,sans-serif;color:#332e2a"><div style="padding:32px 16px"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #f1d9e2"><div style="background:#fff;padding:30px 24px;text-align:center;border-bottom:1px solid #f1d9e2"><img src="https://violetta.com.br/logo-violetta.jpeg" alt="Violetta Jóias e Semi Joias" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto"></div><div style="padding:38px 32px 34px"><div style="display:inline-block;background:#fff0f5;color:#b85f7f;padding:7px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:1px">BEM-VINDA À VIOLETTA</div><h1 style="font-size:30px;line-height:1.2;margin:18px 0 12px;color:#3a2830">Que bom ter você com a gente, ${esc(name)}!</h1><p style="font-size:16px;line-height:1.7;margin:0 0 14px;color:#6f675f">Sua conta foi criada com sucesso. Agora você pode acompanhar seus pedidos, consultar pagamentos e descobrir nossas joias e semi-joias com toda praticidade.</p><p style="font-size:16px;line-height:1.7;margin:0 0 28px;color:#6f675f">Preparamos tudo para que sua experiência na Violetta seja simples, elegante e especial.</p><a href="https://violetta.com.br/minha-conta" style="display:block;text-align:center;background:#b85f7f;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:15px 20px;border-radius:10px">Acessar minha conta</a><p style="font-size:13px;line-height:1.6;margin:24px 0 0;color:#8b8177;text-align:center">Se você não criou esta conta, ignore esta mensagem.</p></div><div style="background:#fffafd;padding:22px 24px;text-align:center;border-top:1px solid #f1d9e2"><p style="margin:0;color:#8b8177;font-size:13px">Com carinho, equipe Violetta ✨</p><p style="margin:8px 0 0;color:#b85f7f;font-size:12px">violetta.com.br</p></div></div></div></body></html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Violetta <contato@violetta.com.br>",
        to: [user.email],
        subject: "Bem-vinda à Violetta ✨ Sua conta está pronta",
        html,
        text: `Olá, ${name}! Sua conta na Violetta foi criada com sucesso. Acesse sua conta em https://violetta.com.br/minha-conta`,
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || "Falha ao enviar o e-mail.");
    return res.status(200).json({ ok: true, id: result.id });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Falha ao enviar o e-mail." });
  }
}
