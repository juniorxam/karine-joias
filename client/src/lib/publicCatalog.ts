import { isSupabaseConfigured, supabase } from "./supabase";
import { fallbackCatalog, type CatalogProduct } from "./catalog";

type PublicRow = {
  id: string;
  name: string;
  category: string;
  material: string;
  price: number;
  image_url: string | null;
  featured: boolean;
  is_published: boolean;
};

export async function loadPublicCatalog(): Promise<CatalogProduct[]> {
  if (!isSupabaseConfigured || !supabase) return fallbackCatalog;

  const { data, error } = await supabase
    .from("public_products")
    .select("id,name,category,material,price,image_url,featured,is_published")
    .eq("store_slug", "karine-joias")
    .eq("is_published", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data?.length) return fallbackCatalog;
  return (data as PublicRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    material: row.material,
    price: Number(row.price),
    imageUrl: row.image_url ?? undefined,
    featured: row.featured,
    isPublished: row.is_published,
  }));
}
