import postgres from 'postgres';

const dbUrl = 'postgresql://postgres:XKZgUb0wFG6SDXun@db.ldzutiojmcawhwdhojlo.supabase.co:5432/postgres';

const sql = postgres(dbUrl, { prepare: false, max: 1, connect_timeout: 10 });

try {
  const result = await sql`select 1 as ok`;
  console.log('CONEXAO OK:', result);
} catch (err) {
  console.error('FALHOU:', err.message);
} finally {
  await sql.end();
}