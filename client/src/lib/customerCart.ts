import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type CatalogProduct } from "./catalog";
import { customerSupabase } from "./supabase";

export type CartItem = CatalogProduct & { quantity: number };
const guestCartKey = "kj-cart";
type Change = { id: string; quantity: number; mode: "delta" | "merge" | "remove"; product?: CartItem };

function readGuestCart(): CartItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(guestCartKey) || "[]");
    if (!Array.isArray(items)) return [];
    return items.filter(item => /^[0-9]{1,19}$/.test(String(item?.id)) && Number.isInteger(item.quantity) && item.quantity > 0)
      .slice(0, 30).map(item => ({ ...item, quantity: Math.min(item.quantity, 20) }));
  } catch {
    return [];
  }
}

function fromServer(value: unknown): CartItem[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value).map(item => ({ category: "", material: "", ...item }));
}

function change(item: CartItem, quantity: number, mode: Change["mode"]): Change {
  return { id: String(item.id), quantity, mode, product: {
    id: item.id, name: item.name, material: item.material, category: item.category,
    price: item.price, imageUrl: item.imageUrl, quantity: item.quantity,
  } };
}

export function useCustomerCart(customerId: string | undefined, authResolved: boolean) {
  const [guest, setGuest] = useState(readGuestCart);
  const [cloud, setCloud] = useState<{ customerId: string; items: CartItem[] }>();
  const [error, setError] = useState(false);
  const scope = useRef(customerId);
  const readVersion = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const writing = useRef(0);
  scope.current = customerId;

  const refresh = useCallback(async () => {
    if (!customerSupabase || !customerId || writing.current) return null;
    const request = ++readVersion.current;
    const guestItems = readGuestCart();
    const result = guestItems.length
      ? await customerSupabase.rpc("update_customer_cart", {
          p_customer: customerId, p_changes: guestItems.map(item => change(item, item.quantity, "merge")),
        })
      : await customerSupabase.from("customer_carts").select("items").eq("customer_id", customerId).maybeSingle();
    if (scope.current !== customerId || request !== readVersion.current || writing.current) return null;
    setError(Boolean(result.error));
    if (result.error) return null;
    if (guestItems.length) {
      localStorage.removeItem(guestCartKey);
      setGuest([]);
    }
    const updated = fromServer(guestItems.length ? result.data : result.data?.items);
    setCloud({ customerId, items: updated });
    return updated;
  }, [customerId]);

  useEffect(() => {
    setError(false);
    if (!customerId) { setCloud(undefined); return; }
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      ++readVersion.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [customerId, refresh]);

  useEffect(() => {
    if (!customerId && authResolved) localStorage.setItem(guestCartKey, JSON.stringify(guest));
  }, [guest, customerId, authResolved]);

  const ready = authResolved && (!customerId || cloud?.customerId === customerId);
  const items = !authResolved ? [] : customerId ? (cloud?.customerId === customerId ? cloud.items : []) : guest;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const write = async (changes: Change[]) => {
    if (!customerSupabase || !customerId || !changes.length) return true;
    const client = customerSupabase;
    ++writing.current;
    ++readVersion.current;
    const task = queue.current.then(async () => {
      if (scope.current !== customerId) return false;
      const { data, error: failure } = await client.rpc("update_customer_cart", { p_customer: customerId, p_changes: changes });
      if (scope.current !== customerId) return false;
      if (failure) {
        toast.error("Não foi possível atualizar o carrinho. Confira os itens e tente novamente.");
        return false;
      }
      const updated = fromServer(data);
      itemsRef.current = updated;
      setCloud({ customerId, items: updated });
      return true;
    });
    queue.current = task.catch(() => {});
    try { return await task; }
    catch { toast.error("Não foi possível atualizar o carrinho."); return false; }
    finally { --writing.current; }
  };

  const edit = (update: (items: CartItem[]) => CartItem[], removal: "remove" | "delta" = "remove") => {
    if (!ready) { toast.error("Aguarde a sincronização do carrinho."); return false; }
    const before = itemsRef.current;
    const after = update(before);
    if (after === before) return false;
    if (after.length > 30) { toast.error("O carrinho aceita até 30 peças diferentes."); return false; }
    if (!customerId) {
      itemsRef.current = after;
      setGuest(after);
      return true;
    }
    if (writing.current) { toast.info("Aguarde a atualização do carrinho."); return false; }
    const changes = [
      ...before.filter(item => !after.some(next => String(next.id) === String(item.id))).map(item => change(item, removal === "delta" ? -item.quantity : 0, removal)),
      ...after.flatMap(item => {
        const old = before.find(previous => String(previous.id) === String(item.id));
        const quantity = item.quantity - (old?.quantity ?? 0);
        return quantity ? [change(item, quantity, "delta")] : [];
      }),
    ];
    void write(changes);
    return true;
  };

  const removePurchased = async (purchased: CartItem[]) => {
    if (customerId) return write(purchased.map(item => change(item, -item.quantity, "delta")));
    edit(current => current.flatMap(item => {
      const sold = purchased.find(line => String(line.id) === String(item.id));
      const quantity = item.quantity - (sold?.quantity ?? 0);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
    return true;
  };

  return { items, edit, removePurchased, ready, error, refresh, isWriting: () => writing.current > 0 };
}
