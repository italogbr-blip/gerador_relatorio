<?php
session_start();
require 'mms_config.php';

function exibirBloqueioELogin($mensagemErro, $pdo, $id_relatorio = null) {
    $erroLogin = '';
    
    // Se enviou o form de login por esta tela de bloqueio
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['form_login_bloqueio'])) {
        $user = trim($_POST['username'] ?? '');
        $pass = trim($_POST['senha'] ?? '');
        if (empty($user) || empty($pass)) {
            $erroLogin = "Por favor, preencha todos os campos.";
        } else {
            $stmt = $pdo->prepare("SELECT id, username, nome, senha, nivel_autoridade FROM usuarios WHERE username = ?");
            $stmt->execute([$user]);
            $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($usuario && password_verify($pass, $usuario['senha'])) {
                session_regenerate_id(true);
                $_SESSION['usuario_id'] = $usuario['id'];
                $_SESSION['username'] = $usuario['username'];
                $_SESSION['nome'] = $usuario['nome'] ?? $usuario['username'];
                $_SESSION['nivel_autoridade'] = $usuario['nivel_autoridade'];
                
                // ===== PERSISTÊNCIA DE SESSÃO (LEMBRAR-ME PWA) =====
                try {
                    $token = bin2hex(random_bytes(32));
                    $stmtToken = $pdo->prepare("UPDATE usuarios SET remember_token = ? WHERE id = ?");
                    $stmtToken->execute([$token, $usuario['id']]);
                    setcookie('mms_remember_token', $token, time() + (86400 * 30), "/");
                } catch(Exception $e) {}
                
                // Recarrega a página
                header("Location: " . $_SERVER['REQUEST_URI']);
                exit();
            } else {
                $erroLogin = "Usuário ou senha incorretos.";
            }
        }
    }
    
    $erroDisplay = $erroLogin ? $erroLogin : $mensagemErro;
    
    $ogTitle = "Relatório - MMS";
    $ogDesc = "Para visualizar este relatório, você precisa confirmar sua identidade.";
    if ($id_relatorio && $pdo) {
        $stmt = $pdo->prepare("SELECT dados_json FROM relatorios WHERE id = ?");
        $stmt->execute([$id_relatorio]);
        if ($row = $stmt->fetch()) {
            $d = json_decode($row['dados_json'], true);
            if ($d) {
                $ogTitle = "Relatório MMS " . ($d['unidade'] ?? '');
                $ogDesc = "Acesse para visualizar os detalhes deste relatório.";
            }
        }
    }
    
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    $baseUri = $protocol . "://" . $_SERVER['HTTP_HOST'] . preg_replace('/\/[^\/]+$/', '', $_SERVER['REQUEST_URI']);
    $ogImage = $baseUri . "/images/logo.png";
    ?>
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acesso Restrito - MMS</title>
        
        <!-- Open Graph Tags para WhatsApp -->
        <meta property="og:title" content="<?php echo htmlspecialchars($ogTitle); ?>" />
        <meta property="og:description" content="<?php echo htmlspecialchars($ogDesc); ?>" />
        <meta property="og:image" content="<?php echo htmlspecialchars($ogImage); ?>" />
        <meta property="og:type" content="website" />
        
        <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Outfit', sans-serif; background-color: #0f172a; }
            .glass-panel { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.05); }
        </style>
    </head>
    <body class="min-h-screen flex items-center justify-center p-6 relative overflow-hidden text-slate-200">
        <div class="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>
        <div class="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-rose-900 rounded-full mix-blend-multiply filter blur-[128px] opacity-30"></div>

        <div class="w-full max-w-md glass-panel rounded-3xl shadow-2xl p-8 relative z-10">
            <div class="flex justify-center mb-6">
                <div class="bg-white p-3 rounded-xl shadow-lg">
                    <img src="images/logo.png" alt="Logo MMS" class="h-12 object-contain">
                </div>
            </div>
            
            <h2 class="text-3xl font-extrabold text-center tracking-tight mb-2 text-rose-500">Acesso Restrito</h2>
            <p class="text-center text-slate-400 text-sm mb-6 font-light">Para visualizar este relatório, você precisa confirmar sua identidade.</p>

            <div class="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl mb-8 text-sm font-semibold text-center tracking-wide shadow-inner">
                <?php echo htmlspecialchars($erroDisplay); ?>
            </div>

            <form method="POST" action="" class="space-y-5">
                <input type="hidden" name="form_login_bloqueio" value="1">
                <div>
                    <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Usuário</label>
                    <input type="text" name="username" placeholder="Seu usuário" required
                        class="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all">
                </div>
                <div>
                    <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Senha</label>
                    <input type="password" name="senha" placeholder="••••••••" required
                        class="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all">
                </div>
                <button type="submit" class="w-full bg-rose-600 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.3)] hover:shadow-[0_0_30px_rgba(225,29,72,0.5)] hover:bg-rose-500 transform hover:-translate-y-1 transition-all duration-300 mt-6 tracking-wide uppercase text-sm">
                    Autenticar e Acessar
                </button>
            </form>
            <div class="mt-6 text-center">
                <a href="index.php" class="text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase font-semibold tracking-wider border-b border-transparent hover:border-slate-300">← Voltar ao Início</a>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit();
}

