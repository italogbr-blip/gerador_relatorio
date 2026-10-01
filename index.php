<?php
session_start();

// FORÇA LIMPEZA DE CACHE DO NAVEGADOR (Garante que sempre rodem a versão mais nova do código)
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

require 'mms_config.php';
// Verificação de sessão
$logado = isset($_SESSION['usuario_id']);
$nome_user = $_SESSION['username'] ?? '';
$nome_preposto = '';

// Função IP e Bloqueio
if (!function_exists('obterIPCliente')) {
    function obterIPCliente() {
        $headers = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 'HTTP_X_CLUSTER_CLIENT_IP', 'HTTP_FORWARDED_FOR', 'HTTP_FORWARDED', 'REMOTE_ADDR'];
        foreach ($headers as $h) {
            if (!empty($_SERVER[$h])) {
                $ip = explode(',', $_SERVER[$h])[0];
                return filter_var(trim($ip), FILTER_VALIDATE_IP) ?: $_SERVER['REMOTE_ADDR'];
            }
        }
        return $_SERVER['REMOTE_ADDR'] ?? 'Desconhecido';
    }
}
$ip_visitante = obterIPCliente();
try {
    $stmtB = $pdo->prepare("SELECT ip FROM ips_bloqueados WHERE ip = ?");
    $stmtB->execute([$ip_visitante]);
    if ($stmtB->fetch()) {
        die("<!DOCTYPE html><html><head><title>Acesso Bloqueado</title><meta name='viewport' content='width=device-width, initial-scale=1.0'></head><body style='background:#0f172a;color:white;text-align:center;padding:50px;font-family:sans-serif;'><h1>🚫 Acesso Bloqueado</h1><p>Seu acesso ao Gerador de Relatórios foi bloqueado pela coordenação.</p></body></html>");
    }

    $stmtIp = $pdo->prepare("SELECT ip FROM mms_acessos_gerador WHERE ip = ?");
    $stmtIp->execute([$ip_visitante]);
    if (!$stmtIp->fetch()) {
        $loc = 'Desconhecida';
        if ($ip_visitante !== '127.0.0.1' && $ip_visitante !== '::1' && strpos($ip_visitante, '192.168.') === false) {
            $ctx = stream_context_create(['http' => ['timeout' => 2]]);
            $json = @file_get_contents("http://ip-api.com/json/{$ip_visitante}?lang=pt-BR", false, $ctx);
            if ($json) {
                $d = json_decode($json, true);
                if (isset($d['status']) && $d['status'] === 'success') {
                    $loc = $d['city'] . ' - ' . $d['regionName'];
                }
            }
        }
        $pdo->prepare("INSERT INTO mms_acessos_gerador (ip, localizacao, total_acessos) VALUES (?, ?, 1)")->execute([$ip_visitante, $loc]);
    } else {
        $pdo->prepare("UPDATE mms_acessos_gerador SET ultimo_acesso = NOW(), total_acessos = total_acessos + 1 WHERE ip = ?")->execute([$ip_visitante]);
    }
} catch (\Throwable $e) {}

if ($logado) {
    try {
        $stmt_nome = $pdo->prepare("SELECT nome, username FROM usuarios WHERE id = ?");
        $stmt_nome->execute([$_SESSION['usuario_id']]);
        $row_nome = $stmt_nome->fetch();
        if ($row_nome) {
            $nome_preposto = !empty($row_nome['nome']) ? $row_nome['nome'] : $row_nome['username'];
        }
    } catch (Exception $e) {}
}

// Busca notificação ativa
$stmtPop = $pdo->query("SELECT * FROM notificacoes WHERE ativa = 1 ORDER BY id DESC LIMIT 1");
$notificacao = $stmtPop->fetch();
$notificacaoAtiva = null;

if ($notificacao) {
    $notif_id = $notificacao['id'];
    $deveMostrar = true;

    if ($logado) {
        // Se está LOGADO, ignoramos o localStorage e olhamos APENAS o Banco de Dados
        try {
            $stmtInt = $pdo->prepare("SELECT id FROM interacoes_popup WHERE notificacao_id = ? AND usuario_id = ? LIMIT 1");
            $stmtInt->execute([$notif_id, $_SESSION['usuario_id']]);
            if ($stmtInt->fetch()) {
                $deveMostrar = false; // Já deu feedback no banco
            }
        } catch (Exception $e) {}
    }

    if ($deveMostrar) {
        $notificacaoAtiva = $notificacao;
    }
}

// Buscar versão atual do banco
$versao_app = 'v1.2.3'; // Fallback padrão
try {
    $stmtV = $pdo->query("SELECT versao FROM mms_versao_app ORDER BY id DESC LIMIT 1");
    $vApp = $stmtV->fetchColumn();
    if ($vApp) {
        $versao_app = $vApp;
    }
} catch (\Throwable $e) {}

?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <!-- Meta tags PWA para esconder URL, barra do navegador e opções no WebApp -->
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="MMS Relatórios">
    <meta name="theme-color" content="#0f172a">
    <title>Gerador de Relatórios MMS</title>
    
    <!-- Cropper.js for image cropping -->
    <link href="css/cropper.min.css" rel="stylesheet">
    <script src="js/cropper.min.js"></script>
    
    <script>
        // Bloqueia o uso do botão direito do mouse
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });

        // Bloqueia teclas de atalho de desenvolvedor e inspeção
        document.onkeydown = function(e) {
            if (e.keyCode === 123) { // F12
                return false;
            }
            if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) { // Ctrl+Shift+I, J, C
                return false;
            }
            if (e.ctrlKey && e.keyCode === 85) { // Ctrl+U
                return false;
            }
        };

        // Lógica Global de Auto-Avanço e Validação de Minutos
        document.addEventListener('input', function(e) {
            const target = e.target;
            if (target.tagName === 'INPUT' && target.getAttribute('maxlength') === '2') {
                target.value = target.value.replace(/[^0-9]/g, '');
                const nextInput = target.nextElementSibling && target.nextElementSibling.nextElementSibling;
                const prevInput = target.previousElementSibling && target.previousElementSibling.previousElementSibling;
                const isHour = nextInput && nextInput.tagName === 'INPUT';
                const isMinute = prevInput && prevInput.tagName === 'INPUT';

                if (isMinute && target.value !== '') {
                    if (parseInt(target.value, 10) > 59) {
                        target.value = '59';
                    }
                }
                if (isHour && target.value.length === 2) {
                    nextInput.focus();
                }
            }
        }, true);
    </script>

    <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
    <script src="js/jspdf.umd.min.js?v=<?php echo time(); ?>"></script>
    <script src="js/html2canvas.min.js?v=<?php echo time(); ?>"></script>
    <script src="js/heic2any.min.js?v=<?php echo time(); ?>"></script>
    
    <!-- Sistema de Notificações In-App -->
    <link rel="stylesheet" href="../coord/assets/css/notifications.css?v=<?php echo time(); ?>">
    <script src="../coord/assets/js/notifications.js?v=<?php echo time(); ?>" defer></script>

    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>
        .font-modern { font-family: 'Inter', sans-serif !important; }

        /* RESET BÁSICO E TRAVA CONTRA ROLAGEM HORIZONTAL */
        html, body { 
            margin: 0; 
            background-color: #0f172a; 
            font-family: "Times New Roman", Times, serif !important; 
            overflow-x: hidden; 
            touch-action: pan-y; 
            min-height: 100vh;
        }

        /* Ocultar barra de rolagem nos textareas, mantendo a função */
        textarea::-webkit-scrollbar, div[contenteditable]::-webkit-scrollbar { width: 6px; }
        textarea::-webkit-scrollbar-thumb, div[contenteditable]::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }

        /* Estilização para o ContentEditable funcionar como Placeholder */
        #in-info { cursor: text; }
        #in-info[contenteditable]:empty:before {
            content: attr(data-placeholder);
            color: #94a3b8;
            pointer-events: none;
            display: block;
        }

        /* TRAVA DE ERRO */
        .erro-validacao {
            border-color: #f43f5e !important;
            background-color: #fff1f2 !important;
            border-width: 2px !important;
        }

        /* CLASSES DO VER_RELATORIO.PHP PARA O PREVIEW */
        .page-a4 {
            width: 210mm; min-height: 297mm; background: white; margin: 0 auto 0 auto;
            padding: 30mm 15mm 18mm 15mm; position: relative; box-sizing: border-box;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
            font-family: 'Times-Roman', 'Times New Roman', Times, serif !important; 
            font-size: 14px; color: #000; flex-shrink: 0;
        }
        .bg-pagina {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: url('images/background.png') no-repeat center center;
            background-size: cover; z-index: 0; pointer-events: none;
        }
        .conteudo-pdf { position: relative; z-index: 1; }
        .fixed-logo { position: absolute; top: 5mm; left: 15mm; z-index: 1; }
        .fixed-logo img { width: 80px; height: 80px; object-fit: contain; }
        .footer {
            position: absolute; bottom: 10mm; left: 15mm; right: 15mm;
            text-align: center; font-size: 14px; font-weight: bold; color: #000;
            padding-top: 10px; z-index: 1;
        }

        .titulo-pdf {
            text-align: center; font-weight: bold; font-size: 16px;
            text-decoration: underline; margin-top: -2mm; margin-bottom: 5mm; text-transform: uppercase;
        }

        .label-pdf { font-weight: bold; }
        .time-input-pdf { display: inline-block; width: 20px; text-align: center; border-bottom: 1px; margin: 0; padding: 0; }
        .campo-texto-pdf { width: 100%; white-space: pre-wrap; word-wrap: break-word; line-height: 1.2; text-align: left; transition: text-align 0.3s ease;}

        .pax-container { display: block; padding-top: 10px; }

        .footer-mms-pdf { display: none; }
        .page-number-pdf { display: none; }

        .table-pax { width: 100%; margin-top: 40px; border-collapse: separate; border-spacing: 0; }
        .table-pax th, .table-pax td { vertical-align: top; }
        .pax-title { font-weight: bold; font-size: 16px; margin-bottom: 15px; }

        @media print {
            .no-print { display: none !important; }
            body { background: white; padding: 0; margin: 0; }
            #escala-wrapper { transform: none !important; height: auto !important; }
            #relatorio-a4 { box-shadow: none; margin: 0; height: auto; border-radius: 0; }
        }

        input[type="date"] {
            -webkit-appearance: none !important;
            appearance: none !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }

        /* TRAVAMENTO DE TABELAS E ZOOM */
        .overflow-x-auto, table {
            touch-action: pan-y pinch-zoom;
            overscroll-behavior-x: none;
        }
        table {
            max-width: 100%;
        }
    </style>
