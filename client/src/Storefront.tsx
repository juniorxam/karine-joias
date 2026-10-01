import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Gem, Instagram, Menu, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, type CatalogProduct } from "./lib/catalog";
import { loadPublicCatalog } from "./lib/publicCatalog";

const categories = ["Todas", "Joias", "Semi-joias", "Acessórios"];

export default function Storefront() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    loadPublicCatalog().then(setProducts);
    document.title = "Karine Joias · Escolha o detalhe que fica";
    return () => { document.title = "Karine Joias · Gestão"; };
  }, []);

  const filtered = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "Todas" || product.category === category;
    const text = `${product.name} ${product.material} ${product.category}`.toLowerCase();
    return matchesCategory && text.includes(query.toLowerCase());
  }), [category, products, query]);

  const featured = products.filter((product) => product.featured).slice(0, 3);
  const askAbout = async (product: CatalogProduct) => {
    const message = `Olá, Karine! Gostei da peça ${product.name} (${formatMoney(product.price)}). Pode me contar mais?`;
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem preparada", { description: "Copiamos uma mensagem para você enviar à Karine." });
    } catch {
      toast.success("Peça selecionada", { description: message });
    }
  };

  return <div className="storefront">
    <header className="store-header">
      <a className="store-logo" href="/loja" aria-label="Karine Joias - início">
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
        <div className="store-hero-art" aria-label="Composição abstrata em tons dourados">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-gem"><Gem size={82} strokeWidth={1} /></div>
          <span className="hero-stamp">FEITO PARA<br /><b>BRILHAR</b></span>
        </div>
      </section>

      <section className="store-values" id="essencia">
        <div><span>01</span><strong>Escolhas com intenção</strong><p>Peças que contam uma história sem precisar dizer uma palavra.</p></div>
        <div><span>02</span><strong>Detalhes que aproximam</strong><p>Atendimento próximo para encontrar algo realmente seu.</p></div>
        <div><span>03</span><strong>Brilho para todos os dias</strong><p>Joias para celebrar o agora, do seu jeito.</p></div>
      </section>

      {featured.length > 0 && <section className="store-featured">
        <div className="store-section-heading"><div><p className="store-kicker">CURADORIA KARINE</p><h2>Peças para se apaixonar.</h2></div><a href="#colecao">Ver toda a coleção <ArrowRight size={15} /></a></div>
        <div className="featured-grid">{featured.map((product) => <ProductCard key={product.id} product={product} onAsk={askAbout} featured />)}</div>
      </section>}

      <section className="store-catalog" id="colecao">
        <div className="store-section-heading catalog-heading"><div><p className="store-kicker">A COLEÇÃO</p><h2>Encontre o seu brilho.</h2></div><span>{filtered.length} peças</span></div>
        <div className="catalog-toolbar"><div className="catalog-search"><Search size={17} /><input aria-label="Buscar produtos" placeholder="Buscar uma peça..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="category-list">{categories.map((item) => <button className={category === item ? "selected" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
        {filtered.length ? <div className="store-product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} onAsk={askAbout} />)}</div> : <div className="empty-catalog"><Gem size={28} /><h3>Nenhuma peça encontrada.</h3><p>Tente outro termo ou volte para todas as categorias.</p><button onClick={() => { setQuery(""); setCategory("Todas"); }}>Limpar busca</button></div>}
      </section>
    </main>

    <footer className="store-footer" id="contato"><div className="footer-brand"><span className="store-logo-mark"><Gem size={19} /></span><div><strong>Karine</strong><small>JOIAS</small></div></div><div><p className="store-kicker">ATENDIMENTO</p><h3>Uma peça especial começa<br />com uma conversa.</h3><p className="footer-note">Escolha uma peça e prepare sua mensagem. A Karine continua o atendimento com você.</p></div><div className="footer-links"><a href="#colecao">Coleção <ArrowRight size={14} /></a><a href="/" >Área da proprietária <ArrowRight size={14} /></a><a href="https://instagram.com" target="_blank" rel="noreferrer"><Instagram size={14} /> Instagram</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Karine Joias</span><span>Feito para brilhar.</span></div></footer>
  </div>;
}

function ProductCard({ product, onAsk, featured = false }: { product: CatalogProduct; onAsk: (product: CatalogProduct) => void; featured?: boolean }) {
  return <article className={featured ? "store-product-card featured-card" : "store-product-card"}>
    <div className="store-product-art" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}><div className="product-art-glow"><Gem size={featured ? 39 : 31} strokeWidth={1.1} /></div><span>{product.category}</span></div>
    <div className="store-product-info"><p className="product-material">{product.material}</p><h3>{product.name}</h3><div className="store-product-bottom"><strong>{formatMoney(product.price)}</strong><button onClick={() => onAsk(product)} aria-label={`Tenho interesse em ${product.name}`}>{featured ? "Tenho interesse" : <Check size={15} />}</button></div></div>
  </article>;
}
