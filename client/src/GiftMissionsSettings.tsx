import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { formatMoney } from "./lib/catalog";
import { supabase } from "./lib/supabase";

const fields = "id,title,gift_name,threshold_amount,gift_stock,reserved_gifts,starts_at,ends_at,is_active";
type Mission = {
  id: string;
  title: string;
  gift_name: string;
  threshold_amount: number;
  gift_stock: number;
  reserved_gifts: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};
const empty = { title: "", gift_name: "", threshold_amount: "", gift_stock: "", starts_at: "", ends_at: "" };
const localInput = (value: string | null) => value
  ? new Date(Date.parse(value) - 3 * 3600000).toISOString().slice(0, 16)
  : "";
const isoDate = (value: string) => value ? new Date(value + ":00-03:00").toISOString() : null;
const displayDate = (value: string | null) => value
  ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  : "Sem limite";

export default function GiftMissionsSettings({ ownerId }: { ownerId: string }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<Mission | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.from("reward_missions").select(fields).eq("owner_id", ownerId)
      .eq("mode", "single_order").order("threshold_amount").then(({ data, error }) => {
        if (!mounted) return;
        setLoadState(error ? "error" : "ready");
        if (data) setMissions(data);
      });
    return () => { mounted = false; };
  }, [ownerId]);

  const reset = () => { setForm(empty); setEditing(null); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || busy) return;
    const title = form.title.trim();
    const gift_name = form.gift_name.trim();
    const threshold_amount = Number(form.threshold_amount);
    const gift_stock = Number(form.gift_stock);
    const starts_at = isoDate(form.starts_at);
    const ends_at = isoDate(form.ends_at);
    if (title.length < 3 || gift_name.length < 2 || threshold_amount <= 0 ||
      !Number.isInteger(gift_stock) || gift_stock < (editing?.reserved_gifts ?? 0) ||
      (starts_at && ends_at && starts_at >= ends_at)) {
      toast.error("Confira os nomes, o valor mínimo, a quantidade e as datas da campanha.");
      return;
    }
    setBusy(true);
    const values = { title, gift_name, threshold_amount, gift_stock, starts_at, ends_at };
    const query = editing
      ? supabase.from("reward_missions").update(values).eq("owner_id", ownerId).eq("id", editing.id)
      : supabase.from("reward_missions").insert({ ...values, owner_id: ownerId, mode: "single_order", is_active: false });
    const { data, error } = await query.select(fields).single();
    setBusy(false);
    if (error || !data) {
      toast.error("Não foi possível salvar o mimo", { description: error?.message });
      return;
    }
    setMissions(current => [...current.filter(mission => mission.id !== data.id), data]);
    reset();
    toast.success(editing ? "Mimo atualizado" : "Mimo salvo. Ative para mostrar na loja.");
  };

  const toggle = async (mission: Mission) => {
    if (!supabase || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from("reward_missions").update({ is_active: !mission.is_active })
      .eq("owner_id", ownerId).eq("id", mission.id).eq("is_active", mission.is_active).select(fields).single();
    setBusy(false);
    if (error || !data) { toast.error("Não foi possível alterar o mimo", { description: error?.message }); return; }
    setMissions(current => current.map(item => item.id === data.id ? data : item));
  };

  return <section className="panel">
    <h3>Mimos por pedido</h3>
    <p>O valor mínimo considera os produtos após descontos, sem frete. Cadastre o mimo e ative quando estiver pronta.</p>
    {loadState === "error" && <p role="alert">Não foi possível carregar os mimos. Atualize a página para tentar novamente.</p>}
    {loadState === "loading" && <p role="status">Carregando mimos…</p>}
    {loadState === "ready" && <>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="form-grid" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{editing ? "Editar mimo" : "Novo mimo"}</legend>
          <label>Nome da campanha<input required minLength={3} maxLength={120} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
          <label>Brinde<input required minLength={2} maxLength={160} value={form.gift_name} onChange={event => setForm({ ...form, gift_name: event.target.value })} /></label>
          <label>Valor mínimo (R$)<input required type="number" min=".01" step=".01" value={form.threshold_amount} onChange={event => setForm({ ...form, threshold_amount: event.target.value })} /></label>
          <label>Quantidade de brindes<input required type="number" min={editing?.reserved_gifts ?? 0} max="2147483647" step="1" value={form.gift_stock} onChange={event => setForm({ ...form, gift_stock: event.target.value })} /></label>
          <label>Início (horário de Brasília)<input type="datetime-local" value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} /></label>
          <label>Fim (horário de Brasília)<input type="datetime-local" value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} /></label>
          <div><button className="primary" type="submit">{busy ? "Salvando…" : "Salvar mimo"}</button>{editing && <button className="secondary" type="button" onClick={reset}>Cancelar edição</button>}</div>
        </fieldset>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Campanha</th><th>Valor mínimo</th><th>Quantidade</th><th>Vigência</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{missions.length === 0 ? <tr><td colSpan={6}>Nenhum mimo cadastrado.</td></tr> : [...missions].sort((a,b) => a.threshold_amount-b.threshold_amount).map(mission =>
          <tr key={mission.id}><td><strong>{mission.title}</strong><br />{mission.gift_name}</td><td>{formatMoney(mission.threshold_amount)}</td><td>{mission.gift_stock} ({mission.reserved_gifts} reservados)</td><td>{displayDate(mission.starts_at)} até {displayDate(mission.ends_at)}</td><td>{mission.is_active ? "Ativa" : "Inativa"}</td><td>
            <button className="secondary" type="button" disabled={busy} onClick={() => {
              setEditing(mission);
              setForm({ title: mission.title, gift_name: mission.gift_name, threshold_amount: String(mission.threshold_amount), gift_stock: String(mission.gift_stock), starts_at: localInput(mission.starts_at), ends_at: localInput(mission.ends_at) });
            }}>Editar</button>
            <button className="secondary" type="button" disabled={busy} onClick={() => void toggle(mission)}>{mission.is_active ? "Desativar" : "Ativar"}</button>
          </td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