</head>
<body class="text-slate-800 antialiased">
<nav class="font-modern bg-[#0f172a] border-b border-slate-800 shadow-sm h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-50 no-print shadow-lg">
    <!-- Esquerda: Logo / App Name -->
    <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-400 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
            </svg>
        </div>
    </div>

    <!-- Direita: Notificações e Menu -->
    <div class="flex items-center gap-1 md:gap-2">
        <!-- Ícone de Notificações -->
        <div class="relative">
            <button onclick="toggleNotificacoes()" class="relative p-2 text-slate-400 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-slate-800 focus:outline-none flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                <span id="badge-notificacoes" class="hidden absolute top-0 right-0 h-4 w-4 bg-rose-500 rounded-full border-2 border-[#0f172a] text-[9px] font-bold text-white flex items-center justify-center shadow-sm">0</span>
            </button>
            
            <!-- Dropdown Notificações -->
            <div id="dropdown-notificacoes" class="hidden absolute right-0 mt-3 w-72 md:w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 transform origin-top-right transition-all overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h3 class="font-black text-xs text-slate-800 uppercase tracking-widest">Notificações</h3>
                    <div class="flex items-center gap-3">
                        <?php if($logado && $_SESSION['nivel_autoridade'] == 2): ?>
                        <a href="coord/" class="text-amber-500 hover:text-amber-600 transition-colors" title="Painel Coordenação">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        </a>
                        <?php endif; ?>
                        <span id="txt-qtd-notificacoes" class="text-[9px] font-bold text-slate-500 uppercase">0 novas</span>
                    </div>
                </div>
                <div id="lista-notificacoes" class="max-h-80 overflow-y-auto bg-white p-1">
                    <!-- Mensagens inseridas via JS -->
                </div>
            </div>
        </div>

        <!-- Menu Hamburger / Avatar -->
        <div class="relative">
            <button onclick="toggleMenu()" class="flex items-center gap-2 justify-center px-3 py-2 rounded-md focus:outline-none hover:bg-slate-800 text-slate-200 transition-colors border border-transparent cursor-pointer">
                <?php if($logado): ?>
                    <span class="text-xs font-bold tracking-widest uppercase hidden sm:block mr-1">MENU</span>
                    <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                        <?php echo substr($nome_user, 0, 1); ?>
                    </div>
                <?php else: ?>
                    <span class="text-xs font-bold tracking-widest uppercase mr-1">MENU</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="3" x2="21" y1="6" y2="6"/>
                        <line x1="3" x2="21" y1="12" y2="12"/>
                        <line x1="3" x2="21" y1="18" y2="18"/>
                    </svg>
                <?php endif; ?>
            </button>
        
        <!-- Dropdown Menu -->
        <div id="user-menu-dropdown" class="absolute right-0 mt-3 w-60 bg-white rounded-lg shadow-xl py-2 border border-slate-200 hidden z-50 transform origin-top-right transition-all">
            <?php if($logado): ?>
                <div class="px-4 py-3 border-b border-slate-100 mb-1">
                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sessão Ativa</p>
                    <p class="text-sm font-black text-slate-800 truncate"><?php echo htmlspecialchars($nome_user); ?></p>
                </div>
                <a href="meus_relatorios" class="flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                    <span class="text-lg">📂</span> Meus Relatórios
                </a>
                <?php if($_SESSION['nivel_autoridade'] == 2): ?>
                <a href="coord/" class="flex items-center gap-3 px-4 py-3 text-sm font-bold text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors">
                    <span class="text-lg">⚙️</span> Painel Coordenação
                </a>
                <button type="button" onclick="limparCacheGeral()" class="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-colors text-left cursor-pointer border-t border-slate-100 mt-1">
                    <span class="text-lg">🧹</span> Limpar Cache
                </button>
                <button type="button" onclick="navegarWebView()" class="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-teal-600 hover:bg-teal-50 transition-colors text-left cursor-pointer border-t border-slate-100 mt-1">
                    <span class="text-lg">🌐</span> Navegador WebView
                </button>
                <?php endif; ?>
                <a href="logout.php" class="flex items-center gap-3 px-4 py-3 text-sm font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors border-t border-slate-100 mt-1">
                    <span class="text-lg">🚪</span> Sair do Sistema
                </a>
            <?php else: ?>
                <button type="button" onclick="abrirModalAuth('login'); toggleMenu();" class="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors text-left cursor-pointer">
                    <span class="text-lg">🔑</span> Fazer Login
                </button>
                <button type="button" onclick="abrirModalAuth('cadastro'); toggleMenu();" class="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors border-t border-slate-100 mt-1 text-left cursor-pointer">
                    <span class="text-lg">📝</span> Criar Nova Conta
                </button>
            <?php endif; ?>
        </div>
    </div>
</nav>

    <?php if(!$logado): ?>
<div id="aviso-login" class="font-modern mx-4 max-w-2xl md:mx-auto mt-6 mb-2 no-print relative group">
    <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-4 md:p-5 shadow-lg shadow-blue-900/20 flex flex-col sm:flex-row items-center justify-between gap-4 md:gap-5 relative overflow-hidden border border-blue-500/30">
        <!-- Decorativo fundo -->
        <div class="absolute -right-10 -top-10 opacity-10 pointer-events-none transition-transform group-hover:scale-110 duration-700">
            <svg class="w-32 h-32 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
        </div>
        
        <div class="flex items-center gap-4 z-10 w-full sm:w-auto">
            <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm border border-white/10 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6 text-white drop-shadow-sm"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
            </div>
            <div>
                <h3 class="text-white font-black text-xs md:text-sm tracking-wide">Salvar na Nuvem</h3>
                <p class="text-blue-100 text-[10px] md:text-xs font-medium mt-1 leading-relaxed">
                    Crie uma conta para organizar e acessar facilmente todos os seus relatórios.
                </p>
            </div>
        </div>
        
        <div class="flex items-center gap-3 z-10 w-full sm:w-auto shrink-0">
            <button type="button" onclick="abrirModalAuth('login')" class="flex-1 sm:flex-none text-center px-4 py-2.5 bg-white text-blue-700 hover:bg-blue-50 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-sm hover:shadow-md cursor-pointer">Entrar</button>
            <button type="button" onclick="abrirModalAuth('cadastro')" class="flex-1 sm:flex-none text-center px-4 py-2.5 bg-blue-800 text-white hover:bg-blue-900 border border-blue-500/50 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-sm hover:shadow-md cursor-pointer">Criar Conta</button>
        </div>
        
        <!-- Botão Fechar -->
        <button onclick="document.getElementById('aviso-login').style.display='none'" class="absolute top-2 right-2 text-blue-200 hover:text-white p-1 rounded-lg hover:bg-white/20 transition-colors z-20" title="Fechar Aviso">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    </div>
</div>
<?php endif; ?>

    


    <div id="interface-preenchimento" class="max-w-2xl mx-3 md:mx-auto bg-white rounded-lg shadow-[0_2px_8px_rgba(15,23,42,0.05)] p-4 md:p-8 mt-6 md:mt-10 mb-12 no-print border border-white relative">
        
        <div class="flex justify-between items-center mb-6">
            <img src="images/logo.jpg" class="h-12 md:h-16 object-contain drop-shadow-sm">
            <button onclick="limparTudo()" class="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold py-2.5 px-4 rounded-lg shadow-sm flex items-center gap-2 text-xs md:text-sm active:bg-slate-100 transition-colors cursor-pointer select-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Iniciar Novo Relatório</span>
            </button>
        </div>
        <h2 class="text-xl md:text-2xl font-black text-center mb-4 border-b-2 border-slate-100 pb-4 text-slate-800 uppercase tracking-tight">Preenchimento de Relatório</h2>

        <!-- Sistema de Abas para Relatórios Simultâneos (Até 4) -->
        <div class="font-modern mb-8 no-print">
            <div class="flex items-center justify-between mb-2">
                <label class="font-black text-[10px] text-slate-400 uppercase tracking-widest">Relatórios em Andamento</label>
                <button type="button" onclick="adicionarAbaRelatorio()" id="btn-add-relatorio" class="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-black px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors border border-blue-200 shadow-sm cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                    Adicionar Relatório
                </button>
            </div>
            <div id="container-abas" class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200 shadow-inner transition-all duration-300">
                <!-- Aba 1 -->
                <button type="button" onclick="switchTab(1)" id="tab-btn-1" class="relative flex flex-col items-center justify-center p-2.5 rounded-lg bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-200/50 transition-all duration-300 transform scale-[1.02] cursor-pointer">
                    <span class="tab-lbl text-[9px] font-black uppercase tracking-widest text-blue-600 transition-colors">Relatório 1</span>
                    <span class="tab-nm text-[12px] font-black text-slate-800 truncate max-w-full" id="tab-name-1">Vazio</span>
                </button>
                <!-- Aba 2 -->
                <button type="button" onclick="switchTab(2)" id="tab-btn-2" style="display: none;" class="relative flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 cursor-pointer">
                    <div onclick="removerAbaRelatorio(2, event)" class="absolute top-1 right-1 w-4 h-4 bg-rose-100/50 hover:bg-rose-500 text-rose-600 hover:text-white rounded-full flex items-center justify-center transition-colors shadow-sm" title="Remover">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </div>
                    <span class="tab-lbl text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors">Relatório 2</span>
                    <span class="tab-nm text-[11px] font-black text-slate-700 truncate max-w-full" id="tab-name-2">Vazio</span>
                </button>
                <!-- Aba 3 -->
                <button type="button" onclick="switchTab(3)" id="tab-btn-3" style="display: none;" class="relative flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 cursor-pointer">
                    <div onclick="removerAbaRelatorio(3, event)" class="absolute top-1 right-1 w-4 h-4 bg-rose-100/50 hover:bg-rose-500 text-rose-600 hover:text-white rounded-full flex items-center justify-center transition-colors shadow-sm" title="Remover">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </div>
                    <span class="tab-lbl text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors">Relatório 3</span>
                    <span class="tab-nm text-[11px] font-black text-slate-700 truncate max-w-full" id="tab-name-3">Vazio</span>
                </button>
                <!-- Aba 4 -->
                <button type="button" onclick="switchTab(4)" id="tab-btn-4" style="display: none;" class="relative flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 cursor-pointer">
                    <div onclick="removerAbaRelatorio(4, event)" class="absolute top-1 right-1 w-4 h-4 bg-rose-100/50 hover:bg-rose-500 text-rose-600 hover:text-white rounded-full flex items-center justify-center transition-colors shadow-sm" title="Remover">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </div>
                    <span class="tab-lbl text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors">Relatório 4</span>
                    <span class="tab-nm text-[11px] font-black text-slate-700 truncate max-w-full" id="tab-name-4">Vazio</span>
                </button>
            </div>
        </div>

        <!-- Conteúdo do formulário -->
        <div id="conteudo-formulario" class="transition-all duration-300">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            <div class="md:col-span-2">
                <label class="block font-black text-[11px] text-black uppercase tracking-wide mb-1">Empresa / Grupo:</label>
                <select id="in-grupo" name="grupo" oninput="sync()" class="w-full max-w-full border border-slate-300 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white shadow-sm save-local box-border">
                    <option value="TECHNIP">TECHNIP</option>
                    <option value="DOF">DOF</option>
                    <option value="TECHNIP/DOF">TECHNIP/DOF</option>
                    <option value="CONSTELLATION">CONSTELLATION</option>
                    <option value="ZONDA">ZONDA</option>
                    <option value="OUTROS">OUTROS</option>
                </select>
            </div>

            <div class="min-w-0">
                <label class="block font-black text-[11px] text-black uppercase tracking-wide mb-1">Unidade:</label>
                <input type="text" id="in-unidade" name="unidade" oninput="this.value = this.value.toUpperCase()" style="text-transform: uppercase;" class="w-full max-w-full border border-slate-300 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white shadow-sm uppercase save-local box-border" placeholder="Ex: LONE STAR SS79">
            </div>
            

            <div class="min-w-0">
                <label class="block font-black text-[11px] text-black uppercase tracking-wide mb-1">Data:</label>
                <input type="text" id="in-data" name="data" placeholder="Selecione a data aqui 📅" onfocus="(this.type='date')" onclick="this.type='date'; if(this.showPicker) this.showPicker();" onblur="(this.value == '' ? this.type='text' : this.type='date')" class="w-full max-w-full border border-slate-300 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white shadow-sm cursor-pointer save-local box-border">
            </div>
            
            <div class="min-w-0">
                <label class="block font-black text-[11px] text-black uppercase tracking-wide mb-1">Local:</label>
                <input type="text" id="in-local" name="local" class="w-full max-w-full border border-slate-300 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white shadow-sm save-local box-border" placeholder="Local de atendimento">
            </div>
            <div class="min-w-0">
                <label class="block font-black text-[11px] text-black uppercase tracking-wide mb-1">Modal:</label>
                <input type="text" id="in-modal" name="modal" class="w-full max-w-full border border-slate-300 rounded-lg p-3 text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white shadow-sm save-local box-border" value="Helicóptero">
            </div>
            
            <div class="md:col-span-2 min-w-0 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 shadow-sm mt-1 mb-1 transition-all focus-within:bg-indigo-50/80 focus-within:border-indigo-200">
                <label class="block font-black text-[11px] text-indigo-800 uppercase tracking-wide mb-1">OBSERVAÇÃO TROCA:</label>
                <input type="text" id="in-observacao" name="observacao" oninput="this.value = this.value.toUpperCase().replace(/\\s/g, '_')" style="text-transform: uppercase;" class="w-full max-w-full border border-indigo-200 rounded-lg p-2.5 text-sm font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 transition-all bg-white shadow-inner uppercase save-local box-border placeholder:font-medium placeholder:text-indigo-300 mb-3" placeholder="Ex: TRANSFERIDO">
                <p class="text-sm text-blue-800 font-normal leading-relaxed flex items-start gap-1">
                    <span class="text-base leading-none mt-0.5">💡</span> 
                    <span>O texto será <b>adicionado ao nome do arquivo PDF</b>. (Ex: <b>TRANSFERIDO</b>, <b>1ª TENTATIVA</b>).</span>
                </p>
            </div>
            
            <div class="md:col-span-2 min-w-0">
                <label class="block font-black text-[11px] text-black uppercase tracking-wide mb-1">Nome do Preposto:</label>
                <input type="text" id="in-preposto" name="preposto" class="w-full max-w-full border rounded-lg p-3 text-sm font-medium outline-none transition-all shadow-sm save-local box-border <?php echo ($logado && !empty($nome_preposto)) ? 'bg-slate-200 border-slate-200 text-slate-500 cursor-not-allowed opacity-90' : 'bg-slate-50 focus:bg-white border-slate-300 text-slate-800 focus:ring-1 focus:ring-blue-300 focus:border-blue-400'; ?>" placeholder="Seu nome" value="<?php echo htmlspecialchars($nome_preposto); ?>" <?php echo ($logado && !empty($nome_preposto)) ? 'readonly' : ''; ?>>
            </div>
        </div>

        <div class="bg-slate-50 p-4 md:p-5 rounded-lg mb-8 border border-slate-200 shadow-sm">
            <div class="font-black text-base border-b-2 border-slate-200 mb-5 pb-2 text-slate-800 uppercase text-center tracking-widest">Controle de Horários</div>
            
            <div class="flex flex-col gap-5">
                
                <div class="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-3 transition-all hover:shadow-md relative">
                    <div class="flex items-center justify-between mb-2 border-b border-slate-100 pb-3">
                        <span class="text-[11px] font-black text-blue-700 text-center uppercase tracking-widest bg-blue-50 py-1 rounded-md mx-auto px-4">Saída do Hotel</span>
                    </div>
                    
                    <div class="bg-amber-50/80 border border-amber-200 p-3 mb-2 rounded-lg shadow-sm flex gap-3 items-start">
                        <span class="text-base leading-none mt-0.5">✏️</span>
                        <p class="text-[11px] text-amber-800 leading-relaxed font-medium">
                            <b>Dica:</b> O rótulo inicial <span class="bg-white border border-amber-200 px-1 py-0.5 rounded text-amber-900 mx-0.5">Previsto</span> pode ser clicado e editado (Ex: Previsto DOF, Previsto TFMC).
                        </p>
                    </div>

                    <div id="container-inputs-saida" class="flex flex-col gap-3 transition-opacity duration-300"></div>

                    <div class="flex items-center justify-center mb-2 mt-3">
                        <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer uppercase tracking-wider select-none">
                            <input type="checkbox" id="chk-sem-saida" class="w-4 h-4 text-slate-900 rounded-none border-slate-300 focus:ring-slate-900 cursor-pointer" onchange="clickSemSaida()">
                            N/A SAÍDA DE HOTEL
                        </label>
                    </div>

                    <button id="btn-add-saida" onclick="adicionarLinhaSaida()" class="mt-1 w-full text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2 rounded-lg border border-slate-200 transition-all uppercase tracking-wide cursor-pointer">+ Adicionar Nova Saída</button>
                </div>

                <div class="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-3 transition-all hover:shadow-md">
                    <span class="text-[11px] font-black text-blue-700 text-center uppercase tracking-widest bg-blue-50 py-1 rounded-md mx-auto px-4">Embarque</span>
                    <div class="flex flex-wrap md:flex-nowrap justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100 gap-2">
                        <label class="text-[11px] font-black text-black uppercase tracking-wider ml-1 w-full md:w-auto text-center md:text-left drop-shadow-sm">PREVISÃO:</label>
                        <div class="flex items-center gap-1 mx-auto md:mx-0">
                            <input type="text" id="in-h3" name="h3" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarHora(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">h</span>
                            <input type="text" id="in-m3" name="m3" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarMinuto(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">m</span>
                        </div>
                    </div>

                    <div class="flex items-center justify-center mb-2 mt-1">
                        <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer uppercase tracking-wider select-none">
                            <input type="checkbox" id="chk-sem-embarque-prev" class="w-4 h-4 text-slate-900 rounded-none border-slate-300 focus:ring-slate-900 cursor-pointer" onchange="clickSemEmbarquePrev()">
                            N/A EMBARQUE
                        </label>
                    </div>

                    <div class="flex flex-wrap md:flex-nowrap justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100 gap-2">
                        <label class="text-[11px] font-black text-black uppercase tracking-wider ml-1 w-full md:w-auto text-center md:text-left drop-shadow-sm">REAL:</label>
                        <div class="flex items-center gap-1 mx-auto md:mx-0">
                            <input type="text" id="in-h4" name="h4" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarHora(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">h</span>
                            <input type="text" id="in-m4" name="m4" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarMinuto(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">m</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center justify-center mb-1 mt-2">
                        <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer uppercase tracking-wider select-none">
                            <input type="checkbox" id="chk-sem-embarque" class="w-4 h-4 text-slate-900 rounded-none border-slate-300 focus:ring-slate-900 cursor-pointer" onchange="clickSemEmbarque()">
                            N/A EMBARQUE
                        </label>
                    </div>
                </div>

                <div class="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-3 transition-all hover:shadow-md">
                    <span class="text-[11px] font-black text-blue-700 text-center uppercase tracking-widest bg-blue-50 py-1 rounded-md mx-auto px-4">Atendimento</span>
                    <div class="flex flex-wrap md:flex-nowrap justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100 gap-2">
                        <label class="text-[11px] font-black text-black uppercase tracking-wider ml-1 w-full md:w-auto text-center md:text-left drop-shadow-sm">INÍCIO:</label>
                        <div class="flex items-center gap-1 mx-auto md:mx-0">
                            <input type="text" id="in-h5" name="h5" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarHora(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">h</span>
                            <input type="text" id="in-m5" name="m5" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarMinuto(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">m</span>
                        </div>
                    </div>
                    <div class="flex flex-wrap md:flex-nowrap justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100 gap-2">
                        <label class="text-[11px] font-black text-black uppercase tracking-wider ml-1 w-full md:w-auto text-center md:text-left drop-shadow-sm">FIM:</label>
                        <div class="flex items-center gap-1 mx-auto md:mx-0">
                            <input type="text" id="in-h6" name="h6" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarHora(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">h</span>
                            <input type="text" id="in-m6" name="m6" inputmode="numeric" pattern="[0-9]*" maxlength="2" oninput="validarMinuto(this)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 bg-white shadow-inner save-local">
                            <span class="text-slate-400 font-bold text-sm">m</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="mb-8 w-full overflow-hidden">
            <label class="block font-black text-base text-black uppercase tracking-widest mb-3 ml-1">Informações sobre a troca:</label>
            
            <div class="border border-slate-300 rounded-lg shadow-sm bg-slate-50 overflow-hidden transition-all focus-within:ring-1 focus-within:ring-blue-300 focus-within:border-blue-400 focus-within:bg-white">
                
                <div class="bg-slate-100 border-b border-slate-200 p-2 flex flex-wrap gap-1.5 items-center select-none">
                    <button type="button" onclick="formatarTextoWysiwyg('bold')" class="w-8 h-8 flex items-center justify-center bg-transparent hover:bg-slate-200 rounded-md text-slate-800 font-serif font-black text-sm transition-all border border-transparent hover:border-slate-300" title="Negrito">B</button>
                    <button type="button" onclick="formatarTextoWysiwyg('italic')" class="w-8 h-8 flex items-center justify-center bg-transparent hover:bg-slate-200 rounded-md text-slate-800 font-serif italic font-bold text-sm transition-all border border-transparent hover:border-slate-300" title="Itálico">I</button>
                    <button type="button" onclick="formatarTextoWysiwyg('underline')" class="w-8 h-8 flex items-center justify-center bg-transparent hover:bg-slate-200 rounded-md text-slate-800 font-serif underline font-bold text-sm transition-all border border-transparent hover:border-slate-300" title="Sublinhado">U</button>
                    
                    <div class="w-[1px] h-5 bg-slate-300 mx-1"></div>
                    
                    <button type="button" onclick="mudarAlinhamentoInfo('left')" id="btn-align-left" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm text-blue-600 transition-all text-xs font-bold uppercase tracking-wide" title="Alinhar à Esquerda">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h16" /></svg>
                        <span class="hidden md:inline">Esquerda</span>
                    </button>
                    <button type="button" onclick="mudarAlinhamentoInfo('justify')" id="btn-align-justify" class="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-transparent rounded-md text-slate-500 hover:bg-slate-200 transition-all text-xs font-bold uppercase tracking-wide" title="Justificar">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        <span class="hidden md:inline">Justificar</span>
                    </button>
                    
                    <div class="w-[1px] h-5 bg-slate-300 mx-1"></div>
                    
                    <button type="button" onclick="inserirBolinhaInfo()" class="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-transparent rounded-md text-slate-500 hover:bg-slate-200 transition-all text-xs font-bold uppercase tracking-wide" title="Inserir Marcador">
                        <span class="text-base leading-none -mt-0.5 text-black">▪</span>
                        <span class="hidden md:inline">Inserir Tópico</span>
                    </button>
                </div>
                
                <div id="in-info" contenteditable="true" class="w-full max-w-full p-4 text-base outline-none bg-transparent box-border overflow-y-auto save-local" style="min-height: 250px; max-height: 400px;" data-placeholder="Houve embarque de material..."></div>
            </div>
            
            <p class="text-[11px] text-slate-500 font-medium leading-relaxed mt-2 ml-1">
                💡 <b>Dica:</b> O alinhamento <b>Justificar</b> distribui o texto para encostar perfeitamente nas margens do relatório.
            </p>
        </div>

        <div class="flex flex-col gap-6 border-t-2 border-slate-100 pt-6 mb-8 w-full overflow-hidden">
            <div class="bg-blue-50/80 border border-blue-100 p-4 mb-2 rounded-lg shadow-sm flex gap-3 items-start">
                <span class="text-xl">💡</span>
                <p class="text-sm text-blue-800 leading-relaxed font-medium">
                    Nos campos <b>EMBARCANDO</b> e <b>DESEMBARCANDO</b> colocar uma palavra entre *asteriscos* a deixará em <b class="text-blue-900">Negrito</b>. <br><br><b>Exemplo:</b> *TFMC* o deixará destacado no relatório.
                </p>
            </div>

            <div class="flex flex-col gap-6 w-full overflow-hidden">
                <div class="bg-emerald-50/30 p-2 md:p-3 rounded-lg border border-emerald-100 shadow-sm w-full overflow-hidden flex flex-col h-[500px]">
                    <h3 class="font-black text-emerald-700 text-base mb-2 uppercase tracking-widest text-center bg-emerald-100/50 py-1.5 rounded">Embarcando</h3>
                    <textarea id="in-pax1" name="pax1" class="w-full max-w-full border border-emerald-200/50 rounded-lg p-3 text-base text-slate-800 leading-relaxed outline-none focus:ring-1 focus:ring-emerald-300 bg-white shadow-inner save-local box-border overflow-y-auto resize-none" style="flex: 1;" placeholder="1- Nome..."></textarea>
                </div>
                <div class="bg-rose-50/30 p-2 md:p-3 rounded-lg border border-rose-100 shadow-sm w-full overflow-hidden flex flex-col h-[500px]">
                    <h3 class="font-black text-rose-700 text-base mb-2 uppercase tracking-widest text-center bg-rose-100/50 py-1.5 rounded">Desembarcando</h3>
                    <textarea id="in-pax2" name="pax2" class="w-full max-w-full border border-rose-200/50 rounded-lg p-3 text-base text-slate-800 leading-relaxed outline-none focus:ring-1 focus:ring-rose-300 bg-white shadow-inner save-local box-border overflow-y-auto resize-none" style="flex: 1;" placeholder="1- Nome..."></textarea>
                </div>
            </div>
        </div>

        <div class="bg-slate-50 p-4 md:p-5 rounded-lg mb-8 border border-slate-200 shadow-sm">
            <div class="font-black text-base border-b-2 border-slate-200 mb-3 pb-2 text-slate-600 uppercase text-center tracking-widest">Anexos Fotográficos</div>
            
            <div class="bg-indigo-50 border border-indigo-100 p-3 mb-5 rounded-lg flex gap-3 items-start">
                <span class="text-xl">💡</span>
                <p class="text-[11px] text-indigo-900 leading-relaxed font-medium">
                    <b>Dica de Usabilidade:</b> Ao anexar uma foto, o campo com o título "ANEXO FOTOGRÁFICO" é totalmente editável. Você pode trocá-lo, por exemplo, por "MATERIAL", "CARGO MANIFEST - RT xxx", etc.
                </p>
            </div>

            <div id="lista-anexos" class="flex flex-col gap-3 mb-4"></div>
            <input type="file" id="input-foto" accept="image/*" class="opacity-0 absolute w-0 h-0 -z-10" onchange="processarFoto(event)">
            <button type="button" onclick="document.getElementById('input-foto').click()" class="w-full bg-indigo-600 text-white font-black py-3 rounded-lg border-0 hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Selecionar Imagem
            </button>
            <p id="img-feedback" class="text-[9px] text-center mt-2 text-slate-500 uppercase font-bold tracking-wide"></p>
        </div>



        </div> <!-- Fim do conteudo-formulario -->

        <div class="mt-10 flex flex-col space-y-3 text-center">
            
            <div class="bg-indigo-50/50 border border-indigo-100 rounded-lg py-3 px-4 text-left w-full shadow-sm mb-3 transition-all hover:shadow hover:bg-indigo-50">
                <label class="block font-black text-[9px] text-indigo-400 uppercase tracking-widest mb-1.5">Prévia do Nome do Arquivo:</label>
                <div class="flex items-center gap-2">
                    <span class="text-base leading-none opacity-70">📄</span>
                    <span id="preview-filename" class="font-bold text-indigo-800 text-xs break-all">MMS_00-00-0000.pdf</span>
                </div>
            </div>

            <button id="btn-gerar" onclick="gerarPDF()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl transition-all duration-200 uppercase tracking-widest text-xs shadow-sm cursor-pointer">
                Gerar Relatório (PDF)
            </button>
            
            <div id="area-sucesso-pdf" class="hidden flex-col gap-3 mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p class="text-emerald-600 font-bold text-sm">✅ Relatório gerado com sucesso!</p>
                <div class="flex gap-2">
                    <button id="btn-share-manual" class="flex-1 bg-blue-600 text-white font-bold py-3 rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                        Compartilhar
                    </button>
                    <a id="btn-download-manual" href="#" class="flex-1 bg-slate-800 text-white font-bold py-3 rounded-lg shadow-sm hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 decoration-transparent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Baixar
                    </a>
                </div>
                <button id="btn-editar-manual" onclick="editarRelatorio()" class="mt-2 w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-lg border border-slate-300 shadow-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Editar Relatório
                </button>
            </div>
            
            <div class="flex items-center justify-center gap-2 mt-4">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <p id="save-status" class="text-xs text-slate-400 font-medium uppercase tracking-widest">Sincronizado</p>
            </div>
            
            <div class="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
                <a href="../gerador_qrcode/" class="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-white hover:border-blue-300 hover:text-blue-600 hover:shadow-sm transition-all text-[10px] font-black uppercase tracking-widest text-decoration-none">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    Ferramenta MMS: Gerador de QR Code
                </a>
                <div class="flex flex-col md:flex-row items-center justify-between mt-4 no-print w-full pb-4">
                      <div class="hidden md:block w-20"></div> <!-- Espaçador para manter o texto centralizado na tela grande -->
                      <p class="text-[11px] text-slate-400 font-medium uppercase tracking-wide text-center mb-3 md:mb-0 flex-1">
                          Desenvolvido por <strong class="text-slate-600">Vero Studio</strong> &copy; para <strong class="text-blue-600">MMS Suporte Logístico</strong>
                      </p>
                      <div class="w-full md:w-20 flex justify-end pr-2 md:pr-0">
                          <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 text-[9px] font-black text-slate-400 uppercase tracking-widest shadow-sm bg-white" title="Atualizado com melhorias">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                              <?php echo htmlspecialchars($versao_app); ?>
                          </div>
                      </div>
                  </div>
            </div>
        </div>
    </div>


    <!-- Modal de Autenticação Embutido (Glassmorphism) -->
    <div id="modal-auth" class="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-md hidden flex-col items-center justify-center p-4 overflow-y-auto no-print">
        <div class="w-full max-w-md bg-white text-slate-800 rounded-3xl border border-slate-200 shadow-2xl p-6 md:p-8 relative transform scale-95 opacity-0 transition-all duration-300 ease-out" id="modal-auth-card">
            
            <!-- Botão Fechar -->
            <button type="button" onclick="fecharModalAuth()" class="absolute top-4 right-4 z-20 w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full flex items-center justify-center transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <!-- Tabs do Modal: Login vs Cadastro -->
            <div class="flex border-b border-slate-200 mb-6 gap-2">
                <button type="button" onclick="alternarFormAuth('login')" id="btn-tab-login" class="flex-1 pb-3 text-sm font-bold uppercase tracking-wider text-center border-b-2 border-blue-600 text-blue-600 transition-colors cursor-pointer">Entrar</button>
                <button type="button" onclick="alternarFormAuth('cadastro')" id="btn-tab-cadastro" class="flex-1 pb-3 text-sm font-bold uppercase tracking-wider text-center border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">Criar Conta</button>
            </div>

            <!-- Seção de Alerta de Erro / Sucesso -->
            <div id="auth-alerta" class="hidden px-4 py-3 rounded-lg mb-4 text-xs font-semibold text-center tracking-wide"></div>

            <!-- Form Login -->
            <form id="form-login-ajax" onsubmit="submeterLoginAjax(event)" class="space-y-4">
                <div>
                    <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1.5 ml-1">Usuário</label>
                    <input type="text" id="in-login-user" name="username" placeholder="Seu usuário" required autocomplete="username"
                        class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500 transition-all">
                </div>
                <div>
                    <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1.5 ml-1">Senha</label>
                    <input type="password" id="in-login-pass" name="senha" placeholder="••••••••" required autocomplete="current-password"
                        class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500 transition-all">
                </div>
                
                <!-- Botão Biometria / FaceID -->
                <button type="button" id="btn-biometria-login" onclick="loginComBiometria()" class="hidden w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-lg transition-all border border-slate-300 flex items-center justify-center gap-2 tracking-wide text-xs uppercase cursor-pointer">
                    <span class="text-base" id="icon-biometria-login">🔑</span>
                    <span id="text-biometria-login">Entrar com Biometria / FaceID</span>
                </button>

                <button type="submit" id="btn-auth-submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all tracking-wider text-xs uppercase cursor-pointer">
                    Acessar Plataforma
                </button>
            </form>

            <!-- Form Cadastro -->
            <form id="form-cadastro-ajax" onsubmit="submeterCadastroAjax(event)" class="space-y-3.5 hidden">
                <div>
                    <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">Nome Completo</label>
                    <input type="text" id="in-reg-nome" name="nome" placeholder="Seu nome completo" required
                        class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">Usuário</label>
                        <input type="text" id="in-reg-user" name="username" placeholder="Usuário" required
                            class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">Confirmar Usuário</label>
                        <input type="text" id="in-reg-user-conf" name="username_confirm" placeholder="Repetir" required
                            class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">E-mail</label>
                        <input type="email" id="in-reg-email" name="email" placeholder="E-mail" required
                            class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">Confirmar E-mail</label>
                        <input type="email" id="in-reg-email-conf" name="email_confirm" placeholder="Repetir" required
                            class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">Senha</label>
                        <input type="password" id="in-reg-pass" name="senha" placeholder="Mínimo 6 caracteres" required
                            class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1 ml-1">Confirmar Senha</label>
                        <input type="password" id="in-reg-pass-conf" name="senha_confirm" placeholder="Repetir" required
                            class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-emerald-500 transition-all">
                    </div>
                </div>

                <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-all tracking-wider text-xs uppercase mt-2 cursor-pointer">
                    Criar Cadastro
                </button>
            </form>
        </div>
    </div>

    <!-- Modal / Dialog para Ativação Pós-Login de Biometria -->
    <div id="modal-enroll-biometry" class="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-md hidden flex-col items-center justify-center p-4 no-print">
        <div class="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 text-slate-800 text-center shadow-2xl relative">
            <div class="text-4xl mb-4" id="enroll-biometry-icon">🧬</div>
            <h3 class="text-lg font-black uppercase tracking-wider mb-2">Login por Biometria</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-6">Deseja ativar o login por impressão digital ou reconhecimento facial neste dispositivo para agilizar seus próximos acessos?</p>
            <div class="flex gap-3">
                <button type="button" onclick="ativarBiometriaUsuario()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-xs uppercase tracking-wide transition-colors cursor-pointer">Ativar</button>
                <button type="button" onclick="recusarBiometriaUsuario()" class="flex-1 bg-slate-100 hover:bg-slate-200 font-bold py-3 rounded-lg text-xs uppercase tracking-wide text-slate-600 transition-colors cursor-pointer">Agora Não</button>
            </div>
        </div>
    </div>

    <!-- Modal de Simulação Biométrica (Fallback para HTTP / sem SSL) -->
    <div id="modal-biometria-simulada" class="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-sm hidden flex-col items-center justify-center p-4 no-print">
        <div class="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-3xl p-6 text-center text-white shadow-2xl">
            <div class="w-16 h-16 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span class="text-3xl">👤</span>
            </div>
            <h4 class="font-black text-sm uppercase tracking-widest mb-1" id="sim-biometria-titulo">Verificação Biométrica</h4>
            <p class="text-[10px] text-slate-400 mb-6">Aguardando sensor de impressão digital ou reconhecimento facial do dispositivo...</p>
            <div class="flex flex-col gap-2">
                <button type="button" onclick="confirmarBiometriaSimulada()" class="w-full bg-emerald-600 hover:bg-emerald-700 font-black py-2.5 rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer">Simular Confirmação (OK)</button>
                <button type="button" onclick="fecharBiometriaSimulada()" class="w-full bg-slate-800 hover:bg-slate-700 font-black py-2.5 rounded-lg text-[10px] uppercase tracking-wider text-slate-400 transition-all cursor-pointer">Cancelar</button>
            </div>
        </div>
    </div>

    <!-- Overlay de Loading -->
    <div id="loading-overlay" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] hidden flex-col items-center justify-center">
        <svg class="animate-spin h-12 w-12 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-white font-bold text-lg tracking-widest uppercase">Gerando Relatório...</p>
        <p class="text-blue-200 text-sm mt-2 font-medium">Por favor, aguarde.</p>
    </div>

    <h2 id="titulo-preview" class="text-sm md:text-base font-black text-center text-slate-400 mb-6 uppercase tracking-[0.2em] no-print">Preview do Documento</h2>

    <div class="w-full flex justify-center pb-10 overflow-hidden" id="preview-container">
        <div id="escala-wrapper" class="origin-top" style="transition: transform 0.3s ease; display: flex; flex-direction: column; gap: 20px;">
            <div id="relatorio-a4" class="page-a4">
                <div class="bg-pagina"></div>
                <div class="fixed-logo"><img src="images/logo.png" alt="Logo MMS"></div>
                
                <div class="conteudo-pdf">
                    <div class="titulo-pdf text-black-900">RELATÓRIO DE TROCA DE TURMA</div>
                    
                    <div class="row"><span class="label-pdf">Unidade:</span> <span id="out-unidade" style="text-transform: uppercase;"></span></div>
                    <div class="row"><span class="label-pdf">Data:</span> <span id="out-data"></span></div>
                    <div class="row"><span class="label-pdf">Local:</span> <span id="out-local"></span></div>
                    <div class="row"><span class="label-pdf">Modal:</span> <span id="out-modal"></span></div>
                    
                    <div class="row" style="margin-top:5px;"><span class="label-pdf">Horário de Saída do Hotel (Previsto e Real):</span></div>
                    <div id="out-container-saida" class="content-box ml-4 flex flex-col space-y-0.5"></div>

                    <div class="row" style="margin-top:5px;"><span class="label-pdf">Horários de Embarque (Previsto e Real):</span></div>
                    <div class="content-box ml-4" id="out-container-embarque"></div>
                    
                    <div class="row" style="margin-top:5px;"><span class="label-pdf">Horário Inicial e de finalização:</span></div>
                    <div class="content-box ml-4"><span class="label-pdf">Início:&nbsp;</span><span id="out-h5" class="time-input-pdf"></span>h<span id="out-m5" class="time-input-pdf"></span>min &nbsp;às&nbsp; <span class="label-pdf">Fim:&nbsp;</span><span id="out-h6" class="time-input-pdf"></span>h<span id="out-m6" class="time-input-pdf"></span>min</div>
                    
                    <div class="row" style="margin-top:5px;"><span class="label-pdf">Nome do Preposto:</span> <span id="out-preposto"></span></div>
                    
                    <div class="row" style="margin-top:5px;"><span class="label-pdf">Informações sobre a troca de turma:</span></div>
                    <div id="out-info" class="info-box campo-texto-pdf" style="line-height: 1.3;">N/A</div>

                    <table class="table-pax" id="bloco-passageiros">
                        <tbody id="out-tbody-pax">
                            <tr>
                                <th style='width: 46%; padding-right: 15px; border-right: 1px solid #d1d5db; text-align: left; padding-bottom: 15px;'><div class='pax-title' style='margin-bottom:0;'>Nomes Passageiros Embarcando:</div></th>
                                <th style='width: 54%; padding-left: 35px; text-align: left; padding-bottom: 15px;'><div class='pax-title' style='margin-bottom:0;'>Nomes Passageiros Desembarcados:</div></th>
                            </tr>
                            <tr>
                                <td style='width: 46%; padding-right: 15px; border-right: 1px solid #d1d5db; vertical-align: top; line-height: 1.4;'>N/A</td>
                                <td style='width: 54%; padding-left: 35px; vertical-align: top; line-height: 1.4;'>N/A</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="footer">Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020</div>
            </div>
            <div id="container-anexos-pdf" style="display: flex; flex-direction: column; gap: 20px; width: 210mm; flex-shrink: 0;"></div>
        </div>
    </div>

    <datalist id="datalist-local"></datalist>
    <datalist id="datalist-modal"></datalist>
    <datalist id="datalist-preposto"></datalist>

    <script>
        // --- SISTEMA DE ABAS (RELATÓRIOS SIMULTÂNEOS) ---
        let activeTab = parseInt(localStorage.getItem('mms_active_tab')) || 1;
        const nomePrepostoGlobal = '<?php echo addslashes($nome_preposto); ?>';
        const isLogado = <?php echo $logado ? 'true' : 'false'; ?>;

        function initTabs() {
            for (let i = 1; i <= 4; i++) {
                let tabData = localStorage.getItem('mms_tab_' + i);
                if (!tabData) {
                    // Migra rascunho antigo para a aba 1 caso exista
                    if (i === 1 && (localStorage.getItem('mms_save_unidade') !== null || localStorage.getItem('mms_saidas_hotel') !== null)) {
                        let oldState = {
                            grupo: localStorage.getItem('mms_save_grupo') || 'TECHNIP',
                            unidade: localStorage.getItem('mms_save_unidade') || '',
                            data: localStorage.getItem('mms_save_data') || '',
                            local: localStorage.getItem('mms_save_local') || '',
                            modal: localStorage.getItem('mms_save_modal') || 'Helicóptero',
                            preposto: localStorage.getItem('mms_save_preposto') || nomePrepostoGlobal,
                            info: localStorage.getItem('mms_save_info') || '',
                            pax1: localStorage.getItem('mms_save_pax1') || '',
                            pax2: localStorage.getItem('mms_save_pax2') || '',
                            h3: localStorage.getItem('mms_save_h3') || '',
                            m3: localStorage.getItem('mms_save_m3') || '',
                            h4: localStorage.getItem('mms_save_h4') || '',
                            m4: localStorage.getItem('mms_save_m4') || '',
                            h5: localStorage.getItem('mms_save_h5') || '',
                            m5: localStorage.getItem('mms_save_m5') || '',
                            h6: localStorage.getItem('mms_save_h6') || '',
                            m6: localStorage.getItem('mms_save_m6') || '',
                            listaSaidas: JSON.parse(localStorage.getItem('mms_saidas_hotel')) || [{ label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }],
                            fotosAnexadas: [],
                            semSaida: localStorage.getItem('mms_sem_saida') === 'true',
                            alinhamentoInfo: localStorage.getItem('mms_align_info') || 'left',
                            tamanhoFonteRelatorio: parseInt(localStorage.getItem('mms_fonte_relatorio')) || 15
                        };
                        localStorage.setItem('mms_tab_1', JSON.stringify(oldState));
                    } else {
                        // Estado inicial vazio
                        let defaultState = {
                            grupo: 'TECHNIP',
                            unidade: '',
                            data: '',
                            local: '',
                            modal: 'Helicóptero',
                            preposto: nomePrepostoGlobal,
                            info: '',
                            pax1: '',
                            pax2: '',
                            h3: '', m3: '', h4: '', m4: '', h5: '', m5: '', h6: '', m6: '',
                            listaSaidas: [{ label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }],
                            fotosAnexadas: [],
                            semSaida: false,
                            semEmbarquePrev: false,
                            semEmbarque: false,
                            alinhamentoInfo: 'left',
                            tamanhoFonteRelatorio: 15
                        };
                        localStorage.setItem('mms_tab_' + i, JSON.stringify(defaultState));
                    }
                }
            }
        }

        function salvarTabAtiva() {
            let prepostoVal = document.getElementById('in-preposto') ? document.getElementById('in-preposto').value : '';
            let oldData = JSON.parse(localStorage.getItem('mms_tab_' + activeTab)) || {};
            let dataVal = {
                grupo: document.getElementById('in-grupo') ? document.getElementById('in-grupo').value : 'TECHNIP',
                unidade: document.getElementById('in-unidade') ? document.getElementById('in-unidade').value : '',
                data: document.getElementById('in-data') ? document.getElementById('in-data').value : '',
                local: document.getElementById('in-local') ? document.getElementById('in-local').value : '',
                modal: document.getElementById('in-modal') ? document.getElementById('in-modal').value : 'Helicóptero',
                observacao: document.getElementById('in-observacao') ? document.getElementById('in-observacao').value : '',
                preposto: prepostoVal,
                info: document.getElementById('in-info') ? document.getElementById('in-info').innerHTML : '',
                pax1: document.getElementById('in-pax1') ? document.getElementById('in-pax1').value : '',
                pax2: document.getElementById('in-pax2') ? document.getElementById('in-pax2').value : '',
                h3: document.getElementById('in-h3') ? document.getElementById('in-h3').value : '',
                m3: document.getElementById('in-m3') ? document.getElementById('in-m3').value : '',
                h4: document.getElementById('in-h4') ? document.getElementById('in-h4').value : '',
                m4: document.getElementById('in-m4') ? document.getElementById('in-m4').value : '',
                h5: document.getElementById('in-h5') ? document.getElementById('in-h5').value : '',
                m5: document.getElementById('in-m5') ? document.getElementById('in-m5').value : '',
                h6: document.getElementById('in-h6') ? document.getElementById('in-h6').value : '',
                m6: document.getElementById('in-m6') ? document.getElementById('in-m6').value : '',
                listaSaidas: listaSaidas,
                fotosAnexadas: fotosAnexadas,
                semSaida: document.getElementById('chk-sem-saida') ? document.getElementById('chk-sem-saida').checked : false,
                semEmbarque: document.getElementById('chk-sem-embarque') ? document.getElementById('chk-sem-embarque').checked : false,
                alinhamentoInfo: alinhamentoInfo,
                tamanhoFonteRelatorio: tamanhoFonteRelatorio
            };
            if (oldData.pdfGerado) {
                dataVal.pdfGerado = oldData.pdfGerado;
            }
            localStorage.setItem('mms_tab_' + activeTab, JSON.stringify(dataVal));
            renderTabsUI();
            mostrarToastSalvo();
        }

        let timeoutToast = null;
        function mostrarToastSalvo() {
            const toast = document.getElementById('toast-save');
            if (!toast) return;
            toast.classList.remove('opacity-0');
            toast.classList.add('opacity-100');
            if (timeoutToast) clearTimeout(timeoutToast);
            timeoutToast = setTimeout(() => {
                toast.classList.remove('opacity-100');
                toast.classList.add('opacity-0');
            }, 1500);
        }

        function carregarTab(tabIndex) {
            let dataVal = JSON.parse(localStorage.getItem('mms_tab_' + tabIndex));
            if (!dataVal) return;
            
            // Atualiza campos de entrada
            if(document.getElementById('in-grupo')) document.getElementById('in-grupo').value = dataVal.grupo || 'TECHNIP';
            if(document.getElementById('in-unidade')) document.getElementById('in-unidade').value = dataVal.unidade || '';
            
            if(document.getElementById('in-data')) {
                document.getElementById('in-data').value = dataVal.data || '';
                if (dataVal.data) {
                    document.getElementById('in-data').type = 'date';
                } else {
                    document.getElementById('in-data').type = 'text';
                }
            }
            if(document.getElementById('in-local')) document.getElementById('in-local').value = dataVal.local || '';
            if(document.getElementById('in-modal')) document.getElementById('in-modal').value = dataVal.modal || 'Helicóptero';
            if(document.getElementById('in-observacao')) document.getElementById('in-observacao').value = dataVal.observacao || '';
            
            if(document.getElementById('in-preposto')) {
                if (isLogado && nomePrepostoGlobal) {
                    document.getElementById('in-preposto').value = nomePrepostoGlobal;
                    document.getElementById('in-preposto').readOnly = true;
                } else {
                    document.getElementById('in-preposto').value = dataVal.preposto || '';
                    document.getElementById('in-preposto').readOnly = false;
                }
            }
            
            if(document.getElementById('in-info')) document.getElementById('in-info').innerHTML = dataVal.info || '';
            if(document.getElementById('in-pax1')) document.getElementById('in-pax1').value = dataVal.pax1 || '';
            if(document.getElementById('in-pax2')) document.getElementById('in-pax2').value = dataVal.pax2 || '';
            if(document.getElementById('in-h3')) document.getElementById('in-h3').value = dataVal.h3 || '';
            if(document.getElementById('in-m3')) document.getElementById('in-m3').value = dataVal.m3 || '';
            if(document.getElementById('in-h4')) document.getElementById('in-h4').value = dataVal.h4 || '';
            if(document.getElementById('in-m4')) document.getElementById('in-m4').value = dataVal.m4 || '';
            if(document.getElementById('in-h5')) document.getElementById('in-h5').value = dataVal.h5 || '';
            if(document.getElementById('in-m5')) document.getElementById('in-m5').value = dataVal.m5 || '';
            if(document.getElementById('in-h6')) document.getElementById('in-h6').value = dataVal.h6 || '';
            if(document.getElementById('in-m6')) document.getElementById('in-m6').value = dataVal.m6 || '';
            
            if(document.getElementById('chk-sem-saida')) document.getElementById('chk-sem-saida').checked = dataVal.semSaida || false;
            
            if(document.getElementById('chk-sem-embarque-prev')) {
                document.getElementById('chk-sem-embarque-prev').checked = dataVal.semEmbarquePrev || false;
                clickSemEmbarquePrev(true);
            }

            if(document.getElementById('chk-sem-embarque')) {
                document.getElementById('chk-sem-embarque').checked = dataVal.semEmbarque || false;
                clickSemEmbarque(true); // Aplica visualmente e estado
            }
            
            // Define variáveis globais
            listaSaidas = dataVal.listaSaidas || [{ label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }];
            fotosAnexadas = dataVal.fotosAnexadas || [];
            alinhamentoInfo = dataVal.alinhamentoInfo || 'left';
            tamanhoFonteRelatorio = dataVal.tamanhoFonteRelatorio || 15;
            
            // Atualiza a visualização e preview
            renderSaidasUI();
            renderSaidasPreview();
            renderizarAnexosUI();
            aplicarTamanhoFonte();
            aplicarAlinhamento();
            
            // Sincroniza campos com o preview do PDF
            campos.forEach(id => {
                const elInput = document.getElementById('in-' + id);
                const elOutput = document.getElementById('out-' + id);
                if (elInput && elOutput) {
                    if (id === 'data') {
                        elOutput.innerText = formatarData(elInput.value);
                    } else if (id === 'info') {
                        const clean = elInput.innerHTML.replace(/(<br\s*\/?>|\s|&nbsp;)+$/gi, '').trim();
                        elOutput.innerHTML = clean === '' ? 'N/A' : formatarInfo(elInput.innerHTML);
                    } else if (id === 'pax1' || id === 'pax2') {
                        // Handled by renderTablePax in reajustarLayout
                    } else if (id === 'h3' || id === 'm3' || id === 'h4' || id === 'm4') {
                        // Handled by renderEmbarquePreview
                    } else {
                        elOutput.innerText = elInput.value;
                    }
                }
            });
            renderEmbarquePreview();
            
            // Reseta estado do botão de gerar PDF ao trocar de aba
            const btnGerar = document.getElementById('btn-gerar');
            const areaSucesso = document.getElementById('area-sucesso-pdf');
            
            if (dataVal.pdfGerado) {
                if (btnGerar) btnGerar.style.display = 'none';
                if (areaSucesso) {
                    areaSucesso.classList.remove('hidden');
                    areaSucesso.classList.add('flex');
                    document.getElementById('conteudo-formulario').classList.add('opacity-50', 'pointer-events-none');
                    
                    const btnDownload = document.getElementById('btn-download-manual');
                    const btnShare = document.getElementById('btn-share-manual');
                    
                    if (btnDownload) {
                        btnDownload.href = dataVal.pdfGerado.fetchUrl;
                        btnDownload.download = dataVal.pdfGerado.nome_arquivo;
                        btnDownload.removeAttribute('target');
                    }
                    
                    if (btnShare) {
                        btnShare.onclick = async () => {
                            if (navigator.share) {
                                let linkUrl = dataVal.pdfGerado.fetchUrl;
                                if (linkUrl.includes('download_pdf.php?id=')) {
                                    linkUrl = linkUrl.replace('download_pdf.php?id=', 'ver_relatorio.php?id=');
                                }
                                const absoluteUrl = new URL(linkUrl, window.location.href).href;
                                try {
                                    const pdfRes = await fetch(dataVal.pdfGerado.fetchUrl);
                                    const pdfBlob = await pdfRes.blob();
                                    const file = new File([pdfBlob], dataVal.pdfGerado.nome_arquivo, { type: 'application/pdf' });
                                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                        await navigator.share({ files: [file] });
                                    } else {
                                        await navigator.share({
                                            text: 'Acesse o relatório através deste link: ' + dataVal.pdfGerado.nome_arquivo,
                                            url: absoluteUrl
                                        });
                                    }
                                } catch (err) { 
                                    if (err.name !== 'AbortError') {
                                        await navigator.share({
                                            text: 'Acesse o relatório através deste link: ' + dataVal.pdfGerado.nome_arquivo,
                                            url: absoluteUrl
                                        });
                                    }
                                }
                            } else {
                                alert("Função de compartilhar não suportada neste navegador. Use o botão Baixar.");
                            }
                        };
                    }
                }
            } else {
                if (btnGerar) {
                    btnGerar.style.display = 'block';
                    btnGerar.innerText = "Gerar Relatório (PDF)";
                }
                if (areaSucesso) {
                    areaSucesso.classList.add('hidden');
                    areaSucesso.classList.remove('flex');
                }
                const formC = document.getElementById('conteudo-formulario');
                if (formC) formC.classList.remove('opacity-50', 'pointer-events-none');
            }
            
            reajustarLayout();
            renderTabsUI();
        }

        let numAbasVisiveis = parseInt(localStorage.getItem('mms_num_abas') || '1');

        function adicionarAbaRelatorio() {
            if (numAbasVisiveis < 4) {
                numAbasVisiveis++;
                localStorage.setItem('mms_num_abas', numAbasVisiveis);
                switchTab(numAbasVisiveis); // Muda para a nova aba criada
                renderTabsUI();
            }
            if (numAbasVisiveis >= 4) {
                document.getElementById('btn-add-relatorio').style.display = 'none';
            }
        }

        function removerAbaRelatorio(tabIndex, event) {
            event.stopPropagation();
            if (numAbasVisiveis <= 1) return;
            
            exibirConfirmacao("Deseja realmente remover este relatório? Todos os dados dele serão perdidos.", () => {
                salvarTabAtiva(); // Salva o atual para garantir que não perca o que está aberto
                
                // Desloca os dados
                for (let i = tabIndex; i < numAbasVisiveis; i++) {
                    let nextData = localStorage.getItem('mms_tab_' + (i + 1));
                    if (nextData) {
                        localStorage.setItem('mms_tab_' + i, nextData);
                    } else {
                        localStorage.removeItem('mms_tab_' + i);
                    }
                }
                
                // Limpa a última
                localStorage.removeItem('mms_tab_' + numAbasVisiveis);
                numAbasVisiveis--;
                localStorage.setItem('mms_num_abas', numAbasVisiveis);
                
                if (activeTab >= tabIndex) {
                    activeTab = Math.max(1, activeTab - 1);
                    localStorage.setItem('mms_active_tab', activeTab);
                }
                
                carregarTab(activeTab);
                renderTabsUI();
            });
        }

        function renderTabsUI() {
            if (numAbasVisiveis >= 4) {
                document.getElementById('btn-add-relatorio').style.display = 'none';
            } else {
                document.getElementById('btn-add-relatorio').style.display = 'flex';
            }
            
            for (let i = 1; i <= 4; i++) {
                let tabData = JSON.parse(localStorage.getItem('mms_tab_' + i));
                let tabNameEl = document.getElementById('tab-name-' + i);
                let tabBtnEl = document.getElementById('tab-btn-' + i);
                
                if (tabData) {
                    let label = tabData.unidade ? tabData.unidade.toUpperCase() : 'Vazio';
                    if (tabNameEl) tabNameEl.innerText = label;
                } else if (tabNameEl) {
                    tabNameEl.innerText = 'Vazio';
                }
                
                if (tabBtnEl) {
                    if (i <= numAbasVisiveis) {
                        tabBtnEl.style.display = 'flex';
                    } else {
                        tabBtnEl.style.display = 'none';
                    }

                    let textLabel = tabBtnEl.querySelector('.tab-lbl');
                    let nameLabel = tabBtnEl.querySelector('.tab-nm');
                    if (i === activeTab) {
                        tabBtnEl.className = "relative flex flex-col items-center justify-center p-2.5 rounded-lg bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-200/50 transition-all duration-300 transform scale-[1.02] cursor-pointer";
                        if (textLabel) {
                            textLabel.className = "tab-lbl text-[9px] font-black uppercase tracking-widest text-blue-600 transition-colors";
                        }
                        if (nameLabel) {
                            nameLabel.className = "tab-nm text-[12px] font-black text-slate-800 truncate max-w-full";
                        }
                    } else {
                        tabBtnEl.className = "relative flex flex-col items-center justify-center p-2.5 rounded-lg bg-transparent text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 transition-all duration-300 cursor-pointer border border-transparent";
                        if (textLabel) {
                            textLabel.className = "tab-lbl text-[9px] font-bold uppercase tracking-wider text-slate-400 transition-colors";
                        }
                        if (nameLabel) {
                            nameLabel.className = "tab-nm text-[11px] font-bold text-slate-500 truncate max-w-full";
                        }
                    }
                }
            }
        }

        function switchTab(newTabIndex) {
            if (newTabIndex === activeTab) return;
            salvarTabAtiva();
            activeTab = newTabIndex;
            localStorage.setItem('mms_active_tab', activeTab);
            carregarTab(activeTab);
        }

        // --- SISTEMA DE AUTENTICAÇÃO AJAX E BIOMETRIA ---
        function abrirModalAuth(abaDefault = 'login') {
            const modal = document.getElementById('modal-auth');
            const card = document.getElementById('modal-auth-card');
            
            // Oculta alertas antigos
            const alerta = document.getElementById('auth-alerta');
            alerta.className = 'hidden';
            alerta.innerText = '';

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            }, 50);

            alternarFormAuth(abaDefault);
            verificarSuporteBiometria();

            // Se a biometria estiver habilitada e abrindo na aba de login, dispara automaticamente
            if (abaDefault === 'login' && localStorage.getItem('mms_biometric_enabled') === 'true') {
                setTimeout(() => {
                    loginComBiometria();
                }, 350);
            }
        }

        function fecharModalAuth() {
            const modal = document.getElementById('modal-auth');
            const card = document.getElementById('modal-auth-card');

            card.classList.remove('scale-100', 'opacity-100');
            card.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
            }, 300);
        }

        function alternarFormAuth(aba) {
            const formLogin = document.getElementById('form-login-ajax');
            const formCadastro = document.getElementById('form-cadastro-ajax');
            const btnTabLogin = document.getElementById('btn-tab-login');
            const btnTabCadastro = document.getElementById('btn-tab-cadastro');

            if (aba === 'login') {
                formLogin.classList.remove('hidden');
                formCadastro.classList.add('hidden');
                btnTabLogin.className = "flex-1 pb-3 text-sm font-bold uppercase tracking-wider text-center border-b-2 border-blue-500 text-blue-400 transition-colors cursor-pointer";
                btnTabCadastro.className = "flex-1 pb-3 text-sm font-bold uppercase tracking-wider text-center border-b-2 border-transparent text-slate-400 hover:text-slate-800 transition-colors cursor-pointer";
            } else {
                formLogin.classList.add('hidden');
                formCadastro.classList.remove('hidden');
                btnTabLogin.className = "flex-1 pb-3 text-sm font-bold uppercase tracking-wider text-center border-b-2 border-transparent text-slate-400 hover:text-slate-800 transition-colors cursor-pointer";
                btnTabCadastro.className = "flex-1 pb-3 text-sm font-bold uppercase tracking-wider text-center border-b-2 border-emerald-500 text-emerald-400 transition-colors cursor-pointer";
            }
        }

        function exibirAlertaAuth(mensagem, tipo = 'erro') {
            const alerta = document.getElementById('auth-alerta');
            alerta.classList.remove('hidden');
            if (tipo === 'sucesso') {
                alerta.className = "bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 px-4 py-3 rounded-lg mb-4 text-xs font-semibold text-center tracking-wide block";
            } else {
                alerta.className = "bg-rose-500/15 border border-rose-500/35 text-rose-300 px-4 py-3 rounded-lg mb-4 text-xs font-semibold text-center tracking-wide block";
            }
            alerta.innerText = mensagem;
        }

        async function submeterLoginAjax(event) {
            event.preventDefault();
            const form = event.target;
            const formData = new FormData(form);

            const btnSubmit = document.getElementById('btn-auth-submit');
            const originalText = btnSubmit.innerText;
            btnSubmit.innerText = "VERIFICANDO...";
            btnSubmit.disabled = true;

            try {
                const res = await fetch('login.php', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                const data = await res.json();
                if (data.sucesso) {
                    // Login com sucesso!
                    const username = document.getElementById('in-login-user').value;
                    const pass = document.getElementById('in-login-pass').value;
                    
                    // Se o dispositivo suporta biometria e ainda não está ativado
                    if (window.PublicKeyCredential && localStorage.getItem('mms_biometric_enabled') !== 'true') {
                        // Salva para usarmos no modal de enroll
                        sessionStorage.setItem('mms_temp_enroll_user', username);
                        sessionStorage.setItem('mms_temp_enroll_pass', btoa(pass));
                        
                        fecharModalAuth();
                        // Mostra prompt de ativação de biometria
                        document.getElementById('modal-enroll-biometry').classList.remove('hidden');
                        document.getElementById('modal-enroll-biometry').classList.add('flex');
                    } else {
                        // Apenas recarrega a página
                        window.location.reload();
                    }
                } else {
                    exibirAlertaAuth(data.erro || "Usuário ou senha incorretos.");
                    btnSubmit.innerText = originalText;
                    btnSubmit.disabled = false;
                }
            } catch (err) {
                console.error(err);
                exibirAlertaAuth("Erro de conexão com o servidor.");
                btnSubmit.innerText = originalText;
                btnSubmit.disabled = false;
            }
        }

        async function submeterCadastroAjax(event) {
            event.preventDefault();
            const form = event.target;
            const formData = new FormData(form);

            try {
                const res = await fetch('cadastro.php', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                const data = await res.json();
                if (data.sucesso) {
                    exibirAlertaAuth("Cadastro realizado com sucesso! Faça login abaixo.", "sucesso");
                    setTimeout(() => {
                        alternarFormAuth('login');
                        // Preenche o campo de usuário cadastrado para facilitar
                        document.getElementById('in-login-user').value = document.getElementById('in-reg-user').value;
                        document.getElementById('in-login-pass').value = '';
                    }, 1500);
                } else {
                    exibirAlertaAuth(data.erro || "Falha ao realizar cadastro.");
                }
            } catch (err) {
                console.error(err);
                exibirAlertaAuth("Erro de conexão com o servidor.");
            }
        }

        // --- CONTROLE DE BIOMETRIA ---
        function verificarSuporteBiometria() {
            const btnBiometria = document.getElementById('btn-biometria-login');
            
            // Verifica se o suporte físico à biometria existe ou se já foi cadastrado
            if (localStorage.getItem('mms_biometric_enabled') === 'true') {
                btnBiometria.classList.remove('hidden');
                btnBiometria.classList.add('flex');
            } else {
                btnBiometria.classList.add('hidden');
                btnBiometria.classList.remove('flex');
            }
        }

        let biometriaSimuladaCallback = null;

        function loginComBiometria() {
            if (localStorage.getItem('mms_biometric_enabled') !== 'true') return;

            // Se for HTTPS ou localhost, tentamos usar o WebAuthn real para autenticação biométrica (TouchID/FaceID/Windows Hello)
            if (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                if (window.PublicKeyCredential) {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);
                    
                    navigator.credentials.get({
                        publicKey: {
                            challenge: challenge,
                            rpId: window.location.hostname,
                            userVerification: "required"
                        }
                    }).then(assertion => {
                        if (assertion) {
                            efetuarLoginBiometrico();
                        }
                    }).catch(err => {
                        console.warn("Falha no WebAuthn real, abrindo fallback simulado:", err);
                        abrirBiometriaSimulada(efetuarLoginBiometrico);
                    });
                    return;
                }
            }

            // Fallback para HTTP (Simulação Premium de Biometria)
            abrirBiometriaSimulada(efetuarLoginBiometrico);
        }

        function efetuarLoginBiometrico() {
            const user = localStorage.getItem('mms_biometric_username');
            const pass = atob(localStorage.getItem('mms_biometric_password') || '');

            if (user && pass) {
                const formData = new FormData();
                formData.append('username', user);
                formData.append('senha', pass);

                const btnSubmit = document.getElementById('btn-auth-submit');
                btnSubmit.innerText = "LOGANDO COM BIOMETRIA...";
                btnSubmit.disabled = true;

                fetch('login.php', {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                })
                .then(res => res.json())
                .then(data => {
                    if (data.sucesso) {
                        window.location.reload();
                    } else {
                        exibirAlertaAuth(data.erro || "Falha no login por biometria.");
                        btnSubmit.innerText = "Acessar Plataforma";
                        btnSubmit.disabled = false;
                    }
                })
                .catch(err => {
                    console.error(err);
                    exibirAlertaAuth("Erro de conexão ao realizar login biométrico.");
                    btnSubmit.innerText = "Acessar Plataforma";
                    btnSubmit.disabled = false;
                });
            }
        }

        function abrirBiometriaSimulada(callbackSuccess) {
            biometriaSimuladaCallback = callbackSuccess;
            document.getElementById('modal-biometria-simulada').classList.remove('hidden');
            document.getElementById('modal-biometria-simulada').classList.add('flex');
        }

        function fecharBiometriaSimulada() {
            document.getElementById('modal-biometria-simulada').classList.add('hidden');
            document.getElementById('modal-biometria-simulada').classList.remove('flex');
            biometriaSimuladaCallback = null;
        }

        function confirmarBiometriaSimulada() {
            if (biometriaSimuladaCallback) {
                biometriaSimuladaCallback();
            }
            fecharBiometriaSimulada();
        }

        // Ativação (Enrollment) de Biometria
        function ativarBiometriaUsuario() {
            const user = sessionStorage.getItem('mms_temp_enroll_user');
            const pass = sessionStorage.getItem('mms_temp_enroll_pass');

            if (!user || !pass) {
                recusarBiometriaUsuario();
                return;
            }

            // Tenta usar WebAuthn real para registrar a credencial
            if (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                if (window.PublicKeyCredential) {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);

                    navigator.credentials.create({
                        publicKey: {
                            challenge: challenge,
                            rp: { name: "MMS Suporte Logístico" },
                            user: {
                                id: new Uint8Array(16),
                                name: user,
                                displayName: user
                            },
                            pubKeyCredParams: [{type: "public-key", alg: -7}], // ES256
                            authenticatorSelection: {
                                authenticatorAttachment: "platform",
                                userVerification: "required"
                            },
                            timeout: 60000
                        }
                    }).then(credential => {
                        if (credential) {
                            salvarDadosBiometriaLocal(user, pass);
                        }
                    }).catch(err => {
                        console.warn("Falha no WebAuthn real de cadastro, abrindo fallback simulado:", err);
                        abrirBiometriaSimulada(() => salvarDadosBiometriaLocal(user, pass));
                    });
                    return;
                }
            }

            // Fallback simulado
            abrirBiometriaSimulada(() => salvarDadosBiometriaLocal(user, pass));
        }

        function salvarDadosBiometriaLocal(user, pass) {
            localStorage.setItem('mms_biometric_enabled', 'true');
            localStorage.setItem('mms_biometric_username', user);
            localStorage.setItem('mms_biometric_password', pass); // já está em base64
            
            // Remove temporários
            sessionStorage.removeItem('mms_temp_enroll_user');
            sessionStorage.removeItem('mms_temp_enroll_pass');

            document.getElementById('modal-enroll-biometry').classList.add('hidden');
            document.getElementById('modal-enroll-biometry').classList.remove('flex');
            
            alert("Biometria/FaceID ativada com sucesso para este dispositivo!");
            window.location.reload();
        }

        function recusarBiometriaUsuario() {
            sessionStorage.removeItem('mms_temp_enroll_user');
            sessionStorage.removeItem('mms_temp_enroll_pass');
            document.getElementById('modal-enroll-biometry').classList.add('hidden');
            document.getElementById('modal-enroll-biometry').classList.remove('flex');
            window.location.reload();
        }

        function toggleMenu() { document.getElementById('user-menu-dropdown').classList.toggle('hidden'); }
        window.onclick = e => { if(!e.target.closest('.relative')) document.getElementById('user-menu-dropdown').classList.add('hidden'); }
        const campos = ['grupo', 'unidade', 'data', 'local', 'modal', 'preposto', 'info', 'pax1', 'pax2', 'h3', 'm3', 'h4', 'm4', 'h5', 'm5', 'h6', 'm6'];
        let fotosAnexadas = []; 
        let alinhamentoInfo = localStorage.getItem('mms_align_info') || 'left';
        
        let tamanhoFonteRelatorio = parseInt(localStorage.getItem('mms_fonte_relatorio')) || 15;
        if(tamanhoFonteRelatorio < 14) tamanhoFonteRelatorio = 14;
        if(tamanhoFonteRelatorio > 15) tamanhoFonteRelatorio = 15;
        
        let listaSaidas = JSON.parse(localStorage.getItem('mms_saidas_hotel')) || [
            { label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }
        ];

        // --- SISTEMA DE CACHES DE MEMÓRIA (Suggestive Filling) ---
        function carregarCacheCisativo() {
            const caches = {
                'local': 'datalist-local',
                'modal': 'datalist-modal',
                'preposto': 'datalist-preposto'
            };

            for (const [campoId, listId] of Object.entries(caches)) {
                const cacheData = JSON.parse(localStorage.getItem(`mms_cache_${campoId}`)) || [];
                const datalist = document.getElementById(listId);
                datalist.innerHTML = '';
                cacheData.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item;
                    datalist.appendChild(option);
                });
                const input = document.getElementById(`in-${campoId}`);
                if (input) input.setAttribute('list', listId);
            }
        }

        function salvarCaches() {
            const cachesParaSalvar = ['local', 'modal', 'preposto'];
            
            cachesParaSalvar.forEach(campoId => {
                const input = document.getElementById(`in-${campoId}`);
                if (input && input.value.trim() !== '') {
                    const valorActual = input.value.trim();
                    const cacheKey = `mms_cache_${campoId}`;
                    let cacheData = JSON.parse(localStorage.getItem(cacheKey)) || [];
                    
                    if (!cacheData.includes(valorActual)) {
                        cacheData.unshift(valorActual); 
                        if (cacheData.length > 5) cacheData.pop(); 
                        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                    }
                }
            });
            carregarCacheCisativo();
        }

        // --- SISTEMA WYSIWYG & FORMATAÇÃO ---
        function formatarTextoWysiwyg(comando) {
            document.execCommand(comando, false, null);
            document.getElementById('in-info').focus();
            const el = document.getElementById('in-info');
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function aplicarAlinhamento() {
            const outInfo = document.getElementById('out-info');
            const inInfo = document.getElementById('in-info');
            const btnLeft = document.getElementById('btn-align-left');
            const btnJustify = document.getElementById('btn-align-justify');

            if(outInfo) outInfo.style.textAlign = alinhamentoInfo;
            if(inInfo) inInfo.style.textAlign = alinhamentoInfo;

            const classActive = "flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm text-blue-600 transition-all text-xs font-bold uppercase tracking-wide";
            const classInactive = "flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-transparent rounded-md text-slate-500 hover:bg-slate-200 transition-all text-xs font-bold uppercase tracking-wide";

            if (btnLeft && btnJustify) {
                if (alinhamentoInfo === 'justify') {
                    btnJustify.className = classActive;
                    btnLeft.className = classInactive;
                } else {
                    btnLeft.className = classActive;
                    btnJustify.className = classInactive;
                }
            }
        }

        function mudarAlinhamentoInfo(align) {
            alinhamentoInfo = align;
            salvarTabAtiva();
            aplicarAlinhamento();
        }

        function inserirBolinhaInfo() {
            document.getElementById('in-info').focus();
            document.execCommand('insertText', false, '▪ ');
            const el = document.getElementById('in-info');
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function formatarInfo(htmlContent) {
            if (!htmlContent) return "N/A";
            let cleanHTML = htmlContent.replace(/(<br\s*\/?>|\s|&nbsp;)+$/gi, '').trim();
            if (cleanHTML === '') return "N/A";
            cleanHTML = cleanHTML.replace(/\*([^*]+)\*/g, '<b>$1</b>');
            return cleanHTML.replace(/▪/g, '<strong style="color: black; font-size: 1.2em;">▪</strong>');
        }

        // --- SISTEMA DE FONTE RESTRITA ---
        function aplicarTamanhoFonte() {
            document.getElementById('relatorio-a4').style.fontSize = tamanhoFonteRelatorio + 'px';
        }

        function editarRelatorio() {
            document.getElementById('area-sucesso-pdf').classList.add('hidden');
            document.getElementById('area-sucesso-pdf').classList.remove('flex');
            document.getElementById('btn-gerar').style.display = 'block';
            document.getElementById('conteudo-formulario').classList.remove('opacity-50', 'pointer-events-none');
        }

        function clickSemSaida() {
            const chk = document.getElementById('chk-sem-saida');
            const lbl = chk.closest('label');
            if (chk.checked) {
                lbl.classList.remove('font-bold', 'text-slate-600');
                lbl.classList.add('font-black', 'text-slate-900');
                listaSaidas.forEach(item => {
                    item.h1 = 'N/A'; item.m1 = '';
                    item.h2 = 'N/A'; item.m2 = '';
                });
            } else {
                lbl.classList.remove('font-black', 'text-slate-900');
                lbl.classList.add('font-bold', 'text-slate-600');
                listaSaidas.forEach(item => {
                    if (item.h1 === 'N/A') item.h1 = '';
                    if (item.h2 === 'N/A') item.h2 = '';
                });
            }
            salvarTabAtiva();
            renderSaidasUI();
            renderSaidasPreview();
        }

        function validarHora(el) {
            if(el.value === 'N/A' || el.value === 'N') return;
            el.value = el.value.replace(/\D/g, '');
            if(el.value !== '') {
                let n = parseInt(el.value, 10);
                if(n > 23) el.value = '23';
            }
        }

        function validarMinuto(el) {
            if(el.value === 'N/A' || el.value === 'N') return;
            el.value = el.value.replace(/\D/g, '');
            if(el.value !== '') {
                let n = parseInt(el.value, 10);
                if(n > 59) el.value = '59';
            }
        }

        function clickSemEmbarquePrev(fromLoad = false) {
            const chk = document.getElementById('chk-sem-embarque-prev');
            const lbl = chk.closest('label');
            const inH3 = document.getElementById('in-h3');
            const inM3 = document.getElementById('in-m3');
            
            if (!inH3 || !inM3 || !chk) return;
            
            if (chk.checked) {
                lbl.classList.remove('font-bold', 'text-slate-600');
                lbl.classList.add('font-black', 'text-slate-900');
                [inH3].forEach(inH => {
                    inH.removeAttribute('inputmode');
                    inH.removeAttribute('pattern');
                    inH.setAttribute('maxlength', '3'); 
                    inH.value = 'N/A';
                    inH.readOnly = true;
                    inH.classList.add('bg-slate-200', 'text-slate-500');
                    inH.classList.remove('bg-white');
                });
                [inM3].forEach(inM => {
                    inM.value = '';
                    inM.readOnly = true;
                    inM.classList.add('bg-slate-200', 'text-slate-500');
                    inM.classList.remove('bg-white');
                });
            } else {
                lbl.classList.remove('font-black', 'text-slate-900');
                lbl.classList.add('font-bold', 'text-slate-600');
                [inH3].forEach(inH => {
                    inH.setAttribute('inputmode', 'numeric');
                    inH.setAttribute('pattern', '[0-9]*');
                    inH.setAttribute('maxlength', '2');
                    if (inH.value === 'N/A') inH.value = '';
                    inH.readOnly = false;
                    inH.classList.remove('bg-slate-200', 'text-slate-500');
                    inH.classList.add('bg-white');
                });
                [inM3].forEach(inM => {
                    inM.setAttribute('inputmode', 'numeric');
                    inM.setAttribute('pattern', '[0-9]*');
                    if (inM.value === 'A' || inM.value === 'N/A') inM.value = '';
                    inM.readOnly = false;
                    inM.classList.remove('bg-slate-200', 'text-slate-500');
                    inM.classList.add('bg-white');
                });
            }
            
            if (!fromLoad) {
                salvarTabAtiva();
            }
            renderEmbarquePreview();
        }

        function clickSemEmbarque(fromLoad = false) {
            const chk = document.getElementById('chk-sem-embarque');
            const lbl = chk.closest('label');
            const inH3 = document.getElementById('in-h3');
            const inM3 = document.getElementById('in-m3');
            const inH4 = document.getElementById('in-h4');
            const inM4 = document.getElementById('in-m4');
            
            if (!inH4 || !inM4 || !chk || !inH3 || !inM3) return;
            
            if (chk.checked) {
                lbl.classList.remove('font-bold', 'text-slate-600');
                lbl.classList.add('font-black', 'text-slate-900');
                [inH4].forEach(inH => {
                    inH.removeAttribute('inputmode');
                    inH.removeAttribute('pattern');
                    inH.setAttribute('maxlength', '3'); 
                    inH.value = 'N/A';
                    inH.readOnly = true;
                    inH.classList.add('bg-slate-200', 'text-slate-500');
                    inH.classList.remove('bg-white');
                });
                [inM4].forEach(inM => {
                    inM.value = '';
                    inM.readOnly = true;
                    inM.classList.add('bg-slate-200', 'text-slate-500');
                    inM.classList.remove('bg-white');
                });
            } else {
                lbl.classList.remove('font-black', 'text-slate-900');
                lbl.classList.add('font-bold', 'text-slate-600');
                [inH4].forEach(inH => {
                    inH.setAttribute('inputmode', 'numeric');
                    inH.setAttribute('pattern', '[0-9]*');
                    inH.setAttribute('maxlength', '2');
                    if (inH.value === 'N/A') inH.value = '';
                    inH.readOnly = false;
                    inH.classList.remove('bg-slate-200', 'text-slate-500');
                    inH.classList.add('bg-white');
                });
                [inM4].forEach(inM => {
                    inM.setAttribute('inputmode', 'numeric');
                    inM.setAttribute('pattern', '[0-9]*');
                    if (inM.value === 'A' || inM.value === 'N/A') inM.value = '';
                    inM.readOnly = false;
                    inM.classList.remove('bg-slate-200', 'text-slate-500');
                    inM.classList.add('bg-white');
                });
            }
            
            if (!fromLoad) {
                salvarTabAtiva();
            }
            renderEmbarquePreview();
        }

        function toggleSemSaida() {
            const chk = document.getElementById('chk-sem-saida').checked;
            salvarTabAtiva();
            renderSaidasPreview();
        }

        function ajustarEscalaPreview() {
            const wrapper = document.getElementById('escala-wrapper');
            const screenWidth = window.innerWidth;
            
            // Remove a trava de altura para permitir que o conteúdo expanda livremente e possamos medir a altura real
            wrapper.style.height = 'auto';
            
            if (screenWidth < 820) {
                const scale = (screenWidth - 20) / 794; 
                wrapper.style.transform = `scale(${scale})`;
                
                // Mede a altura TOTAL não-escalada de todos os elementos (relatório principal + anexos)
                const totalHeight = wrapper.scrollHeight;
                wrapper.style.height = `${totalHeight * scale}px`;
            } else {
                wrapper.style.transform = 'none';
                wrapper.style.height = 'auto';
            }
        }
        window.addEventListener('resize', ajustarEscalaPreview);

        function capitalize(str) {
            if (!str) return "";
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        }



        function atualizarCampoSaida(index, campo, valor) {
            listaSaidas[index][campo] = valor;
            salvarTabAtiva();
            renderSaidasPreview(); 
        }

        function adicionarLinhaSaida() {
            listaSaidas.push({ label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' });
            salvarTabAtiva();
            renderSaidasUI();
            renderSaidasPreview();
        }

        function removerLinhaSaida(index) {
            if (listaSaidas.length > 1) {
                listaSaidas.splice(index, 1);
                salvarTabAtiva();
                renderSaidasUI();
                renderSaidasPreview();
            }
        }

        function renderSaidasUI() {
            const container = document.getElementById('container-inputs-saida');
            container.innerHTML = '';
            
            const isSemSaida = document.getElementById('chk-sem-saida') && document.getElementById('chk-sem-saida').checked;
            const hAttrs = isSemSaida ? 'maxlength="3" readonly' : 'maxlength="2" inputmode="numeric" pattern="[0-9]*"';
            const mAttrs = isSemSaida ? 'maxlength="2" readonly' : 'maxlength="2" inputmode="numeric" pattern="[0-9]*"';
            const bgClass = isSemSaida ? 'bg-slate-200 text-slate-500' : 'bg-white';

            listaSaidas.forEach((item, index) => {
                container.innerHTML += `
                    <div class="bg-slate-50 border border-slate-100 p-3 rounded-lg flex flex-col gap-3 relative min-w-0">
                        <div class="flex flex-col md:flex-row md:justify-between items-center gap-3 md:gap-2">
                            <div class="flex items-center flex-1 min-w-0 justify-center md:justify-start overflow-hidden w-full md:w-auto">
                                <input type="text" placeholder="Ex: Previsto DOF" name="saida_label1_${index}" value="${item.label1}" oninput="this.classList.remove('erro-validacao'); this.style.width = (this.value.length || 10) + 2 + 'ch'; atualizarCampoSaida(${index}, 'label1', this.value)" onblur="atualizarCampoSaida(${index}, 'label1', this.value)" style="width: ${item.label1 ? item.label1.length + 2 : 12}ch;" class="min-w-[80px] max-w-full text-base font-extrabold border-b-2 border-slate-200 outline-none bg-transparent text-blue-700 focus:border-blue-400 transition-colors pb-1 text-center md:text-left">
                                <span class="text-sm font-bold text-slate-400 ml-0.5 shrink-0">:</span>
                            </div>
                            <div class="flex items-center gap-1 mx-auto md:mx-0"><input type="text" name="saida_h1_${index}" value="${item.h1}" ${hAttrs} oninput="this.classList.remove('erro-validacao'); validarHora(this); atualizarCampoSaida(${index}, 'h1', this.value)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${bgClass} transition-all shadow-inner">
                            <span class="text-slate-400 font-bold text-sm">h</span>
                            <input type="text" name="saida_m1_${index}" value="${item.m1}" ${mAttrs} oninput="this.classList.remove('erro-validacao'); validarMinuto(this); atualizarCampoSaida(${index}, 'm1', this.value)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${bgClass} transition-all shadow-inner">
                            <span class="text-slate-400 font-bold text-sm">m</span></div>
                        </div>
                        <div class="flex flex-col md:flex-row md:justify-between items-center gap-3 md:gap-2 border-t border-slate-100 pt-3 mt-1">
                            <span class="w-full md:w-24 text-[11px] font-black text-black uppercase tracking-wider text-center md:text-left pl-1">Real:</span>
                            <div class="flex items-center gap-1 mx-auto md:mx-0"><input type="text" name="saida_h2_${index}" value="${item.h2}" ${hAttrs} oninput="this.classList.remove('erro-validacao'); validarHora(this); atualizarCampoSaida(${index}, 'h2', this.value)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${bgClass} transition-all shadow-inner">
                            <span class="text-slate-400 font-bold text-sm">h</span>
                            <input type="text" name="saida_m2_${index}" value="${item.m2}" ${mAttrs} oninput="this.classList.remove('erro-validacao'); validarMinuto(this); atualizarCampoSaida(${index}, 'm2', this.value)" class="w-[68px] md:w-[72px] border-2 border-slate-300 rounded-xl py-[12px] px-2 md:py-[14px] md:px-[10px] text-center text-base font-black outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${bgClass} transition-all shadow-inner">
                            <span class="text-slate-400 font-bold text-sm">m</span></div>
                        </div>
                        ${index > 0 ? `<button onclick="removerLinhaSaida(${index})" class="absolute -top-2 -right-2 bg-rose-100 text-rose-600 rounded-full w-6 h-6 flex items-center justify-center font-bold border border-rose-200 hover:bg-rose-200 transition-colors shadow-sm">✕</button>` : ''}
                    </div>
                `;
            });
        }

        function renderEmbarquePreview() {
            const h3 = document.getElementById('in-h3') ? document.getElementById('in-h3').value : '';
            const m3 = document.getElementById('in-m3') ? document.getElementById('in-m3').value : '';
            const h4 = document.getElementById('in-h4') ? document.getElementById('in-h4').value : '';
            const m4 = document.getElementById('in-m4') ? document.getElementById('in-m4').value : '';
            
            let prevHTML = '';
            if (h3.toUpperCase() === 'N/A' || h3.toUpperCase() === 'N' || h3.toUpperCase() === 'NA') {
                prevHTML = `N/A`;
            } else {
                prevHTML = `<span id="out-h3" class="time-input-pdf">${h3}</span>h<span id="out-m3" class="time-input-pdf">${m3}</span>min`;
            }

            let realHTML = '';
            if (h4.toUpperCase() === 'N/A' || h4.toUpperCase() === 'N' || h4.toUpperCase() === 'NA') {
                realHTML = `N/A`;
            } else {
                realHTML = `<span id="out-h4" class="time-input-pdf">${h4}</span>h<span id="out-m4" class="time-input-pdf">${m4}</span>min`;
            }

            const container = document.getElementById('out-container-embarque');
            if (container) {
                container.innerHTML = `<span class="label-pdf">Previsto:&nbsp;</span>${prevHTML} &nbsp;&nbsp;&nbsp;&nbsp;<span class="label-pdf">Real:&nbsp;</span>${realHTML}`;
            }
        }

        function renderSaidasPreview() {
            const container = document.getElementById('out-container-saida');
            container.innerHTML = '';
            listaSaidas.forEach(item => {
                let h1Str = item.h1 || '';
                let h2Str = item.h2 || '';
                let m1Str = item.m1 || '';
                let m2Str = item.m2 || '';
                
                let prevHTML = '';
                if (h1Str.toUpperCase() === 'N/A' || h1Str.toUpperCase() === 'N' || h1Str.toUpperCase() === 'NA') {
                    prevHTML = `N/A`;
                } else {
                    prevHTML = `<span class="time-input-pdf">${h1Str}</span>h<span class="time-input-pdf">${m1Str}</span>min`;
                }

                let realHTML = '';
                if (h2Str.toUpperCase() === 'N/A' || h2Str.toUpperCase() === 'N' || h2Str.toUpperCase() === 'NA') {
                    realHTML = `N/A`;
                } else {
                    realHTML = `<span class="time-input-pdf">${h2Str}</span>h<span class="time-input-pdf">${m2Str}</span>min`;
                }

                container.innerHTML += `
                    <div class="mb-0.5">
                        <span class="font-black text-black">${item.label1 ? item.label1 + ':' : ''}</span>
                        ${prevHTML} 
                        &nbsp;&nbsp;
                        <span class="font-black text-black">Real:</span>
                        ${realHTML}
                    </div>
                `;
            });
        }

        let tempImgParaGirar = null;
        let rotacaoAtual = 0;

        async function processarFoto(event) {
            const file = event.target.files[0];
            if (!file) return;
            const feedback = document.getElementById('img-feedback');
            feedback.innerText = "⏳ PROCESSANDO ARQUIVO...";
            feedback.className = "text-[10px] text-center mt-2 text-blue-600 font-black animate-pulse tracking-widest";
            try {
                let blobParaUso = file;
                const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
                if (isHeic) {
                    await new Promise(r => setTimeout(r, 100));
                    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.1 });
                    blobParaUso = Array.isArray(converted) ? converted[0] : converted;
                }
                const urlTemp = URL.createObjectURL(blobParaUso);
                const img = new Image();
                img.onload = function() {
                    tempImgParaGirar = img;
                    rotacaoAtual = 0;
                    const imgElement = document.getElementById('img-preview-rotacao');
                    
                    document.getElementById('modal-rotacionar').classList.remove('hidden');
                    document.getElementById('modal-rotacionar').classList.add('flex');
                    
                    if (window.cropperInstance) {
                        window.cropperInstance.destroy();
                    }
                    
                    // Prepara preview nativo (sem Cropper)
                    imgElement.style.display = 'block';
                    imgElement.style.maxWidth = '100%';
                    imgElement.style.transform = 'rotate(0deg)';
                    imgElement.style.transition = 'transform 0.3s ease';
                    imgElement.src = urlTemp;

                    feedback.innerText = "ESCOLHA A ORIENTAÇÃO DA FOTO E CLIQUE EM CONFIRMAR";
                    feedback.className = "text-[10px] text-center mt-2 text-slate-500 font-bold tracking-widest";
                };
                img.src = urlTemp;
            } catch (err) {
                feedback.innerText = "ERRO AO PROCESSAR ❌";
                feedback.className = "text-[10px] text-center mt-2 text-rose-600 font-black tracking-widest";
                alert("Erro ao processar foto.");
            }
            event.target.value = ''; 
        }

        document.addEventListener('DOMContentLoaded', () => {
            const modalRot = document.getElementById('modal-rotacionar');
            const btnFecharRot = document.getElementById('btn-fechar-modal-rotacionar');
            const btnGirar = document.getElementById('btn-girar-foto');
            const btnConfirma = document.getElementById('btn-confirmar-rotacao');
            const imgPreview = document.getElementById('img-preview-rotacao');

            if(btnFecharRot) {
                btnFecharRot.addEventListener('click', () => {
                    modalRot.classList.add('hidden');
                    modalRot.classList.remove('flex');
                    tempImgParaGirar = null;
                });
            }

            if(btnGirar) {
                btnGirar.addEventListener('click', () => {
                    rotacaoAtual += 90;
                    if(imgPreview) {
                        imgPreview.style.transform = `rotate(${rotacaoAtual}deg)`;
                    }
                });
            }

            if(btnConfirma) {
                btnConfirma.addEventListener('click', () => {
                    if(!tempImgParaGirar) return;
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    let angle = rotacaoAtual % 360;
                    if (angle < 0) angle += 360;
                    let w = tempImgParaGirar.width; 
                    let h = tempImgParaGirar.height;
                    const MAX = 800; 

                    if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
                    else { if (h > MAX) { w *= MAX / h; h = MAX; } }

                    if (angle === 90 || angle === 270) {
                        canvas.width = h;
                        canvas.height = w;
                    } else {
                        canvas.width = w;
                        canvas.height = h;
                    }
                    
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(angle * Math.PI / 180);
                    ctx.drawImage(tempImgParaGirar, -w / 2, -h / 2, w, h);
                    
                    const base64 = canvas.toDataURL('image/jpeg', 0.65);
                    
                    modalRot.classList.add('hidden');
                    modalRot.classList.remove('flex');
                    
                    const tituloPadrao = 'ANEXO FOTOGRÁFICO';
                    
                    fotosAnexadas.push({
                        id: Date.now(),
                        base64: base64,
                        titulo: tituloPadrao
                    });
                    
                    tempImgParaGirar = null;
                    
                    renderizarAnexosUI();
                    try { salvarTabAtiva(); } catch(e) { console.warn('Limite de storage excedido ao salvar foto'); }
                    reajustarLayout();
                    
                    const feedback = document.getElementById('img-feedback');
                    if (feedback) {
                        feedback.innerText = "FOTO ENVIADA EM HD COM SUCESSO ✅";
                        feedback.className = "text-[10px] text-center mt-2 text-emerald-600 font-black tracking-widest";
                    }
                });
            }
        });

        function formatarData(dataOriginal) {
            if (!dataOriginal) return "";
            const partes = dataOriginal.split('-');
            return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataOriginal;
        }

        function formatarTextoNegrito(texto) {
            if (!texto) return "";
            let textoSeguro = texto.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return textoSeguro.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<b>$1</b>');
        }

        function removerFoto(id) {
            fotosAnexadas = fotosAnexadas.filter(f => f.id !== id);
            salvarTabAtiva();
            renderizarAnexosUI(); reajustarLayout();
        }

        function atualizarTituloFoto(id, titulo) {
            const foto = fotosAnexadas.find(f => f.id === id);
            if (foto) {
                foto.titulo = titulo.toUpperCase();
                salvarTabAtiva();
            }
            reajustarLayout();
        }

        function moverFoto(id, direcao) {
            const index = fotosAnexadas.findIndex(f => f.id === id);
            if (index === -1) return;
            
            const novoIndex = index + direcao;
            if (novoIndex < 0 || novoIndex >= fotosAnexadas.length) return;
            
            // Troca de posição
            const temp = fotosAnexadas[index];
            fotosAnexadas[index] = fotosAnexadas[novoIndex];
            fotosAnexadas[novoIndex] = temp;
            
            salvarTabAtiva();
            renderizarAnexosUI();
            reajustarLayout();
        }

        function renderizarAnexosUI() {
            const container = document.getElementById('lista-anexos');
            container.innerHTML = '';
            fotosAnexadas.forEach((foto, index) => {
                const isFirst = index === 0;
                const isLast = index === fotosAnexadas.length - 1;
                
                container.innerHTML += `
                        <div class="bg-white p-4 border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-all flex flex-col gap-3 min-w-0" data-id="${foto.id}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <img src="${foto.base64}" onclick="abrirPreviewAnexo('${foto.base64}')" class="w-16 h-16 object-cover rounded-lg border border-slate-100 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" title="Clique para ampliar">
                            </div>
                            
                            <!-- Painel de Controles -->
                            <div class="flex items-center gap-1.5">
                                <!-- Mover para cima -->
                                <button type="button" onclick="moverFoto(${foto.id}, -1)" ${isFirst ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para cima">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>
                                </button>
                                <!-- Mover para baixo -->
                                <button type="button" onclick="moverFoto(${foto.id}, 1)" ${isLast ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Mover para baixo">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                <!-- Divisor -->
                                <div class="w-[1px] h-6 bg-slate-200 mx-1"></div>
                                <!-- Remover -->
                                <button type="button" onclick="removerFoto(${foto.id})" class="text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Campo de Título do Anexo (Largura Total) -->
                        <div class="w-full">
                            <label class="block text-[9px] font-black text-slate-900 uppercase tracking-widest mb-1.5 ml-0.5">TITULO DA PÁGINA NO RELATÓRIO:</label>
                            <div class="relative">
                                <input type="text" value="${foto.titulo}" placeholder="ex: ANEXO FOTOGRÁFICO" oninput="atualizarTituloFoto(${foto.id}, this.value)" class="w-full border-2 border-blue-200/60 rounded-lg p-3 pr-10 text-sm font-black uppercase text-blue-900 bg-blue-50/30 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all box-border shadow-inner">
                                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>`;
            });
        }

        function renderTablePax() {
            // Remove páginas dinâmicas anteriores do preview
            document.querySelectorAll('.page-a4-dynamic-pax').forEach(el => el.remove());
            
            const blocoPax = document.getElementById('bloco-passageiros');
            if (blocoPax) blocoPax.style.display = 'none';
            
            let pax1 = document.getElementById('in-pax1') ? document.getElementById('in-pax1').value : '';
            let pax2 = document.getElementById('in-pax2') ? document.getElementById('in-pax2').value : '';
            
            let pax1Linhas = pax1.split('\n').map(l => l.trim());
            let pax2Linhas = pax2.split('\n').map(l => l.trim());
            
            let maxLinhas = Math.max(pax1Linhas.length, pax2Linhas.length);
            
            // Clean up old dynamic blocks on page 1 if any
            const firstPageContent = document.querySelector('#relatorio-a4 .conteudo-pdf');
            if(firstPageContent) {
                const oldBlocks = firstPageContent.querySelectorAll('.pax-dynamic-block');
                oldBlocks.forEach(el => el.remove());
            }

            if (maxLinhas === 0 || (pax1.trim() === '' && pax2.trim() === '')) {
                if (firstPageContent) {
                    firstPageContent.insertAdjacentHTML('beforeend', `
                    <div class="pax-dynamic-block" style="width: 100%; overflow: hidden; page-break-inside: auto; margin-top: 40px;">
                        <div style="width: 44%; float: left; border-right: 1px solid #ccc; padding-right: 4%; overflow-wrap: break-word; word-wrap: break-word;">
                            <div class="pax-title" style="margin-bottom: 5px; font-weight: bold; font-size: 16px;">Nomes Passageiros Embarcando:</div>
                            <div style="line-height: 1.4;">N/A</div>
                        </div>
                        <div style="width: 44%; float: right; padding-left: 2%; overflow-wrap: break-word; word-wrap: break-word;">
                            <div class="pax-title" style="margin-bottom: 5px; font-weight: bold; font-size: 16px;">Nomes Passageiros Desembarcados:</div>
                            <div style="line-height: 1.4;">N/A</div>
                        </div>
                        <div style="clear: both;"></div>
                    </div>`);
                }
                return;
            }

            const itemsPerPage = 20;
            const numPages = Math.ceil(maxLinhas / itemsPerPage);
            
            for (let p = 0; p < numPages; p++) {
                let start = p * itemsPerPage;
                let end = start + itemsPerPage;
                
                let chunk1 = pax1Linhas.slice(start, end).map(formatarTextoNegrito).map(l => l === '' ? '<div style="margin-bottom: 3px;">&nbsp;</div>' : `<div style="margin-bottom: 3px; word-wrap: break-word;">${l}</div>`).join('');
                let chunk2 = pax2Linhas.slice(start, end).map(formatarTextoNegrito).map(l => l === '' ? '<div style="margin-bottom: 3px;">&nbsp;</div>' : `<div style="margin-bottom: 3px; word-wrap: break-word;">${l}</div>`).join('');
                
                if (!chunk1) chunk1 = '&nbsp;';
                if (!chunk2) chunk2 = '&nbsp;';
                
                let titleSuffix = p > 0 ? ' (Cont.)' : '';

                let htmlBlock = `
                <div class="pax-dynamic-block" style="width: 100%; overflow: hidden; page-break-inside: auto; margin-top: 40px;">
                    <div style="box-sizing: border-box; width: 50%; float: left; border-right: 1px solid #ccc; padding-right: 2%; overflow-wrap: break-word; word-wrap: break-word;">
                        <div class="pax-title" style="margin-bottom: 5px; font-weight: bold; font-size: 16px;">Nomes Passageiros Embarcando${titleSuffix}:</div>
                        <div style="line-height: 1.4;">${chunk1}</div>
                    </div>
                    <div style="box-sizing: border-box; width: 50%; float: right; padding-left: 2%; overflow-wrap: break-word; word-wrap: break-word;">
                        <div class="pax-title" style="margin-bottom: 5px; font-weight: bold; font-size: 16px;">Nomes Passageiros Desembarcados${titleSuffix}:</div>
                        <div style="line-height: 1.4;">${chunk2}</div>
                    </div>
                    <div style="clear: both;"></div>
                </div>`;

                if (p === 0) {
                    firstPageContent.insertAdjacentHTML('beforeend', htmlBlock);
                } else {
                    const wrapper = document.getElementById('escala-wrapper');
                    const containerAnexosPdf = document.getElementById('container-anexos-pdf');
                    
                    const newPage = document.createElement('div');
                    newPage.className = 'page-a4 page-a4-dynamic-pax transform-origin-top shadow-xl mt-6';
                    newPage.innerHTML = `
                        <div class="bg-pagina"></div>
                        <div class="fixed-logo"><img src="images/logo.jpg" alt="Logo MMS"></div>
                        <div class="conteudo-pdf">
                            ${htmlBlock}
                        </div>
                        <div class="footer">Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020</div>
                    `;
                    wrapper.insertBefore(newPage, containerAnexosPdf);
                }
            }
        }

        // MOTOR DE ALTURA DINÂMICA (PAGINAÇÃO FLEXÍVEL)
        function reajustarLayout() {
            const relatorio = document.getElementById('relatorio-a4');
            const containerAnexosPdf = document.getElementById('container-anexos-pdf');
            containerAnexosPdf.innerHTML = '';
            fotosAnexadas.forEach((foto, index) => {
                containerAnexosPdf.innerHTML += `
                    <div class="page-a4">
                        <div class="bg-pagina"></div>
                        <div class="fixed-logo"><img src="images/logo.jpg" alt="Logo MMS"></div>
                        <div class="conteudo-pdf">
                            <div style="padding-top: 10px; text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 10px; text-decoration: underline;">${foto.titulo}</div>
                            <div style="text-align: center; width: 100%;">
                                <img src="${foto.base64}" onload="ajustarEscalaPreview()" style="max-width: 100%; max-height: 650px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;">
                            </div>
                        </div>
                        <div class="footer">
                            Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                        </div>
                    </div>`;
            });
            renderTablePax();
            ajustarEscalaPreview(); 
            aplicarAlinhamento();
        }

        // ROTINA FORÇADA DE SINCRONIZAÇÃO DE CACHE AO CARREGAR
        function atualizarValoresSalvos() {
            campos.forEach(id => {
                let salvo = localStorage.getItem('mms_save_' + id);
                const elInput = document.getElementById('in-' + id);
                const elOutput = document.getElementById('out-' + id);
                
                if(salvo !== null && salvo !== undefined) {
                    if (id === 'unidade') {
                        salvo = salvo.toUpperCase();
                        if(elInput) elInput.value = salvo;
                        if(elOutput) elOutput.innerText = salvo;
                    }
                    else if (id === 'data') {
                        if(elInput) { elInput.type = 'date'; elInput.value = salvo; }
                        if(elOutput) elOutput.innerText = formatarData(salvo);
                    }
                    else if (id === 'info') {
                        if(elInput) elInput.innerHTML = salvo; 
                        if(elOutput) {
                            const clean = salvo.replace(/(<br\s*\/?>|\s|&nbsp;)+$/gi, '').trim();
                            elOutput.innerHTML = clean === '' ? 'N/A' : formatarInfo(salvo);
                        }
                    }
                    else if (id === 'pax1' || id === 'pax2') {
                        if(elInput) elInput.value = salvo;
                    }
                    else {
                        if(elInput && !elInput.readOnly) {
                            elInput.value = salvo;
                        }
                        if(elOutput) {
                            elOutput.innerText = (elInput && elInput.readOnly) ? elInput.value : salvo;
                        }
                    }
                } else if (elInput && elOutput && elInput.value) {
                    // CORREÇÃO: Espelha para o PDF os valores nativos do HTML (ex: "Helicóptero" no Modal) 
                    // que não foram acionados para entrar no cache do usuário ainda.
                    if (id !== 'info' && id !== 'pax1' && id !== 'pax2') {
                        elOutput.innerText = elInput.value;
                    }
                }
            });
        }

        window.onload = () => {
            initTabs();
            carregarTab(activeTab);
            carregarCacheCisativo();

            // Bloqueia formatação extra durante o "Colar" no box de Informações
            const inInfo = document.getElementById('in-info');
            if (inInfo) {
                inInfo.addEventListener('paste', function(e) {
                    e.preventDefault();
                    let text = (e.originalEvent || e).clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                });
            }
        };

        document.querySelectorAll('.save-local').forEach(el => {
            el.addEventListener('input', () => {
                el.classList.remove('erro-validacao');
                
                const idReal = el.id.replace('in-', '');
                
                let valorToSave;
                if (idReal === 'info') {
                    valorToSave = el.innerHTML; 
                } else {
                    valorToSave = el.value;
                    if (idReal === 'unidade') {
                        valorToSave = valorToSave.toUpperCase();
                        el.value = valorToSave;
                    }
                }
                
                salvarTabAtiva();
                
                // Atualiza em tempo real a folha do PDF garantindo N/A se vazio
                const elOutput = document.getElementById('out-' + idReal);
                if (idReal === 'h3' || idReal === 'm3' || idReal === 'h4' || idReal === 'm4') {
                    renderEmbarquePreview();
                } else if(elOutput) {
                    if (idReal === 'data') {
                        elOutput.innerText = formatarData(valorToSave);
                    } else if (idReal === 'pax1' || idReal === 'pax2') {
                        // handled by reajustarLayout -> renderTablePax
                    } else if (idReal === 'info') {
                        const cleanText = el.innerText.trim();
                        elOutput.innerHTML = cleanText === '' ? 'N/A' : formatarInfo(valorToSave);
                    } else {
                        elOutput.innerText = valorToSave;
                    }
                }
                
                reajustarLayout();
            });
        });

        // --- SISTEMA DE GERAÇÃO DE PDF & NUMERAÇÃO ---
        async function gerarPDF() {
            salvarCaches();

            const camposParaValidar = [
                'in-unidade', 'in-data', 'in-local', 'in-modal', 'in-preposto',
                'in-h3', 'in-m3', 'in-h4', 'in-m4', 'in-h5', 'in-m5', 'in-h6', 'in-m6',
                'in-pax1', 'in-pax2'
            ];
            
            let temErro = false;
            
            document.querySelectorAll('.erro-validacao').forEach(el => {
                el.classList.remove('erro-validacao');
            });

            camposParaValidar.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.value.trim() === '' && !el.readOnly) {
                    temErro = true;
                    el.classList.add('erro-validacao');
                }
            });

            const semSaida = document.getElementById('chk-sem-saida') && document.getElementById('chk-sem-saida').checked;
            if (!semSaida) {
                const inputsSaida = document.querySelectorAll('#container-inputs-saida input[type="text"]');
                inputsSaida.forEach(el => {
                    if (el.value.trim() === '') {
                        temErro = true;
                        el.classList.add('erro-validacao');
                    }
                });
            }

            if (temErro) {
                customAlert('Por favor, preencha todos os campos obrigatórios destacados em vermelho antes de gerar o relatório.');
                const primeiroErro = document.querySelector('.erro-validacao');
                if (primeiroErro) {
                    primeiroErro.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return; 
            }

            const pacote = {
                grupo: document.getElementById('in-grupo') ? document.getElementById('in-grupo').value : 'N/A',
                unidade: document.getElementById('in-unidade').value,
                data: document.getElementById('in-data').value,
                local: document.getElementById('in-local').value,
                modal: document.getElementById('in-modal').value,
                preposto: document.getElementById('in-preposto').value,
                observacao_nome_arquivo: document.getElementById('in-observacao') ? document.getElementById('in-observacao').value : '',
                horarios: {
                    saida_hotel: listaSaidas,
                    embarque_previsto: `${document.getElementById('in-h3').value}:${document.getElementById('in-m3').value}`,
                    embarque_real: `${document.getElementById('in-h4').value}:${document.getElementById('in-m4').value}`,
                    atendimento_inicio: `${document.getElementById('in-h5').value}:${document.getElementById('in-m5').value}`,
                    atendimento_fim: `${document.getElementById('in-h6').value}:${document.getElementById('in-m6').value}`
                },
                info_troca: (document.getElementById('in-info').innerHTML || '').replace(/\*([^*]+)\*/g, '<b>$1</b>'),
                pax_embarcando: document.getElementById('in-pax1').value,
                pax_desembarcando: document.getElementById('in-pax2').value,
                fotos: fotosAnexadas 
            };

            const ui = document.getElementById('interface-preenchimento');
            const previewTitle = document.getElementById('titulo-preview');
            const pdf = document.getElementById('relatorio-a4');
            const btnGerar = document.getElementById('btn-gerar');
            
            const unidadeRaw = document.getElementById('in-unidade').value || 'MMS';
            const unidadeClean = unidadeRaw.trim().replace(/\s+/g, '_').toUpperCase();

            const dataRaw = document.getElementById('in-data').value;
            let dataFormatada = '00-00-0000';
            if(dataRaw) {
                const partes = dataRaw.split('-');
                dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            }

            const nomeArquivo = `${unidadeClean}_${dataFormatada}.pdf`;

            btnGerar.innerText = "Gerando PDF...";
            document.getElementById('loading-overlay').classList.remove('hidden');
            document.getElementById('loading-overlay').classList.add('flex');

            const bgP2 = document.getElementById('bg-p2');
            const totalPaginasTexto = (bgP2 && bgP2.style.display === 'block') ? 2 : 1;
            const totalPaginasFotos = fotosAnexadas.length;

            for (let i = 1; i <= totalPaginasTexto; i++) {
                const numDiv = document.createElement('div');
                numDiv.className = 'page-number-pdf';
                numDiv.innerText = i;
                numDiv.style.top = `${(i - 1) * 297 + 275}mm`;
                pdf.appendChild(numDiv);
            }

            const anexosContainer = document.getElementById('container-anexos-pdf');
            if (anexosContainer) {
                const fotoPáginas = anexosContainer.querySelectorAll('div[style*="position: absolute"]');
                fotoPáginas.forEach((p, idx) => {
                    const num = totalPaginasTexto + idx + 1;
                    const numDiv = document.createElement('div');
                    numDiv.className = 'page-number-pdf';
                    numDiv.innerText = num;
                    numDiv.style.bottom = '10mm';
                    p.appendChild(numDiv);
                });
            }

            try { 
                // 1. Envia os dados para o PHP (que agora gera o PDF com DomPDF)
                const res = await fetch('salvar_relatorio.php', { method: 'POST', body: JSON.stringify(pacote) });
                const jsonResp = await res.json();
                
                if (!jsonResp.sucesso) {
                    throw new Error(jsonResp.erro || "Falha ao gerar o PDF no servidor.");
                }

                // 2. Baixa o PDF gerado pelo PHP (usando o script de download para evitar bloqueio do .htaccess)
                const pdfFetchUrl = jsonResp.id_relatorio 
                    ? 'download_pdf.php?id=' + jsonResp.id_relatorio 
                    : 'download_pdf.php?file=' + encodeURIComponent(jsonResp.pdf_url.split('/').pop()) + '&name=' + encodeURIComponent(jsonResp.nome_arquivo);
                
                const pdfRes = await fetch(pdfFetchUrl);
                if (!pdfRes.ok) throw new Error("Não foi possível baixar o arquivo PDF do servidor.");
                const pdfBlob = await pdfRes.blob();

                // Salva o estado do PDF na aba atual para que sobreviva à troca de abas
                let tabData = JSON.parse(localStorage.getItem('mms_tab_' + activeTab)) || {};
                tabData.pdfGerado = {
                    fetchUrl: pdfFetchUrl,
                    nome_arquivo: jsonResp.nome_arquivo
                };
                localStorage.setItem('mms_tab_' + activeTab, JSON.stringify(tabData));
                
                // Em vez de forçar o download direto (que falha no Safari/WebViews), mostramos a UI manual
                const btnGerar = document.getElementById('btn-gerar');
                const areaSucesso = document.getElementById('area-sucesso-pdf');
                const btnShare = document.getElementById('btn-share-manual');
                const btnDownload = document.getElementById('btn-download-manual');
                
                btnGerar.style.display = 'none';
                areaSucesso.classList.remove('hidden');
                areaSucesso.classList.add('flex');
                document.getElementById('conteudo-formulario').classList.add('opacity-50', 'pointer-events-none');
                
                // Configura o link de download direto usando o Blob recém-baixado (evita bloqueios do navegador)
                const blobUrl = URL.createObjectURL(pdfBlob);
                btnDownload.href = blobUrl;
                btnDownload.download = jsonResp.nome_arquivo; // Força comportamento de download no Chrome
                btnDownload.removeAttribute('target'); // Remove target _blank que causa bloqueio silencioso em Android Chrome
                
                // Configura o botão de compartilhar manual
                btnShare.onclick = async () => {
                    if (navigator.share) {
                        let linkParaCompartilhar = pdfFetchUrl;
                        if (jsonResp.id_relatorio) {
                            linkParaCompartilhar = 'ver_relatorio.php?id=' + jsonResp.id_relatorio;
                        }
                        const absoluteUrl = new URL(linkParaCompartilhar, window.location.href).href;
                        const shareDataUrl = {
                            text: 'Acesse o relatório através deste link: ' + jsonResp.nome_arquivo,
                            url: absoluteUrl
                        };
                        
                        try {
                            const file = new File([pdfBlob], jsonResp.nome_arquivo, { type: 'application/pdf' });
                            
                            // 1. Tenta compartilhar o arquivo físico (iOS, Chrome Android mais novo)
                            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                try {
                                    await navigator.share({
                                        files: [file]
                                    });
                                } catch (err) {
                                    // Se falhar o envio de arquivo (ex: restrição do Chrome Android), cai pro Fallback de Link
                                    if (err.name !== 'AbortError') {
                                        await navigator.share(shareDataUrl);
                                    }
                                }
                            } else {
                                // 2. Se não suporta envio de arquivos, compartilha o Link direto!
                                await navigator.share(shareDataUrl);
                            }
                        } catch (err) {
                            if (err.name !== 'AbortError') {
                                alert('Erro ao compartilhar: ' + err.message + '\nPor favor, use o botão Baixar.');
                            }
                        }
                    } else {
                        alert("Função de compartilhar não suportada neste navegador. Use o botão Baixar.");
                    }
                };
                
            } catch (error) {
                console.error('Erro ao gerar/compartilhar PDF:', error);
                alert("Houve um erro na geração do PDF: " + error.message);
            } finally {
                document.querySelectorAll('.page-number-pdf').forEach(el => el.remove());
                document.getElementById('loading-overlay').classList.add('hidden');
                document.getElementById('loading-overlay').classList.remove('flex');
                document.getElementById('btn-gerar').innerText = "Gerar Novamente";
            }
        }

        function limparTudo() {
            exibirConfirmacao("Deseja apagar os dados do relatório atual? Os outros relatórios salvos nas demais abas continuarão intactos.", () => {
                let defaultState = {
                    grupo: 'TECHNIP',
                    unidade: '',
                    data: '',
                    local: '',
                    modal: 'Helicóptero',
                    preposto: isLogado ? nomePrepostoGlobal : '',
                    info: '',
                    pax1: '',
                    pax2: '',
                    h3: '', m3: '', h4: '', m4: '', h5: '', m5: '', h6: '', m6: '',
                    listaSaidas: [{ label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }],
                    fotosAnexadas: [],
                    semSaida: false,
                    alinhamentoInfo: 'left',
                    tamanhoFonteRelatorio: 15
                };
                localStorage.setItem('mms_tab_' + activeTab, JSON.stringify(defaultState));
                carregarTab(activeTab);
            });
        }
    </script>

    <?php if($notificacaoAtiva): ?>
    <!-- Pop-up do Sistema (Ajustado para não cortar o topo) -->
    <div id="sys-popup" class="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-md overflow-y-auto flex justify-center p-4 py-8 md:p-8">
        <div class="bg-white rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden transform scale-100 transition-transform h-fit my-auto border-none relative">
            
            <!-- Botão de Fechar (X) -->
            <button onclick="fecharNotificacao()" class="absolute top-4 right-4 z-20 w-8 h-8 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:rotate-90">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <?php 
                $corHeader = 'bg-blue-600'; 
                $icone = 'ℹ️';
                if($notificacaoAtiva['tipo'] == 'urgente') { $corHeader = 'bg-rose-600'; $icone = '⚠️'; }
                if($notificacaoAtiva['tipo'] == 'feedback') { $corHeader = 'bg-amber-500'; $icone = '⭐'; }
            ?>

            <div class="<?php echo $corHeader; ?> py-4 px-6 text-white flex items-center gap-4 min-h-[70px]">
                <div class="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl shadow-inner">
                    <?php echo $icone; ?>
                </div>
                <div class="flex-1 min-w-0 pr-8">
                    <h3 class="font-black tracking-wider uppercase text-xs md:text-sm leading-tight break-words">
                        <?php echo htmlspecialchars($notificacaoAtiva['titulo']); ?>
                    </h3>
                </div>
            </div>
            
            <div class="p-6">
                <p class="text-slate-600 text-sm leading-relaxed mb-6 font-medium text-center">
                    <?php echo nl2br(htmlspecialchars($notificacaoAtiva['mensagem'])); ?>
                </p>

                <?php if($notificacaoAtiva['mostrar_feedback']): ?>
                <div id="feedback-section" class="mb-6">
                    <label class="block text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-2">Sua opinião é importante:</label>
                    <?php if(isset($_SESSION['usuario_id'])): ?>
                        <textarea id="pop-feedback-text" placeholder="Escreva um comentário (opcional)..." class="w-full border border-slate-200 rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 transition-all bg-slate-50 min-h-[80px] mb-4 text-slate-800"></textarea>
                        
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">Como você avalia?</p>
                        
                        <!-- Novo Sistema de 5 Estrelas -->
                        <div class="flex justify-center gap-2 mb-4" id="star-rating">
                            <?php for($i=1; $i<=5; $i++): ?>
                                <button type="button" onclick="setRating(<?php echo $i; ?>)" class="star-btn text-3xl text-slate-800 transition-all hover:scale-110" data-value="<?php echo $i; ?>">★</button>
                            <?php endfor; ?>
                        </div>

                        <button onclick="enviarFeedback()" class="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-lg uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-slate-200 transition-all active:scale-95">
                            Enviar Feedback
                        </button>
                    <?php else: ?>
                        <div class="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-center mb-4">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">🔒 Logue-se para escrever seu feedback</p>
                        </div>
                        <button onclick="fecharNotificacao()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-4 rounded-lg uppercase tracking-[0.2em] text-[10px] transition-all border border-slate-200">
                            Entendido / Fechar
                        </button>
                    <?php endif; ?>
                </div>
                <?php else: ?>
                    <button onclick="fecharNotificacao()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-4 rounded-lg uppercase tracking-[0.2em] text-[10px] transition-all border border-slate-200">
                        Entendido / Fechar
                    </button>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <script>
        let currentRating = 0;
        const notifId = <?php echo $notificacaoAtiva['id']; ?>;

        function setRating(val) {
            currentRating = val;
            document.querySelectorAll('.star-btn').forEach(btn => {
                const btnVal = parseInt(btn.getAttribute('data-value'));
                if(btnVal <= val) {
                    btn.classList.remove('text-slate-800');
                    btn.classList.add('text-amber-600');
                } else {
                    btn.classList.add('text-slate-800');
                    btn.classList.remove('text-amber-600');
                }
            });
        }

        async function enviarFeedback() {
            const textEl = document.getElementById('pop-feedback-text');
            const text = textEl ? textEl.value : '';
            
            try {
                await fetch('salvar_interacao.php', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        notificacao_id: notifId, 
                        nota: currentRating, 
                        texto: text 
                    }) 
                });
                
                // Exibe mensagem de sucesso antes de fechar
                const section = document.getElementById('feedback-section') || document.querySelector('.p-6');
                section.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 animate-bounce">
                        <div class="text-5xl mb-4">✅</div>
                        <p class="text-slate-800 font-black uppercase tracking-widest text-sm text-center">Obrigado por contribuir!</p>
                    </div>
                `;
                
                // Fecha passando true = com feedback (não precisa salvar de novo)
                setTimeout(() => fecharNotificacao(true), 2000);
            } catch(e) { 
                console.error(e); 
                fecharNotificacao(true); // Mesmo com erro, considera que tentou dar feedback
            }
        }

        async function fecharNotificacao(comFeedback = false) {
            // Se estiver logado e ainda não enviou feedback, registra que viu o pop-up
            if (isLogado && !comFeedback) {
                try {
                    await fetch('salvar_interacao.php', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            notificacao_id: notifId, 
                            nota: 0, // 0 = apenas visualizou sem avaliar
                            texto: null 
                        }) 
                    });
                } catch(e) { 
                    console.error('Erro ao registrar visualização:', e); 
                }
            }
            
            document.getElementById('sys-popup').style.display = 'none';
            
            // Só salva no localStorage se NÃO estiver logado (logados usam banco de dados)
            if (!isLogado) {
                localStorage.setItem('mms_pop_visto_' + notifId, 'true');
            }
        }

        // Verifica cache ao carregar (Apenas para deslogados. Logados usam Banco de Dados)
        if (!isLogado && localStorage.getItem('mms_pop_visto_' + notifId) && <?php echo $notificacaoAtiva['regra_exibicao'] !== 'sempre' ? 'true' : 'false'; ?>) {
            document.getElementById('sys-popup').style.display = 'none';
        }
    </script>
    <?php endif; ?>

    <script>
        function toggleMobileMenu() {
            const menu = document.getElementById('mobile-menu');
            if (menu) menu.classList.toggle('hidden');
        }

        function limparRascunho() {
            exibirConfirmacao("Deseja apagar os dados do relatório atual? Os outros relatórios salvos nas demais abas continuarão intactos.", () => {
                let defaultState = {
                    grupo: 'TECHNIP',
                    unidade: '',
                    data: '',
                    local: '',
                    modal: 'Helicóptero',
                    preposto: isLogado ? nomePrepostoGlobal : '',
                    info: '',
                    pax1: '',
                    pax2: '',
                    h3: '', m3: '', h4: '', m4: '', h5: '', m5: '', h6: '', m6: '',
                    listaSaidas: [{ label1: 'Previsto', h1: '', m1: '', label2: 'Real', h2: '', m2: '' }],
                    fotosAnexadas: [],
                    semSaida: false,
                    alinhamentoInfo: 'left',
                    tamanhoFonteRelatorio: 15
                };
                localStorage.setItem('mms_tab_' + activeTab, JSON.stringify(defaultState));
                carregarTab(activeTab);
            });
        }

        let confirmCallback = null;

        function exibirConfirmacao(mensagem, callback) {
            document.getElementById('msg-confirmacao').innerText = mensagem;
            confirmCallback = callback;
            
            const modal = document.getElementById('modal-confirmacao');
            const card = document.getElementById('modal-confirm-card');
            
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            }, 10);
        }

        function fecharConfirmacao() {
            const modal = document.getElementById('modal-confirmacao');
            const card = document.getElementById('modal-confirm-card');
            
            card.classList.remove('scale-100', 'opacity-100');
            card.classList.add('scale-95', 'opacity-0');
            
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                confirmCallback = null;
            }, 300);
        }

        function customAlert(mensagem) {
            const modal = document.getElementById('modal-alerta');
            const card = document.getElementById('modal-alerta-card');
            document.getElementById('msg-alerta').innerText = mensagem;
            
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            setTimeout(() => {
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            }, 10);
        }

        function fecharAlerta() {
            const modal = document.getElementById('modal-alerta');
            const card = document.getElementById('modal-alerta-card');
            
            card.classList.remove('scale-100', 'opacity-100');
            card.classList.add('scale-95', 'opacity-0');
            
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 300);
        }
    </script>

    <!-- Modal Confirmação Customizado -->
    <div id="modal-confirmacao" class="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm hidden justify-center items-center p-4">
        <div id="modal-confirm-card" class="bg-white rounded-lg shadow-2xl max-w-sm w-full overflow-hidden transform scale-95 opacity-0 transition-all duration-300 border border-slate-100">
            <div class="p-6">
                <div class="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mb-4 mx-auto border border-rose-100 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.543 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 class="text-base font-black text-slate-800 text-center mb-2 uppercase tracking-wide">Atenção</h3>
                <p id="msg-confirmacao" class="text-sm text-slate-600 text-center mb-6 leading-relaxed font-medium"></p>
                <div class="flex gap-3">
                    <button type="button" onclick="fecharConfirmacao()" class="flex-1 px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-lg transition-colors uppercase text-[10px] tracking-widest cursor-pointer">Cancelar</button>
                    <button type="button" onclick="if(confirmCallback) confirmCallback(); fecharConfirmacao();" class="flex-1 px-4 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-lg transition-colors uppercase text-[10px] tracking-widest shadow-md shadow-rose-500/30 cursor-pointer border border-rose-600">Confirmar</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal Alerta Customizado -->
    <div id="modal-alerta" class="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm hidden justify-center items-center p-4">
        <div id="modal-alerta-card" class="bg-white rounded-lg shadow-2xl max-w-sm w-full overflow-hidden transform scale-95 opacity-0 transition-all duration-300 border border-slate-100">
            <div class="p-6">
                <div class="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4 mx-auto border border-emerald-100 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 class="text-base font-black text-slate-800 text-center mb-2 uppercase tracking-wide">Aviso</h3>
                <p id="msg-alerta" class="text-sm text-slate-600 text-center mb-6 leading-relaxed font-medium"></p>
                <div class="flex gap-3">
                    <button type="button" onclick="fecharAlerta()" class="flex-1 px-4 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-lg transition-colors uppercase text-[10px] tracking-widest shadow-md shadow-emerald-500/30 cursor-pointer border border-emerald-600">OK</button>
                </div>
            </div>
        </div>
    </div>
    <!-- Toast de Salvamento -->
    <div id="toast-save" class="fixed bottom-28 right-6 bg-slate-900/90 backdrop-blur-sm text-white px-5 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-3 opacity-0 transition-opacity duration-500 pointer-events-none z-[10000]">
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
        <span>Rascunho Salvo</span>
    </div>


<script>
function limparCacheGeral() {
    // 1. Tentar limpar Service Workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
            for(let registration of registrations) {
                registration.unregister();
            }
        });
    }
    
    // 2. Tentar limpar API de Caches do Navegador
    if ('caches' in window) {
        caches.keys().then(function(names) {
            for (let name of names)
                caches.delete(name);
        });
    }

    // 3. Exibir o Pop-up RedAlert no centro da tela
    const alertHtml = `
    <div id="redalert-cache" class="fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300">
        <div class="bg-gradient-to-br from-rose-600 to-rose-800 text-white p-6 md:p-8 rounded-2xl shadow-[0_10px_50px_rgba(225,29,72,0.6)] max-w-sm w-full mx-4 transform scale-100 flex flex-col items-center text-center animate-[popIn_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)] border border-rose-400/30">
            <div class="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-5 shadow-inner border border-white/20">
                <span class="text-4xl">🧹</span>
            </div>
            <h3 class="text-2xl font-black uppercase tracking-wider mb-2 drop-shadow-md">Cache Limpo!</h3>
            <p class="text-rose-100 font-medium text-sm mb-8 leading-relaxed">A memória temporária e arquivos offline foram deletados com sucesso. O sistema será recarregado agora.</p>
            <div class="w-full flex gap-3">
                <button onclick="window.location.reload(true)" class="flex-1 bg-white text-rose-700 font-black py-3.5 rounded-xl hover:bg-rose-50 transition-all uppercase tracking-widest text-xs shadow-lg transform hover:-translate-y-0.5 active:translate-y-1">Recarregar Sistema</button>
            </div>
        </div>
    </div>
    <style>
    @keyframes popIn {
        0% { transform: scale(0.8); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
    }
    </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', alertHtml);
}

