import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Gem, Heart, Instagram, Menu, Search, ShoppingBag, Sparkles, X, User, Truck, Tag, ShieldCheck, Star, MessageCircle } from "lucide-react";
import { formatMoney, type CatalogProduct } from "./lib/catalog";
type ShippingDistanceRule = { min_km:number; max_km:number|null; price:number };
type ProductReview = { id:string; product_id:number; rating:number; comment:string; display_name:string; created_at:string };
type StorefrontSettings = { hero_title:string; hero_subtitle:string; hero_image_url?:string|null; hero_cta:string; featured_title:string; featured_enabled:boolean; latest_enabled:boolean; category_enabled:boolean; collection_enabled:boolean; collection_title:string; collection_subtitle:string; collection_image_url?:string|null; collection_cta:string; shipping_palmas_enabled:boolean; shipping_palmas_pickup_enabled:boolean; shipping_origin_postal_code:string; shipping_palmas_distance_rules:ShippingDistanceRule[] };
import { loadPublicCatalog } from "./lib/publicCatalog";
import { supabase } from "./lib/supabase";
import CustomerAccount from "./CustomerAccount";

const categories = ["Todas", "Joias", "Semi-joias", "Acessórios"];
const storeWhatsApp = (import.meta.env.VITE_STORE_WHATSAPP as string | undefined)?.replace(/\D/g, "");
const storeInstagram = (import.meta.env.VITE_STORE_INSTAGRAM as string | undefined)?.trim();
const logoSrc = "/logo-violetta.jpeg";

