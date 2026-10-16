import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * URL canônica e fixa de produção da Violetta.
 *
 * Os redirects da área de gestão usam exclusivamente o domínio oficial,
 * evitando dependência de origem dinâmica ou ambiente local.
 */
export const PRODUCTION_SITE_URL = "https://violetta.com.br";
export const MANAGEMENT_LOGIN_URL = `${PRODUCTION_SITE_URL}/gestao/login`;
export const MANAGEMENT_URL = `${PRODUCTION_SITE_URL}/gestao`;
export const MANAGEMENT_RECOVERY_URL = `${PRODUCTION_SITE_URL}/gestao?type=recovery`;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Sessão exclusiva da gestão. Não consome callbacks de autenticação da conta
 * do cliente quando a URL atual é /minha-conta.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storageKey: "violetta-management-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !window.location.pathname.startsWith("/minha-conta"),
      },
    })
  : null;

/**
 * Cliente Supabase com armazenamento de sessão independente para clientes.
 * As permissões de gestão continuam sendo verificadas pelas memberships.
 */
export const customerSupabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storageKey: "violetta-customer-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: window.location.pathname.startsWith("/minha-conta"),
      },
    })
  : null;
