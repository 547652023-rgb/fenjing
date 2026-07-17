import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { App } from "./App";
import { createSupabaseGateway } from "./data/supabaseGateway";
import { readSupabaseConfig } from "./lib/supabase";
import "./styles.css";

const config = readSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
const gateway = config
  ? createSupabaseGateway(createClient(config.url, config.anonKey))
  : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App gateway={gateway} />
  </StrictMode>,
);
