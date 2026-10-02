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
      const { data, error } = await supabase.from("public_products").select("id,product_id,name,category,material,price,image_url,featured,is_published,slug,description").eq("owner_id", ownerId).order("created_at");
      if (error) throw error;
      if (!cancelled) setItems((data ?? []).map((row: any) => ({ publicId: row.id, productId: row.product_id, id: row.product_id, name: row.name, category: row.category, material: row.material, price: Number(row.price), imageUrl: row.image_url ?? undefined, featured: row.featured, isPublished: row.is_published, slug: row.slug ?? undefined, description: row.description ?? undefined })));
    })().catch((error: unknown) => console.error("Falha ao carregar produtos públicos", error)).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [ownerId]);

  return [items, setItems, ready];
}

const toStoreCategory = (category: string) => category === "Joia" ? "Joias" : category === "Semi-joia" ? "Semi-joias" : category === "Acessório" ? "Acessórios" : category;
const toSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export async function savePublicProduct(ownerId: string, product: CatalogProduct, current?: ManagedPublicProduct) {
  if (!supabase) return { publicId: current?.publicId ?? `local-${product.id}`, productId: Number(product.id), id: product.id, name: product.name, category: product.category, material: product.material, price: product.price, featured: current?.featured ?? false, isPublished: true, slug: product.slug || toSlug(product.name), description: product.description } as ManagedPublicProduct;
  const { data, error } = await supabase.from("public_products").upsert({
    ...(current?.publicId ? { id: current.publicId } : {}), owner_id: ownerId, product_id: Number(product.id), store_slug: "karine-joias", name: product.name, category: toStoreCategory(product.category), material: product.material, price: product.price, image_url: product.imageUrl || null, slug: product.slug || toSlug(product.name), description: product.description || null, featured: current?.featured ?? false, is_published: true,
  }, { onConflict: "owner_id,product_id" }).select("id,product_id,name,category,material,price,image_url,featured,is_published,slug,description").single();
  if (error) throw error;
  return { publicId: data.id, productId: data.product_id, id: data.product_id, name: data.name, category: data.category, material: data.material, price: Number(data.price), imageUrl: data.image_url ?? undefined, featured: data.featured, isPublished: data.is_published, slug: data.slug ?? undefined, description: data.description ?? undefined } as ManagedPublicProduct;
}

export async function updatePublicProduct(ownerId: string, item: ManagedPublicProduct, changes: Partial<Pick<ManagedPublicProduct, "isPublished" | "featured">> & Partial<Pick<CatalogProduct, "name" | "category" | "material" | "price" | "slug" | "description" | "imageUrl">>) {
  if (!supabase) return { ...item, ...changes };
  const { data, error } = await supabase.from("public_products").update({
    is_published: changes.isPublished ?? item.isPublished,
    featured: changes.featured ?? item.featured,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.category !== undefined ? { category: toStoreCategory(changes.category) } : {}),
    ...(changes.material !== undefined ? { material: changes.material } : {}),
    ...(changes.price !== undefined ? { price: changes.price } : {}),
    ...(changes.imageUrl !== undefined ? { image_url: changes.imageUrl || null } : {}),
    ...(changes.slug !== undefined ? { slug: changes.slug || toSlug(changes.name || item.name) } : {}),
    ...(changes.description !== undefined ? { description: changes.description || null } : {}),
  }).eq("id", item.publicId).eq("owner_id", ownerId) .select("id,product_id,name,category,material,price,image_url,featured,is_published,slug,description").single();
  if (error) throw error;
  return { ...item, publicId: data.id, productId: data.product_id, id: data.product_id, name: data.name, category: data.category, material: data.material, price: Number(data.price), imageUrl: data.image_url ?? undefined, featured: data.featured, isPublished: data.is_published, slug: data.slug ?? undefined, description: data.description ?? undefined };
}