async function getFunctionErrorMessage(error: unknown, data?: unknown, fallback = "Não foi possível concluir a operação.") {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  const context = error && typeof error === "object" && "context" in error ? error.context : null;
  if (context && typeof context === "object" && "clone" in context && typeof context.clone === "function") {
    try {
      const body = await context.clone().json() as { error?: string; message?: string };
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch { /* A resposta pode não ser JSON. */ }
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

type CartItem = CatalogProduct & { quantity: number };
type Customer = { name: string; email: string; phone: string; recipient_code: string };
type ShippingOption = { id: number | string; company: string; service: string; price: number; delivery_time: number };
type Shipping = { postal_code: string; address: string; number: string; complement: string; neighborhood: string; city: string; state: string; shipping_option?: ShippingOption; shipping_quote_id?: string };

function isValidCPF(value: string) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
function formatCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
async function geocodePostalCode(postalCode:string){ const cep=postalCode.replace(/\D/g,""); if(cep.length!==8) throw new Error("CEP inválido"); const response=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&postalcode="+cep+"&country=Brazil&limit=1"); if(!response.ok) throw new Error("Não foi possível calcular a distância"); const data=await response.json(); if(!Array.isArray(data)||!data[0]) throw new Error("Não foi possível localizar o CEP para calcular a distância"); return {lat:Number(data[0].lat),lon:Number(data[0].lon)}; }
function distanceKm(a:{lat:number;lon:number},b:{lat:number;lon:number}){ const rad=(v:number)=>v*Math.PI/180; const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon); const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); }
function formatPhone(value: string) {
  const digits = normalizePhone(value).slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
}

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


function FirstPurchasePopup(){const [open,setOpen]=useState(false);const[name,setName]=useState("");const[phone,setPhone]=useState("");const[done,setDone]=useState(false);const[reward,setReward]=useState<any>(null);useEffect(()=>{if(localStorage.getItem("violetta-first-purchase-popup"))return;const t=window.setTimeout(()=>setOpen(true),4500);return()=>window.clearTimeout(t)},[]);if(!open)return null;const validName=name.trim().length>=2;const validPhone=normalizePhone(phone).length>=10;const close=()=>{localStorage.setItem("violetta-first-purchase-popup","closed");setOpen(false)};const rewardText=reward?.reward_type==="PERCENT"?"desconto de "+reward.reward_value+"%":reward?.reward_type==="FIXED"?"desconto de "+formatMoney(Number(reward.reward_value)||0):reward?.reward_type==="FREIGHT"?"frete grátis":reward?.reward_type==="GIFT"?(reward.gift_description||"um brinde especial"):"um presente especial";const unlock=async()=>{if(!supabase){toast.error("Serviço da loja indisponível no momento.");return}if(!validName||!validPhone){toast.error("Preencha seu nome e WhatsApp para desbloquear o presente.");return}try{const {data,error}=await supabase.functions.invoke("first-purchase-gift",{body:{name:name.trim(),phone:normalizePhone(phone)}});if(error)throw error;if(!data?.coupon_code)throw new Error("Não foi possível gerar seu benefício.");localStorage.setItem("violetta-first-purchase-popup","unlocked");localStorage.setItem("violetta-first-purchase-lead",JSON.stringify({name:name.trim(),phone:normalizePhone(phone),coupon_code:data.coupon_code,created_at:new Date().toISOString()}));localStorage.setItem("kj-first-purchase-coupon",data.coupon_code);setReward(data);setDone(true)}catch(error){toast.error("Não foi possível liberar o presente.",{description:error instanceof Error?error.message:"Tente novamente."})}};return <div className="first-purchase-overlay" role="dialog" aria-modal="true"><div className="first-purchase-popup"><button className="first-purchase-close" type="button" onClick={close} aria-label="Fechar"><X size={18}/></button><div className="first-purchase-icon">🎁</div>{!done?<><p className="first-purchase-kicker">UM MIMO ESPECIAL PARA VOCÊ</p><h2>Ganhe um presente exclusivo na sua primeira compra</h2><p className="first-purchase-subtitle">Cadastre seu contato para desbloquear seu presente.</p><label>Digite seu nome*<input value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome" autoComplete="name"/>{name&&!validName&&<small>Digite seu nome válido.</small>}</label><label>Agora, seu WhatsApp*<input value={formatPhone(phone)} onChange={e=>setPhone(e.target.value)} placeholder="(63) 99999-9999" inputMode="tel" autoComplete="tel"/>{phone&&!validPhone&&<small>Digite um WhatsApp válido.</small>}</label><button className="first-purchase-submit" type="button" onClick={unlock}>DESBLOQUEAR PRESENTE <ArrowRight size={16}/></button><small className="first-purchase-privacy">Seu benefício é individual e válido conforme as regras configuradas pela Violetta.</small></>:<><p className="first-purchase-kicker">PRESENTE DESBLOQUEADO ✨</p><h2>Seu mimo está reservado!</h2><p className="first-purchase-subtitle">Obrigada, {name.trim().split(/\s+/)[0]||"querida"}. Você ganhou <strong>{rewardText}</strong>.</p><div className="first-purchase-coupon">{reward?.coupon_code||localStorage.getItem("kj-first-purchase-coupon")||""}</div>{reward?.reward_type==="GIFT"&&<small className="first-purchase-privacy">Brinde: {reward.gift_description||"consulte a loja"}</small>}<small className="first-purchase-privacy">Use este código no checkout. Validade e pedido mínimo conforme configuração da loja.</small><button className="first-purchase-submit" type="button" onClick={close}>CONTINUAR COMPRANDO <ArrowRight size={16}/></button></>}</div></div>}
export default function Storefront() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [storefrontSettings, setStorefrontSettings] = useState<StorefrontSettings | null>(null);
  const refreshPublicCatalog = async () => {
    try {
      const latest = await loadPublicCatalog();
      setProducts(latest);
    } catch (error) {
      console.error("Falha ao sincronizar catálogo público", error);
    }
  };

  const refreshStorefrontSettings = async (ownerId?: string) => {
    if (!supabase || !ownerId) return;
    const { data, error } = await supabase.from("storefront_settings")
      .select("hero_title,hero_subtitle,hero_image_url,hero_cta,featured_title,featured_enabled,latest_enabled,category_enabled,collection_enabled,collection_title,collection_subtitle,collection_image_url,collection_cta,shipping_palmas_enabled,shipping_palmas_pickup_enabled,shipping_origin_postal_code,shipping_palmas_distance_rules")
      .eq("store_slug","violetta")
      .eq("owner_id", ownerId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Falha ao sincronizar configurações da vitrine", error);
      return;
    }
    if (data) setStorefrontSettings(data as StorefrontSettings);
  };

  useEffect(() => {
    const ownerId = products[0]?.ownerId;
    if (!ownerId) return;
    void refreshStorefrontSettings(ownerId);
  }, [products[0]?.ownerId]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    // Sincronização em tempo real: qualquer alteração feita no painel em
    // public_products ou storefront_settings atualiza a vitrine aberta.
    const catalogChannel = client
      .channel("violetta-public-catalog")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_products", filter: "store_slug=eq.violetta" },
        () => { void refreshPublicCatalog(); },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.info("[Violetta] Catálogo em tempo real conectado.");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[Violetta] Realtime do catálogo indisponível; o fallback periódico continuará ativo.");
      });

    const settingsChannel = client
      .channel("violetta-storefront-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "storefront_settings", filter: "store_slug=eq.violetta" },
        (payload) => {
          const ownerId = products[0]?.ownerId;
          if (ownerId && (payload.eventType === "INSERT" || payload.eventType === "UPDATE" || payload.eventType === "DELETE")) {
            void refreshStorefrontSettings(ownerId);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.info("[Violetta] Configurações em tempo real conectadas.");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[Violetta] Realtime das configurações indisponível; o fallback periódico continuará ativo.");
      });

    // Fallback: se uma conexão WebSocket cair, a loja ainda se sincroniza
    // automaticamente sem depender de o cliente apertar F5.
    const fallbackTimer = window.setInterval(() => {
      void refreshPublicCatalog();
      const ownerId = products[0]?.ownerId;
      if (ownerId) void refreshStorefrontSettings(ownerId);
    }, 120000);

    return () => {
      window.clearInterval(fallbackTimer);
      void client.removeChannel(catalogChannel);
      void client.removeChannel(settingsChannel);
    };
  }, [products[0]?.ownerId]);
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const [checkoutDraft, setCheckoutDraft] = useState(readCheckoutDraft);
  const returnParams = new URLSearchParams(window.location.search);
  const returnedOrder = returnParams.get("order");
  const [view, setView] = useState<"store" | "checkout" | "success" | "product" | "account">(
    window.location.pathname.includes("/checkout") ? "checkout" : window.location.pathname.includes("/pedido") ? "success" : window.location.pathname.includes("/produto/") ? "product" : window.location.pathname.includes("/minha-conta") ? "account" : "store"
  );
  const [order, setOrder] = useState<{ order_number: string; total_amount: number; payment_status?: string; payment_url?: string; status?: string; shipment?: { carrier?: string | null; service?: string | null; tracking_code?: string | null; tracking_url?: string | null; shipping_status?: string | null } | null; items?: Array<{ id:string; product_id:number; product_name:string; quantity:number; unit_price:number; total_price:number }>; reviews?: Array<{ order_item_id:string; status:string }> } | null>(
    returnedOrder ? { order_number: returnedOrder, total_amount: 0, payment_status: returnParams.get("status") || "success" } : null
  );
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const checkoutIdempotencyKey = useRef<string | null>(null);
  const productSlug = decodeURIComponent(window.location.pathname.split("/produto/")[1] || "");
  const selectedProduct = view === "product" ? products.find(product => (product.slug || String(product.id)) === productSlug || String(product.id) === productSlug) : null;

  useEffect(() => {
    void refreshPublicCatalog();
  }, []);

  useEffect(() => {
    const syncViewWithUrl = () => {
      const pathname = window.location.pathname;
      setView(pathname.includes("/checkout") ? "checkout" : pathname.includes("/pedido") ? "success" : pathname.includes("/produto/") ? "product" : pathname.includes("/minha-conta") ? "account" : "store");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", syncViewWithUrl);
    return () => window.removeEventListener("popstate", syncViewWithUrl);
  }, []);

  useEffect(() => {
    const title = view === "checkout"
      ? "Finalizar pedido · Violetta"
      : view === "product" && selectedProduct
        ? selectedProduct.name + " · Violetta"
        : view === "success"
          ? "Acompanhamento do pedido · Violetta"
          : "Violetta Joias e Semijoias · Escolha o detalhe que fica";
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

    document.getElementById("violetta-store-schema")?.remove();
    if (view === "store" || view === "product") {
      const schema = document.createElement("script");
      schema.id = "violetta-store-schema";
      schema.type = "application/ld+json";
      schema.textContent = JSON.stringify(view === "product" && selectedProduct ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: selectedProduct.name,
        description: selectedProduct.description || description,
        category: selectedProduct.category,
        material: selectedProduct.material,
        image: selectedProduct.imageUrl ? [selectedProduct.imageUrl] : undefined,
        offers: { "@type": "Offer", priceCurrency: "BRL", price: selectedProduct.price.toFixed(2), availability: Number(selectedProduct.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" }
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
          items: data.items || [],
          reviews: data.reviews || [],
        });      }
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
  const bestSellers = [...products].filter(product => product.isBestSeller || (product.soldQuantity ?? 0) > 0).sort((a,b) => (b.soldQuantity ?? 0) - (a.soldQuantity ?? 0)).slice(0, 8);
  const latest = [...products].sort((a,b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).slice(0, 8);
  const gifts = [...products].filter(product => /presente|kit|mix|conjunto/i.test(product.name)).slice(0, 8);
  const giftProducts = gifts.length ? gifts : latest.slice(0, 4);
  const categoryCards = [
    { name: "Joias", label: "Joias", icon: "✦", imageUrl: products.find(product => product.category === "Joias" && product.imageUrl)?.imageUrl },
    { name: "Semi-joias", label: "Semi-joias", icon: "◇", imageUrl: products.find(product => product.category === "Semi-joias" && product.imageUrl)?.imageUrl },
    { name: "Acessórios", label: "Acessórios", icon: "◌", imageUrl: products.find(product => product.category === "Acessórios" && product.imageUrl)?.imageUrl },
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

  const addToCartQuantity = (product: CatalogProduct, quantity: number) => {
    const available = Number(product.stock ?? 0);
    const requested = Math.max(1, Math.min(available, Math.floor(quantity || 1)));
    if (available <= 0) return toast.error("Produto indisponível", { description: product.name });
    setCart(items => {
      const current = items.find(item => String(item.id) === String(product.id));
      const nextQuantity = Math.min(available, (current?.quantity || 0) + requested);
      if (current && nextQuantity === current.quantity) {
        toast.error("Limite de estoque atingido", { description: `Há ${available} unidade(s) disponível(is).` });
        return items;
      }
      return current
        ? items.map(item => String(item.id) === String(product.id) ? { ...item, quantity: nextQuantity } : item)
        : [...items, { ...product, quantity: requested }];
    });
    toast.success(requested > 1 ? `${requested} unidades adicionadas ao carrinho` : "Produto adicionado ao carrinho", { description: product.name });
  };

  const buyNowQuantity = (product: CatalogProduct, quantity: number) => {
    const available = Number(product.stock ?? 0);
    const requested = Math.max(1, Math.min(available, Math.floor(quantity || 1)));
    if (available <= 0) return toast.error("Produto indisponível", { description: product.name });
    setCart(items => {
      const current = items.find(item => String(item.id) === String(product.id));
      return current
        ? items.map(item => String(item.id) === String(product.id) ? { ...item, quantity: requested } : item)
        : [...items, { ...product, quantity: requested }];
    });
    window.history.pushState({}, "", "/loja/checkout");
    setView("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const buyNow = (product: CatalogProduct) => buyNowQuantity(product, 1);

  const changeQty = (id: CatalogProduct["id"], delta: number) => {
    setCart(items => items.flatMap(item => {
      if (String(item.id) !== String(id)) return [item];
      const available = Number(item.stock ?? 0);
      const quantity = Math.min(available, item.quantity + delta);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const askAbout = (product: CatalogProduct) => {
    const message = `Olá! Aqui é a Violetta Joias. Gostei da peça ${product.name} (${formatMoney(product.price)}). Pode me contar mais?`;
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

  const openCart = () => setCartOpen(true);

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

  const submitReview = async (orderItemId: string, rating: number, comment: string) => {
    if (!supabase || !order?.order_number) throw new Error("Pedido não disponível.");
    const token = localStorage.getItem("kj-last-order-token") || "";
    if (!token) throw new Error("Token de acompanhamento não encontrado.");
    const { data, error } = await supabase.functions.invoke("submit-product-review", {
      body: { order_number: order.order_number, token, order_item_id: orderItemId, rating, comment },
    });
    if (error || data?.error) throw new Error(await getFunctionErrorMessage(error, data, "Não foi possível enviar a avaliação."));
    setOrder(current => current ? { ...current, reviews: [...(current.reviews || []).filter((review:any) => review.order_item_id !== orderItemId), { order_item_id: orderItemId, status: data.review?.status || "PENDING" }] } : current);
  };

  const finishOrder = async (customer: Customer, shipping: Shipping, couponCode = "") => {
    if (!supabase) {
      toast.error("A loja ainda não está conectada ao Supabase.");
      return;
    }
    const idempotencyKey = checkoutIdempotencyKey.current ?? (checkoutIdempotencyKey.current = crypto.randomUUID());
    const { data, error } = await supabase.functions.invoke("create-order", {
      body: {
        customer,
        shipping: { ...shipping, recipient_code: customer.recipient_code },
        items: cart.map(item => ({ product_id: Number(item.id), quantity: item.quantity })),
        coupon_code: couponCode || undefined,
        idempotency_key: idempotencyKey,
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
    checkoutIdempotencyKey.current = null;
    const payment = await supabase.functions.invoke("create-payment", { body: { order_number: data.order_number, email: customer.email } });
    if (payment.data?.init_point || payment.data?.sandbox_init_point) {
      window.location.href = payment.data.init_point || payment.data.sandbox_init_point;
      return;
    }
    if (payment.error || payment.data?.error) {
      const message = await getFunctionErrorMessage(payment.error, payment.data, "Verifique a configuração do Mercado Pago no Supabase.");
      toast.error("Pedido criado, mas o pagamento não foi gerado", { description: message });
    } else {
      toast.success("Pedido criado", { description: "Você já pode acompanhar o pedido e tentar o pagamento novamente." });
    }
    window.history.pushState({}, "", "/loja/pedido");
    setView("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "account") {
    return <CustomerAccount onBack={backToStore} />;
  }

  if (view === "product") {
    if (!selectedProduct) return <div className="storefront success-page"><main className="success-card"><p className="store-kicker">PEÇA NÃO ENCONTRADA</p><h1>Essa peça não está disponível.</h1><button className="store-primary-cta" onClick={backToStore}>Voltar para a loja <ArrowRight size={16}/></button></main></div>;
    return <ProductDetail product={selectedProduct} relatedProducts={products.filter(product => String(product.id) !== String(selectedProduct.id) && product.category === selectedProduct.category).slice(0, 4)} onBack={backToStore} onAdd={(quantity) => addToCartQuantity(selectedProduct, quantity)} onBuyNow={(quantity) => buyNowQuantity(selectedProduct, quantity)} onCheckout={goCheckout} onCart={openCart} onRelatedOpen={openProduct} onRelatedAdd={addToCart} onRelatedBuyNow={buyNow} onRelatedAsk={askAbout} />;
  }

  if (view === "checkout" && !cart.length) {
    return <div className="storefront success-page"><main className="success-card"><div className="success-icon"><ShoppingBag size={30}/></div><p className="store-kicker">SEU CARRINHO</p><h1>Seu carrinho está vazio.</h1><p>Escolha uma peça para continuar sua compra.</p><button className="store-primary-cta" onClick={backToStore}>Voltar para a loja <ArrowRight size={16}/></button></main></div>;
  }

  if (view === "checkout") {
    return <Checkout cart={cart} subtotal={subtotal} draft={checkoutDraft} onDraftChange={setCheckoutDraft} onBack={backToStore} onFinish={finishOrder} onChangeQty={changeQty} storefrontSettings={storefrontSettings} />;
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
      setOrder({ ...order, ...data.order, shipment: data.shipment || null, items: data.items || [], reviews: data.reviews || [] });
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
      else {
        const message = await getFunctionErrorMessage(payment.error, payment.data, "Verifique a configuração do Mercado Pago no Supabase.");
        toast.error("Não foi possível gerar o pagamento", { description: message });
      }
    }} onReview={submitReview} paymentLoading={paymentLoading} trackingLoading={trackingLoading} />;
  }

  return <div className="storefront"><FirstPurchasePopup/>
    <header className="store-header">
      <a className="store-logo" href="/loja" onClick={(e) => { e.preventDefault(); backToStore(); }}>
        <img className="store-logo-image" src={logoSrc} alt="Violetta Prata 925 e Semijoias" />
        <span><strong>Violetta</strong><small>PRATA 925 · SEMIJOIAS</small></span>
      </a>
      <nav className={menuOpen ? "store-nav open" : "store-nav"}>
        <a href="#novidades" onClick={() => setMenuOpen(false)}>Novidades</a>
        <a href="#mais-vendidos" onClick={() => setMenuOpen(false)}>Mais vendidos</a>
        <a href="#categorias" onClick={() => setMenuOpen(false)}>Categorias</a>
        <a href="#presentes" onClick={() => setMenuOpen(false)}>Presentes</a>
        <a href="#contato" onClick={() => setMenuOpen(false)}>Atendimento</a>
      </nav>      <div className="store-header-actions">
        <a className="store-admin-link" href="/minha-conta" onClick={(e) => { e.preventDefault(); window.history.pushState({}, "", "/minha-conta"); setView("account"); window.scrollTo({top:0,behavior:"smooth"}); }}>Minha conta</a>
        
        <button className="store-header-search" onClick={() => document.getElementById("colecao")?.scrollIntoView({behavior:"smooth"})} aria-label="Buscar peças"><Search size={17}/></button>
        <button className="store-cart-button" onClick={openCart} aria-label={cartCount ? `Abrir carrinho com ${cartCount} ${cartCount === 1 ? "item" : "itens"}` : "Abrir carrinho"}><ShoppingBag size={18}/>{cartCount > 0 && <b>{cartCount > 99 ? "99+" : cartCount}</b>}</button>
        <button className="store-menu-button" aria-label="Abrir menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>

    {cartOpen && <div className="store-cart-backdrop" onClick={() => setCartOpen(false)}><aside className="store-cart-drawer" onClick={e => e.stopPropagation()} aria-label="Carrinho de compras">
      <div className="store-cart-drawer-head"><div><p className="store-kicker">SEU PEDIDO</p><h2>Carrinho</h2></div><button onClick={() => setCartOpen(false)} aria-label="Fechar carrinho"><X size={19}/></button></div>
      {cart.length ? <>
        <div className="store-cart-items">{cart.map(item => <div className="store-cart-item" key={item.id}>
          <button className="store-cart-thumb" onClick={() => { setCartOpen(false); openProduct(item); }} style={item.imageUrl ? {backgroundImage:`url(${item.imageUrl})`} : undefined}>{!item.imageUrl && <Gem size={24}/>}</button>
          <div className="store-cart-item-copy"><button onClick={() => { setCartOpen(false); openProduct(item); }}><strong>{item.name}</strong></button><small>{item.material}</small><div className="store-cart-item-row"><div className="qty-controls"><button onClick={() => changeQty(item.id,-1)} aria-label="Diminuir">−</button><span>{item.quantity}</span><button onClick={() => changeQty(item.id,1)} aria-label="Aumentar">+</button></div><b>{formatMoney(item.price * item.quantity)}</b></div></div>
        </div>)}</div>
        <div className="store-cart-summary"><div><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div><small>Frete e descontos são calculados no checkout.</small><button className="store-primary-cta" onClick={() => { setCartOpen(false); goCheckout(); }}>Finalizar compra <ArrowRight size={16}/></button><button className="store-cart-continue" onClick={() => setCartOpen(false)}>Continuar comprando</button></div>
      </> : <div className="store-cart-empty"><ShoppingBag size={30}/><h3>Seu carrinho está vazio.</h3><p>Escolha uma peça especial para começar.</p><button className="store-primary-cta" onClick={() => setCartOpen(false)}>Ver coleção <ArrowRight size={15}/></button></div>}
    </aside></div>}
    <main>
      <div className="store-promo-bar"><span>VIOLETTA · PRATA 925 · SEMIJOIAS</span><b>Descubra a coleção e encontre sua próxima peça favorita.</b><a href="#novidades">Comprar agora <ArrowRight size={12}/></a></div>

      <section className="store-hero">
        <div className="store-hero-copy">
          <p className="store-kicker"><Sparkles size={13} /> NOVA COLEÇÃO VIOLETTA JOIAS</p>
          <h1>{storefrontSettings?.hero_title || "Seu brilho, seu momento."}</h1>
          <p className="store-hero-text">{storefrontSettings?.hero_subtitle || "Descubra peças escolhidas para valorizar cada detalhe. Elegância, delicadeza e personalidade em uma só vitrine."}</p>
          <div className="store-hero-actions"><a className="store-primary-cta" href="#novidades">{storefrontSettings?.hero_cta || "Comprar agora"} <ArrowRight size={16} /></a><a className="store-text-link" href="#categorias">Ver categorias</a></div>
        </div>
        <div className="store-hero-art" style={storefrontSettings?.hero_image_url ? { backgroundImage: `linear-gradient(90deg, #332e2a22, transparent), url(${storefrontSettings.hero_image_url})` } : latest[0]?.imageUrl ? { backgroundImage: `linear-gradient(90deg, #332e2a22, transparent), url(${latest[0].imageUrl})` } : undefined}>
          {!storefrontSettings?.hero_image_url && !latest[0]?.imageUrl && <><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-gem"><Gem size={82} strokeWidth={1} /></div></>}
          <span className="hero-stamp"><Heart size={18} strokeWidth={1.5} /><strong>Violetta</strong><b>PRATA 925 · SEMIJOIAS</b></span>
        </div>
      </section>

      <section className="store-values" id="essencia">
        <div><span>01</span><strong>Curadoria especial</strong><p>Peças selecionadas para combinar com diferentes estilos e momentos.</p></div>
        <div><span>02</span><strong>Compra segura</strong><p>Finalize seu pedido online com pagamento processado pelo Mercado Pago.</p></div>
        <div><span>03</span><strong>Atendimento próximo</strong><p>Fale diretamente com a nossa equipe sempre que precisar.</p></div><div><span>04</span><strong>Entrega acompanhada</strong><p>Após o envio, você recebe o código para acompanhar seu pedido.</p></div>
      </section>

      <section className="store-editorial">
        <div className="store-editorial-copy">
          <p className="store-kicker">A ESSÊNCIA VIOLETTA</p>
          <h2>Detalhes que transformam um look.</h2>
          <p>Escolha uma peça para marcar um momento, presentear alguém especial ou simplesmente celebrar você.</p>
          <a className="store-text-link" href="#colecao">Explorar a coleção <ArrowRight size={14}/></a>
        </div>
        <div className="store-editorial-art">
          <div className="editorial-ring"><Gem size={54} strokeWidth={1}/></div>
          <span>VIOLETTA<br/><b>ESSENCIAL</b></span>
        </div>
      </section>

      {(storefrontSettings?.category_enabled ?? true) ? (<section className="store-category-strip" id="categorias">
        <div className="store-section-heading"><div><p className="store-kicker">ENCONTRE SEU ESTILO</p><h2>Compre por categoria</h2></div></div>
        <div className="category-cards">{categoryCards.map(item => <button key={item.name} onClick={() => { setCategory(item.name); document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" }); }} style={item.imageUrl ? { backgroundImage: `linear-gradient(180deg, rgba(40,32,26,.02), rgba(40,32,26,.72)), url(${item.imageUrl})` } : undefined}><span>{item.icon}</span><strong>{item.label}</strong><small>Ver peças <ArrowRight size={13} /></small></button>)}</div>
      </section>) : null}

      {(storefrontSettings?.featured_enabled ?? true) && (bestSellers.length > 0 || featured.length > 0) ? (<section className="store-featured" id="mais-vendidos">
        <div className="store-section-heading"><div><p className="store-kicker">DESTAQUES VIOLETTA</p><h2>{storefrontSettings?.featured_title || "Mais vendidos"}</h2></div><a href="#colecao">Ver todos <ArrowRight size={15} /></a></div>
        <div className="featured-grid">{(bestSellers.length ? bestSellers : featured).map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onBuyNow={buyNow} onAsk={askAbout} onOpen={openProduct} featured isTopSeller={topSoldQuantity > 0 && (product.soldQuantity ?? 0) === topSoldQuantity} />)}</div>
      </section>) : null}

      {giftProducts.length > 0 ? (<section className="store-gifts" id="presentes">
        <div className="store-section-heading"><div><p className="store-kicker">PARA PRESENTEAR</p><h2>Escolhas especiais para presentear</h2></div><a href="#colecao">Ver opções <ArrowRight size={15} /></a></div>
        <div className="store-product-grid">{giftProducts.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onBuyNow={buyNow} onAsk={askAbout} onOpen={openProduct} isTopSeller={false} />)}</div>
      </section>) : null}

      {(storefrontSettings?.latest_enabled ?? true) ? (<section className="store-latest" id="novidades">
        <div className="store-section-heading"><div><p className="store-kicker">RECÉM-CHEGARAM</p><h2>Novidades</h2></div><a href="#colecao">Ver todos <ArrowRight size={15} /></a></div>
        <div className="store-product-grid">{latest.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onBuyNow={buyNow} onAsk={askAbout} onOpen={openProduct} isTopSeller={topSoldQuantity > 0 && (product.soldQuantity ?? 0) === topSoldQuantity} />)}</div>
      </section>) : null}

      {(storefrontSettings?.collection_enabled ?? true) ? (<section className="store-collection-banner" id="colecao-banner" style={storefrontSettings?.collection_image_url ? { backgroundImage: `linear-gradient(90deg, rgba(42,36,31,.88), rgba(42,36,31,.25)), url(${storefrontSettings.collection_image_url})` } : undefined}>
        <div className="store-collection-copy"><p className="store-kicker">COLEÇÃO VIOLETTA</p><h2>{storefrontSettings?.collection_title || "Uma coleção para guardar."}</h2><p>{storefrontSettings?.collection_subtitle || "Detalhes delicados para acompanhar você em todos os momentos."}</p><a href="#colecao" className="store-primary-cta">{storefrontSettings?.collection_cta || "Conhecer coleção"} <ArrowRight size={16}/></a></div>
        {!storefrontSettings?.collection_image_url && <div className="collection-art"><Gem size={88} strokeWidth={1}/></div>}
      </section>) : null}

      <section className="store-catalog" id="colecao">
        <div className="store-section-heading catalog-heading"><div><p className="store-kicker">A COLEÇÃO</p><h2>Encontre o seu brilho.</h2><p className="catalog-intro">Explore joias, semi-joias e acessórios escolhidos para você.</p></div><span>{filtered.length} peças</span></div>
        <div className="catalog-toolbar">
          <div className="catalog-search"><Search size={17} /><input aria-label="Buscar produtos" placeholder="Buscar uma peça..." value={query} onChange={event => setQuery(event.target.value)} /><button className="catalog-clear" onClick={() => setQuery("")} aria-label="Limpar busca" disabled={!query}><X size={14}/></button></div>
          {(query || category !== "Todas") && <button className="catalog-clear-filters" onClick={() => { setQuery(""); setCategory("Todas"); }}>Limpar filtros</button>}<div className="catalog-toolbar-row"><div className="category-list">{categories.map(item => <button className={category === item ? "selected" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><span className="catalog-result-count">{filtered.length} {filtered.length === 1 ? "peça encontrada" : "peças encontradas"}</span></div>
        </div>
        {filtered.length ? <div className="store-product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onAdd={addToCart} onBuyNow={buyNow} onAsk={askAbout} onOpen={openProduct} />)}</div> : <div className="empty-catalog"><Gem size={28} /><h3>Nenhuma peça encontrada.</h3><p>Tente outro termo ou volte para todas as categorias.</p><button onClick={() => { setQuery(""); setCategory("Todas"); }}>Limpar busca</button></div>}
      </section>
    </main>

    <footer className="store-footer" id="contato"><div className="footer-brand"><img className="footer-logo-image" src={logoSrc} alt="Violetta Prata 925 e Semijoias" /><div><strong>Violetta</strong><small>PRATA 925 · SEMIJOIAS</small></div></div><div><p className="store-kicker">ATENDIMENTO</p><h3>Uma peça especial começa<br />com uma conversa.</h3><p className="footer-note">Compre online ou fale diretamente com a nossa equipe.</p></div><div className="footer-links"><a href="#colecao">Coleção <ArrowRight size={14} /></a><a href="/" >Área da proprietária <ArrowRight size={14} /></a>{storeInstagram ? <a href={storeInstagram} target="_blank" rel="noreferrer"><Instagram size={14} /> Instagram</a> : null}</div><div className="footer-bottom"><span>© {new Date().getFullYear()} Violetta Joias</span><span>Feito para brilhar.</span></div></footer>
  </div>;
}

function ProductCard({ product, onAdd, onBuyNow, onAsk, onOpen, featured = false, isTopSeller = false }: { product: CatalogProduct; onAdd: (product: CatalogProduct) => void; onBuyNow: (product: CatalogProduct) => void; onAsk: (product: CatalogProduct) => void; onOpen: (product: CatalogProduct) => void; featured?: boolean; isTopSeller?: boolean }) {
  const badges = product.isBestSeller || isTopSeller ? ["MAIS VENDIDO"] : product.isNew ? ["NOVO"] : product.stock !== undefined && product.stock > 0 && product.stock <= 3 ? ["ÚLTIMAS UNIDADES"] : [];
  return <article className={featured ? "store-product-card featured-card" : "store-product-card"} onClick={() => onOpen(product)}>
    <button className="store-product-art" onClick={() => onOpen(product)} aria-label={`Ver ${product.name}`} style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}>
      {!product.imageUrl && <div className="product-art-glow"><Gem size={featured ? 39 : 31} strokeWidth={1.1} /></div>}
      {badges.length > 0 && <span className="product-badge">{badges[0]}</span>}
      <span className="product-category-tag">{featured ? "DESTAQUE" : product.category}</span>
      <span className="product-quick-view"><Search size={14}/> Ver detalhes</span>
    </button>
    <div className="store-product-info">
      <p className="product-material">{product.material}</p>
      <h3>{product.name}</h3>
      <div className="store-product-bottom">
        <strong>{formatMoney(product.price)}</strong>
        {Number(product.stock ?? 0) > 0 && Number(product.stock ?? 0) <= 3 && <small className="product-low-stock">Últimas unidades</small>}
        <div className="product-actions" onClick={event => event.stopPropagation()}>
          <button className="product-interest" onClick={() => onAsk(product)} aria-label={`Tenho interesse em ${product.name} pelo WhatsApp`}><MessageCircle size={15} /><span>WhatsApp</span></button>
          <button className="product-add-cart" onClick={() => onAdd(product)} disabled={Number(product.stock ?? 0) <= 0}>{Number(product.stock ?? 0) > 0 ? "Adicionar ao carrinho" : "Esgotado"}</button>
          <button className="product-buy-now" onClick={() => onBuyNow(product)} disabled={Number(product.stock ?? 0) <= 0}>{Number(product.stock ?? 0) > 0 ? "Comprar agora" : "Indisponível"}</button>
        </div>
      </div>
    </div>
  </article>;
}

function ProductDetail({ product, relatedProducts, onBack, onAdd, onBuyNow, onCheckout, onCart, onRelatedOpen, onRelatedAdd, onRelatedBuyNow, onRelatedAsk }: { product: CatalogProduct; relatedProducts: CatalogProduct[]; onBack: () => void; onAdd: (quantity: number) => void; onBuyNow: (quantity: number) => void; onCheckout: () => void; onCart: () => void; onRelatedOpen: (product: CatalogProduct) => void; onRelatedAdd: (product: CatalogProduct) => void; onRelatedBuyNow: (product: CatalogProduct) => void; onRelatedAsk: (product: CatalogProduct) => void }) {
  const available = Number(product.stock ?? 0) > 0;
  const maxQuantity = Math.max(1, Number(product.stock ?? 0));
  const [quantity, setQuantity] = useState(1);
  const adjustQuantity = (delta: number) => setQuantity(current => Math.min(maxQuantity, Math.max(1, current + delta)));
  return <div className="storefront checkout-page">
    <header className="store-header"><button className="checkout-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button><a className="store-logo" href="/loja" onClick={event => { event.preventDefault(); onBack(); }}><img className="store-logo-image" src={logoSrc} alt="Violetta Prata 925 e Semijoias" /><span><strong>Violetta</strong><small>PRATA 925 · SEMIJOIAS</small></span></a><button className="store-cart-button" onClick={onCart} aria-label="Abrir carrinho"><ShoppingBag size={18}/></button></header>
    <div className="product-detail-promo"><span>VIOLETTA JOIAS E SEMIJOIAS</span><b>Detalhes escolhidos para acompanhar seus momentos.</b></div>
    <main className="product-detail-page">
      <div className="product-detail-image-wrap">
        <button className="product-detail-back" onClick={onBack}><ArrowLeft size={15}/> Voltar para a coleção</button>
        <div className="product-detail-image" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}>{!product.imageUrl && <Gem size={80} strokeWidth={1}/>}<span className="product-detail-category">{product.category}</span></div>
      </div>
      <div className="product-detail-copy">
        <p className="store-kicker">{product.category}</p><p className="product-material">{product.material}</p><h1>{product.name}</h1>
        <strong className="product-detail-price">{formatMoney(product.price)}</strong><span className="product-installment-note">Parcelamento e opções de pagamento disponíveis no Mercado Pago</span><span className="product-detail-payment-note"><ShieldCheck size={14}/> Pagamento seguro pelo Mercado Pago</span><span className={available ? "product-stock-note" : "product-stock-note sold-out"}>{available ? (Number(product.stock) <= 3 ? "Últimas unidades disponíveis" : "Disponível para envio") : "Produto temporariamente esgotado"}</span>
        <p className="product-detail-description">{product.description || "Uma peça escolhida para trazer delicadeza, presença e brilho aos seus momentos."}</p>
        <div className="product-detail-meta">
          <div><Gem size={17}/><span><b>Material</b><small>{product.material}</small></span></div>
          <div><Check size={17}/><span><b>Disponibilidade</b><small>{Number(product.stock ?? 0) > 0 ? "Em estoque" : "Esgotado"}</small></span></div>
        </div>
        <div className="product-detail-quantity" aria-label="Quantidade">
          <span>Quantidade</span>
          <div className="qty-controls">
            <button type="button" onClick={() => adjustQuantity(-1)} disabled={!available || quantity <= 1} aria-label="Diminuir quantidade">−</button>
            <strong>{quantity}</strong>
            <button type="button" onClick={() => adjustQuantity(1)} disabled={!available || quantity >= maxQuantity} aria-label="Aumentar quantidade">+</button>
          </div>
        </div>
        <div className="product-detail-actions"><div className="product-detail-buy-actions"><button className="product-detail-add" onClick={() => onAdd(quantity)} disabled={Number(product.stock ?? 0) <= 0}>{Number(product.stock ?? 0) > 0 ? "Adicionar ao carrinho" : "Produto esgotado"}</button><button className="product-detail-buy-now" onClick={() => onBuyNow(quantity)} disabled={Number(product.stock ?? 0) <= 0}>{Number(product.stock ?? 0) > 0 ? "Comprar agora" : "Indisponível"}</button></div><button className="product-detail-whatsapp" onClick={() => { if (!storeWhatsApp) return; const text = encodeURIComponent(`Olá! Tenho interesse em ${product.name} (${formatMoney(product.price)}).`); window.open(`https://wa.me/${storeWhatsApp}?text=${text}`, "_blank", "noopener,noreferrer"); }} disabled={!storeWhatsApp}>Tenho interesse <ArrowRight size={15}/></button></div>
        <div className="product-detail-benefits"><span><ShieldCheck size={15}/> Compra segura</span><span><Truck size={15}/> Envio calculado no checkout</span></div><button className="store-primary-cta" onClick={onCart}>Ver carrinho <ArrowRight size={16}/></button>
        <p className="product-detail-note">Pagamento online processado pelo Mercado Pago. Consulte as opções de entrega no checkout.</p>
      </div>
    </main>
    <ProductReviews productId={Number(product.id)} />
    {relatedProducts.length > 0 && <section className="product-related-section"><div className="product-detail-section-heading"><div><p className="store-kicker">VOCÊ TAMBÉM PODE GOSTAR</p><h2>Produtos relacionados</h2><p>Mais peças da categoria {product.category} para completar sua escolha.</p></div><button className="store-text-link product-related-back" onClick={onBack}>Ver toda a coleção <ArrowRight size={14} /></button></div><div className="store-product-grid product-related-grid">{relatedProducts.map(related => <ProductCard key={related.id} product={related} onAdd={onRelatedAdd} onBuyNow={onRelatedBuyNow} onAsk={onRelatedAsk} onOpen={onRelatedOpen} />)}</div></section>}
  </div>;
}

function ProductReviews({ productId }: { productId: number }) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  useEffect(() => {
    if (!supabase || !Number.isFinite(productId)) return;
    supabase.from("product_reviews").select("id,product_id,rating,comment,display_name,created_at").eq("product_id", productId).eq("status", "PUBLISHED").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setReviews((data || []) as ProductReview[]));
  }, [productId]);
  const average = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : 0;
  return <section className="product-detail-social-proof">
    <div className="product-detail-section-heading"><div><p className="store-kicker">EXPERIÊNCIAS VIOLETTA</p><h2>Avaliações de clientes</h2><p>{reviews.length ? `${average.toFixed(1).replace(".", ",")} de 5 · ${reviews.length} avaliação${reviews.length === 1 ? "" : "s"} verificadas` : "Ainda não há avaliações publicadas para esta peça."}</p></div></div>
    {reviews.length ? <div className="product-review-grid">{reviews.map(review => <article className="product-review-card" key={review.id}><div className="product-review-stars">{[1,2,3,4,5].map(star => <Star key={star} size={15} fill={star <= Number(review.rating) ? "currentColor" : "none"} />)}</div><strong>{review.display_name}</strong><p>{review.comment || "Cliente avaliou esta peça."}</p><small>Compra verificada · {new Date(review.created_at).toLocaleDateString("pt-BR")}</small></article>)}</div> : <div className="product-review-grid"><article className="product-review-card product-review-empty"><MessageCircle size={22}/><strong>Seja a primeira a avaliar</strong><p>As avaliações são liberadas somente para clientes que receberam o pedido.</p></article></div>}
  </section>;
}

function Checkout({ cart, subtotal, draft, onDraftChange, onBack, onFinish, onChangeQty, storefrontSettings }: { cart: CartItem[]; subtotal: number; draft: { customer: Customer; shipping: Shipping; couponCode: string }; onDraftChange: Dispatch<SetStateAction<{ customer: Customer; shipping: Shipping; couponCode: string }>>; onBack: () => void; onFinish: (customer: Customer, shipping: Shipping, couponCode?: string) => Promise<void>; onChangeQty: (id: CatalogProduct["id"], delta: number) => void; storefrontSettings: StorefrontSettings | null }) {
  const [customer, setCustomer] = useState<Customer>(draft.customer);
  const [shipping, setShipping] = useState<Shipping>(draft.shipping);
  const [busy, setBusy] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [couponCode, setCouponCode] = useState(draft.couponCode || (() => { try { return localStorage.getItem("kj-first-purchase-coupon") || ""; } catch { return ""; } })());
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0); const [couponApplied, setCouponApplied] = useState(false); const [couponGiftDescription, setCouponGiftDescription] = useState("");
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      setCustomer(current => ({
        ...current,
        email: current.email || user.email || "",
        name: current.name || String(user.user_metadata?.full_name || ""),
        phone: current.phone || String(user.user_metadata?.phone || ""),
      }));
    });
  }, []);
  const [distanceKmValue, setDistanceKmValue] = useState<number|null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState("");
  useEffect(() => { onDraftChange(v => ({ ...v, customer, shipping, couponCode })); }, [customer, shipping, couponCode, onDraftChange]);
  const cartSignature = cart.map(item => item.id + ":" + item.quantity).sort().join("|");
  useEffect(() => { setCouponDiscount(0); setCouponError(""); setCouponApplied(false); setCouponGiftDescription(""); }, [cartSignature]);
  const updateCustomer = (field: keyof Customer, value: string) => setCustomer(v => ({ ...v, [field]: value }));
  const updateShipping = (field: keyof Shipping, value: string) => setShipping(v => ({ ...v, [field]: value }));
  const fetchZip = async (value: string) => {
    const postal_code = value.replace(/\D/g, "").slice(0, 8);
    updateShipping("postal_code", postal_code);
    if (postal_code.length !== 8) return;
    setZipLoading(true);
    try {
      const response = await fetch("https://viacep.com.br/ws/" + postal_code + "/json/");
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado");
      setShipping(v => ({ ...v, postal_code, address: data.logradouro || v.address, neighborhood: data.bairro || v.neighborhood, city: data.localidade || v.city, state: data.uf || v.state }));
    } catch { toast.error("Não foi possível localizar o CEP"); }
    finally { setZipLoading(false); }
  };
  const isPalmas = shipping.city.trim().toLowerCase() === "palmas" && shipping.state.trim().toUpperCase() === "TO";
  useEffect(() => {
    let cancelled=false;
    const calculate=async()=>{
      if(!isPalmas || !shipping.postal_code || !storefrontSettings?.shipping_palmas_enabled){ setDistanceKmValue(null); setDistanceError(""); return; }
      setDistanceLoading(true); setDistanceError("");
      try{
        const origin=await geocodePostalCode(storefrontSettings.shipping_origin_postal_code);
        const destination=await geocodePostalCode(shipping.postal_code);
        const km=distanceKm(origin,destination);
        if(!cancelled)setDistanceKmValue(Number(km.toFixed(1)));
      }catch(error){if(!cancelled){setDistanceKmValue(null);setDistanceError(error instanceof Error?error.message:"Não foi possível calcular a distância");}}
      finally{if(!cancelled)setDistanceLoading(false);}
    };
    calculate();
    return()=>{cancelled=true;};
  },[isPalmas,shipping.postal_code,storefrontSettings?.shipping_palmas_enabled,storefrontSettings?.shipping_origin_postal_code]);
  const matchingRule=distanceKmValue===null?null:(storefrontSettings?.shipping_palmas_distance_rules||[]).find((rule,index,rules)=>{const max=rule.max_km===null?null:Number(rule.max_km);const isLast=index===rules.length-1;return distanceKmValue>=Number(rule.min_km)&&(max!==null&&(isLast?distanceKmValue<=max:distanceKmValue<max));});
  const shippingOptions: ShippingOption[] = shipping.city.trim() ? (isPalmas ? [
    ...(storefrontSettings?.shipping_palmas_enabled&&matchingRule ? [{id:"palmas-distance-"+matchingRule.min_km+"-"+(matchingRule.max_km??"plus"),company:"Violetta",service:"Entrega em Palmas · "+distanceKmValue!.toFixed(1)+" km",price:Number(matchingRule.price),delivery_time:0}] : []),
    ...(storefrontSettings?.shipping_palmas_pickup_enabled ? [{id:"violetta-pickup",company:"Violetta",service:"Retirada no local",price:0,delivery_time:0}] : []),
    ...(!storefrontSettings?.shipping_palmas_enabled ? [{id:"palmas-combine",company:"Violetta",service:"Frete a combinar",price:0,delivery_time:0}] : []),
  ] : [{id:"outside-palmas",company:"Violetta",service:"Frete a combinar",price:0,delivery_time:0}]) : [];
  const shippingOption: ShippingOption | null = shippingOptions.find(option => String(option.id) === String(shipping.shipping_option?.id)) || shippingOptions[0] || null;
  const shippingPrice=shippingOption?.price||0;
  const beyondDeliveryRadius=isPalmas&&distanceKmValue!==null&&distanceKmValue>20;
  const orderTotal=Math.max(0,subtotal-couponDiscount+shippingPrice);
  const pickupSelected = shippingOption?.service === "Retirada no local";
  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return toast.error("Informe o código do cupom");
    if (!supabase) return toast.error("A loja ainda não está conectada ao Supabase.");
    setCouponBusy(true); setCouponError("");
    try {
      const { data, error } = await supabase.functions.invoke("validate-coupon", { body: { code, items: cart.map(item => ({ product_id: Number(item.id), quantity: item.quantity })), shipping_amount: shippingPrice } });
      if (error || !data?.valid) throw new Error(data?.error || error?.message || "Cupom inválido");
      setCouponDiscount(Number(data.discount_amount) || 0); setCouponCode(data.code || code); setCouponApplied(true); setCouponGiftDescription(data.gift_description || "");
      toast.success("Cupom aplicado", { description: data.discount_type === "GIFT" ? (data.gift_description || "Brinde de primeira compra") : data.discount_type === "FREIGHT" ? "Frete grátis" : "Desconto de " + formatMoney(Number(data.discount_amount) || 0) });
    } catch (e) { setCouponDiscount(0); setCouponApplied(false); setCouponGiftDescription(""); setCouponError(e instanceof Error ? e.message : "Cupom inválido"); toast.error("Cupom não aplicado", { description: e instanceof Error ? e.message : "Verifique o código" }); }
    finally { setCouponBusy(false); }
  };
  useEffect(() => { if (couponCode) void applyCoupon(); }, [shippingPrice]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) return toast.error("Seu carrinho está vazio");
    if (!customer.name.trim()) return toast.error("Informe seu nome completo");
    if (!/^\S+@\S+\.\S+$/.test(customer.email.trim())) return toast.error("Informe um e-mail válido");
    const phone = normalizePhone(customer.phone);
    if (phone.length < 10 || phone.length > 11) return toast.error("Informe um WhatsApp válido com DDD");
    if (!isValidCPF(customer.recipient_code)) return toast.error("Informe um CPF válido");
    const postalCode = shipping.postal_code.replace(/\D/g, "");
    if (postalCode.length !== 8) return toast.error("Informe um CEP válido");
    if (!pickupSelected && (!shipping.address.trim() || !shipping.number.trim() || !shipping.neighborhood.trim())) return toast.error("Complete o endereço para entrega");
    if (!shipping.city.trim() || shipping.state.trim().length !== 2) return toast.error("Confira cidade e UF");
    if (!shippingOption) return toast.error("Informe sua cidade para definir a modalidade de entrega");
    setBusy(true);
    try { await onFinish({ ...customer, name: customer.name.trim(), email: customer.email.trim().toLowerCase(), phone }, { ...shipping, postal_code: postalCode, state: shipping.state.trim().toUpperCase(), shipping_option: shippingOption }, couponApplied ? couponCode : ""); }
    finally { setBusy(false); }
  };
  return <div className="storefront checkout-page">
    <header className="store-header"><button className="checkout-back" onClick={onBack}><ArrowLeft size={16}/> Voltar para a loja</button><span className="store-logo"><span className="store-logo-mark"><Gem size={19}/></span><span><strong>Violetta</strong><small>PRATA 925 · SEMIJOIAS</small></span></span><span className="checkout-secure">Checkout seguro</span></header>
    <main className="checkout-layout"><form className="checkout-form" onSubmit={submit}>
      <div className="checkout-title"><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}><span className="payment-methods"><span>1. Dados</span><span>2. Entrega</span><span>3. Pagamento</span></span></div><p className="store-kicker">FINALIZAR PEDIDO</p><h1>Quase seu.</h1><p>Preencha seus dados para reservar as peças e gerar seu pedido. O endereço será usado para organizar a entrega.</p></div>
      <section className="checkout-section"><h2><User size={17}/> Seus dados</h2><div className="checkout-grid"><label>Nome completo<input required autoComplete="name" value={customer.name} onChange={e=>updateCustomer("name",e.target.value)}/></label><label>E-mail<input required type="email" autoComplete="email" value={customer.email} onChange={e=>updateCustomer("email",e.target.value)}/></label><label>WhatsApp<input required autoComplete="tel" value={customer.phone} onChange={e=>updateCustomer("phone",formatPhone(e.target.value))}/></label><label>CPF<input required inputMode="numeric" maxLength={14} value={customer.recipient_code} onChange={e=>updateCustomer("recipient_code",formatCPF(e.target.value))} placeholder="000.000.000-00"/></label></div></section>
      <section className="checkout-section"><h2><Truck size={17}/> Entrega</h2><div className="checkout-grid"><label>CEP<input required inputMode="numeric" value={shipping.postal_code} onChange={e=>fetchZip(e.target.value)} placeholder="00000-000"/>{zipLoading&&<small>Consultando CEP...</small>}</label><label className="wide">Endereço<input required={!pickupSelected} value={shipping.address} onChange={e=>updateShipping("address",e.target.value)}/></label><label>Número<input required={!pickupSelected} value={shipping.number} onChange={e=>updateShipping("number",e.target.value)}/></label><label>Complemento<input value={shipping.complement} onChange={e=>updateShipping("complement",e.target.value)}/></label><label>Bairro<input required={!pickupSelected} value={shipping.neighborhood} onChange={e=>updateShipping("neighborhood",e.target.value)}/></label><label>Cidade<input required value={shipping.city} onChange={e=>updateShipping("city",e.target.value)}/></label><label>UF<input required maxLength={2} value={shipping.state} onChange={e=>updateShipping("state",e.target.value.toUpperCase())}/></label></div>
        {isPalmas&&distanceLoading&&<div className="checkout-final-note"><Truck size={16}/><span>Calculando a distância para definir o frete…</span></div>}{isPalmas&&distanceError&&<div className="checkout-final-note"><Truck size={16}/><span>{distanceError}. Confira o CEP ou tente novamente.</span></div>}{beyondDeliveryRadius&&<div className="checkout-final-note"><Truck size={16}/><span>Este endereço está a {distanceKmValue.toFixed(1)} km da loja. No momento, entregamos em Palmas somente até 20 km. A retirada no local continua disponível.</span></div>}{shippingOptions.length>0&&<div className="shipping-options">{shippingOptions.map(option=><label className={"shipping-option "+(shippingOption?.id===option.id?"selected":"")} key={String(option.id)}><input type="radio" name="shipping-option" checked={shippingOption?.id===option.id} onChange={()=>setShipping(v=>({...v,shipping_option:option}))}/><span><strong>{option.company} · {option.service}</strong><small>{option.service === "Retirada no local" ? "Retire seu pedido no endereço da Violetta, sem cobrança de frete." : isPalmas && option.service !== "Frete a combinar" ? "Frete calculado pela distância entre o CEP da loja e o seu endereço." : "Para este endereço, o frete será negociado separadamente com a loja."}</small></span><b>{option.service === "Frete a combinar" ? "À parte" : option.price > 0 ? formatMoney(option.price) : "Grátis"}</b></label>)}</div>}
        {!shippingOption&&!isPalmas&&<div className="checkout-final-note"><Truck size={16}/><span>Informe cidade e UF para visualizar como o frete será tratado.</span></div>}
      </section>
      <section className="checkout-section"><h2><Tag size={17}/> Cupom de desconto</h2><div className="checkout-grid"><label className="wide">Código do cupom<input value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setCouponDiscount(0);setCouponError("")}} placeholder="EX.: BEMVINDO10"/></label><button type="button" className="shipping-quote-button" onClick={applyCoupon} disabled={couponBusy}>{couponBusy?"Validando...":"Aplicar cupom"}</button></div>{couponError&&<small>{couponError}</small>}{couponApplied&&<small>Cupom aplicado: {couponGiftDescription || (couponDiscount>0 ? "desconto de "+formatMoney(couponDiscount) : "benefício de primeira compra")}</small>}</section>
      <section className="checkout-section"><h2><ShieldCheck size={17}/> Pagamento</h2><div className="payment-placeholder"><ShoppingBag size={18}/><div><strong>Pagamento seguro pelo Mercado Pago</strong><p>Ao confirmar o pedido, você será direcionada ao Mercado Pago. O frete negociado separadamente não entra neste pagamento.</p><div className="payment-methods"><span>PIX</span><span>Cartão</span><span>Ambiente seguro</span></div></div></div></section>
      <div className="checkout-final-note"><ShieldCheck size={16}/><span>{shippingOption?.service === "Retirada no local" ? "Retirada no local sem cobrança de frete." : isPalmas&&shippingOption ? "Frete de "+formatMoney(shippingPrice)+" calculado automaticamente pela distância." : "Para entregas fora de Palmas, o frete será acertado separadamente com a loja."}</span></div>
      <button className="checkout-submit" disabled={busy||!cart.length||!shippingOption}>{busy?"Criando pedido...":"Confirmar pedido e pagar"}</button>
    </form>
    <aside className="checkout-summary"><div className="checkout-summary-head"><div><p className="store-kicker">RESUMO</p><h2>Seu pedido</h2></div><span>{cart.reduce((sum,item)=>sum+item.quantity,0)} itens</span></div>{cart.map(item=><div className="checkout-item" key={item.id}><div className="checkout-item-thumb" style={item.imageUrl?{backgroundImage:"url("+item.imageUrl+")"}:undefined}>{!item.imageUrl&&<Gem size={18}/>}</div><div className="checkout-item-main"><strong>{item.name}</strong><span>{item.quantity} × {formatMoney(item.price)}</span><div className="qty-controls"><button type="button" onClick={()=>onChangeQty(item.id,-1)}>−</button><span>{item.quantity}</span><button type="button" onClick={()=>onChangeQty(item.id,1)}>+</button></div></div><b>{formatMoney(item.price*item.quantity)}</b></div>)}<div className="checkout-total"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div><div className="checkout-total"><span>Frete</span><strong>{shippingOption?.service === "Retirada no local" || shippingOption?.service === "Frete a combinar" ? "À parte" : shippingOption ? formatMoney(shippingOption.price) : "À parte"}</strong></div>{couponDiscount>0&&<div className="checkout-total"><span>Desconto</span><strong>- {formatMoney(couponDiscount)}</strong></div>}<div className="checkout-total grand"><span>Total no Mercado Pago</span><strong>{formatMoney(orderTotal)}</strong></div><p className="checkout-note">{shippingOption?.service === "Retirada no local" ? "O Mercado Pago cobrará somente os produtos menos o desconto. A retirada não tem custo de frete." : shippingOption?.price ? "O Mercado Pago cobrará os produtos, desconto e frete calculado para Palmas." : "O Mercado Pago cobrará somente os produtos menos o desconto. O frete, quando aplicável, será combinado e pago separadamente."}</p></aside>
    </main></div>;
}

function OrderSuccess({ order, onStore, onPay, onTrack, onReview, paymentLoading, trackingLoading }: { order: { order_number: string; total_amount: number; payment_status?: string; status?: string; shipment?: { carrier?: string | null; service?: string | null; tracking_code?: string | null; tracking_url?: string | null; shipping_status?: string | null } | null; items?: Array<{ id:string; product_id:number; product_name:string; quantity:number; unit_price:number; total_price:number }>; reviews?: Array<{ order_item_id:string; status:string }> }; onStore: () => void; onPay: () => void; onTrack: () => void; onReview: (orderItemId: string, rating: number, comment: string) => Promise<void>; paymentLoading: boolean; trackingLoading: boolean }) {
  const steps = [["PENDING_PAYMENT","Pedido recebido"],["PAID","Pagamento confirmado"],["PROCESSING","Preparando pedido"],["READY_TO_SHIP","Pronto para envio"],["SHIPPED","Pedido enviado"],["DELIVERED","Entregue"]] as const;
  const terminal = order.status === "CANCELLED" || order.status === "REFUNDED";
  const statusIndex = terminal ? -1 : Math.max(0, steps.findIndex(([status]) => status === order.status));
  const paymentLabels: Record<string,string> = { PAID:"Pagamento confirmado", APPROVED:"Pagamento confirmado", PENDING:"Pagamento pendente", IN_PROCESS:"Pagamento em análise", REFUNDED:"Pagamento reembolsado", FAILED:"Pagamento recusado", REJECTED:"Pagamento recusado" };
  const statusLabels: Record<string,string> = { PENDING_PAYMENT:"Aguardando pagamento", PAID:"Pagamento confirmado", PROCESSING:"Em preparação", READY_TO_SHIP:"Pronto para envio", SHIPPED:"Enviado", DELIVERED:"Entregue", CANCELLED:"Pedido cancelado", REFUNDED:"Pedido reembolsado" };
  const [reviewDrafts, setReviewDrafts] = useState<Record<string,{rating:number;comment:string;busy:boolean}>>({});
  const copyOrder = async () => { try { await navigator.clipboard.writeText(order.order_number); toast.success("Número do pedido copiado"); } catch { toast.error("Não foi possível copiar"); } };
  const submit = async (itemId:string) => {
    const draft=reviewDrafts[itemId] || {rating:0,comment:"",busy:false};
    if(!draft.rating) return toast.error("Escolha uma nota de 1 a 5 estrelas.");
    setReviewDrafts(v=>({...v,[itemId]:{...draft,busy:true}}));
    try { await onReview(itemId,draft.rating,draft.comment); toast.success("Avaliação enviada",{description:"Ela ficará visível após a aprovação da loja."}); setReviewDrafts(v=>({...v,[itemId]:{...draft,busy:false}})); }
    catch(error){ setReviewDrafts(v=>({...v,[itemId]:{...draft,busy:false}})); toast.error("Não foi possível enviar",{description:error instanceof Error?error.message:"Tente novamente."}); }
  };
  return <div className="storefront success-page"><main className="success-card">
    <div className="success-icon">{terminal?<X size={30}/>:<Check size={30}/>}</div><p className="store-kicker">ACOMPANHAMENTO DO PEDIDO</p><h1>Pedido {order.order_number}</h1>
    <div className="success-order-actions"><button type="button" className="shipping-quote-button" onClick={copyOrder}>Copiar número do pedido</button><button type="button" className="shipping-quote-button" onClick={onTrack} disabled={trackingLoading}>{trackingLoading?"Atualizando...":"Atualizar agora"}</button></div>
    <p>{terminal?(statusLabels[order.status||""]||"Pedido encerrado."):(paymentLabels[order.payment_status||""]||"Pedido recebido. Acompanhe a atualização abaixo.")}</p>
    <div className="success-total">Total do pedido <strong>{formatMoney(Number(order.total_amount))}</strong></div>
    <div className="order-current-status"><span>Status do pedido</span><strong>{statusLabels[order.status||""]||order.status||"Recebido"}</strong><small>{paymentLabels[order.payment_status||""]||"Pagamento em processamento"}</small></div>
    {!terminal&&<div className="order-timeline">{steps.map(([status,label],index)=><div className={index<=statusIndex?"timeline-step done":"timeline-step"} key={status}><span>{index<statusIndex?"✓":index+1}</span><div><strong>{label}</strong><small>{index===statusIndex?"Status atual":index<statusIndex?"Concluído":"Aguardando"}</small></div></div>)}</div>}
    {order.shipment?.tracking_code&&<div className="shipping-tracking-card"><p className="store-kicker">RASTREAMENTO</p><h2>{order.status==="DELIVERED"?"Pedido entregue":"Seu pedido está a caminho"}</h2><p><strong>{order.shipment.carrier||"Transportadora"}</strong>{order.shipment.service?` · ${order.shipment.service}`:""}</p><div className="tracking-code"><span>Código de rastreio</span><strong>{order.shipment.tracking_code}</strong></div><button type="button" className="shipping-quote-button" onClick={async()=>{try{await navigator.clipboard.writeText(order.shipment?.tracking_code||"");toast.success("Código de rastreio copiado");}catch{toast.error("Não foi possível copiar");}}}>Copiar rastreio</button>{order.shipment.shipping_status&&<small>Status da entrega: {order.shipment.shipping_status}</small>}{order.shipment.tracking_url&&<a className="store-primary-cta" href={order.shipment.tracking_url} target="_blank" rel="noreferrer">Acompanhar entrega <ArrowRight size={16}/></a>}</div>}
    {order.status==="DELIVERED"&&order.items?.length&&<section className="order-review-section"><p className="store-kicker">COMPRA VERIFICADA</p><h2>Conte como foi sua experiência</h2><p>Você pode avaliar cada peça deste pedido. A avaliação só fica disponível depois da entrega.</p>{order.items.map(item=>{const existing=order.reviews?.find(review=>review.order_item_id===item.id);const draft=reviewDrafts[item.id]||{rating:0,comment:"",busy:false};return <article className="order-review-card" key={item.id}><strong>{item.product_name}</strong><span>{item.quantity} unidade{item.quantity===1?"":"s"}</span>{existing?<div className="review-submitted"><Check size={17}/>{existing.status==="PUBLISHED"?"Avaliação publicada.":"Avaliação enviada para aprovação."}</div>:<><div className="review-rating-picker">{[1,2,3,4,5].map(star=><button type="button" key={star} aria-label={`${star} estrela${star===1?"":"s"}`} onClick={()=>setReviewDrafts(v=>({...v,[item.id]:{...draft,rating:star}}))} disabled={draft.busy}><Star size={24} fill={star<=draft.rating?"currentColor":"none"}/></button>)}</div><textarea value={draft.comment} maxLength={1200} onChange={e=>setReviewDrafts(v=>({...v,[item.id]:{...draft,comment:e.target.value}}))} placeholder="Conte o que você achou da peça (opcional)" disabled={draft.busy}/><div className="review-form-footer"><small>{draft.comment.length}/1200</small><button type="button" className="store-primary-cta" onClick={()=>submit(item.id)} disabled={draft.busy}>{draft.busy?"Enviando...":"Enviar avaliação"}</button></div></>}</article>})}</section>}
    {!["PAID","APPROVED"].includes(String(order.payment_status||"").toUpperCase())&&order.status!=="CANCELLED"&&order.status!=="REFUNDED"&&<button className="checkout-submit" onClick={onPay} disabled={paymentLoading}>{paymentLoading?"Gerando pagamento...":"Continuar para pagamento"}</button>}
    <p className="order-refresh-hint">Você pode atualizar o status sempre que quiser para conferir as novidades do pedido.</p><button className="store-primary-cta" onClick={onStore}>Voltar para a loja <ArrowRight size={16}/></button>
  </main></div>;
}
