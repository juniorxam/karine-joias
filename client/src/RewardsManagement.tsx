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
  gift_product_id: number;
  gift_quantity: number;
  max_redemptions: number | null;
  is_active: boolean;
};
type GiftProduct = { id: number; name: string; stock: number };
const blank = { title: "", description: "", mode: "cumulative" as Mission["mode"], threshold_amount: 300, gift_product_id: 0, gift_quantity: 1, max_redemptions: null as number | null, is_active: false };

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
    supabase.from("reward_missions").select("id,owner_id,title,description,mode,threshold_amount,gift_product_id,gift_quantity,max_redemptions,is_active")
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
    if (!gift) { toast.error("Selecione um brinde do catálogo."); return; }
    if (input.is_active && !rewardsActivationEnabled) { toast.error("Ativação bloqueada até homologação dos pagamentos e brindes."); return; }
    if (input.is_active && gift.stock < input.gift_quantity) { toast.error("Estoque insuficiente para ativar a missão."); return; }
    setSaving(true);
    try {
      const payload = { ...input, title: input.title.trim(), gift_product_id: Number(input.gift_product_id), owner_id: ownerId };
      const request = id
        ? supabase.from("reward_missions").update(payload).eq("id", id).eq("owner_id", ownerId)
        : supabase.from("reward_missions").insert(payload);
      const { data, error } = await request.select("id,owner_id,title,description,mode,threshold_amount,gift_product_id,gift_quantity,max_redemptions,is_active").single();
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
      <label>Brinde<select required value={draft.gift_product_id || ""} onChange={e => setDraft(d => ({ ...d, gift_product_id: Number(e.target.value) }))}><option value="">Selecione um produto</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} em estoque)</option>)}</select></label>
      <label>Unidades por brinde<input type="number" min="1" max="100" step="1" value={draft.gift_quantity} onChange={e => setDraft(d => ({ ...d, gift_quantity: Number(e.target.value) }))}/></label>
      <button type="submit" disabled={saving}><Plus size={16}/> {saving ? "Salvando..." : "Criar missão desativada"}</button>
    </form>
    <h3>Missões cadastradas</h3>
    {loading ? <p>Carregando missões...</p> : missions.length === 0 ? <p>Nenhuma missão cadastrada.</p> : missions.map(m => <article key={m.id}>
      <strong>{m.title}</strong>
      <p>{m.mode === "cumulative" ? "Compras acumuladas" : "Compra única"} · R$ {Number(m.threshold_amount).toFixed(2).replace(".", ",")} · {products.find(p => p.id === m.gift_product_id)?.name || "Brinde indisponível"}</p>
      <label><input type="checkbox" checked={m.is_active} disabled={saving || !rewardsActivationEnabled} onChange={e => {
        const active = e.target.checked;
        if (active && !window.confirm("Ativar esta missão para os clientes? Verifique antes se o processamento de pagamentos e o resgate de brindes estão homologados.")) return;
        void save({ title: m.title, description: m.description || "", mode: m.mode, threshold_amount: m.threshold_amount, gift_product_id: m.gift_product_id, gift_quantity: m.gift_quantity, max_redemptions: m.max_redemptions, is_active: active }, m.id);
      }}/> {m.is_active ? "Ativa" : "Desativada"}</label>
    </article>)}
  </section>;
}
