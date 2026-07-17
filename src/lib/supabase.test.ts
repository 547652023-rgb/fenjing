import { readSupabaseConfig } from "./supabase";

it("returns null until both public Supabase settings exist", () => {
  expect(readSupabaseConfig({})).toBeNull();
  expect(readSupabaseConfig({ VITE_SUPABASE_URL: "https://example.supabase.co" })).toBeNull();
});

it("accepts only the public URL and anon key", () => {
  expect(
    readSupabaseConfig({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "public-key",
    }),
  ).toEqual({ url: "https://example.supabase.co", anonKey: "public-key" });
});
