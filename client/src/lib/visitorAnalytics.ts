import { supabase } from "./supabase";

const VISITOR_STORAGE_KEY = "violetta-anonymous-visitor-v1";
const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identificador aleatório do navegador, sem dados pessoais ou localização.
 * O mesmo navegador é contado uma vez por dia entre visitantes únicos.
 */
function getAnonymousVisitorId(): string | null {
  try {
    const stored = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (stored && VALID_UUID.test(stored)) return stored;
    const generated = window.crypto.randomUUID();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

/** Registra uma visualização apenas no domínio oficial da loja. */
export async function recordViolettaPageView(): Promise<void> {
  if (!supabase || !["violetta.com.br", "www.violetta.com.br"].includes(window.location.hostname)) return;
  const visitorId = getAnonymousVisitorId();
  if (!visitorId) return;
  const { error } = await supabase.rpc("record_violetta_visit", { p_visitor_id: visitorId });
  if (error && import.meta.env.DEV) console.warn("Visita não registrada", error);
}