function navegarWebView() {
    const modalHtml = `
    <div id="modal-webview-nav" class="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 p-4">
        <div class="bg-white text-slate-800 p-6 md:p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-auto transform flex flex-col animate-[popIn_0.3s_ease-out]">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                </div>
                <h3 class="text-lg font-black text-slate-800 uppercase tracking-wide">Navegador WebView</h3>
            </div>
            
            <p class="text-xs text-slate-500 font-medium mb-4">Digite a URL completa que deseja acessar (incluindo http:// ou https://):</p>
            
            <input type="url" id="in-webview-url" class="w-full border border-slate-300 rounded-lg p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 mb-5 bg-slate-50" placeholder="https://exemplo.com" value="${window.location.href}">
            
            <div class="flex gap-3 mt-auto">
                <button type="button" onclick="document.getElementById('modal-webview-nav').remove()" class="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors uppercase tracking-wide text-xs cursor-pointer">Cancelar</button>
                <button type="button" onclick="let url = document.getElementById('in-webview-url').value.trim(); if(url && url !== 'https://') { if(!url.startsWith('http://') && !url.startsWith('https://')) { url = 'https://' + url; } window.location.href = url; }" class="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors uppercase tracking-wide text-xs shadow-md cursor-pointer">Acessar / Go</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => { document.getElementById('in-webview-url').focus(); }, 100);
}
</script>
<script>
    function atualizarPreviewNomeArquivo() {
        const elUnidade = document.getElementById('in-unidade');
        const elData = document.getElementById('in-data');
        const elObs = document.getElementById('in-observacao');
        const elH3 = document.getElementById('in-h3');
        const elM3 = document.getElementById('in-m3');
        
        if (!elUnidade || !elData) return;

        const unidadeRaw = elUnidade.value || 'MMS';
        const unidadeClean = unidadeRaw.trim().replace(/\s+/g, '_').toUpperCase();

        const dataRaw = elData.value;
        let dataFormatada = '00-00-0000';
        if(dataRaw) {
            const partes = dataRaw.split('-');
            if (partes.length === 3) {
                dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            }
        }

        let strObs = '';
        if (elObs && elObs.value.trim() !== '') {
            strObs = `_${elObs.value.trim().toUpperCase().replace(/\\s+/g, '_')}`;
        }

        let strEmb = '';
        if (elH3 && elM3) {
            const h3 = elH3.value.trim();
            const m3 = elM3.value.trim();
            if (h3 !== '' || m3 !== '') {
                const embPrev = `${h3}h${m3}`;
                if (embPrev !== 'h' && embPrev.toUpperCase().indexOf('N') === -1) {
                    strEmb = `_(${embPrev})`;
                }
            }
        }

        let nomeArquivo = `${unidadeClean}_${dataFormatada}${strEmb}${strObs}.pdf`;
        nomeArquivo = nomeArquivo.replace(/\//g, '-');

        const elPreview = document.getElementById('preview-filename');
        if (elPreview) {
            elPreview.innerText = nomeArquivo;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const idsToListen = ['in-unidade', 'in-data', 'in-observacao', 'in-h3', 'in-m3'];
        idsToListen.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', atualizarPreviewNomeArquivo);
                el.addEventListener('change', atualizarPreviewNomeArquivo);
            }
        });
        
        // Initial call after a slight delay to allow inputs to be populated
        setTimeout(atualizarPreviewNomeArquivo, 500);
    });
</script>
<!-- Modal Instalar Aplicativo -->
<div id="modal-instalar-app" class="fixed inset-0 z-[13000] bg-slate-900/60 backdrop-blur-sm hidden flex-col items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-sm w-full relative transform scale-95 opacity-0 transition-all duration-300 ease-out" id="modal-instalar-card">
        <!-- Botão Fechar -->
        <button type="button" onclick="fecharModalInstalar()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <div class="flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 text-blue-600 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </div>
            <h3 class="text-xl font-black text-slate-800 mb-2">Instalar Aplicativo</h3>
            <p class="text-sm text-slate-500 mb-6 font-medium leading-relaxed">
                Instale o sistema no seu dispositivo para acesso rápido, mais tela e navegação otimizada.
            </p>
            <button type="button" id="btn-instalar-pwa" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-colors uppercase tracking-wider text-sm flex items-center justify-center gap-2 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Instalar Agora
            </button>
        </div>
    </div>
</div>

<script>
    let deferredInstallPrompt = null;
    
    function fecharModalInstalar() {
        const modal = document.getElementById('modal-instalar-app');
        const card = document.getElementById('modal-instalar-card');
        card.classList.remove('scale-100', 'opacity-100');
        card.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }, 300);
        // Salva para não abrir mais sozinho após ser fechado manualmente
        localStorage.setItem('mms_install_prompt_closed', 'true');
    }

    function abrirModalInstalar() {
        if(localStorage.getItem('mms_install_prompt_shown') === 'true') return;
        if(localStorage.getItem('mms_install_prompt_closed') === 'true') return;
        
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');
        if (isStandalone) return;

        
        const modal = document.getElementById('modal-instalar-app');
        const card = document.getElementById('modal-instalar-card');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        setTimeout(() => {
            card.classList.remove('scale-95', 'opacity-0');
            card.classList.add('scale-100', 'opacity-100');
        }, 10);

        // Marca que já foi exibido uma vez
        localStorage.setItem('mms_install_prompt_shown', 'true');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        setTimeout(abrirModalInstalar, 1000);
    });

    document.getElementById('btn-instalar-pwa')?.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                fecharModalInstalar();
            }
            deferredInstallPrompt = null;
        } else {
            alert("Para instalar no iOS (Safari):\n1. Toque em Compartilhar ⬆️ na barra.\n2. Escolha 'Adicionar à Tela de Início'.\n\nNo Chrome/Android:\nAcesse as opções e toque em 'Instalar aplicativo'.");
            fecharModalInstalar();
        }
    });

    // Se o PWA não está instalado
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');
    if (!isStandalone) {
        setTimeout(abrirModalInstalar, 1500);
    }
</script>

<!-- Notificações In-App -->
<script>
    const isLogadoMsg = <?php echo $logado ? 'true' : 'false'; ?>;
    let ultimasNotificacoes = [];
    
    function toggleNotificacoes() {
        const dropdown = document.getElementById('dropdown-notificacoes');
        const isHidden = dropdown.classList.contains('hidden');
        
        if (isHidden) {
            dropdown.classList.remove('hidden');
            dropdown.classList.add('block');
            
            // Marca como lidas no frontend e remove o badge vermelho
            const idsNaoLidos = ultimasNotificacoes.filter(n => !n.lida).map(n => n.id);
            if(idsNaoLidos.length > 0) {
                if(isLogadoMsg) {
                    fetch('api_mensagens.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'marcar_lidas=1'
                    });
                } else {
                    let lidasStore = JSON.parse(localStorage.getItem('mms_msgs_lidas') || '[]');
                    idsNaoLidos.forEach(id => { if(!lidasStore.includes(id)) lidasStore.push(id); });
                    localStorage.setItem('mms_msgs_lidas', JSON.stringify(lidasStore));
                }
                // Atualiza o estado local imediatamente
                ultimasNotificacoes.forEach(n => { if(idsNaoLidos.includes(n.id)) n.lida = true; });
            }
            
            document.getElementById('badge-notificacoes').classList.add('hidden');
            document.getElementById('txt-qtd-notificacoes').innerText = '0 novas';
        } else {
            dropdown.classList.remove('block');
            dropdown.classList.add('hidden');
        }
    }

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        const btn = document.querySelector('button[onclick="toggleNotificacoes()"]');
        const drop = document.getElementById('dropdown-notificacoes');
        if (drop && !drop.classList.contains('hidden')) {
            if (!drop.contains(e.target) && !btn.contains(e.target)) {
                drop.classList.add('hidden');
                drop.classList.remove('block');
            }
        }
    });

    // Controle de notificações já exibidas via Push
    let notificacoesPushExibidas = JSON.parse(localStorage.getItem('mms_notificacoes_push') || '[]');

    async function carregarNotificacoes() {
        try {
            const lidasStore = JSON.parse(localStorage.getItem('mms_msgs_lidas') || '[]');
            const excluidasStore = JSON.parse(localStorage.getItem('mms_msgs_excluidas') || '[]');
            
            const params = new URLSearchParams();
            if(!isLogadoMsg) {
                params.append('anonimo', '1');
            }

            const resp = await fetch('api_mensagens.php?' + params.toString());
            const data = await resp.json();
            
            let mensagensVindas = data.mensagens || [];
            let qtd_novas = data.qtd_novas || 0;

            if(!isLogadoMsg) {
                // Filtra as excluídas e marca as lidas no front
                mensagensVindas = mensagensVindas.filter(m => !excluidasStore.includes(m.id));
                qtd_novas = 0;
                mensagensVindas.forEach(m => {
                    if(lidasStore.includes(m.id)) {
                        m.lida = true;
                    } else {
                        m.lida = false;
                        qtd_novas++;
                    }
                });
            }
            
            ultimasNotificacoes = mensagensVindas;
            const badge = document.getElementById('badge-notificacoes');
            const txtQtd = document.getElementById('txt-qtd-notificacoes');
            const lista = document.getElementById('lista-notificacoes');
            
            if(qtd_novas > 0) {
                badge.innerText = qtd_novas;
                badge.classList.remove('hidden');
                txtQtd.innerText = qtd_novas + ' novas';
                
                // Dispara Push Notification Nativa para as novas
                if (Notification.permission === "granted") {
                    ultimasNotificacoes.forEach(m => {
                        if (!m.lida && !notificacoesPushExibidas.includes(m.id)) {
                            // Tenta usar Service Worker se existir, senão usa API padrão
                            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                                navigator.serviceWorker.ready.then(function(registration) {
                                    registration.showNotification(m.titulo, {
                                        body: m.mensagem,
                                        icon: 'logo192.png',
                                        badge: 'logo192.png',
                                        vibrate: [200, 100, 200]
                                    });
                                });
                            } else {
                                new Notification(m.titulo, {
                                    body: m.mensagem,
                                    icon: 'logo192.png'
                                });
                            }
                            notificacoesPushExibidas.push(m.id);
                        }
                    });
                    localStorage.setItem('mms_notificacoes_push', JSON.stringify(notificacoesPushExibidas));
                } else if (Notification.permission !== "denied") {
                    Notification.requestPermission();
                }
            }
            let htmlPermissao = '';
            if ("Notification" in window && Notification.permission === "default") {
                htmlPermissao = `
                    <div class="p-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-2">
                        <span class="text-[10px] text-blue-800 font-semibold leading-tight">Deseja receber notificações na tela quando chegar uma mensagem?</span>
                        <button type="button" onclick="pedirPermissaoPush()" class="bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black px-3 py-1.5 rounded transition-colors uppercase whitespace-nowrap shadow-sm">Ativar</button>
                    </div>
                `;
            }

            if(ultimasNotificacoes.length === 0) {
                lista.innerHTML = htmlPermissao + '<div class="p-4 text-center text-slate-400 text-xs">Nenhuma notificação recebida.</div>';
            } else {
                lista.innerHTML = htmlPermissao + ultimasNotificacoes.map(m => `
                    <div class="p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors relative group ${!m.lida ? 'bg-blue-50/50' : ''}">
                        <div class="flex items-center justify-between mb-1 pr-6">
                            <h4 class="text-xs font-black text-slate-800">${m.titulo}</h4>
                            <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                                ${m.tipo === 'aviso' ? 'bg-amber-100 text-amber-700' : 
                                 (m.tipo === 'urgente' ? 'bg-rose-100 text-rose-700' : 
                                 (m.tipo === 'sucesso' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'))}">
                                ${m.tipo}
                            </span>
                        </div>
                        <p class="text-[10px] text-slate-500 leading-relaxed mb-1 pr-6">${m.mensagem}</p>
                        <div class="text-[8px] text-slate-400 uppercase font-bold text-right">${m.data_envio}</div>
                        <button onclick="apagarNotificacao(${m.id})" class="absolute top-3 right-3 text-slate-300 hover:text-rose-500 transition-colors hidden group-hover:block" title="Apagar notificação">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                `).join('');
            }
        } catch(e) {
            console.error('Erro ao carregar notificações', e);
        }
    }

    function pedirPermissaoPush() {
        if ("Notification" in window) {
            Notification.requestPermission().then(permission => {
                if(permission === "granted") {
                    carregarNotificacoes();
                }
            });
        }
    }

    async function apagarNotificacao(id) {
        try {
            if(isLogadoMsg) {
                await fetch('api_mensagens.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'apagar_msg=' + id
                });
            } else {
                let excluidasStore = JSON.parse(localStorage.getItem('mms_msgs_excluidas') || '[]');
                if(!excluidasStore.includes(id)) excluidasStore.push(id);
                localStorage.setItem('mms_msgs_excluidas', JSON.stringify(excluidasStore));
            }
            carregarNotificacoes();
        } catch(e) {
            console.error('Erro ao apagar', e);
        }
    }

    // Pede permissão de Push ao abrir
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // Carrega agora e depois de 30 em 30 segundos
<script>
    carregarNotificacoes();
    setInterval(carregarNotificacoes, 30000);
</script>

<!-- Modal Rotacionar Foto -->
<div id="modal-rotacionar" class="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm hidden flex-col items-center justify-center p-4">
    <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 class="font-black text-slate-800 text-sm uppercase tracking-widest">Ajustes Imagem</h3>
            <button id="btn-fechar-modal-rotacionar" class="text-slate-400 hover:text-rose-500 transition-colors">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="p-6 flex-1 flex flex-col items-center justify-center bg-slate-100/50">
            <div class="relative w-full max-w-xs aspect-square bg-slate-200 rounded-xl overflow-hidden shadow-inner border border-slate-300 mx-auto">
                <img id="img-preview-rotacao" src="" class="block max-w-full">
            </div>
            
            <div class="flex gap-4 mt-6">
                <button id="btn-girar-foto" class="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-sm">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    Rotacionar
                </button>
            </div>
        </div>
        <div class="p-4 bg-white border-t border-slate-100">
            <button id="btn-confirmar-rotacao" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs shadow-md transition-all">Confirmar e Anexar</button>
        </div>
    </div>
</div>

<!-- Modal Fullscreen Imagem -->
<div id="modal-preview-anexo" class="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm hidden flex-col items-center justify-center p-4 cursor-pointer" onclick="fecharPreviewAnexo()">
    <button class="absolute top-6 right-6 text-white/70 hover:text-white transition-colors p-2 z-[201]" onclick="fecharPreviewAnexo()">
        <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
    <img id="img-fullscreen-anexo" src="" class="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl transition-transform duration-300 scale-95" onclick="event.stopPropagation()">
</div>
<script>
function abrirPreviewAnexo(base64) {
    const modal = document.getElementById('modal-preview-anexo');
    const img = document.getElementById('img-fullscreen-anexo');
    img.src = base64;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        img.classList.remove('scale-95');
        img.classList.add('scale-100');
    }, 10);
}
function fecharPreviewAnexo() {
    const modal = document.getElementById('modal-preview-anexo');
    const img = document.getElementById('img-fullscreen-anexo');
    img.classList.remove('scale-100');
    img.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        img.src = '';
    }, 300);
}
</script>

<?php if($logado): ?>
<!-- Menu WebApp Mobile Flutuante (Gerador) - Exibido APENAS em WebApp PWA / Standalone se Logado -->
<div id="webapp-mobile-dock" class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] w-[88%] max-w-xs bg-white border border-slate-200/90 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.15)] px-5 py-2.5 hidden items-center justify-between no-print transition-all duration-300">
    <button type="button" onclick="this.querySelector('svg').classList.add('animate-spin'); setTimeout(() => window.location.reload(), 300)" class="dock-item flex flex-col items-center justify-center text-blue-600 transition-all cursor-pointer relative" title="Atualizar">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        <span class="dock-bar block w-5 h-0.5 bg-blue-600 rounded-full mt-1 opacity-100 transition-all"></span>
    </button>
    <a href="coord/index.php" class="dock-item flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition-all cursor-pointer relative" title="Painel Coordenação">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        <span class="dock-bar block w-5 h-0.5 bg-blue-600 rounded-full mt-1 opacity-0 transition-all"></span>
    </a>
    <button type="button" onclick="navegarWebView()" class="dock-item flex flex-col items-center justify-center text-slate-400 hover:text-teal-600 transition-all cursor-pointer relative" title="Navegador WebView">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
        <span class="dock-bar block w-5 h-0.5 bg-teal-600 rounded-full mt-1 opacity-0 transition-all"></span>
    </button>
    <a href="logout.php" class="dock-item flex flex-col items-center justify-center text-slate-400 hover:text-rose-600 transition-all cursor-pointer relative" title="Sair">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
        <span class="dock-bar block w-5 h-0.5 bg-rose-600 rounded-full mt-1 opacity-0 transition-all"></span>
    </a>
</div>

<script>
window.addEventListener('DOMContentLoaded', () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator.standalone === true) || 
                         (document.referrer && document.referrer.includes('android-app://'));
    const dock = document.getElementById('webapp-mobile-dock');
    if (dock) {
        if (isStandalone) {
            dock.classList.remove('hidden');
            dock.classList.add('flex');
        } else {
            dock.classList.add('hidden');
            dock.classList.remove('flex');
        }
    }
});
</script>
<?php endif; ?>

</body>
</html>




