export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

type PublicEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

export function readSupabaseConfig(
  environment: PublicEnvironment,
): SupabasePublicConfig | null {
  const url = environment.VITE_SUPABASE_URL?.trim();
  const anonKey = environment.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}
