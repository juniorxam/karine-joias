import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./supabase";
import { fallbackCatalog, type CatalogProduct } from "./catalog";

type PublicRow = {
  id: string;
  product_id: number;
  name: string;
  category: string;
  material: string;
  price: number;
  image_url: string | null;
  featured: boolean;
  is_published: boolean;
  slug: string | null;
  description: string | null;
  stock: number;
  is_new: boolean;
  is_best_seller: boolean;
  sort_order: number;
  sold_quantity: number;
};

export async function loadPublicCatalog(): Promise<CatalogProduct[]> {
  if (!isSupabaseConfigured) {
    try {
      const local = JSON.parse(localStorage.getItem("kj-public-products") || "[]") as CatalogProduct[];
      const published = local.filter((item: any) => item.isPublished);
      return published.length ? published : fallbackCatalog;
    } catch {
      return fallbackCatalog;
    }
  }

  // A vitrine pública não deve reutilizar a sessão persistida da área da proprietária.
  // Uma sessão autenticada antiga pode mudar o JWT enviado ao Supabase e fazer o
  // catálogo parecer vazio, mesmo quando a leitura anônima está funcionando.
  const publicClient = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const { data, error } = await publicClient
    .from("public_products")
    .select("id,product_id,name,category,material,price,image_url,featured,is_published,slug,description,stock,is_new,is_best_seller,sort_order,sold_quantity")
    .eq("store_slug", "violetta")
    .eq("is_published", true)
    .order("featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Falha ao carregar catálogo público", error);
    return fallbackCatalog;
  }
  if (!data?.length) return [];
  return (data as PublicRow[]).map((row) => ({
    id: row.product_id ?? row.id,
    name: row.name,
    category: row.category === "Joia" ? "Joias" : row.category === "Semi-joia" ? "Semi-joias" : row.category === "Acessório" ? "Acessórios" : row.category,
    material: row.material,
    price: Number(row.price),
    imageUrl: row.image_url ?? undefined,
    featured: row.featured,
    isPublished: row.is_published,
    slug: row.slug ?? undefined,
    description: row.description ?? undefined,
    stock: Number(row.stock ?? 0),
    isNew: row.is_new,
    isBestSeller: row.is_best_seller,
    sortOrder: Number(row.sort_order ?? 0),
    soldQuantity: Number(row.sold_quantity ?? 0),
  }));
}
