export type CatalogProduct = {
  id: number | string;
  name: string;
  category: string;
  material: string;
  price: number;
  pixPrice?: number;
  compareAtPrice?: number;
  discountPercent?: number;
  installmentCount?: number;
  imageUrl?: string;
  imageUrls?: string[];
  featured?: boolean;
  isPublished?: boolean;
  slug?: string;
  description?: string;
  stock?: number;
  isNew?: boolean;
  isBestSeller?: boolean;
  sortOrder?: number;
  soldQuantity?: number;
  ownerId?: string;
};

export const formatMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
