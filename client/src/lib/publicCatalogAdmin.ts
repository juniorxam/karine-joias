import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { CatalogProduct } from "./catalog";

export type ManagedPublicProduct = CatalogProduct & {
  publicId: string;
  productId: number;
  featured: boolean;
  isPublished: boolean;
};

const localKey = "kj-public-products";

function readLocal(): ManagedPublicProduct[] {
  try { return JSON.parse(localStorage.getItem(localKey) || "[]"); } catch { return []; }
}

export function usePublicProductManager(ownerId?: string): [ManagedPublicProduct[], Dispatch<SetStateAction<ManagedPublicProduct[]>>, boolean] {
  const [items, setItems] = useState<ManagedPublicProduct[]>(readLocal);
  const [ready, setReady] = useState(!isSupabaseConfigured || !ownerId);

  useEffect(() => { localStorage.setItem(localKey, JSON.stringify(items)); }, [items]);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !ownerId) { setReady(true); return; }
    setReady(false);
    void (async () => {
      const { data, error } = await supabase.from("public_products").select("id,product_id,name,category,material,price,image_url,featured,is_published").eq("owner_id", ownerId).order("created_at");
      if (error) throw error;
      if (!cancelled) setItems((data ?? []).map((row: any) => ({ publicId: row.id, productId: row.product_id, id: row.product_id, name: row.name, category: row.category, material: row.material, price: Number(row.price), imageUrl: row.image_url ?? undefined, featured: row.featured, isPublished: row.is_published })));
    })().catch((error: unknown) => console.error("Falha ao carregar produtos públicos", error)).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [ownerId]);

  return [items, setItems, ready];
}

export async function savePublicProduct(ownerId: string, product: CatalogProduct, current?: ManagedPublicProduct) {
  if (!supabase) return { publicId: current?.publicId ?? `local-${product.id}`, productId: Number(product.id), id: product.id, name: product.name, category: product.category, material: product.material, price: product.price, featured: current?.featured ?? false, isPublished: true } as ManagedPublicProduct;
  const { data, error } = await supabase.from("public_products").upsert({
    ...(current?.publicId ? { id: current.publicId } : {}), owner_id: ownerId, product_id: Number(product.id), store_slug: "karine-joias", name: product.name, category: product.category, material: product.material, price: product.price, featured: current?.featured ?? false, is_published: true,
  }, { onConflict: "owner_id,product_id" }).select("id,product_id,name,category,material,price,image_url,featured,is_published").single();
  if (error) throw error;
  return { publicId: data.id, productId: data.product_id, id: data.product_id, name: data.name, category: data.category, material: data.material, price: Number(data.price), imageUrl: data.image_url ?? undefined, featured: data.featured, isPublished: data.is_published } as ManagedPublicProduct;
}

export async function updatePublicProduct(ownerId: string, item: ManagedPublicProduct, changes: Partial<Pick<ManagedPublicProduct, "isPublished" | "featured">>) {
  if (!supabase) return { ...item, ...changes };
  const { data, error } = await supabase.from("public_products").update({ is_published: changes.isPublished ?? item.isPublished, featured: changes.featured ?? item.featured }).eq("id", item.publicId).eq("owner_id", ownerId).select("id,product_id,name,category,material,price,image_url,featured,is_published").single();
  if (error) throw error;
  return { ...item, publicId: data.id, featured: data.featured, isPublished: data.is_published };
}
