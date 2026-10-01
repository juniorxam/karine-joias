import { isSupabaseConfigured, supabase } from "./supabase";
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
};

export async function loadPublicCatalog(): Promise<CatalogProduct[]> {
  if (!isSupabaseConfigured || !supabase) {
    try {
      const local = JSON.parse(localStorage.getItem("kj-public-products") || "[]") as CatalogProduct[];
      const published = local.filter((item: any) => item.isPublished);
      return published.length ? published : fallbackCatalog;
    } catch {
      return fallbackCatalog;
    }
  }

  const { data, error } = await supabase
    .from("public_products")
     .select("id,product_id,name,category,material,price,image_url,featured,is_published,slug,description")
    .eq("store_slug", "karine-joias")
    .eq("is_published", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data?.length) return fallbackCatalog;
  return (data as PublicRow[]).map((row) => ({
    id: row.product_id ?? row.id,
    name: row.name,
    category: row.category,
    material: row.material,
    price: Number(row.price),
    imageUrl: row.image_url ?? undefined,
    featured: row.featured,
    isPublished: row.is_published,
    slug: row.slug ?? undefined,
    description: row.description ?? undefined,
  }));
}