// [SEGURANÇA] Validação rígida do ID
$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if (!$id) {
    die("Erro: ID do relatório inválido.");
}

// Proteção: Só acessa quem está logado
if (!isset($_SESSION['usuario_id'])) {
    exibirBloqueioELogin("Você precisa estar logado para visualizar o relatório.", $pdo, $id);
}

require_once __DIR__ . '/mms_layout.php'; // Layout centralizado

// Busca o relatório no banco de dados
$stmt = $pdo->prepare("SELECT * FROM relatorios WHERE id = ?");
$stmt->execute([$id]);
$relatorio = $stmt->fetch();

if (!$relatorio) {
    die("Erro: Relatório não encontrado no banco de dados.");
}

// Verifica se o usuário é admin (2) ou se é o dono do relatório
if ($_SESSION['nivel_autoridade'] != 2 && $relatorio['usuario_id'] != $_SESSION['usuario_id']) {
    http_response_code(403);
    exibirBloqueioELogin("Acesso negado. Você só pode visualizar os seus próprios relatórios. Autentique-se com a conta correta.", $pdo, $id);
}

// Verifica se quer ver a versão original
$isOriginal = isset($_GET['original']) && $_GET['original'] == '1';

// "Desempacota" o JSON
$jsonRaw = $relatorio['dados_json'];
if ($isOriginal && !empty($relatorio['dados_json_original'])) {
    $jsonRaw = $relatorio['dados_json_original'];
}

$dados = json_decode($jsonRaw, true);

if (!$dados) {
    die("Erro: O arquivo JSON deste relatório está corrompido ou vazio.");
}

// =========================================================================
// PREPARAÇÃO DE DADOS
// =========================================================================

$unidade = htmlspecialchars($dados['unidade'] ?? 'N/A');
$data = htmlspecialchars($dados['data'] ?? 'N/A');

$partesData = explode('-', $data);
$dataFormatada = count($partesData) === 3 ? "{$partesData[2]}/{$partesData[1]}/{$partesData[0]}" : $data;

$local = htmlspecialchars($dados['local'] ?? 'N/A');
$modal = htmlspecialchars($dados['modal'] ?? 'N/A');
$preposto = htmlspecialchars($dados['preposto'] ?? 'N/A');

// Processamento do campo Informações
$info_bruto = $dados['info_troca'] ?? 'N/A';
$info_bruto = str_ireplace(['<div>', '<p>'], '<br>', $info_bruto);
$info_bruto = str_ireplace(['</div>', '</p>'], '', $info_bruto);
$info = strip_tags($info_bruto, '<b><i><u><br><strong><em><ul><li><ol>');
$info = str_replace('▪', '&bull;', $info);
$info = preg_replace('/^(<br\s*\/?>)+/i', '', $info);
$info = preg_replace('/(<br\s*\/?>)+$/i', '', $info);
$info = preg_replace('/(<br\s*\/?>){3,}/i', '<br><br>', $info);
if (trim($info) === '' || $info === 'N/A') { $info = 'N/A'; }

// Tratamento das Saídas
$saidasHTML = '';
if (isset($dados['horarios']['saida_hotel']) && is_array($dados['horarios']['saida_hotel'])) {
    foreach ($dados['horarios']['saida_hotel'] as $saida) {
        $h1 = htmlspecialchars($saida['h1'] ?? ''); $m1 = htmlspecialchars($saida['m1'] ?? '');
        $h2 = htmlspecialchars($saida['h2'] ?? ''); $m2 = htmlspecialchars($saida['m2'] ?? '');
        $l1 = htmlspecialchars($saida['label1'] ?? 'Previsto');
        $l2 = htmlspecialchars($saida['label2'] ?? 'Real');
        
        $t1 = (strtoupper($h1) === 'N/A' || strtoupper($h1) === 'N' || strtoupper($h1) === 'NA') ? "N/A" : "{$h1} h {$m1} min";
        $t2 = (strtoupper($h2) === 'N/A' || strtoupper($h2) === 'N' || strtoupper($h2) === 'NA') ? "N/A" : "{$h2} h {$m2} min";

        $saidasHTML .= "<div style='margin-bottom: 4px;'><span style='font-weight:bold;'>{$l1}:</span> {$t1} &nbsp;&nbsp;&nbsp;&nbsp; <span style='font-weight:bold;'>{$l2}:</span> {$t2}</div>";
    }
} else {
    $saidasHTML = "N/A";
}

