import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

const tableFields: Record<string, string[]> = {
  products: ["id", "name", "category", "material", "cost", "price", "stock", "imageUrl"],
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
  // In production, the server is the source of truth. Never hydrate an authenticated
  // account from another browser/session's localStorage before the owner's rows load.
  const [value, setValue] = useState<T[]>(() => (!isSupabaseConfigured ? readLocal(localKey, initial) : []));
  const [ready, setReady] = useState(!isSupabaseConfigured || !ownerId);
  const [serverLoadSucceeded, setServerLoadSucceeded] = useState(!isSupabaseConfigured || !ownerId);

  useEffect(() => {
    localStorage.setItem(localKey, JSON.stringify(value));
  }, [localKey, value]);

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!client) {
      setServerLoadSucceeded(true);
      setReady(true);
      return;
    }
    if (!ownerId) {
      setServerLoadSucceeded(false);
      setValue([]);
      setReady(false);
      return;
    }
    setServerLoadSucceeded(false);
    setReady(false);
    (async () => {
      const { data, error } = await client.from(table).select("*").eq("owner_id", ownerId).order("id");
      if (error) throw error;
      if (cancelled) return;
      // An authenticated account with no rows must stay empty. Do not automatically
      // copy local/demo data into the production database.
      if (data?.length) {
        setValue(data.map((row) => fromDb(table, row)) as T[]);
      } else {
        setValue([]);
      }
      if (!cancelled) {
        setServerLoadSucceeded(true);
        setReady(true);
      }
    })().catch((error) => {
      console.error(`Falha ao carregar ${table} no Supabase`, error);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [table, localKey, ownerId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !ownerId || !ready || !serverLoadSucceeded) return;
    const sync = async () => {
      const rows = value.map((item) => toDb(table, item, ownerId));
      const { data: existing, error: readError } = await client.from(table).select("id").eq("owner_id", ownerId);
      if (readError) return console.error(`Falha ao consultar ${table}`, readError);
      const ids = new Set(value.map((item) => item.id));
      const removed = (existing ?? []).map((row) => row.id).filter((id) => !ids.has(id));
      if (removed.length) await client.from(table).delete().eq("owner_id", ownerId).in("id", removed);
      if (rows.length) {
        const { error } = await client.from(table).upsert(rows, { onConflict: "id" });
        if (error) console.error(`Falha ao sincronizar ${table}`, error);
      }
    };
    void sync();
  }, [table, ownerId, ready, serverLoadSucceeded, value]);

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

export async function deleteManualSale(saleId: number) {
  if (!supabase) throw new Error("Supabase indisponível");
  const { data, error } = await supabase.rpc("delete_manual_sale", { p_sale_id: saleId });
  if (error) throw error;
  return data as { sale_id: number; cash_id: number | null; product_id: number | null };
}
