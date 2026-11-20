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

  const [featured, ...moreSuggestions] = suggestions;
  const renderSuggestion = ({ product }: (typeof suggestions)[number]) => (
    <li key={product.id}>
      <div>
        <span>{product.name}</span>
        <b>{formatMoney(product.price)}</b>
      </div>
      <button type="button" onClick={() => onAdd(product)} aria-label={`Adicionar ${product.name} ao carrinho`}>Adicionar</button>
    </li>
  );

  return <section className="cart-gift-progress cart-gift-offer" aria-label="Mimos">
    <strong>{target.gift_name}</strong>
    <p aria-live="polite">{missing
      ? <>Faltam <b>{formatMoney(missing / 100)}</b> para ganhar o mimo.</>
      : "Você ganhou um mimo surpresa!"}</p>
    <progress aria-label={`Progresso para ${target.gift_name}`} value={Math.min(cents, threshold)} max={threshold} />
    {featured && <ul>{renderSuggestion(featured)}</ul>}
    {moreSuggestions.length > 0 && <details>
      <summary>Ver mais sugestões</summary>
      <ul>{moreSuggestions.map(renderSuggestion)}</ul>
    </details>}
  </section>;
}
