import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Gem, Instagram, Menu, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { formatMoney, type CatalogProduct } from "./lib/catalog";
type StorefrontSettings = { hero_title:string; hero_subtitle:string; hero_image_url?:string|null; hero_cta:string; featured_title:string; featured_enabled:boolean; latest_enabled:boolean; category_enabled:boolean; collection_enabled:boolean; collection_title:string; collection_subtitle:string; collection_image_url?:string|null; collection_cta:string };
import { loadPublicCatalog } from "./lib/publicCatalog";
import { supabase } from "./lib/supabase";

const categories = ["Todas", "Joias", "Semi-joias", "Acessórios"];
const storeWhatsApp = (import.meta.env.VITE_STORE_WHATSAPP as string | undefined)?.replace(/\D/g, "");

type CartItem = CatalogProduct & { quantity: number };
type Customer = { name: string; email: string; phone: string; recipient_code: string };
type ShippingOption = { id: number | string; company: string; service: string; price: number; delivery_time: number };
type Shipping = { postal_code: string; address: string; number: string; complement: string; neighborhood: string; city: string; state: string; shipping_option?: ShippingOption; shipping_quote_id?: string };

const cartKey = "kj-cart";
const checkoutDraftKey = "kj-checkout-draft";

function readCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(cartKey) || "[]"); } catch { return []; }
}

function readCheckoutDraft(): { customer: Customer; shipping: Shipping; couponCode: string } {
  const empty = {
    customer: { name: "", email: "", phone: "", recipient_code: "" },
    shipping: { postal_code: "", address: "", number: "", complement: "", neighborhood: "", city: "", state: "" },
    couponCode: ""
  };
  try {
    const saved = JSON.parse(localStorage.getItem(checkoutDraftKey) || "null");
    return saved ? { ...empty, ...saved, customer: { ...empty.customer, ...saved.customer }, shipping: { ...empty.shipping, ...saved.shipping } } : empty;
  } catch { return empty; }
}