$embPrev = htmlspecialchars($dados['horarios']['embarque_previsto'] ?? 'N/A');
$embPrevFormatado = $embPrev !== 'N/A' ? str_replace(':', ' h ', $embPrev) . ' min' : 'N/A';
$embReal = htmlspecialchars($dados['horarios']['embarque_real'] ?? 'N/A');
$embRealFormatado = $embReal !== 'N/A' ? str_replace(':', ' h ', $embReal) . ' min' : 'N/A';
$atInicio = htmlspecialchars($dados['horarios']['atendimento_inicio'] ?? 'N/A');
$atInicioFormatado = $atInicio !== 'N/A' ? str_replace(':', ' h ', $atInicio) . ' min' : 'N/A';
$atFim = htmlspecialchars($dados['horarios']['atendimento_fim'] ?? 'N/A');
$atFimFormatado = $atFim !== 'N/A' ? str_replace(':', ' h ', $atFim) . ' min' : 'N/A';

// Passageiros
$pax1_bruto = htmlspecialchars($dados['pax_embarcando'] ?? 'N/A');
$pax1_bruto = preg_replace('/\*(.*?)\*/', '<b>$1</b>', $pax1_bruto);
$pax1 = nl2br($pax1_bruto);
$pax2_bruto = htmlspecialchars($dados['pax_desembarcando'] ?? 'N/A');
$pax2_bruto = preg_replace('/\*(.*?)\*/', '<b>$1</b>', $pax2_bruto);
$pax2 = nl2br($pax2_bruto);

$pax1List = explode('<br />', str_replace(['<br>', '<br/>'], '<br />', $pax1));
$pax2List = explode('<br />', str_replace(['<br>', '<br/>'], '<br />', $pax2));
$max_linhas = max(count($pax1List), count($pax2List));

$col1_lines = array_map('trim', $pax1List);
$col2_lines = array_map('trim', $pax2List);

$max_linhas = max(count($col1_lines), count($col2_lines));

$paxRows = '';
$itemsPerPage = 20;
$numPages = ceil($max_linhas / $itemsPerPage);
if ($numPages == 0) $numPages = 1;

for ($p = 0; $p < $numPages; $p++) {
    $start = $p * $itemsPerPage;
    $chunk1_lines = array_slice($col1_lines, $start, $itemsPerPage);
    $chunk2_lines = array_slice($col2_lines, $start, $itemsPerPage);

    $chunk1 = empty($chunk1_lines) ? 'N/A' : implode('', array_map(function($l) {
        return $l === '' ? "<div style='margin-bottom: 3px;'>&nbsp;</div>" : "<div style='margin-bottom: 3px; word-wrap: break-word;'>{$l}</div>";
    }, $chunk1_lines));

    $chunk2 = empty($chunk2_lines) ? 'N/A' : implode('', array_map(function($l) {
        return $l === '' ? "<div style='margin-bottom: 3px;'>&nbsp;</div>" : "<div style='margin-bottom: 3px; word-wrap: break-word;'>{$l}</div>";
    }, $chunk2_lines));

    $titleSuffix = $p > 0 ? ' (Cont.)' : '';

    $block = "
    <div style='width: 100%; overflow: hidden; page-break-inside: auto; margin-top: 40px;'>
        <div style='box-sizing: border-box; width: 50%; float: left; border-right: 1px solid #ccc; padding-right: 2%; overflow-wrap: break-word; word-wrap: break-word;'>
            <div class='pax-title' style='margin-bottom: 5px; font-weight: bold; font-size: 16px;'>Nomes Passageiros Embarcando{$titleSuffix}:</div>
            <div style='line-height: 1.4;'>{$chunk1}</div>
        </div>
        <div style='box-sizing: border-box; width: 50%; float: right; padding-left: 2%; overflow-wrap: break-word; word-wrap: break-word;'>
            <div class='pax-title' style='margin-bottom: 5px; font-weight: bold; font-size: 16px;'>Nomes Passageiros Desembarcados{$titleSuffix}:</div>
            <div style='line-height: 1.4;'>{$chunk2}</div>
        </div>
        <div style='clear: both;'></div>
    </div>";

    if ($p === 0) {
        $paxRows .= $block;
    } else {
        $paxRows .= "
        </div>
        <div class='footer'>
            Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>
            E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
        </div>
    </div>
    <div class='page-a4' style='margin-top: 20px;'>
        <div class='bg-pagina'></div>
        <div class='fixed-logo'><img src='images/logo.png' alt='MMS'></div>
        <div class='conteudo-pdf'>
            {$block}
        ";
    }
}

