import postgres from "https://deno.land/x/postgresjs/mod.js";

const poolerUrl = "postgresql://edge_worker.ldzutiojmcawhwdhojlo:SenhaForte123@aws-1-us-west-1.pooler.supabase.com:6543/postgres";

export const sql = postgres(poolerUrl, {
  prepare: false,
  ssl: "require",
  max: 1
});
