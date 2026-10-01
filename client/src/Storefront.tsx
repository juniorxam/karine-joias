import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Gem, Instagram, Menu, Minus, Plus, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, type CatalogProduct } from "./lib/catalog";
import { loadPublicCatalog } from "./lib/publicCatalog";
import { supabase } from "./lib/supabase";

const categories = ["Todas", "Joias", "Semi-joias", "Acessórios"];
const storeWhatsApp = (import.meta.env.VITE_STORE_WHATSAPP as string | undefined)?.replace(/\D/g, "");

type CartItem = CatalogProduct & { quantity: number };
type Customer = { name: string; email: string; phone: string };
type Shipping = { postal_code: string; address: string; number: string; complement: string; neighborhood: string; city: string; state: string };

const cartKey = "kj-cart";

function readCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(cartKey) || "[]"); } catch { return []; }
}

export default function Storefront() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const returnParams = new URLSearchParams(window.location.search);
  const returnedOrder = returnParams.get("order");
  const [view, setView] = useState<"store" | "checkout" | "success">(
    window.location.pathname.includes("/checkout") ? "checkout" : window.location.pathname.includes("/pedido") ? "success" : "store"
  );
  const [order, setOrder] = useState<{ order_number: string; total_amount: number; payment_status?: string } | null>(
    returnedOrder ? { order_number: returnedOrder, total_amount: 0, payment_status: returnParams.get("status") || "success" } : null
  );

  useEffect(() => {
    loadPublicCatalog().then(setProducts);
    document.title = view === "checkout" ? "Karine Joias · Finalizar pedido" : "Karine Joias · Escolha o detalhe que fica";
  }, [view]);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart]);

  const filtered = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "Todas" || product.category === category;
    const text = `${product.name} ${product.material} ${product.category}`.toLowerCase();
    return matchesCategory && text.includes(query.toLowerCase());
  }), [category, products, query]);

  const featured = products.filter((product) => product.featured).slice(0, 3);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (product: CatalogProduct) => {
    setCart(items => {
      const current = items.find(item => String(item.id) === String(product.id));
      return current
        ? items.map(item => String(item.id) === String(product.id) ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { ...product, quantity: 1 }];
    });
    toast.success("Produto adicionado ao carrinho", { description: product.name });
  };

  const changeQty = (id: CatalogProduct["id"], delta: number) => {
    setCart(items => items.flatMap(item => {
      if (String(item.id) !== String(id)) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const askAbout = (product: CatalogProduct) => {
    const message = `Olá, Karine! Gostei da peça ${product.name} (${formatMoney(product.price)}). Pode me contar mais?`;
    if (storeWhatsApp) {
      window.open(`https://wa.me/${storeWhatsApp}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } else {
      navigator.clipboard?.writeText(message);
      toast.success("Mensagem preparada");
    }
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

  const finishOrder = async (customer: Customer, shipping: Shipping) => {
    if (!supabase) {
      toast.error("A loja ainda não está conectada ao Supabase.");
      return;
    }
    const { data, error } = await supabase.functions.invoke("create-order", {
      body: {
        customer,
        shipping,
        items: cart.map(item => ({ product_id: Number(item.id), quantity: item.quantity })),
      },
    });
    if (error) {
      toast.error("Não foi possível criar o pedido", { description: error.message });
      return;
    }
    setOrder(data);
    setCart([]);
    const payment = await supabase.functions.invoke("create-payment", { body: { order_number: data.order_number, email: customer.email } });
    if (payment.data?.init_point) { window.location.href = payment.data.init_point; return; }
    if (payment.error) toast.success("Pedido criado", { description: "O pagamento online ainda não está configurado." });
    window.history.pushState({}, "", "/loja/pedido");
    setView("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "checkout") {
    return <Checkout cart={cart} subtotal={subtotal} onBack={backToStore} onFinish={finishOrder} onChangeQty={changeQty} />;
  }

  if (view === "success" && order) {
    return <OrderSuccess order={order} onStore={backToStore} />;
  }

  return <div className="storefront">
    <header className="store-header">
      <a className="store-logo" href="/loja" onClick={(e) => { e.preventDefault(); backToStore(); }}>
        <span className="store-logo-mark"><Gem size={19} /></span>
        <span><strong>Karine</strong><small>JOIAS</small></span>
      </a>
      <nav className={menuOpen ? "store-nav open" : "store-nav"}>
        <a href="#colecao" onClick={() => setMenuOpen(false)}>Coleção</a>
        <a href="#essencia" onClick={() => setMenuOpen(false)}>A essência</a>
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
          <p className="store-kicker"><Sparkles size={13} /> JOIAS COM PRESENÇA DELICADA</p>
          <h1>Escolha o detalhe <em>que fica.</em></h1>
          <p className="store-hero-text">Peças escolhidas para acompanhar seus momentos mais bonitos — com brilho, intenção e a delicadeza que é só sua.</p>
          <a className="store-primary-cta" href="#colecao">Explorar a coleção <ArrowRight size={16} /></a>
        </div>
        <div className="store-hero-art"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-gem"><Gem size={82} strokeWidth={1} /></div><span className="hero-stamp">FEITO PARA<br /><b>BRILHAR</b></span></div>
      </section>

      <section className="store-values" id="essencia">
        <div><span>01</span><strong>Escolhas com intenção</strong><p>Peças que contam uma história sem precisar dizer uma palavra.</p></div>
        <div><span>02</span><strong>Detalhes que aproximam</strong><p>Atendimento próximo para encontrar algo realmente seu.</p></div>
        <div><span>03</span><strong>Brilho para todos os dias</strong><p>Joias para celebrar o agora, do seu jeito.</p></div>
      </section>

      {featured.length > 0 && <section className="store-featured">
        <div className="store-section-heading"><div><p className="store-kicker">CURADORIA KARINE</p><h2>Peças para se apaixonar.</h2></div><a href="#colecao">Ver toda a coleção <ArrowRight size={15} /></a></div>
        <div className="featured-grid">{featured.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onAsk={askAbout} featured />)}</div>
      </section>}

      <section className="store-catalog" id="colecao">
        <div className="store-section-heading catalog-heading"><div><p className="store-kicker">A COLEÇÃO</p><h2>Encontre o seu brilho.</h2></div><span>{filtered.length} peças</span></div>
        <div className="catalog-toolbar"><div className="catalog-search"><Search size={17} /><input aria-label="Buscar produtos" placeholder="Buscar uma peça..." value={query} onChange={event => setQuery(event.target.value)} /></div><div className="category-list">{categories.map(item => <button className={category === item ? "selected" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
        {filtered.length ? <div className="store-product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onAsk={askAbout} />)}</div> : <div className="empty-catalog"><Gem size={28} /><h3>Nenhuma peça encontrada.</h3><p>Tente outro termo ou volte para todas as categorias.</p><button onClick={() => { setQuery(""); setCategory("Todas"); }}>Limpar busca</button></div>}
      </section>
    </main>

    <footer className="store-footer" id="contato"><div className="footer-brand"><span className="store-logo-mark"><Gem size={19} /></span><div><strong>Karine</strong><small>JOIAS</small></div></div><div><p className="store-kicker">ATENDIMENTO</p><h3>Uma peça especial começa<br />com uma conversa.</h3><p className="footer-note">Compre online ou fale diretamente com a Karine.</p></div><div className="footer-links"><a href="#colecao">Coleção <ArrowRight size={14} /></a><a href="/" >Área da proprietária <ArrowRight size={14} /></a><a href="https://instagram.com" target="_blank" rel="noreferrer"><Instagram size={14} /> Instagram</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Karine Joias</span><span>Feito para brilhar.</span></div></footer>
  </div>;
}

function ProductCard({ product, onAdd, onAsk, featured = false }: { product: CatalogProduct; onAdd: (product: CatalogProduct) => void; onAsk: (product: CatalogProduct) => void; featured?: boolean }) {
  return <article className={featured ? "store-product-card featured-card" : "store-product-card"}>
    <div className="store-product-art" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}><div className="product-art-glow"><Gem size={featured ? 39 : 31} strokeWidth={1.1} /></div><span>{product.category}</span></div>
    <div className="store-product-info"><p className="product-material">{product.material}</p><h3>{product.name}</h3><div className="store-product-bottom"><strong>{formatMoney(product.price)}</strong><div className="product-actions"><button className="product-buy" onClick={() => onAdd(product)}>Comprar</button><button className="product-interest" onClick={() => onAsk(product)} aria-label={`Tenho interesse em ${product.name}`}>{featured ? "WhatsApp" : <Check size={15} />}</button></div></div></div>
  </article>;
}

function Checkout({ cart, subtotal, onBack, onFinish, onChangeQty }: { cart: CartItem[]; subtotal: number; onBack: () => void; onFinish: (customer: Customer, shipping: Shipping) => Promise<void>; onChangeQty: (id: CatalogProduct["id"], delta: number) => void }) {
  const [customer, setCustomer] = useState<Customer>({ name: "", email: "", phone: "" });
  const [shipping, setShipping] = useState<Shipping>({ postal_code: "", address: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
  const [busy, setBusy] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);

  const updateCustomer = (field: keyof Customer, value: string) => setCustomer(v => ({ ...v, [field]: value }));
  const updateShipping = (field: keyof Shipping, value: string) => setShipping(v => ({ ...v, [field]: value }));

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) return toast.error("Seu carrinho está vazio");
    setBusy(true);
    try { await onFinish(customer, shipping); } finally { setBusy(false); }
  };

  return <div className="storefront checkout-page">
    <header className="store-header"><button className="checkout-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button><span className="store-logo"><span className="store-logo-mark"><Gem size={19}/></span><span><strong>Karine</strong><small>JOIAS</small></span></span><span className="checkout-secure">Checkout seguro</span></header>
    <main className="checkout-layout">
      <form className="checkout-form" onSubmit={submit}>
        <div className="checkout-title"><p className="store-kicker">FINALIZAR PEDIDO</p><h1>Quase seu.</h1><p>Preencha seus dados para reservar as peças e gerar seu pedido.</p></div>
        <section className="checkout-section"><h2>Seus dados</h2><div className="checkout-grid"><label>Nome completo<input required value={customer.name} onChange={e => updateCustomer("name", e.target.value)} /></label><label>E-mail<input required type="email" value={customer.email} onChange={e => updateCustomer("email", e.target.value)} /></label><label>WhatsApp<input required value={customer.phone} onChange={e => updateCustomer("phone", e.target.value)} /></label></div></section>
        <section className="checkout-section"><h2>Entrega</h2><div className="checkout-grid"><label>CEP<input required inputMode="numeric" value={shipping.postal_code} onChange={e => fetchZip(e.target.value)} placeholder="00000-000" />{zipLoading && <small>Consultando CEP...</small>}</label><label className="wide">Endereço<input required value={shipping.address} onChange={e => updateShipping("address", e.target.value)} /></label><label>Número<input required value={shipping.number} onChange={e => updateShipping("number", e.target.value)} /></label><label>Complemento<input value={shipping.complement} onChange={e => updateShipping("complement", e.target.value)} /></label><label>Bairro<input required value={shipping.neighborhood} onChange={e => updateShipping("neighborhood", e.target.value)} /></label><label>Cidade<input required value={shipping.city} onChange={e => updateShipping("city", e.target.value)} /></label><label>UF<input required maxLength={2} value={shipping.state} onChange={e => updateShipping("state", e.target.value.toUpperCase())} /></label></div></section>
        <section className="checkout-section"><h2>Pagamento</h2><div className="payment-placeholder"><ShoppingBag size={18}/><div><strong>Pagamento online será liberado na próxima etapa</strong><p>Seu pedido será criado com status aguardando pagamento. A integração PIX/cartão pode ser conectada ao Mercado Pago sem alterar o checkout.</p></div></div></section>
        <button className="checkout-submit" disabled={busy || !cart.length}>{busy ? "Criando pedido..." : "Confirmar pedido"}</button>
      </form>
      <aside className="checkout-summary"><h2>Seu pedido</h2>{cart.map(item => <div className="checkout-item" key={item.id}><div><strong>{item.name}</strong><span>{item.quantity} × {formatMoney(item.price)}</span></div><div className="qty-controls"><button type="button" onClick={() => onChangeQty(item.id, -1)} aria-label="Diminuir">−</button><span>{item.quantity}</span><button type="button" onClick={() => onChangeQty(item.id, 1)} aria-label="Aumentar">+</button></div><b>{formatMoney(item.price * item.quantity)}</b></div>)}<div className="checkout-total"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div><div className="checkout-total grand"><span>Total</span><strong>{formatMoney(subtotal)}</strong></div><p className="checkout-note">Frete e pagamento serão calculados na próxima etapa.</p></aside>
    </main>
  </div>;
}

function OrderSuccess({ order, onStore }: { order: { order_number: string; total_amount: number; payment_status?: string }; onStore: () => void }) {
  return <div className="storefront success-page"><main className="success-card"><div className="success-icon"><Check size={30}/></div><p className="store-kicker">PEDIDO RECEBIDO</p><h1>Obrigada pela sua compra.</h1><p>Seu pedido <strong>{order.order_number}</strong> foi recebido. {order.payment_status === "success" ? "O pagamento foi encaminhado para confirmação." : "Acompanhe a confirmação do pagamento pelo Mercado Pago."}</p>{order.total_amount > 0 && <div className="success-total">Total do pedido <strong>{formatMoney(Number(order.total_amount))}</strong></div>}<button className="store-primary-cta" onClick={onStore}>Voltar para a loja <ArrowRight size={16}/></button></main></div>;
}
