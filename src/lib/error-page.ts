export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Algo deu errado</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 1.5rem;
  }
  .card {
    max-width: 28rem;
    width: 100%;
    text-align: center;
  }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; font-weight: 700; }
  p { margin: 0 0 1.5rem; color: #475569; font-size: .95rem; line-height: 1.5; }
  .actions { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
  button, a.btn {
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: .5rem; padding: .625rem 1rem;
    font-size: .875rem; font-weight: 500; cursor: pointer;
    text-decoration: none; border: 1px solid transparent; transition: opacity .15s;
  }
  button:hover, a.btn:hover { opacity: .9; }
  .primary { background: #0f172a; color: #fff; }
  .secondary { background: #fff; color: #0f172a; border-color: #cbd5e1; }
  .icon {
    width: 3.5rem; height: 3.5rem; border-radius: 9999px;
    background: #fee2e2; color: #b91c1c;
    display: inline-flex; align-items: center; justify-content: center;
    margin: 0 auto 1rem; font-size: 1.75rem; font-weight: 700;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">!</div>
    <h1>Algo deu errado</h1>
    <p>Ocorreu um erro inesperado ao carregar a página. Tente novamente em alguns instantes.</p>
    <div class="actions">
      <button class="primary" onclick="location.reload()">Tentar novamente</button>
      <a class="btn secondary" href="/">Ir para o início</a>
    </div>
  </div>
</body>
</html>`;
}
