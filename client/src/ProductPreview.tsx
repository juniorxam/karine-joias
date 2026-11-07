import { useEffect, useMemo, useState } from "react";
import { Eye, Monitor, Smartphone, X } from "lucide-react";
import type { CatalogProduct } from "./lib/catalog";
import { ProductCard, ProductDetail } from "./Storefront";
import "./product-preview.css";

type PreviewProduct = Partial<CatalogProduct> & {
  price?: number | string;
  pixPrice?: number | string | null;
  compareAtPrice?: number | string | null;
  installmentCount?: number | string | null;
  discountPercent?: number | string | null;
  stock?: number | string;
};
type Props = {
  product: PreviewProduct;
  images?: string[];
  onClose: () => void;
  onPublish?: () => void | Promise<void>;
  note?: string;
};

export default function ProductPreview({ product, images, onClose, onPublish, note }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [view, setView] = useState<"card" | "detail">("card");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !publishing) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, publishing]);

  const catalogProduct = useMemo<CatalogProduct>(() => {
    const photos = images !== undefined
      ? images.filter(Boolean).slice(0, 5)
      : Array.from(new Set([...(product.imageUrls || []), ...(product.imageUrl ? [product.imageUrl] : [])])).slice(0, 5);
    const numberOrUndefined = (value: unknown) => value == null || value === "" ? undefined : Number(value);
    return {
      id: product.id ?? 0,
      name: String(product.name || "Nome do produto"),
      category: String(product.category || "Joias"),
      material: String(product.material || "Material não informado"),
      description: product.description || undefined,
      price: Number(product.price || 0),
      pixPrice: numberOrUndefined(product.pixPrice),
      compareAtPrice: numberOrUndefined(product.compareAtPrice),
      discountPercent: numberOrUndefined(product.discountPercent),
      installmentCount: numberOrUndefined(product.installmentCount),
      stock: Number(product.stock || 0),
      imageUrl: photos[0],
      imageUrls: photos,
      isNew: product.isNew || false,
      isBestSeller: product.isBestSeller || false,
      featured: product.featured || false,
    };
  }, [product, images]);

  const noAction = () => {};
  const publish = async () => {
    if (!onPublish || publishing) return;
    setPublishing(true);
    try {
      await onPublish();
      onClose();
    } finally {
      setPublishing(false);
    }
  };

  return <div className="violetta-preview-overlay" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !publishing) onClose();
  }}>
    <section className="violetta-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="violetta-preview-title">
      <header className="violetta-preview-header">
        <div className="violetta-preview-heading">
          <div className="violetta-preview-icon"><Eye size={20}/></div>
          <div>
            <small>VIOLETTA · GESTÃO DA LOJA</small>
            <h2 id="violetta-preview-title">Pré-visualização do anúncio</h2>
            <p>Confira como o produto aparecerá para seus clientes.</p>
          </div>
        </div>
        <button type="button" className="violetta-preview-close" onClick={onClose} disabled={publishing} aria-label="Fechar prévia"><X size={21}/></button>
      </header>
      <div className="violetta-preview-toolbar">
        <div className="violetta-preview-choice" role="group" aria-label="Escolher tipo de visualização">
          <button type="button" className={view === "card" ? "is-active" : ""} aria-pressed={view === "card"} onClick={() => setView("card")}>Na vitrine</button>
          <button type="button" className={view === "detail" ? "is-active" : ""} aria-pressed={view === "detail"} onClick={() => setView("detail")}>Página do produto</button>
        </div>
        <div className="violetta-preview-choice" role="group" aria-label="Visualização por dispositivo">
          <button type="button" className={device === "desktop" ? "is-active" : ""} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={15}/> Computador</button>
          <button type="button" className={device === "mobile" ? "is-active" : ""} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={15}/> Celular</button>
        </div>
      </div>
      <div className="violetta-preview-stage">
        <div className={"violetta-preview-screen storefront " + (device === "mobile" ? "violetta-preview-phone" : "violetta-preview-desktop")}>
          {view === "card"
            ? <div className="violetta-preview-card-wrap"><div className="store-product-grid"><ProductCard product={catalogProduct} onAdd={noAction} onBuyNow={noAction} onAsk={noAction} onOpen={noAction}/></div></div>
            : <ProductDetail preview product={catalogProduct} relatedProducts={[]} onBack={noAction} onAdd={noAction} onBuyNow={noAction} onCheckout={noAction} onCart={noAction} onAsk={noAction} onRelatedOpen={noAction} onRelatedAdd={noAction} onRelatedBuyNow={noAction} onRelatedAsk={noAction}/>}
        </div>
      </div>
      <footer className="violetta-preview-footer">
        <p><Eye size={15}/>{note || "Prévia privada. Ninguém poderá comprar ou acessar este anúncio por aqui."}</p>
        <div className="violetta-preview-footer-buttons">
          <button type="button" className="violetta-preview-cancel" onClick={onClose} disabled={publishing}>{onPublish ? "Voltar e editar" : "Voltar ao cadastro"}</button>
          {onPublish && <button type="button" className="violetta-preview-publish" onClick={() => void publish()} disabled={publishing}>{publishing ? "Publicando…" : "Confirmar publicação"}</button>}
        </div>
      </footer>
    </section>
  </div>;
}
