import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // O socket do realtime entra com a chave ANÔNIMA por padrão — canais de
  // tabelas com RLS "authenticated" ficam mudos sem erro. Aplica o JWT do
  // usuário assim que a sessão carrega (corrida clássica do @supabase/ssr).
  client.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) client.realtime.setAuth(token);
  });
  return client;
}
