import { useEffect, useState, type FormEvent } from "react";
import { formatCPF, isValidCPF } from "./lib/cpf";
import { customerSupabase } from "./lib/supabase";

export default function CustomerCpf({ customerId }: { customerId: string }) {
  const [ending, setEnding] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = customerSupabase;
    if (!client) return;
    let active = true;
    setLoading(true);
    setError("");
    client.from("customer_tax_ids").select("cpf").eq("customer_id", customerId).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setError("Não foi possível consultar o CPF salvo.");
      else setEnding(data?.cpf?.slice(-2) || "");
      setLoading(false);
    });
    return () => { active = false; };
  }, [customerId, attempt]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerSupabase || busy) return;
    if (!isValidCPF(draft)) { setError("Informe um CPF válido."); return; }
    setBusy(true);
    setError("");
    setMessage("");
    const digits = draft.replace(/\D/g, "");
    try {
      const { error } = await customerSupabase.from("customer_tax_ids")
        .insert({ customer_id: customerId, cpf: digits });
      if (error) throw error;
      setEnding(digits.slice(-2));
      setDraft("");
      setEditing(false);
      setMessage("CPF salvo para as próximas compras.");
    } catch {
      setError("Não foi possível salvar o CPF. Tente novamente.");
    } finally { setBusy(false); }
  };

  return <section className="customer-detail-panel">
    <h2>CPF para compras</h2>
    <p>Cadastre seu próprio CPF para comprar com esta conta. Para corrigir o documento depois, fale com o atendimento.</p>
    {loading ? <p role="status">Consultando CPF salvo…</p> : editing ? (
      <form className="customer-form" onSubmit={save}>
        <label>CPF <input autoComplete="off" inputMode="numeric" maxLength={14} required placeholder="000.000.000-00"
          value={draft} onChange={event => setDraft(formatCPF(event.target.value))} /></label>
        <button className="customer-resume-payment" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar CPF"}</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => {
          setDraft(""); setEditing(false); setError("");
        }}>Cancelar</button>
      </form>
    ) : <>
      {ending && <p>CPF salvo <strong>•••.•••.•••-{ending}</strong></p>}
      <div className="customer-links">
        {!ending && !error && <button type="button" disabled={busy} onClick={() => { setEditing(true); setError(""); setMessage(""); }}>Cadastrar CPF</button>}
        {ending && <a href="https://wa.me/556399945488" target="_blank" rel="noreferrer">Falar com a Violetta para corrigir</a>}
        {error && <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Consultar novamente</button>}
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
