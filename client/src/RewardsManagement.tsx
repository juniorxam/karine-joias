import { useEffect, useState } from "react";
import { Gift, Plus, Pencil, Search, X } from "lucide-react";
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
  reserved_gifts: number;
  gift_quantity: number;
  max_redemptions: number | null;
  is_active: boolean;
};
type GiftProduct = { id: number; name: string; stock: number };
const blank = { title: "", description: "", mode: "cumulative" as Mission["mode"], threshold_amount: 300, gift_source: "custom" as "custom" | "catalog", gift_product_id: null as number | null, gift_name: "", gift_description: "", gift_image_url: "", gift_stock: 0, reserved_gifts: 0, gift_quantity: 1, max_redemptions: null as number | null, is_active: false };

export default function RewardsManagement({ ownerId, products }: { ownerId: string; products: GiftProduct[] }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [draft, setDraft] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"config"|"customers">("config");
  const [claims, setClaims] = useState<{id:string;mission_id:string;customer_user_id:string;status:string;created_at:string}[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const rewardsActivationEnabled = false; // Unlock only after verified server-side fulfillment.
  useEffect(() => {
    if (!supabase || !ownerId) return;
    let cancelled = false;
    setLoading(true);
    supabase.from("reward_missions").select("id,owner_id,title,description,mode,threshold_amount,gift_source,gift_product_id,gift_name,gift_description,gift_image_url,gift_stock,reserved_gifts,gift_quantity,max_redemptions,is_active")
      .eq("owner_id", ownerId).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { toast.error("Missões indisponíveis. Verifique a configuração segura do banco."); return; }
        setMissions((data || []) as Mission[]);
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ownerId]);
  useEffect(()=>{
    if(view!=="customers"||!supabase||!ownerId)return;
    let cancelled=false;
    setClaimsLoading(true);
    supabase.from("reward_claims").select("id,mission_id,customer_user_id,status,created_at,reward_missions!inner(owner_id)").eq("reward_missions.owner_id",ownerId).order("created_at",{ascending:false}).then(({data,error})=>{
      if(cancelled)return;
      if(error){toast.error("Não foi possível consultar os resgates.");setClaims([]);}
      else setClaims((data||[]) as unknown as typeof claims);
    }).finally(()=>{if(!cancelled)setClaimsLoading(false)});
    return()=>{cancelled=true};
  },[view,ownerId]);
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
      const { data, error } = await request.select("id,owner_id,title,description,mode,threshold_amount,gift_source,gift_product_id,gift_name,gift_description,gift_image_url,gift_stock,reserved_gifts,gift_quantity,max_redemptions,is_active").single();
      if (error) throw error;
      setMissions(current => id ? current.map(m => m.id === id ? data as Mission : m) : [data as Mission, ...current]);
      setDraft(blank);
      setEditingId(null);
      setShowForm(false);
      toast.success("Missão salva.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível salvar a missão.");
    } finally { setSaving(false); }
  }
  const filtered = missions.filter(m => `${m.title} ${m.gift_name}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const beginEdit = (m: Mission) => {
    setDraft({title:m.title,description:m.description||"",mode:m.mode,threshold_amount:m.threshold_amount,gift_source:m.gift_source,gift_product_id:m.gift_product_id,gift_name:m.gift_name,gift_description:m.gift_description||"",gift_image_url:m.gift_image_url||"",gift_stock:m.gift_stock,reserved_gifts:m.reserved_gifts,gift_quantity:m.gift_quantity,max_redemptions:m.max_redemptions,is_active:m.is_active});
    setEditingId(m.id);
    setShowForm(true);
  };
  return <section className="rewards-management">
    <h2><Gift size={20} aria-hidden="true"/> Clube de Recompensas</h2>
    <p>Crie metas de compras e escolha o brinde. Missões novas começam desativadas.</p><p role="status">Ativação temporariamente bloqueada: falta homologar pagamentos e resgate de brindes.</p>
    <div className="rewards-management-tabs"><button type="button" aria-pressed={view==="config"} onClick={()=>setView("config")}>Configurar metas</button><button type="button" aria-pressed={view==="customers"} onClick={()=>setView("customers")}>Acompanhamento de clientes</button></div>
    {view==="customers"?<div className="rewards-management-customers"><h3>Resgates registrados</h3><p>Exibimos somente brindes com resgate registrado no banco. Atingimento automático de metas ainda depende da validação do processamento de pagamentos.</p>{claimsLoading?<p>Carregando resgates…</p>:claims.length===0?<p>Nenhum resgate registrado até o momento.</p>:<div className="rewards-management-grid">{claims.map(c=><article className="rewards-management-card" key={c.id}><strong>{missions.find(m=>m.id===c.mission_id)?.title||"Meta"}</strong><p>Brinde: {missions.find(m=>m.id===c.mission_id)?.gift_name||"—"}</p><p>Cliente (ID): {c.customer_user_id}</p><p>Registrado em: {new Date(c.created_at).toLocaleDateString("pt-BR")}</p><span className={c.status==="fulfilled"?"reward-status-active":"reward-status-draft"}>{c.status==="fulfilled"?"Entregue":c.status==="reserved"?"Reservado":"Cancelado"}</span></article>)}</div>}</div>:<>
    <div className="rewards-management-toolbar"><div><strong>{missions.length} {missions.length===1?"meta cadastrada":"metas cadastradas"}</strong><span>{missions.filter(m=>m.is_active).length} ativas · {missions.filter(m=>!m.is_active).length} desativadas</span></div><button type="button" onClick={()=>{setEditingId(null);setDraft(blank);setShowForm(v=>!v);}}><Plus size={17}/> Nova meta</button></div>
    <div className="rewards-management-search"><Search size={17}/><input aria-label="Buscar metas" placeholder="Buscar meta ou brinde" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    {showForm && <form className="rewards-management-form" onSubmit={e => { e.preventDefault(); void save(draft,editingId||undefined); }}><div className="rewards-management-form-heading"><h3>{editingId?"Editar meta":"Criar nova meta"}</h3><button type="button" onClick={()=>{setShowForm(false);setEditingId(null);setDraft(blank);}} aria-label="Fechar formulário"><X size={18}/></button></div>
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
      <button type="submit" disabled={saving}><Plus size={16}/> {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar missão desativada"}</button>
    </form>}
    <h3>Metas cadastradas</h3>
    {loading ? <p>Carregando missões...</p> : missions.length === 0 ? <p>Nenhuma meta cadastrada. Clique em “Nova meta” para começar.</p> : filtered.length === 0 ? <p>Nenhuma meta encontrada para esta busca.</p> : <div className="rewards-management-grid">{filtered.map(m => <article className="rewards-management-card" key={m.id}>
      <div className="rewards-management-card-top">{m.gift_image_url&&<img src={m.gift_image_url} alt={m.gift_name} loading="lazy"/>}<div><span className={m.is_active?"reward-status-active":"reward-status-draft"}>{m.is_active?"Ativa":"Desativada"}</span><h4>{m.title}</h4></div></div>
      <p>{m.mode === "cumulative" ? "Compras acumuladas" : "Compra única"} · R$ {Number(m.threshold_amount).toFixed(2).replace(".", ",")} · {m.gift_name || products.find(p => p.id === m.gift_product_id)?.name || "Brinde indisponível"}</p>
      <button type="button" className="rewards-management-edit" onClick={()=>beginEdit(m)}><Pencil size={15}/> Editar meta</button>
      <label><input type="checkbox" checked={m.is_active} disabled={saving || !rewardsActivationEnabled} onChange={e => {
        const active = e.target.checked;
        if (active && !window.confirm("Ativar esta missão para os clientes? Verifique antes se o processamento de pagamentos e o resgate de brindes estão homologados.")) return;
        void save({ title: m.title, description: m.description || "", mode: m.mode, threshold_amount: m.threshold_amount, gift_source:m.gift_source, gift_product_id:m.gift_product_id, gift_name:m.gift_name, gift_description:m.gift_description || "", gift_image_url:m.gift_image_url || "", gift_stock:m.gift_stock, reserved_gifts:m.reserved_gifts, gift_quantity: m.gift_quantity, max_redemptions: m.max_redemptions, is_active: active }, m.id);
      }}/> {m.is_active ? "Ativa" : "Desativada"}</label>
    </article>)}</div>}
    </>}
  </section>;
}
