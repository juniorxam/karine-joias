-- Classificação adicional, sem alterar categorias ou produtos existentes.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text;
COMMENT ON COLUMN public.products.product_type IS 'Tipo da peça (Brincos, Colares etc.). Nulo para cadastros anteriores.';
