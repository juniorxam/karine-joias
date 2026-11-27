import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

const tableFields: Record<string, string[]> = {
  products: ["id", "name", "category", "material", "productType", "finishColor", "style", "occasions", "size", "tags", "cost", "price", "pixPrice", "compareAtPrice", "discountPercent", "installmentCount", "stock", "imageUrl", "imageUrls"],
  clients: ["id", "name", "phone", "email", "birthday", "preferences"],
  sales: ["id", "date", "productId", "clientId", "amount", "payment", "discount", "channel", "quantity"],
  cash_entries: ["id", "date", "type", "category", "description", "amount"],
  promotions: ["id", "name", "type", "value", "code", "ends", "active", "uses"],
};

const toDb = (table: string, value: Record<string, unknown>, ownerId: string) => {
  const allowed = tableFields[table] ?? Object.keys(value);
  const row: Record<string, unknown> = { owner_id: ownerId };
  for (const field of allowed) {
    if (field === "id") row.id = value.id;
    else if (field === "productId") row.product_id = value[field];
    else if (field === "clientId") row.client_id = value[field];
    else row[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value[field];
  }
  return row;
};

const fromDb = (table: string, row: Record<string, any>) => {
  const value: Record<string, any> = {};
  for (const field of tableFields[table] ?? Object.keys(row)) {
    if (field === "id") value.id = row.id;
    else if (field === "productId") value.productId = row.product_id;
    else if (field === "clientId") value.clientId = row.client_id;
    else value[field] = row[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
  }
  return value;
};

function readLocal<T>(key: string, initial: T) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed as T : initial;
  } catch {
    return initial;
  }
}

export function useSyncedCollection<T extends Record<string, any>>(
  table: string,
  localKey: string,
  initial: T[],
  ownerId?: string,
): [T[], Dispatch<SetStateAction<T[]>>, boolean] {
  const [value, setValue] = useState<T[]>(() => (!isSupabaseConfigured ? readLocal(localKey, initial) : []));
  const [ready, setReady] = useState(!isSupabaseConfigured || !ownerId);
  const [serverLoadSucceeded, setServerLoadSucceeded] = useState(!isSupabaseConfigured || !ownerId);
  const [baseline, setBaseline] = useState<T[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) localStorage.setItem(localKey, JSON.stringify(value));
  }, [localKey, value]);

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!client) {
      setServerLoadSucceeded(true);
      setReady(true);
      return;
    }
    setServerLoadSucceeded(false);
    setReady(false);
    setBaseline(null);
    if (!ownerId) {
      setValue([]);
      return;
    }
    (async () => {
      const { data, error } = await client.from(table).select("*").eq("owner_id", ownerId).order("id");
      if (error) throw error;
      if (cancelled) return;
      const loaded = (data || []).map((row) => fromDb(table, row)) as T[];
      setValue(loaded);
      setBaseline(loaded);
      setServerLoadSucceeded(true);
      setReady(true);
    })().catch((error) => {
      console.error(`Falha ao carregar ${table} no Supabase`, error);
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [table, ownerId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !ownerId || !ready || !serverLoadSucceeded || !baseline) return;
    const oldById = new Map(baseline.map((item) => [String(item.id), item]));
    const newById = new Map(value.map((item) => [String(item.id), item]));
    const changed = value.filter((item) => JSON.stringify(item) !== JSON.stringify(oldById.get(String(item.id))));
    const deleted = baseline.filter((item) => !newById.has(String(item.id)));
    if (!changed.length && !deleted.length) return;
    let cancelled = false;
    const sync = async () => {
      const { data: current, error: readError } = await client.from(table).select("*").eq("owner_id", ownerId);
      if (readError) throw readError;
      const serverById = new Map((current || []).map((row) => [String(row.id), fromDb(table, row)]));
      const conflicts = [...changed, ...deleted].filter((item) => {
        const id = String(item.id);
        const previous = oldById.get(id);
        const server = serverById.get(id);
        const desired = newById.get(id);
        // A server-side RPC may already have committed the desired value.
        if (desired && JSON.stringify(server) === JSON.stringify(desired)) return false;
        return previous ? JSON.stringify(previous) !== JSON.stringify(server) : server !== undefined;
      });
      if (conflicts.length) throw new Error(`Conflito de sincronização em ${table}. Atualize a página antes de continuar.`);
      for (const item of deleted) {
        if (!serverById.has(String(item.id))) continue;
        const { error } = await client.from(table).delete().eq("owner_id", ownerId).eq("id", item.id);
        if (error) throw error;
      }
      const pending = changed.filter((item) => JSON.stringify(serverById.get(String(item.id))) !== JSON.stringify(item));
      if (pending.length) {
        const { error } = await client.from(table).upsert(pending.map((item) => toDb(table, item, ownerId)), { onConflict: "id" });
        if (error) throw error;
      }
      if (!cancelled) setBaseline(value);
    };
    void sync().catch((error) => console.error(`Falha ao sincronizar ${table}`, error));
    return () => { cancelled = true; };
  }, [table, ownerId, ready, serverLoadSucceeded, value, baseline]);

  return [value, setValue, ready];
}

export async function createManualSale(input: {
  date: string;
  productId: number;
  clientId: number;
  amount: number;
  payment: string;
  discount?: number;
  quantity?: number;
}) {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("create_manual_sale", {
    p_date: input.date,
    p_product_id: input.productId,
    p_client_id: input.clientId,
    p_amount: input.amount,
    p_payment: input.payment,
    p_discount: input.discount ?? 0,
    p_quantity: input.quantity ?? 1,
  });
  if (error) throw error;
  return {
    sale: fromDb("sales", data.sale) as any,
    cash: fromDb("cash_entries", data.cash) as any,
    product: fromDb("products", data.product) as any,
  };
}

export async function adjustProductStock(productId: number, delta: number, reason = "Ajuste manual") {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("adjust_product_stock", {
    p_product_id: productId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) throw error;
  return fromDb("products", data) as any;
}

export async function deleteManualSale(saleId: number) {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("delete_manual_sale", { p_sale_id: saleId });
  if (error) throw error;
  return data as { sale_id: number; cash_id: number | null; product_id: number | null };
}