// Fotos
$fotosHTML = '';
if (!empty($dados['fotos']) && is_array($dados['fotos'])) {
    foreach ($dados['fotos'] as $foto) {
        $titulo = htmlspecialchars($foto['titulo'] ?? 'ANEXO FOTOGRÁFICO');
        $srcRaw = $foto['base64'] ?? '';
        $src = '';
        if (is_string($srcRaw) && preg_match('#^data:image/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$#', $srcRaw)) {
            $src = htmlspecialchars($srcRaw, ENT_QUOTES);
        }
        if ($src) {
            $fotosHTML .= "
            <div class='page-a4' style='margin-top: 20px;'>
                <div class='bg-pagina'></div>
                <div class='fixed-logo'><img src='images/logo.png' alt='MMS'></div>
                <div class='conteudo-pdf'>
                    <div style='padding-top: 10px; text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 10px; text-decoration: underline;'>{$titulo}</div>
                    <div style='text-align: center; width: 100%;'>
                        <img src='{$src}' style='max-width: 100%; max-height: 650px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto;' />
                    </div>
                </div>
                <div class='footer'>
                    Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>
                    E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                </div>
            </div>";
        }
    }
}
$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
$baseUri = $protocol . "://" . $_SERVER['HTTP_HOST'] . preg_replace('/\/[^\/]+$/', '', $_SERVER['REQUEST_URI']);
$ogImage = $baseUri . "/images/logo.png";
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Relatório #<?php echo (int)$id; ?> - MMS</title>
    
    <!-- Open Graph Tags para WhatsApp -->
    <meta property="og:title" content="Relatório MMS <?php echo htmlspecialchars($unidade); ?>" />
    <meta property="og:description" content="Acesse para visualizar os detalhes deste relatório." />
    <meta property="og:image" content="<?php echo htmlspecialchars($ogImage); ?>" />
    <meta property="og:type" content="website" />
    
    <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
    <style>
        body { background-color: #f1f5f9; margin: 0; padding: 20px; }
        .toolbar {
            max-width: 210mm;
            margin: 0 auto 20px auto;
            background: #0f172a;
            color: white;
            padding: 15px 20px;
            border-radius: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        <?php echo gerarCssPreview(); ?>
    </style>
</head>
<body>

    <!-- Toolbar de Auditoria -->
    <div class="toolbar no-print">
        <div>
            <div class="flex items-center gap-2">
                <span class="text-xs font-black uppercase tracking-widest text-slate-400">Auditoria</span>
                <?php if($isOriginal): ?>
                    <span class="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase">Versão Original</span>
                <?php endif; ?>
            </div>
            <p class="text-[10px] text-slate-400 mt-1">Enviado em: <?php echo date('d/m/Y às H:i', strtotime($relatorio['data_criacao'])); ?></p>
            <?php if(!empty($relatorio['dados_json_original'])): ?>
                <p class="text-[10px] text-amber-400">Editado em: <?php echo date('d/m/Y às H:i', strtotime($relatorio['data_edicao'])); ?></p>
            <?php endif; ?>
        </div>
        <div class="flex gap-3">
            <?php if(!empty($relatorio['dados_json_original'])): ?>
                <?php if($isOriginal): ?>
                    <a href="ver_relatorio?id=<?php echo (int)$id; ?>" class="bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg text-xs font-bold uppercase transition">Ver Atual</a>
                <?php else: ?>
                    <a href="ver_relatorio?id=<?php echo (int)$id; ?>&original=1" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-xs font-bold uppercase transition border border-slate-600">Ver Original</a>
                <?php endif; ?>
            <?php endif; ?>
            <button onclick="window.close()" class="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-xs font-bold uppercase transition">Voltar</button>
            <button onclick="compartilharRelatorio(<?php echo (int)$id; ?>)" class="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-xs font-bold uppercase transition shadow-md flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
                VISUALIZAR RELATÓRIO
            </button>
        </div>
    </div>

    <!-- PÁGINA 1: RELATÓRIO -->
    <div class="page-a4">
        <div class="bg-pagina"></div>
        
        <div class="fixed-logo"><img src="images/logo.png" alt="MMS"></div>

        <div class="conteudo-pdf">
            <div class="titulo-pdf">RELATÓRIO DE TROCA DE TURMA</div>

            <div class="row"><span class="label">Unidade:</span> <?php echo $unidade; ?></div>
            <div class="row"><span class="label">Data:</span> <?php echo $dataFormatada; ?></div>
            <div class="row"><span class="label">Local:</span> <?php echo $local; ?></div>
            <div class="row"><span class="label">Modal:</span> <?php echo $modal; ?></div>

            <div class="row" style="margin-top:5px;"><span class="label">Horário de Saída do Hotel (Previsto e Real):</span></div>
            <div class="content-box"><?php echo $saidasHTML; ?></div>

            <div class="row" style="margin-top:5px;"><span class="label">Horários de Embarque (Previsto e Real):</span></div>
            <div class="content-box">
                <span class="label">Previsto:</span> <?php echo $embPrevFormatado; ?> &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Real:</span> <?php echo $embRealFormatado; ?>
            </div>

            <div class="row" style="margin-top:5px;"><span class="label">Horário Inicial e de Finalização:</span></div>
            <div class="content-box">
                <span class="label">Início:</span> <?php echo $atInicioFormatado; ?> &nbsp;às&nbsp; <span class="label">Fim:</span> <?php echo $atFimFormatado; ?>
            </div>

            <div class="row" style="margin-top:5px;"><span class="label">Nome do Preposto:</span> <?php echo $preposto; ?></div>

            <div class="row" style="margin-top:5px;"><span class="label">Informações sobre a troca de turma:</span></div>
            <div class="info-box"><?php echo $info; ?></div>

            <?php echo $paxRows; ?>
            
            <?php if(!empty($dados['editado_por_admin'])): ?>
            <div style="text-align: center; font-size: 10px; color: #666; margin-top: 15px; border-top: 1px solid #ccc; padding-top: 5px; page-break-inside: avoid;">
                <?php echo htmlspecialchars($dados['editado_por_admin']); ?>
            </div>
            <?php endif; ?>
        </div>

        <div class="footer">
            Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>
            E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
        </div>
    </div>

    <!-- ANEXOS FOTOGRÁFICOS -->
    <?php echo $fotosHTML; ?>


    <script>
        async function compartilharRelatorio(id) {
            const btn = event.currentTarget;
            const originalHTML = btn.innerHTML;

            try {
                btn.innerHTML = '<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> PROCESSANDO...';
                btn.disabled = true;

                const urlDownload = 'download_pdf.php?id=' + id;
                const pdfRes = await fetch(urlDownload, { credentials: 'same-origin' });

                if (!pdfRes.ok) {
                    throw new Error('Servidor retornou erro ' + pdfRes.status);
                }

                // Valida que realmente é um PDF
                const contentType = pdfRes.headers.get('Content-Type') || '';
                if (!contentType.includes('application/pdf')) {
                    // Lê como texto para mostrar o erro PHP se houver
                    const errText = await pdfRes.text();
                    throw new Error('Resposta inesperada do servidor: ' + errText.substring(0, 150));
                }

                const pdfBlob = await pdfRes.blob();
                if (pdfBlob.size < 100) {
                    throw new Error('PDF gerado está vazio ou corrompido.');
                }

                const nomeUnidade = "<?php echo addslashes(strtoupper(trim(preg_replace('/\s+/', '_', $unidade)))); ?>";
                const dataArquivo = "<?php echo str_replace('/', '-', $dataFormatada); ?>";
                const nomeArquivo = nomeUnidade + '_' + dataArquivo + '.pdf';

                let compartilhou = false;
                if (navigator.share && navigator.canShare) {
                    const file = new File([pdfBlob], nomeArquivo, { 
                        type: 'application/pdf',
                        lastModified: Date.now()
                    });
                    if (navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({ 
                                title: 'Relatório ' + nomeUnidade, 
                                text: 'Segue o relatório PDF em anexo.', 
                                files: [file] 
                            });
                            compartilhou = true;
                        } catch (e) {
                            if (e.name !== 'AbortError') console.error(e);
                            else compartilhou = true; // Usuário cancelou — não é erro
                        }
                    }
                }

                // Fallback: download direto
                if (!compartilhou) {
                    const blobUrl = URL.createObjectURL(pdfBlob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = nomeArquivo;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 2000);
                }

            } catch (err) {
                console.error(err);
                alert('Erro ao compartilhar: ' + err.message);
            } finally {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }
        }
    </script>
</body>
</html>


