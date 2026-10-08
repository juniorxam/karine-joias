import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * URL canônica de produção da Violetta.
 *
 * O fluxo da gestão NÃO deve depender de window.location.origin nem de
 * URLs de desenvolvimento. Mesmo que uma variável Vite seja configurada
 * incorretamente com localhost, a recuperação da gestão continua apontando
 * para o domínio oficial.
 */
export const PRODUCTION_SITE_URL = "https://violetta.com.br";
export const MANAGEMENT_LOGIN_URL = `${PRODUCTION_SITE_URL}/gestao/login`;
export const MANAGEMENT_URL = `${PRODUCTION_SITE_URL}/gestao`;
export const MANAGEMENT_RECOVERY_URL = `${PRODUCTION_SITE_URL}/gestao?type=recovery`;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