export default function Storefront() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [menuOpen, setMenuOpen] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState<StorefrontSettings | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("storefront_settings").select("hero_title,hero_subtitle,hero_image_url,hero_cta,featured_title,featured_enabled,latest_enabled,category_enabled,collection_enabled,collection_title,collection_subtitle,collection_image_url,collection_cta").eq("store_slug","karine-joias").limit(1).maybeSingle()
      .then(({ data }) => { if (data) setStorefrontSettings(data as StorefrontSettings); });
  }, []);
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const [checkoutDraft, setCheckoutDraft] = useState(readCheckoutDraft);
  const returnParams = new URLSearchParams(window.location.search);
  const returnedOrder = returnParams.get("order");
  const [view, setView] = useState<"store" | "checkout" | "success" | "product">(
    window.location.pathname.includes("/checkout") ? "checkout" : window.location.pathname.includes("/pedido") ? "success" : window.location.pathname.includes("/produto/") ? "product" : "store"
  );
  const [order, setOrder] = useState<{ order_number: string; total_amount: number; payment_status?: string; payment_url?: string; status?: string; shipment?: { carrier?: string | null; service?: string | null; tracking_code?: string | null; tracking_url?: string | null; shipping_status?: string | null } | null } | null>(
    returnedOrder ? { order_number: returnedOrder, total_amount: 0, payment_status: returnParams.get("status") || "success" } : null
  );
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const productSlug = decodeURIComponent(window.location.pathname.split("/produto/")[1] || "");
  const selectedProduct = view === "product" ? products.find(product => (product.slug || String(product.id)) === productSlug || String(product.id) === productSlug) : null;

  useEffect(() => {
    loadPublicCatalog().then(setProducts);
  }, []);

  useEffect(() => {
    const title = view === "checkout"
      ? "Finalizar pedido · Violetta"
      : view === "product" && selectedProduct
        ? selectedProduct.name + " · Violetta"
        : view === "success"
          ? "Acompanhamento do pedido · Violetta"
          : "Violetta · Escolha o detalhe que fica";
    const description = view === "product" && selectedProduct
      ? selectedProduct.name + ", " + selectedProduct.material + ", na Violetta. Veja detalhes e compre online."
      : "Joias e semi-joias escolhidas para acompanhar seus momentos mais bonitos. Compre online na Violetta.";
    document.title = title;
    document.documentElement.lang = "pt-BR";

    const upsertMeta = (name: string, content: string, property = false) => {
      const attribute = property ? "property" : "name";
      let tag = document.head.querySelector<HTMLMetaElement>("meta[" + attribute + "=\"" + name + "\"]");
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attribute, name);
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    upsertMeta("description", description);
    upsertMeta("robots", view === "success" || view === "checkout" ? "noindex,nofollow" : "index,follow");
    upsertMeta("og:title", title, true);
    upsertMeta("og:description", description, true);
    upsertMeta("og:type", "website", true);
    upsertMeta("og:locale", "pt_BR", true);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href.split("?")[0].replace(/\/$/, "");

    document.getElementById("karine-store-schema")?.remove();
    if (view === "store" || view === "product") {
      const schema = document.createElement("script");
      schema.id = "karine-store-schema";
      schema.type = "application/ld+json";
      schema.textContent = JSON.stringify(view === "product" && selectedProduct ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: selectedProduct.name,
        description: selectedProduct.description || description,
        category: selectedProduct.category,
        material: selectedProduct.material,
        image: selectedProduct.imageUrl ? [selectedProduct.imageUrl] : undefined,
        offers: { "@type": "Offer", priceCurrency: "BRL", price: selectedProduct.price.toFixed(2), availability: "https://schema.org/InStock" }
      } : {
        "@context": "https://schema.org",
        "@type": "Store",
        name: "Violetta",
        url: window.location.origin + "/loja",
        description
      });
      document.head.appendChild(schema);
    }
  }, [view, selectedProduct?.id]);

  useEffect(() => {
    if (view !== "success" || !returnedOrder || !supabase) return;
    const token = localStorage.getItem("kj-last-order-token");
    if (!token) return;
    supabase.functions.invoke("order-status", {
      body: { order_number: returnedOrder, token },
    }).then(({ data }) => {
      if (data?.order) {
        setOrder({
          order_number: data.order.order_number,
          total_amount: Number(data.order.total_amount),
          payment_status: data.order.payment_status,
          status: data.order.status,
          shipment: data.shipment || null,
        });
      }
    });
  }, [view, returnedOrder]);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(checkoutDraftKey, JSON.stringify(checkoutDraft));
  }, [checkoutDraft]);

  const filtered = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "Todas" || product.category === category;
    const text = `${product.name} ${product.material} ${product.category}`.toLowerCase();
    return matchesCategory && text.includes(query.toLowerCase());
  }), [category, products, query]);

  const topSoldQuantity = Math.max(0, ...products.map(product => product.soldQuantity ?? 0));
  const featured = products.filter((product) => product.featured).sort((a,b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).slice(0, 4);
  const latest = [...products].sort((a,b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).slice(0, 4);
  const categoryCards = [
    { name: "Joias", label: "Joias", icon: "✦" },
    { name: "Semi-joias", label: "Semi-joias", icon: "◇" },
    { name: "Acessórios", label: "Acessórios", icon: "◌" },
  ];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (product: CatalogProduct) => {
    const available = Number(product.stock ?? 0);
    if (available <= 0) return toast.error("Produto indisponível", { description: product.name });
    setCart(items => {
      const current = items.find(item => String(item.id) === String(product.id));
      if (current && current.quantity >= available) {
        toast.error("Limite de estoque atingido", { description: `Há ${available} unidade(s) disponível(is).` });
        return items;
      }
      return current
        ? items.map(item => String(item.id) === String(product.id) ? { ...item, quantity: Math.min(available, item.quantity + 1) } : item)
        : [...items, { ...product, quantity: 1 }];
    });
    toast.success("Produto adicionado ao carrinho", { description: product.name });
  };

  const changeQty = (id: CatalogProduct["id"], delta: number) => {
    setCart(items => items.flatMap(item => {
      if (String(item.id) !== String(id)) return [item];
      const available = Number(item.stock ?? 0);
      const quantity = Math.min(available, item.quantity + delta);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const askAbout = (product: CatalogProduct) => {
    const message = `Olá, Violetta! Gostei da peça ${product.name} (${formatMoney(product.price)}). Pode me contar mais?`;
    if (storeWhatsApp) {
      window.open(`https://wa.me/${storeWhatsApp}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } else {
      navigator.clipboard?.writeText(message);
      toast.success("Mensagem preparada");
    }
  };

  const openProduct = (product: CatalogProduct) => {
    const slug = product.slug || String(product.id);
    window.history.pushState({}, "", `/loja/produto/${encodeURIComponent(slug)}`);
    setView("product");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goCheckout = () => {
    if (!cart.length) return toast.error("Seu carrinho está vazio");
    window.history.pushState({}, "", "/loja/checkout");
    setView("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const backToStore = () => {
    window.history.pushState({}, "", "/loja");
    setView("store");
  };

  const finishOrder = async (customer: Customer, shipping: Shipping, couponCode = "") => {
    if (!supabase) {
      toast.error("A loja ainda não está conectada ao Supabase.");
      return;
    }
    const { data, error } = await supabase.functions.invoke("create-order", {
      body: {
        customer,
        shipping: { ...shipping, recipient_code: customer.recipient_code },
        items: cart.map(item => ({ product_id: Number(item.id), quantity: item.quantity })),
        coupon_code: couponCode || undefined,
      },
    });
    if (error) {
      toast.error("Não foi possível criar o pedido", { description: error.message });
      return;
    }
    setOrder(data);
    localStorage.setItem("kj-last-order-email", customer.email.trim().toLowerCase());
    localStorage.setItem("kj-last-order-number", data.order_number);
    if (data.tracking_token) localStorage.setItem("kj-last-order-token", data.tracking_token);
    setCart([]);
    localStorage.removeItem(checkoutDraftKey);
    const payment = await supabase.functions.invoke("create-payment", { body: { order_number: data.order_number, email: customer.email } });
    if (payment.data?.init_point || payment.data?.sandbox_init_point) {
      window.location.href = payment.data.init_point || payment.data.sandbox_init_point;
      return;
    }
    if (payment.error) toast.success("Pedido criado", { description: "O pagamento online ainda não está configurado." });
    window.history.pushState({}, "", "/loja/pedido");
    setView("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "product") {
    if (!selectedProduct) return <div className="storefront success-page"><main className="success-card"><p className="store-kicker">PEÇA NÃO ENCONTRADA</p><h1>Essa peça não está disponível.</h1><button className="store-primary-cta" onClick={backToStore}>Voltar para a loja <ArrowRight size={16}/></button></main></div>;
    return <ProductDetail product={selectedProduct} onBack={backToStore} onAdd={() => addToCart(selectedProduct)} onCheckout={goCheckout} />;
  }

  if (view === "checkout") {
    return <Checkout cart={cart} subtotal={subtotal} draft={checkoutDraft} onDraftChange={setCheckoutDraft} onBack={backToStore} onFinish={finishOrder} onChangeQty={changeQty} />;
  }

  if (view === "success" && order) {
    return <OrderSuccess order={order} onStore={backToStore} onTrack={async () => {
      if (!supabase || !order.order_number) return;
      const token = localStorage.getItem("kj-last-order-token") || "";
      if (!token) return toast.error("Token de acompanhamento não encontrado", { description: "Este pedido só pode ser consultado pelo link recebido após a compra." });
      setTrackingLoading(true);
      const { data, error } = await supabase.functions.invoke("order-status", { body: { order_number: order.order_number, token } });
      setTrackingLoading(false);
      if (error || !data?.order) return toast.error("Não foi possível consultar o pedido", { description: error?.message || data?.error || "Tente novamente." });
      setOrder({ ...order, ...data.order, shipment: data.shipment || null });
    }} onPay={async () => {
      if (!supabase || !order.order_number) return;
      setPaymentLoading(true);
      const email = localStorage.getItem("kj-last-order-email") || "";
      if (!email) {
        toast.error("Não encontramos o e-mail deste pedido", { description: "Volte ao checkout e tente novamente." });
        setPaymentLoading(false);
        return;
      }
      const payment = await supabase.functions.invoke("create-payment", { body: { order_number: order.order_number, email } });
      setPaymentLoading(false);
      if (payment.data?.init_point || payment.data?.sandbox_init_point) window.location.href = payment.data.init_point || payment.data.sandbox_init_point;
      else toast.error("Não foi possível gerar o pagamento", { description: payment.error?.message || "Verifique a configuração do Mercado Pago." });
    }} paymentLoading={paymentLoading} trackingLoading={trackingLoading} />;
  }

  return <div className="storefront">
    <header className="store-header">
      <a className="store-logo" href="/loja" onClick={(e) => { e.preventDefault(); backToStore(); }}>
        <span className="store-logo-mark"><Gem size={19} /></span>
        <span><strong>Violetta</strong><small>JOIAS</small></span>
      </a>
      <nav className={menuOpen ? "store-nav open" : "store-nav"}>
        <a href="#novidades" onClick={() => setMenuOpen(false)}>Novidades</a>
        <a href="#colecao" onClick={() => setMenuOpen(false)}>Coleção</a>
        <a href="#categorias" onClick={() => setMenuOpen(false)}>Categorias</a>
        <a href="#contato" onClick={() => setMenuOpen(false)}>Atendimento</a>
      </nav>
      <div className="store-header-actions">
        <a className="store-admin-link" href="/">Acesso da proprietária</a>
        <button className="store-cart-button" onClick={goCheckout} aria-label="Abrir carrinho"><ShoppingBag size={18}/>{cartCount > 0 && <b>{cartCount}</b>}</button>
        <button className="store-menu-button" aria-label="Abrir menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>

    <main>
      <section className="store-hero">
        <div className="store-hero-copy">
          <p className="store-kicker"><Sparkles size={13} /> NOVA COLEÇÃO VIOLETTA JOIAS</p>
          <h1>{storefrontSettings?.hero_title || "Seu brilho, seu momento."}</h1>
          <p className="store-hero-text">{storefrontSettings?.hero_subtitle || "Descubra peças escolhidas para valorizar cada detalhe. Elegância, delicadeza e personalidade em uma só vitrine."}</p>
          <div className="store-hero-actions"><a className="store-primary-cta" href="#novidades">{storefrontSettings?.hero_cta || "Comprar agora"} <ArrowRight size={16} /></a><a className="store-text-link" href="#categorias">Ver categorias</a></div>
        </div>
        <div className="store-hero-art" style={storefrontSettings?.hero_image_url ? { backgroundImage: `linear-gradient(90deg, #332e2a22, transparent), url(${storefrontSettings.hero_image_url})` } : latest[0]?.imageUrl ? { backgroundImage: `linear-gradient(90deg, #332e2a22, transparent), url(${latest[0].imageUrl})` } : undefined}>
          {!storefrontSettings?.hero_image_url && !latest[0]?.imageUrl && <><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-gem"><Gem size={82} strokeWidth={1} /></div></>}
          <span className="hero-stamp">VIOLETTA<br /><b>JOIAS</b></span>
        </div>
      </section>

      <section className="store-values" id="essencia">
        <div><span>01</span><strong>Curadoria especial</strong><p>Peças selecionadas para combinar com diferentes estilos e momentos.</p></div>
        <div><span>02</span><strong>Compra segura</strong><p>Finalize seu pedido online com pagamento processado pelo Mercado Pago.</p></div>
        <div><span>03</span><strong>Atendimento próximo</strong><p>Fale diretamente com a Violetta sempre que precisar.</p></div>
      </section>

      {(storefrontSettings?.category_enabled ?? true) ? (<section className="store-category-strip" id="categorias">
        <div className="store-section-heading"><div><p className="store-kicker">ENCONTRE SEU ESTILO</p><h2>Compre por categoria</h2></div></div>
        <div className="category-cards">{categoryCards.map(item => <button key={item.name} onClick={() => { setCategory(item.name); document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" }); }}><span>{item.icon}</span><strong>{item.label}</strong><small>Ver peças <ArrowRight size={13} /></small></button>)}</div>
      </section>) : null}

      {(storefrontSettings?.featured_enabled ?? true) && featured.length > 0 ? (<section className="store-featured" id="novidades">
        <div className="store-section-heading"><div><p className="store-kicker">CURADORIA VIOLETTA</p><h2>{storefrontSettings?.featured_title || "Peças para se apaixonar."}</h2></div><a href="#colecao">Ver toda a coleção <ArrowRight size={15} /></a></div>
        <div className="featured-grid">{featured.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onAsk={askAbout} onOpen={openProduct} featured isTopSeller={topSoldQuantity > 0 && (product.soldQuantity ?? 0) === topSoldQuantity} />)}</div>
      </section>) : null}

      {(storefrontSettings?.latest_enabled ?? true) ? (<section className="store-latest">
        <div className="store-section-heading"><div><p className="store-kicker">RECÉM-CHEGARAM</p><h2>Novidades</h2></div><a href="#colecao">Ver todos <ArrowRight size={15} /></a></div>
        <div className="store-product-grid">{latest.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onAsk={askAbout} onOpen={openProduct} isTopSeller={topSoldQuantity > 0 && (product.soldQuantity ?? 0) === topSoldQuantity} />)}</div>
      </section>) : null}

      {(storefrontSettings?.collection_enabled ?? true) ? (<section className="store-collection-banner" id="colecao-banner" style={storefrontSettings?.collection_image_url ? { backgroundImage: `linear-gradient(90deg, rgba(42,36,31,.88), rgba(42,36,31,.25)), url(${storefrontSettings.collection_image_url})` } : undefined}>
        <div className="store-collection-copy"><p className="store-kicker">COLEÇÃO VIOLETTA</p><h2>{storefrontSettings?.collection_title || "Uma coleção para guardar."}</h2><p>{storefrontSettings?.collection_subtitle || "Detalhes delicados para acompanhar você em todos os momentos."}</p><a href="#colecao" className="store-primary-cta">{storefrontSettings?.collection_cta || "Conhecer coleção"} <ArrowRight size={16}/></a></div>
        {!storefrontSettings?.collection_image_url && <div className="collection-art"><Gem size={88} strokeWidth={1}/></div>}
      </section>) : null}

      <section className="store-catalog" id="colecao">
        <div className="store-section-heading catalog-heading"><div><p className="store-kicker">A COLEÇÃO</p><h2>Encontre o seu brilho.</h2></div><span>{filtered.length} peças</span></div>
        <div className="catalog-toolbar"><div className="catalog-search"><Search size={17} /><input aria-label="Buscar produtos" placeholder="Buscar uma peça..." value={query} onChange={event => setQuery(event.target.value)} /></div><div className="category-list">{categories.map(item => <button className={category === item ? "selected" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
        {filtered.length ? <div className="store-product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onAsk={askAbout} onOpen={openProduct} />)}</div> : <div className="empty-catalog"><Gem size={28} /><h3>Nenhuma peça encontrada.</h3><p>Tente outro termo ou volte para todas as categorias.</p><button onClick={() => { setQuery(""); setCategory("Todas"); }}>Limpar busca</button></div>}
      </section>
    </main>

    <footer className="store-footer" id="contato"><div className="footer-brand"><span className="store-logo-mark"><Gem size={19} /></span><div><strong>Violetta</strong><small>JOIAS</small></div></div><div><p className="store-kicker">ATENDIMENTO</p><h3>Uma peça especial começa<br />com uma conversa.</h3><p className="footer-note">Compre online ou fale diretamente com a Violetta.</p></div><div className="footer-links"><a href="#colecao">Coleção <ArrowRight size={14} /></a><a href="/" >Área da proprietária <ArrowRight size={14} /></a><a href="https://instagram.com" target="_blank" rel="noreferrer"><Instagram size={14} /> Instagram</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Violetta</span><span>Feito para brilhar.</span></div></footer>
  </div>;
}

function ProductCard({ product, onAdd, onAsk, onOpen, featured = false, isTopSeller = false }: { product: CatalogProduct; onAdd: (product: CatalogProduct) => void; onAsk: (product: CatalogProduct) => void; onOpen: (product: CatalogProduct) => void; featured?: boolean; isTopSeller?: boolean }) {
  const badges = product.isBestSeller || isTopSeller ? ["MAIS VENDIDO"] : product.isNew ? ["NOVO"] : product.stock !== undefined && product.stock > 0 && product.stock <= 3 ? ["ÚLTIMAS UNIDADES"] : [];
  return <article className={featured ? "store-product-card featured-card" : "store-product-card"}>
    <button className="store-product-art" onClick={() => onOpen(product)} aria-label={`Ver ${product.name}`} style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}>
      {!product.imageUrl && <div className="product-art-glow"><Gem size={featured ? 39 : 31} strokeWidth={1.1} /></div>}
      {badges.length > 0 && <span className="product-badge">{badges[0]}</span>}<span className="product-category-tag">{featured ? "DESTAQUE" : product.category}</span>
    </button><div className="store-product-info"><p className="product-material">{product.material}</p><h3>{product.name}</h3><div className="store-product-bottom"><strong>{formatMoney(product.price)}</strong><div className="product-actions"><button className="product-buy" onClick={() => onAdd(product)}>Comprar</button><button className="product-interest" onClick={() => onAsk(product)} aria-label={`Tenho interesse em ${product.name}`}>{featured ? "WhatsApp" : <Check size={15} />}</button></div></div></div>
  </article>;
}

function ProductDetail({ product, onBack, onAdd, onCheckout }: { product: CatalogProduct; onBack: () => void; onAdd: () => void; onCheckout: () => void }) {
  return <div className="storefront checkout-page">
    <header className="store-header"><button className="checkout-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button><span className="store-logo"><span className="store-logo-mark"><Gem size={19}/></span><span><strong>Violetta</strong><small>JOIAS</small></span></span><button className="store-cart-button" onClick={onCheckout}><ShoppingBag size={18}/></button></header>
    <main className="product-detail-page">
      <div className="product-detail-image" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}>{!product.imageUrl && <Gem size={80} strokeWidth={1}/>}</div>
      <div className="product-detail-copy"><p className="store-kicker">{product.category}</p><p className="product-material">{product.material}</p><h1>{product.name}</h1><strong className="product-detail-price">{formatMoney(product.price)}</strong><p className="product-detail-description">{product.description || "Uma peça escolhida para trazer delicadeza, presença e brilho aos seus momentos."}</p><button className="checkout-submit" onClick={onAdd} disabled={Number(product.stock ?? 0) <= 0}>{Number(product.stock ?? 0) > 0 ? "Adicionar ao carrinho" : "Produto esgotado"}</button><button className="store-primary-cta" onClick={onCheckout}>Ir para o carrinho <ArrowRight size={16}/></button></div>
    </main>
  </div>;
}

function Checkout({ cart, subtotal, draft, onDraftChange, onBack, onFinish, onChangeQty }: { cart: CartItem[]; subtotal: number; draft: { customer: Customer; shipping: Shipping; couponCode: string }; onDraftChange: Dispatch<SetStateAction<{ customer: Customer; shipping: Shipping; couponCode: string }>>; onBack: () => void; onFinish: (customer: Customer, shipping: Shipping, couponCode?: string) => Promise<void>; onChangeQty: (id: CatalogProduct["id"], delta: number) => void }) {
  const [customer, setCustomer] = useState<Customer>(draft.customer);
  const [shipping, setShipping] = useState<Shipping>(draft.shipping);
  const [busy, setBusy] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);
  const [shippingQuoteId, setShippingQuoteId] = useState<string | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [couponCode, setCouponCode] = useState(draft.couponCode);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);

  useEffect(() => {
    onDraftChange(v => ({ ...v, customer, shipping, couponCode }));
  }, [customer, shipping, couponCode, onDraftChange]);

  const cartSignature = cart.map(item => `${item.id}:${item.quantity}`).sort().join("|");

  // Frete e cupom dependem do carrinho. Qualquer alteração de quantidade
  // invalida os dados anteriores para evitar checkout com cotação/desconto antigos.
  useEffect(() => {
    setShippingOptions([]);
    setShippingOption(null);
    setShippingQuoteId(null);
    setCouponDiscount(0);
    setCouponError("");
  }, [cartSignature]);

  const updateCustomer = (field: keyof Customer, value: string) => setCustomer(v => ({ ...v, [field]: value }));
  const updateShipping = (field: keyof Shipping, value: string) => {
    setShipping(v => ({ ...v, [field]: value }));
    if (field === "postal_code") {
      setShippingOptions([]);
      setShippingOption(null);
      setShippingQuoteId(null);
    }
  };

  const fetchZip = async (value: string) => {
    const postal_code = value.replace(/\D/g, "").slice(0, 8);
    updateShipping("postal_code", postal_code);
    if (postal_code.length !== 8) return;
    setZipLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postal_code}/json/`);
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado");
      setShipping(v => ({ ...v, postal_code, address: data.logradouro || v.address, neighborhood: data.bairro || v.neighborhood, city: data.localidade || v.city, state: data.uf || v.state }));
    } catch { toast.error("Não foi possível localizar o CEP"); }
    finally { setZipLoading(false); }
  };

  const quoteShipping = async () => {
    if (!supabase || shipping.postal_code.replace(/\D/g, "").length !== 8) return toast.error("Informe um CEP válido");
    setShippingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("shipping-quote", {
        body: { postal_code: shipping.postal_code, items: cart.map(item => ({ product_id: Number(item.id), quantity: item.quantity })) }
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Erro ao calcular frete");
      setShippingOptions(data.options || []);
      setShippingOption(data.options?.[0] || null);
      setShippingQuoteId(data.quote_id || null);
    } catch (e) {
      toast.error("Não foi possível calcular o frete", { description: e instanceof Error ? e.message : "Tente novamente" });
    } finally { setShippingLoading(false); }
  };\n  const isPickup = shippingOption?.service === "Retirada no local";

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return toast.error("Informe o código do cupom");
    if (!supabase) return toast.error("A loja ainda não está conectada ao Supabase.");
    setCouponBusy(true); setCouponError("");
    try {
      const { data, error } = await supabase.functions.invoke("validate-coupon", { body: { code, items: cart.map(item => ({ product_id: Number(item.id), quantity: item.quantity })) } });
      if (error || !data?.valid) throw new Error(data?.error || error?.message || "Cupom inválido");
      setCouponDiscount(Number(data.discount_amount) || 0);
      setCouponCode(data.code || code);
      toast.success("Cupom aplicado", { description: `Desconto de ${formatMoney(Number(data.discount_amount) || 0)}` });
    } catch (e) { setCouponDiscount(0); setCouponError(e instanceof Error ? e.message : "Cupom inválido"); toast.error("Cupom não aplicado", { description: e instanceof Error ? e.message : "Verifique o código" }); }
    finally { setCouponBusy(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) return toast.error("Seu carrinho está vazio");
    if (!shippingOption) return toast.error("Calcule e selecione uma opção de frete");
    setBusy(true);
    try {
      await onFinish(customer, { ...shipping, shipping_option: shippingOption, shipping_quote_id: shippingQuoteId || undefined }, couponDiscount > 0 ? couponCode : "");
    } finally {
      setBusy(false);
    }
  };

  return <div className="storefront checkout-page">
    <header className="store-header"><button className="checkout-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button><span className="store-logo"><span className="store-logo-mark"><Gem size={19}/></span><span><strong>Violetta</strong><small>JOIAS</small></span></span><span className="checkout-secure">Checkout seguro</span></header>
    <main className="checkout-layout">
      <form className="checkout-form" onSubmit={submit}>
        <div className="checkout-title"><p className="store-kicker">FINALIZAR PEDIDO</p><h1>Quase seu.</h1><p>Preencha seus dados para reservar as peças e gerar seu pedido. O endereço pode ser dispensado quando você escolher retirada no local.</p></div>
        <section className="checkout-section"><h2>Seus dados</h2><div className="checkout-grid"><label>Nome completo<input required value={customer.name} onChange={e => updateCustomer("name", e.target.value)} /></label><label>E-mail<input required type="email" value={customer.email} onChange={e => updateCustomer("email", e.target.value)} /></label><label>WhatsApp<input required inputMode="tel" value={customer.phone} onChange={e => updateCustomer("phone", e.target.value)} /></label><label>CPF<input required inputMode="numeric" maxLength={11} value={customer.recipient_code} onChange={e => updateCustomer("recipient_code", e.target.value.replace(/\D/g, "").slice(0,11))} placeholder="00000000000" /></label></div></section>
        <section className="checkout-section"><h2>Entrega</h2><div className="checkout-grid"><label>CEP<input required inputMode="numeric" value={shipping.postal_code} onChange={e => fetchZip(e.target.value)} placeholder="00000-000" />{zipLoading && <small>Consultando CEP...</small>}</label><label className="wide">Endereço<input required={!isPickup} value={shipping.address} onChange={e => updateShipping("address", e.target.value)} /></label><label>Número<input required={!isPickup} value={shipping.number} onChange={e => updateShipping("number", e.target.value)} /></label><label>Complemento<input value={shipping.complement} onChange={e => updateShipping("complement", e.target.value)} /></label><label>Bairro<input required={!isPickup} value={shipping.neighborhood} onChange={e => updateShipping("neighborhood", e.target.value)} /></label><label>Cidade<input required={!isPickup} value={shipping.city} onChange={e => updateShipping("city", e.target.value)} /></label><label>UF<input required={!isPickup} maxLength={2} value={shipping.state} onChange={e => updateShipping("state", e.target.value.toUpperCase())} /></label></div><button type="button" className="shipping-quote-button" onClick={quoteShipping} disabled={shippingLoading}>{shippingLoading ? "Calculando frete..." : "Calcular frete"}</button>{shippingOptions.length > 0 && <div className="shipping-options">{shippingOptions.map((option: ShippingOption) => <label className={shippingOption?.id === option.id ? "shipping-option selected" : "shipping-option"} key={String(option.id)}><input type="radio" name="shipping" checked={shippingOption?.id === option.id} onChange={() => setShippingOption(option)} /><span><strong>{option.company} · {option.service}</strong><small>{option.delivery_time ? `Até ${option.delivery_time} dias úteis` : "Prazo a confirmar"}</small></span><b>{formatMoney(option.price)}</b></label>)}</div>}</section>
        <section className="checkout-section"><h2>Cupom de desconto</h2><div className="checkout-grid"><label className="wide">Código do cupom<input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponDiscount(0); setCouponError(""); }} placeholder="EX.: BEMVINDO10" /></label><button type="button" className="shipping-quote-button" onClick={applyCoupon} disabled={couponBusy}>{couponBusy ? "Validando..." : "Aplicar cupom"}</button></div>{couponError && <small>{couponError}</small>}{couponDiscount > 0 && <small>Cupom aplicado: desconto de {formatMoney(couponDiscount)}</small>}</section><section className="checkout-section"><h2>Pagamento</h2><div className="payment-placeholder"><ShoppingBag size={18}/><div><strong>Pagamento seguro pelo Mercado Pago</strong><p>Ao confirmar o pedido, você será direcionada ao Mercado Pago para concluir o pagamento por PIX ou cartão.</p></div></div></section>
        <button className="checkout-submit" disabled={busy || !cart.length}>{busy ? "Criando pedido..." : "Confirmar pedido"}</button>
      </form>
      <aside className="checkout-summary"><h2>Seu pedido</h2>{cart.map(item => <div className="checkout-item" key={item.id}><div><strong>{item.name}</strong><span>{item.quantity} × {formatMoney(item.price)}</span></div><div className="qty-controls"><button type="button" onClick={() => onChangeQty(item.id, -1)} aria-label="Diminuir">−</button><span>{item.quantity}</span><button type="button" onClick={() => onChangeQty(item.id, 1)} aria-label="Aumentar">+</button></div><b>{formatMoney(item.price * item.quantity)}</b></div>)}<div className="checkout-total"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div><div className="checkout-total"><span>Frete</span><strong>{shippingOption ? formatMoney(shippingOption.price) : "A calcular"}</strong></div>{couponDiscount > 0 && <div className="checkout-total"><span>Desconto</span><strong>- {formatMoney(couponDiscount)}</strong></div>}<div className="checkout-total grand"><span>Total</span><strong>{formatMoney(Math.max(0, subtotal - couponDiscount + (shippingOption?.price || 0)))}</strong></div><p className="checkout-note">Em Palmas, compras acima de R$ 50 têm entrega por R$ 7 e acima de R$ 100 têm entrega grátis. Retirada no local é gratuita.</p></aside>
    </main>
  </div>;
}

function OrderSuccess({ order, onStore, onPay, onTrack, paymentLoading, trackingLoading }: { order: { order_number: string; total_amount: number; payment_status?: string; payment_url?: string; status?: string; shipment?: { carrier?: string | null; service?: string | null; tracking_code?: string | null; tracking_url?: string | null; shipping_status?: string | null } | null }; onStore: () => void; onPay: () => void; onTrack: () => void; paymentLoading: boolean; trackingLoading: boolean }) {
  const steps = [
    ["PENDING_PAYMENT", "Pedido recebido"],
    ["PAID", "Pagamento confirmado"],
    ["PROCESSING", "Preparando pedido"],
    ["READY_TO_SHIP", "Pronto para envio"],
    ["SHIPPED", "Pedido enviado"],
    ["DELIVERED", "Entregue"],
  ] as const;
  const statusIndex = Math.max(0, steps.findIndex(([status]) => status === order.status));
  return <div className="storefront success-page"><main className="success-card">
    <div className="success-icon"><Check size={30}/></div>
    <p className="store-kicker">ACOMPANHAMENTO DO PEDIDO</p>
    <h1>Pedido {order.order_number}</h1>
    <p>{order.payment_status === "PAID" ? "Pagamento confirmado." : "O pagamento ainda está aguardando confirmação."}</p>
    <div className="success-total">Total do pedido <strong>{formatMoney(Number(order.total_amount))}</strong></div>
    <div className="order-timeline">{steps.map(([status, label], index) => <div className={index <= statusIndex ? "timeline-step done" : "timeline-step"} key={status}><span>{index < statusIndex ? "✓" : index + 1}</span><div><strong>{label}</strong><small>{index === statusIndex ? "Status atual" : index < statusIndex ? "Concluído" : "Aguardando"}</small></div></div>)}</div>
    {order.shipment?.tracking_code && <div className="shipping-tracking-card">
      <p className="store-kicker">RASTREAMENTO</p>
      <h2>Seu pedido está a caminho</h2>
      <p><strong>{order.shipment.carrier || "Transportadora"}</strong>{order.shipment.service ? ` · ${order.shipment.service}` : ""}</p>
      <div className="tracking-code"><span>Código de rastreio</span><strong>{order.shipment.tracking_code}</strong></div>
      {order.shipment.tracking_url && <a className="store-primary-cta" href={order.shipment.tracking_url} target="_blank" rel="noreferrer">Acompanhar entrega <ArrowRight size={16}/></a>}
    </div>}
    {order.payment_status !== "PAID" && <button className="checkout-submit" onClick={onPay} disabled={paymentLoading}>{paymentLoading ? "Gerando pagamento..." : "Continuar para pagamento"}</button>}
    <button className="shipping-quote-button" onClick={onTrack} disabled={trackingLoading}>{trackingLoading ? "Atualizando..." : "Atualizar status do pedido"}</button>
    <button className="store-primary-cta" onClick={onStore}>Voltar para a loja <ArrowRight size={16}/></button>
  </main></div>;
}
