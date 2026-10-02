export type CatalogProduct = {
  id: number | string;
  name: string;
  category: string;
  material: string;
  price: number;
  imageUrl?: string;
  featured?: boolean;
  isPublished?: boolean;
  slug?: string;
  description?: string;
  stock?: number;
  isNew?: boolean;
  isBestSeller?: boolean;
  sortOrder?: number;
};

export const fallbackCatalog: CatalogProduct[] = [
  { id: 1, name: "Anel Solitário Aurora", category: "Joias", material: "Ouro 18k", price: 1290, featured: true },
  { id: 2, name: "Colar Gota Serena", category: "Semi-joias", material: "Prata 925", price: 289, featured: true },
  { id: 3, name: "Brinco Pérola Luna", category: "Joias", material: "Ouro 18k", price: 890 },
  { id: 4, name: "Pulseira Luz", category: "Semi-joias", material: "Banho rosé", price: 189 },
  { id: 5, name: "Ear Cuff Rosé", category: "Acessórios", material: "Banho rosé", price: 89 },
  { id: 6, name: "Aliança Essenza", category: "Joias", material: "Ouro 18k", price: 1790, featured: true },
  { id: 7, name: "Mix de Anéis Dourado", category: "Semi-joias", material: "Banho 18k", price: 249 },
];

export const formatMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
