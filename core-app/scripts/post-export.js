const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
const indexHtmlPath = path.join(distDir, 'index.html');

if (fs.existsSync(indexHtmlPath)) {
  const routes = ['painel_coord', 'meus_relatorios', 'coord', 'ver_relatorio', 'cadastro'];

  routes.forEach((route) => {
    // 1. Arquivo plano: dist/painel_coord.html
    const routeHtmlPath = path.join(distDir, `${route}.html`);
    fs.copyFileSync(indexHtmlPath, routeHtmlPath);

    // 2. Diretório com index: dist/painel_coord/index.html
    const routeDir = path.join(distDir, route);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.copyFileSync(indexHtmlPath, path.join(routeDir, 'index.html'));
  });

  // 3. Fallback global 404 para SPAs em Vercel, Netlify, GitHub Pages, etc.
  const fallback404 = path.join(distDir, '404.html');
  fs.copyFileSync(indexHtmlPath, fallback404);

  console.log('[post-export] Rotas estáticas e 404.html SPA criados com sucesso para:', routes.join(', '));
} else {
  console.warn('[post-export] index.html não encontrado em:', indexHtmlPath);
}
