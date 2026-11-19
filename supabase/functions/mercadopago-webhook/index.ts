import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (_req: Request) => {
  return new Response(JSON.stringify({
    error: "PROVIDER_RETIRED",
    message: "Esta integração de pagamento foi desativada. A loja utiliza InfinitePay. Inicie um novo checkout pela loja."
  }), {
    status: 410,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
});
