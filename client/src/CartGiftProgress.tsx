import { formatMoney, type CatalogProduct } from "./lib/catalog";

export type GiftMission = { id: string; gift_name: string; threshold_amount: number };

type Props = {
  missions: GiftMission[];
  netSubtotal: number;
  products: CatalogProduct[];
  cartIds: Set<string>;
  onAdd: (product: CatalogProduct) => void;
  contribution?: (price: number) => number;
};

export default function CartGiftProgress({ missions, netSubtotal, products, cartIds, onAdd, contribution = price => price }: Props) {
  const cents = Math.max(0, Math.round(netSubtotal * 100));
  const next = missions.find(mission => Math.round(mission.threshold_amount * 100) > cents);
  const target = next ?? missions.at(-1);
  if (!target) return null;

  const threshold = Math.round(target.threshold_amount * 100);
  const missing = Math.max(0, threshold - cents);
  const suggestions = missing ? products
    .filter(product => Number(product.stock) > 0 && !cartIds.has(String(product.id)) && product.price > 0)
    .map(product => ({ product, distance: Math.round(contribution(product.price) * 100) - missing }))
    .sort((a, b) => Number(a.distance < 0) - Number(b.distance < 0) || Math.abs(a.distance) - Math.abs(b.distance))
    .slice(0, 3) : [];

  return <section className="cart-gift-progress" aria-label="Mimos">
    <strong>{target.gift_name}</strong>
    <p>{missing ? `Faltam ${formatMoney(missing / 100)} para ganhar o mimo.` : "Seu pedido já tem direito ao mimo!"}</p>
    <progress aria-label={`Progresso para ${target.gift_name}`} value={Math.min(cents, threshold)} max={threshold} />
    {suggestions.length > 0 && <ul>{suggestions.map(({ product }) => <li key={product.id}>
      <span>{product.name} · {formatMoney(product.price)}</span>
      <button type="button" onClick={() => onAdd(product)} aria-label={`Adicionar ${product.name} ao carrinho`}>Adicionar</button>
    </li>)}</ul>}
  </section>;
}
