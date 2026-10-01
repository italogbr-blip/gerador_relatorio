<?php
http_response_code(404);
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Página Não Encontrada - Coordenação</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
    <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex flex-col justify-between p-4">
    <header class="w-full flex justify-between items-center py-4 px-2 max-w-lg mx-auto">
        <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
                MMS
            </div>
            <span class="text-sm font-black tracking-widest uppercase text-slate-300">Coordenação</span>
        </div>
    </header>

    <main class="flex-1 flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
        <div class="w-20 h-20 bg-slate-800 border border-slate-700 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-2xl">
            🔍
        </div>
        <span class="text-xs font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 mb-3">Erro 404</span>
        <h1 class="text-2xl font-black text-white mb-2">Página Não Encontrada</h1>
        <p class="text-slate-400 text-xs leading-relaxed mb-8">
            A página ou caminho digitado não foi encontrado no Painel de Coordenação.
        </p>

        <a href="./" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-4 px-6 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>Voltar ao Painel Coordenação</span>
        </a>
    </main>

    <footer class="text-center text-[10px] text-slate-500 py-4 uppercase font-bold tracking-widest">
        MMS Tools &copy; <?php echo date('Y'); ?>
    </footer>
</body>
</html>
