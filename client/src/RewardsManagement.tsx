import { useEffect, useState } from "react";
import { Gift, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";

type Mission = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  mode: "cumulative" | "single_order";
  threshold_amount: number;
  gift_source: "custom" | "catalog";
  gift_product_id: number | null;
  gift_name: string;
  gift_description: string | null;
  gift_image_url: string | null;
  gift_stock: number;
  gift_quantity: number;
  max_redemptions: number | null;
  is_active: boolean;
};
type GiftProduct = { id: number; name: string; stock: number };
const blank = { title: "", description: "", mode: "cumulative" as Mission["mode"], threshold_amount: 300, gift_source: "custom" as "custom" | "catalog", gift_product_id: null as number | null, gift_name: "", gift_description: "", gift_image_url: "", gift_stock: 0, gift_quantity: 1, max_redemptions: null as number | null, is_active: false };

export default function RewardsManagement({ ownerId, products }: { ownerId: string; products: GiftProduct[] }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [draft, setDraft] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const rewardsActivationEnabled = false; // Unlock only after verified server-side fulfillment.
  useEffect(() => {
    if (!supabase || !ownerId) return;
    let cancelled = false;
    setLoading(true);
    supabase.from("reward_missions").select("id,owner_id,title,description,mode,threshold_amount,gift_source,gift_product_id,gift_name,gift_description,gift_image_url,gift_stock,gift_quantity,max_redemptions,is_active")
      .eq("owner_id", ownerId).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { toast.error("Missões indisponíveis. Verifique a configuração segura do banco."); return; }
        setMissions((data || []) as Mission[]);
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ownerId]);
  async function save(input: typeof blank, id?: string) {
    if (!supabase || !ownerId || saving) return;
    if (!input.title.trim() || !Number.isFinite(input.threshold_amount) || input.threshold_amount <= 0) { toast.error("Informe título e valor de meta válido."); return; }
    const gift = products.find(p => p.id === Number(input.gift_product_id));
    if (input.gift_source === "catalog" && !gift) { toast.error("Selecione um produto do catálogo."); return; }
    if (input.gift_source === "custom" && !input.gift_name.trim()) { toast.error("Informe o nome do brinde exclusivo."); return; }
    if (!Number.isInteger(input.gift_stock) || input.gift_stock < 0) { toast.error("Informe um estoque válido."); return; }
    if (input.is_active && !rewardsActivationEnabled) { toast.error("Ativação bloqueada até homologação dos pagamentos e brindes."); return; }
    if (input.is_active && (input.gift_source === "custom" ? input.gift_stock : gift?.stock ?? 0) < input.gift_quantity) { toast.error("Estoque insuficiente para ativar a missão."); return; }
    setSaving(true);
    try {
      const payload = { ...input, title: input.title.trim(), gift_product_id: input.gift_source === "catalog" ? Number(input.gift_product_id) : null, gift_name: input.gift_source === "catalog" ? (gift?.name || "") : input.gift_name.trim(), gift_description: input.gift_description || null, gift_image_url: input.gift_image_url || null, owner_id: ownerId };
      const request = id
        ? supabase.from("reward_missions").update(payload).eq("id", id).eq("owner_id", ownerId)
        : supabase.from("reward_missions").insert(payload);
      const { data, error } = await request.select("id,owner_id,title,description,mode,threshold_amount,gift_source,gift_product_id,gift_name,gift_description,gift_image_url,gift_stock,gift_quantity,max_redemptions,is_active").single();
      if (error) throw error;
      setMissions(current => id ? current.map(m => m.id === id ? data as Mission : m) : [data as Mission, ...current]);
      if (!id) setDraft(blank);
      toast.success("Missão salva.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar a missão.");
    } finally { setSaving(false); }
  }
  return <section className="rewards-management">
    <h2><Gift size={20} aria-hidden="true"/> Clube de Recompensas</h2>
    <p>Crie metas de compras e escolha o brinde. Missões novas começam desativadas.</p><p role="status">Ativação temporariamente bloqueada: falta homologar pagamentos e resgate de brindes.</p>
    <form onSubmit={e => { e.preventDefault(); void save(draft); }}>
      <label>Nome da missão<input required maxLength={120} value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Compre R$ 300 e ganhe um brinco"/></label>
      <label>Modalidade<select value={draft.mode} onChange={e => setDraft(d => ({ ...d, mode: e.target.value as Mission["mode"] }))}><option value="cumulative">Compras acumuladas</option><option value="single_order">Uma única compra</option></select></label>
      <label>Meta em R$<input type="number" min=".01" step=".01" required value={draft.threshold_amount} onChange={e => setDraft(d => ({ ...d, threshold_amount: Number(e.target.value) }))}/></label>
      <label>Origem do brinde<select value={draft.gift_source} onChange={e => setDraft(d => ({...d, gift_source:e.target.value as "custom"|"catalog", gift_product_id:null}))}><option value="custom">Brinde exclusivo (não vendido na loja)</option><option value="catalog">Produto do catálogo</option></select></label>
      {draft.gift_source === "catalog" ? <label>Produto do catálogo<select required value={draft.gift_product_id ?? ""} onChange={e => setDraft(d => ({...d,gift_product_id:Number(e.target.value)}))}><option value="">Selecione um produto</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} em estoque)</option>)}</select></label> : <>
        <label>Nome do brinde<input required maxLength={160} value={draft.gift_name} onChange={e => setDraft(d => ({...d,gift_name:e.target.value}))} placeholder="Nécessaire exclusiva Violetta"/></label>
        <label>Descrição do brinde<textarea value={draft.gift_description} onChange={e => setDraft(d => ({...d,gift_description:e.target.value}))} placeholder="Material, cor e detalhes"/></label>
        <label>URL da foto do brinde<input type="url" value={draft.gift_image_url} onChange={e => setDraft(d => ({...d,gift_image_url:e.target.value}))} placeholder="https://..."/></label>
        <label>Quantidade disponível<input type="number" min="0" step="1" value={draft.gift_stock} onChange={e => setDraft(d => ({...d,gift_stock:Number(e.target.value)}))}/></label>
      </>}
      <label>Unidades por brinde<input type="number" min="1" max="100" step="1" value={draft.gift_quantity} onChange={e => setDraft(d => ({ ...d, gift_quantity: Number(e.target.value) }))}/></label>
      <button type="submit" disabled={saving}><Plus size={16}/> {saving ? "Salvando..." : "Criar missão desativada"}</button>
    </form>
    <h3>Missões cadastradas</h3>
    {loading ? <p>Carregando missões...</p> : missions.length === 0 ? <p>Nenhuma missão cadastrada.</p> : missions.map(m => <article key={m.id}>
      <strong>{m.title}</strong>
      <p>{m.mode === "cumulative" ? "Compras acumuladas" : "Compra única"} · R$ {Number(m.threshold_amount).toFixed(2).replace(".", ",")} · {m.gift_name || products.find(p => p.id === m.gift_product_id)?.name || "Brinde indisponível"}</p>
      <label><input type="checkbox" checked={m.is_active} disabled={saving || !rewardsActivationEnabled} onChange={e => {
        const active = e.target.checked;
        if (active && !window.confirm("Ativar esta missão para os clientes? Verifique antes se o processamento de pagamentos e o resgate de brindes estão homologados.")) return;
        void save({ title: m.title, description: m.description || "", mode: m.mode, threshold_amount: m.threshold_amount, gift_source:m.gift_source, gift_product_id:m.gift_product_id, gift_name:m.gift_name, gift_description:m.gift_description || "", gift_image_url:m.gift_image_url || "", gift_stock:m.gift_stock, gift_quantity: m.gift_quantity, max_redemptions: m.max_redemptions, is_active: active }, m.id);
      }}/> {m.is_active ? "Ativa" : "Desativada"}</label>
    </article>)}
  </section>;
}
