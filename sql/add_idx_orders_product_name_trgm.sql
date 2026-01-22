CREATE INDEX IF NOT EXISTS idx_orders_product_name_trgm
ON public.orders
USING gin (product_name gin_trgm_ops);
