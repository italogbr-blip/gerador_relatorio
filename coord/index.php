<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
ini_set('session.gc_maxlifetime', 604800);
session_set_cookie_params(604800);
session_start();

// DIAGNOSTICO TEMPORARIO
if (isset($_GET['diag'])) {
    echo "<pre>";
    echo "PHP Version: " . phpversion() . "\n";
    echo "Session variables:\n";
    print_r($_SESSION);
    echo "Cookies:\n";
    print_r($_COOKIE);
    echo "</pre>";
    exit();
}

// TRAVA DE SEGURANÇA: Se não estiver logado ou não for admin (nível 2), expulsa para o login
if (!isset($_SESSION['usuario_id']) || $_SESSION['nivel_autoridade'] != 2) {
    header("Location: ../login.php");
    exit();
}

require_once __DIR__ . '/../mms_config.php';
if (file_exists(__DIR__ . '/../notas/notas_db.php')) {
    require_once __DIR__ . '/../notas/notas_db.php';
}
if (file_exists(__DIR__ . '/perm_manager.php')) {
    require_once __DIR__ . '/perm_manager.php';
}

// ============================================================
// CRIAÇÃO DE TABELAS NECESSÁRIAS
// ============================================================
try {
    // Tabela de notificações
    $pdo->exec("CREATE TABLE IF NOT EXISTS notificacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(100),
        mensagem TEXT,
        tipo ENUM('feedback', 'aviso', 'urgente') DEFAULT 'aviso',
        ativa TINYINT(1) DEFAULT 1,
        regra_exibicao ENUM('sempre', 'uma_vez', 'dias') DEFAULT 'sempre',
        validade_dias INT DEFAULT 0,
        mostrar_feedback TINYINT(1) DEFAULT 1,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    
    $colunas_notif = ['regra_exibicao', 'validade_dias', 'data_criacao'];
    foreach($colunas_notif as $col) {
        try {
            if($col == 'regra_exibicao') {
                $pdo->exec("ALTER TABLE notificacoes ADD COLUMN $col ENUM('sempre', 'uma_vez', 'dias') DEFAULT 'sempre'");
            } elseif($col == 'validade_dias') {
                $pdo->exec("ALTER TABLE notificacoes ADD COLUMN $col INT DEFAULT 0");
            } elseif($col == 'data_criacao') {
                $pdo->exec("ALTER TABLE notificacoes ADD COLUMN $col TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            }
        } catch(Exception $e) { /* Coluna já existe */ }
    }

    // Tabela de interações
    $pdo->exec("CREATE TABLE IF NOT EXISTS interacoes_popup (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notificacao_id INT,
        usuario_id INT NULL,
        feedback_nota INT NULL,
        feedback_texto TEXT NULL,
        data_interacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )");

    $colunas_inter = ['feedback_nota', 'feedback_texto', 'data_interacao'];
    foreach($colunas_inter as $col) {
        try {
            if($col == 'feedback_nota') {
                $pdo->exec("ALTER TABLE interacoes_popup ADD COLUMN $col INT NULL");
            } elseif($col == 'feedback_texto') {
                $pdo->exec("ALTER TABLE interacoes_popup ADD COLUMN $col TEXT NULL");
            } elseif($col == 'data_interacao') {
                $pdo->exec("ALTER TABLE interacoes_popup ADD COLUMN $col TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            }
        } catch(Exception $e) { /* Coluna já existe */ }
    }

    // Tabela de registro de logins
    $pdo->exec("CREATE TABLE IF NOT EXISTS registro_logins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT,
        ip VARCHAR(45),
        data_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )");

    // ----------- NOVAS TABELAS DE SEGURANÇA DO PAINEL -----------
    // Tabela onde a senha do painel fica armazenada (com hash)
    $pdo->exec("CREATE TABLE IF NOT EXISTS coord_senha (
        id INT PRIMARY KEY DEFAULT 1,
        senha_hash VARCHAR(255) NOT NULL,
        atualizada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    // Tabela onde os acessos falhos são gravados
    $pdo->exec("CREATE TABLE IF NOT EXISTS coord_acessos_falhos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NULL,
        username VARCHAR(100) NULL,
        ip VARCHAR(45),
        user_agent VARCHAR(500),
        data_tentativa TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    // Tabelas de Mensagens In-App
    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_mensagens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(150),
        mensagem TEXT,
        tipo VARCHAR(20) DEFAULT 'info',
        destinatario_id INT NULL,
        data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_mensagens_agendadas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(150),
        mensagem TEXT,
        tipo VARCHAR(20) DEFAULT 'info',
        destinatario_id INT NULL,
        frequencia VARCHAR(20) DEFAULT 'imediato',
        data_hora_proxima DATETIME NULL,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_versao_app (
        id INT AUTO_INCREMENT PRIMARY KEY,
        versao VARCHAR(50),
        descricao TEXT,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS ips_bloqueados (
        ip VARCHAR(45) PRIMARY KEY,
        data_bloqueio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        bloqueado_por VARCHAR(100)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_acessos_gerador (
        ip VARCHAR(45) PRIMARY KEY,
        ultimo_acesso TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ultimo_preposto VARCHAR(150) NULL,
        localizacao VARCHAR(150) NULL,
        total_acessos INT DEFAULT 1
    )");

    // Garante as colunas caso a tabela já exista
    try { $pdo->exec("ALTER TABLE mms_acessos_gerador ADD COLUMN ultimo_preposto VARCHAR(150) NULL"); } catch(Exception $e) {}
    try { $pdo->exec("ALTER TABLE mms_acessos_gerador ADD COLUMN localizacao VARCHAR(150) NULL"); } catch(Exception $e) {}
    
    // Garante colunas necessárias na tabela relatorios
    $cols_rel = [
        "ip_origem"  => "ALTER TABLE relatorios ADD COLUMN ip_origem VARCHAR(45) NULL",
        "empresa"    => "ALTER TABLE relatorios ADD COLUMN empresa VARCHAR(100) NULL DEFAULT 'OUTROS'",
        "dados_json" => "ALTER TABLE relatorios ADD COLUMN dados_json LONGTEXT NULL"
    ];
    foreach($cols_rel as $col => $sql_alter) {
        try { $pdo->exec($sql_alter); } catch(\Throwable $e) {}
    }

    // Garante colunas necessárias na tabela usuarios
    $cols_usu = [
        "nome"          => "ALTER TABLE usuarios ADD COLUMN nome VARCHAR(100) NULL AFTER username",
        "last_activity" => "ALTER TABLE usuarios ADD COLUMN last_activity TIMESTAMP NULL"
    ];
    foreach($cols_usu as $col => $sql_alter) {
        try { $pdo->exec($sql_alter); } catch(\Throwable $e) {}
    }

} catch (Exception $e) {
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    $mensagem = date('[d/m/Y H:i:s] ') . "ERRO COORD.PHP - Criação de Tabelas: " . $e->getMessage() . "\n";
    error_log($mensagem, 3, $caminhoLog);
}

// ============================================================
// FUNÇÃO PARA OBTER IP REAL DO CLIENTE
// ============================================================
function obterIPCliente() {
    $headers = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 'HTTP_X_CLUSTER_CLIENT_IP', 'HTTP_FORWARDED_FOR', 'HTTP_FORWARDED', 'REMOTE_ADDR'];
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = explode(',', $_SERVER[$h])[0];
            $ip = trim($ip);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'Desconhecido';
}

// ============================================================
// VERIFICAÇÃO DE SENHA DO PAINEL (BLOQUEIO DE ACESSO)
// ============================================================

// Verifica se já existe senha cadastrada
$senha_cadastrada = false;
try {
    $stmtSenha = $pdo->query("SELECT senha_hash FROM coord_senha WHERE id = 1");
    $senhaRow = $stmtSenha->fetch();
    if ($senhaRow && !empty($senhaRow['senha_hash'])) {
        $senha_cadastrada = true;
        $senha_hash_db = $senhaRow['senha_hash'];
    }
} catch(Exception $e) {
    $senha_cadastrada = false;
}

// Se a senha não está cadastrada, exibe aviso e interrompe
if (!$senha_cadastrada) {
    ?>
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Senha não configurada</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>body { font-family: "Inter", sans-serif; }</style>
    </head>
    <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-slate-200">
            <div class="text-center mb-6">
                <div class="text-5xl mb-3">🔒</div>
                <h1 class="text-2xl font-black text-slate-800 mb-2">Senha do Painel não configurada</h1>
                <p class="text-slate-600 text-sm">Para acessar o Painel de Coordenação, é necessário cadastrar uma senha de acesso primeiro.</p>
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p class="text-amber-800 text-xs font-semibold uppercase tracking-widest mb-2">⚠️ Como cadastrar:</p>
                <p class="text-amber-700 text-xs leading-relaxed">Acesse o arquivo <b>coord_setup.php</b> no servidor e defina a senha que será usada para abrir o painel. Após cadastrar, este aviso desaparecerá.</p>
            </div>
            <a href="../" class="block text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg uppercase tracking-wider text-xs transition-colors">Voltar</a>
        </div>

        <!-- Menu WebApp Voltar (Apenas PWA) REMOVIDO -->
    </body>
    </html>
    <?php
    exit();
}

// Logout do painel (limpa apenas a flag de acesso)
if (isset($_GET['lock_panel'])) {
    unset($_SESSION['coord_panel_unlocked']);
    header("Location: ./");
    exit();
}

// Processa tentativa de login no painel
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['senha_painel'])) {
    $senha_digitada = $_POST['senha_painel'];
    
    if (password_verify($senha_digitada, $senha_hash_db)) {
        // Senha correta - libera acesso
        $_SESSION['coord_panel_unlocked'] = true;
        header("Location: ./");
        exit();
    } else {
        // Senha errada - registra tentativa falha
        try {
            $stmtFalha = $pdo->prepare("INSERT INTO coord_acessos_falhos (usuario_id, username, ip, user_agent, data_tentativa) VALUES (?, ?, ?, ?, NOW())");
            $stmtFalha->execute([
                $_SESSION['usuario_id'] ?? null,
                $_SESSION['username'] ?? 'desconhecido',
                obterIPCliente(),
                substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500)
            ]);
        } catch(Exception $e) {
            $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
            error_log(date('[d/m/Y H:i:s] ') . "ERRO COORD.PHP - Registro Falha: " . $e->getMessage() . "\n", 3, $caminhoLog);
        }
        $erro_senha = "Senha incorreta. Tentativa registrada.";
    }
}

// Se ainda não passou pela verificação de senha, mostra a tela de bloqueio
if (empty($_SESSION['coord_panel_unlocked'])) {
    ?>
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Acesso Restrito - Painel de Coordenação</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>body { font-family: "Inter", sans-serif; }</style>
    </head>
    <body class="bg-slate-100 min-h-screen flex flex-col">
        <!-- CABEÇALHO COORDENAÇÃO -->
        <header class="bg-slate-900 text-white p-4 shadow-md w-full flex justify-between items-center z-50">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <span class="text-sm md:text-base font-black tracking-widest uppercase">Coordenação</span>
            </div>
            <div class="text-right text-[10px] md:text-xs text-slate-400 font-medium">
                <div><?php echo date('d/m/Y H:i'); ?></div>
                <div>IP: <?php echo htmlspecialchars(obterIPCliente()); ?></div>
            </div>
        </header>
        
        <div class="flex-1 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-slate-200">
            <div class="text-center mb-6">
                <div class="text-5xl mb-3">🔐</div>
                <h1 class="text-2xl font-black text-slate-800 mb-1">Painel de Coordenação</h1>
                <p class="text-slate-500 text-sm">Acesso protegido por senha</p>
            </div>
            
            <?php if (!empty($erro_senha)): ?>
                <div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg mb-4 text-sm font-semibold text-center">
                    ❌ <?php echo htmlspecialchars($erro_senha); ?>
                </div>
            <?php endif; ?>
            
            <form method="POST" class="space-y-4">
                <div>
                    <label class="block text-xs text-slate-600 uppercase tracking-widest font-semibold mb-2">Senha de Acesso</label>
                    <input type="password" name="senha_painel" required autofocus class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Digite a senha do painel">
                </div>
                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg uppercase tracking-wider text-xs transition-colors">
                    🔓 Desbloquear Painel
                </button>
            </form>
            
        <!-- Menu WebApp Voltar (Apenas PWA) REMOVIDO -->
    </body>
    </html>
    <?php
    exit();
}

// ============================================================
// A PARTIR DAQUI O PAINEL ESTÁ DESBLOQUEADO
// ============================================================

$msg_sucesso = '';

// Deletar popup
if (isset($_GET['del_popup'])) {
    if (!hasPermission()) {
        $msg_sucesso = 'Acesso negado: permissão insuficiente.';
    } else {
        $id_del = (int)$_GET['del_popup'];
        try {
            // Deleta manualmente as interações primeiro (garantia extra caso o CASCADE falhe)
            $pdo->prepare("DELETE FROM interacoes_popup WHERE notificacao_id = ?")->execute([$id_del]);
            // Deleta a notificação
            $pdo->prepare("DELETE FROM notificacoes WHERE id = ?")->execute([$id_del]);
            logAudit('Excluir Popup', "ID {$id_del}");
            $_SESSION['msg_sucesso_temp'] = "Pop-up e avaliações removidos com sucesso!";
            header("Location: ./");
            exit();
        } catch(Exception $e) {
            $msg_sucesso = "Erro ao deletar pop-up: " . $e->getMessage();
        }
    }
    // aborta o fluxo normal se permissão negada
    if (!hasPermission()) { exit(); }

    $id_del = (int)$_GET['del_popup'];
    try {
        // Deleta manualmente as interações primeiro (garantia extra caso o CASCADE falhe)
        $pdo->prepare("DELETE FROM interacoes_popup WHERE notificacao_id = ?")->execute([$id_del]);
        
        // Deleta a notificação
        $pdo->prepare("DELETE FROM notificacoes WHERE id = ?")->execute([$id_del]);
        
        $_SESSION['msg_sucesso_temp'] = "Pop-up e avaliações removidos com sucesso!";
        header("Location: ./");
        exit();
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao deletar pop-up: " . $e->getMessage();
    }
}

// Deletar relatório
if (isset($_GET['del_relatorio'])) {
    if (!hasPermission()) {
        $msg_sucesso = 'Acesso negado: permissão insuficiente.';
    } else {
        $id_del = (int)$_GET['del_relatorio'];
        try {
            // Busca a URL do PDF para excluir do servidor
            $stmtPdf = $pdo->prepare("SELECT pdf_url FROM relatorios WHERE id = ?");
            $stmtPdf->execute([$id_del]);
            $pdfPath = $stmtPdf->fetchColumn();
            if (!empty($pdfPath)) {
                $caminhoCompleto = __DIR__ . '/' . $pdfPath;
                if (file_exists($caminhoCompleto)) { unlink($caminhoCompleto); }
            }
            // Deleta do banco
            $pdo->prepare("DELETE FROM relatorios WHERE id = ?")->execute([$id_del]);
            logAudit('Excluir Relatório', "ID {$id_del}");
            $_SESSION['msg_sucesso_temp'] = "Relatório e PDF excluídos definitivamente com sucesso!";
            header("Location: ./");
            exit();
        } catch(Exception $e) {
            $msg_sucesso = "Erro ao deletar relatório: " . $e->getMessage();
        }
    }
    if (!hasPermission()) { exit(); }

    $id_del = (int)$_GET['del_relatorio'];
    try {
        // Busca a URL do PDF para excluir do servidor
        $stmtPdf = $pdo->prepare("SELECT pdf_url FROM relatorios WHERE id = ?");
        $stmtPdf->execute([$id_del]);
        $pdfPath = $stmtPdf->fetchColumn();

        if (!empty($pdfPath)) {
            $caminhoCompleto = __DIR__ . '/' . $pdfPath;
            if (file_exists($caminhoCompleto)) {
                unlink($caminhoCompleto);
            }
        }

        // Deleta do banco
        $pdo->prepare("DELETE FROM relatorios WHERE id = ?")->execute([$id_del]);
        
        $_SESSION['msg_sucesso_temp'] = "Relatório e PDF excluídos definitivamente com sucesso!";
        header("Location: ./");
        exit();
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao deletar relatório: " . $e->getMessage();
    }
}

// Recupera mensagem temporária após redirect
if (isset($_SESSION['msg_sucesso_temp'])) {
    $msg_sucesso = $_SESSION['msg_sucesso_temp'];
    unset($_SESSION['msg_sucesso_temp']);
}

// Salvar nova versão do aplicativo
if (isset($_POST['save_version']) && hasPermission()) {
    $versao = trim($_POST['versao_numero'] ?? '');
    $descricao = trim($_POST['versao_descricao'] ?? '');
    
    if (!empty($versao)) {
        try {
            $stmt = $pdo->prepare("INSERT INTO mms_versao_app (versao, descricao) VALUES (?, ?)");
            $stmt->execute([$versao, $descricao]);
            $_SESSION['msg_sucesso_temp'] = "Nova versão ($versao) registrada com sucesso!";
            header("Location: ./?tab=version");
            exit();
        } catch(Exception $e) {
            $msg_sucesso = "Erro ao salvar versão: " . $e->getMessage();
        }
    }
}

// Alternar status
if (isset($_GET['toggle_popup'])) {
    if (!hasPermission()) {
        $msg_sucesso = 'Acesso negado: permissão insuficiente.';
    } else {
        $id_tog = (int)$_GET['toggle_popup'];
        try {
            $stmtAtiva = $pdo->prepare("SELECT ativa FROM notificacoes WHERE id = ?");
            $stmtAtiva->execute([$id_tog]);
            $ativaAtual = $stmtAtiva->fetchColumn();
            if (!$ativaAtual) { $pdo->query("UPDATE notificacoes SET ativa = 0"); }
            $pdo->prepare("UPDATE notificacoes SET ativa = ? WHERE id = ?")->execute([!$ativaAtual, $id_tog]);
            logAudit('Alternar Status Popup', "ID {$id_tog}, nova ativa: " . (! $ativaAtual));
            $msg_sucesso = "Status do pop-up alterado!";
        } catch(Exception $e) {
            $msg_sucesso = "Erro ao alterar status.";
        }
    }
    if (!hasPermission()) { exit(); }

    $id_tog = (int)$_GET['toggle_popup'];
    try {
        $stmtAtiva = $pdo->prepare("SELECT ativa FROM notificacoes WHERE id = ?");
        $stmtAtiva->execute([$id_tog]);
        $ativaAtual = $stmtAtiva->fetchColumn();
        
        if (!$ativaAtual) {
            $pdo->query("UPDATE notificacoes SET ativa = 0"); // Desativa os outros
        }
        $pdo->prepare("UPDATE notificacoes SET ativa = ? WHERE id = ?")->execute([!$ativaAtual, $id_tog]);
        $msg_sucesso = "Status do pop-up alterado!";
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao alterar status.";
    }
}

// Limpar histórico de acessos falhos
if (isset($_GET['limpar_falhas'])) {
    try {
        $pdo->exec("DELETE FROM coord_acessos_falhos");
        $msg_sucesso = "Histórico de acessos falhos limpo!";
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao limpar histórico.";
    }
}

// Deletar mensagem in-app do histórico
if (isset($_GET['del_mensagem'])) {
    $id_del_msg = (int)$_GET['del_mensagem'];
    try {
        // Apaga lidas e excluídas amarradas à mensagem
        $pdo->prepare("DELETE FROM mms_mensagens_lidas WHERE mensagem_id = ?")->execute([$id_del_msg]);
        $pdo->prepare("DELETE FROM mms_mensagens_excluidas WHERE mensagem_id = ?")->execute([$id_del_msg]);
        
        $pdo->prepare("DELETE FROM mms_mensagens WHERE id = ?")->execute([$id_del_msg]);
        $_SESSION['msg_sucesso_temp'] = "Mensagem apagada com sucesso!";
        header("Location: ./?aba=mensagens");
        exit();
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao apagar mensagem: " . $e->getMessage();
    }
}

// Limpar cache dos PDFs (requer token CSRF + confirmação POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['acao_limpar_cache_pdf'])) {
    // Valida token CSRF
    $tokenEnviado = $_POST['csrf_token_cache'] ?? '';
    $tokenSessao  = $_SESSION['csrf_token_cache'] ?? '';
    if (!$tokenSessao || !hash_equals($tokenSessao, $tokenEnviado)) {
        $msg_sucesso = "❌ Ação bloqueada: token de segurança inválido.";
    } else {
        // Invalida token após uso (one-time use)
        unset($_SESSION['csrf_token_cache']);
        try {
            $stmt = $pdo->prepare("UPDATE relatorios SET pdf_url = NULL");
            $stmt->execute();
            $qtd = $stmt->rowCount();
            // Registra no log de auditoria
            $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
            error_log(date('[d/m/Y H:i:s] ') . "CACHE PDF LIMPO por '{$_SESSION['username']}' (ID {$_SESSION['usuario_id']}) — {$qtd} registros afetados.\n", 3, $caminhoLog);
            $_SESSION['msg_sucesso_temp'] = "🗑️ Cache de PDFs limpo com sucesso! {$qtd} registros atualizados. Os PDFs serão regenerados no próximo download.";
            header("Location: ./");
            exit();
        } catch(Exception $e) {
            $msg_sucesso = "Erro ao limpar cache: " . $e->getMessage();
        }
    }
}

// Gera token CSRF para o formulário de cache
if (empty($_SESSION['csrf_token_cache'])) {
    $_SESSION['csrf_token_cache'] = bin2hex(random_bytes(32));
}
$csrfTokenCache = $_SESSION['csrf_token_cache'];

// Processa a mudança no tempo de retenção
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['meses_retencao'])) {
    $meses = (int)$_POST['meses_retencao'];
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS configuracoes (
            id INT PRIMARY KEY DEFAULT 1,
            meses_retencao_midia INT DEFAULT 6,
            ultima_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )");
        
        $pdo->exec("INSERT IGNORE INTO configuracoes (id, meses_retencao_midia) VALUES (1, 6)");
        
        $stmt = $pdo->prepare("UPDATE configuracoes SET meses_retencao_midia = ? WHERE id = 1");
        $stmt->execute([$meses]);
        $msg_sucesso = "Configuração de retenção atualizada!";
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao atualizar configuração.";
    }
}

// Processa a criação ou edição de popup
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['acao_popup'])) {
    $titulo = $_POST['popup_titulo'] ?? '';
    $mensagem = $_POST['popup_mensagem'] ?? '';
    $tipo = $_POST['popup_tipo'] ?? 'aviso';
    $regra = $_POST['popup_regra'] ?? 'sempre';
    $dias = (int)($_POST['popup_dias'] ?? 0);
    $mostrar_f = isset($_POST['mostrar_feedback']) ? 1 : 0;
    $acao = $_POST['acao_popup'];
    
    try {
        if ($acao === 'editar') {
            $id_edit = (int)$_POST['popup_id'];
            $stmtPop = $pdo->prepare("UPDATE notificacoes SET titulo = ?, mensagem = ?, tipo = ?, regra_exibicao = ?, validade_dias = ?, mostrar_feedback = ? WHERE id = ?");
            $stmtPop->execute([$titulo, $mensagem, $tipo, $regra, $dias, $mostrar_f, $id_edit]);
            $msg_sucesso = "Pop-up atualizado com sucesso!";
        } else {
            // Criar Novo (Apenas um ativo por vez)
            $pdo->query("UPDATE notificacoes SET ativa = 0");
            $stmtPop = $pdo->prepare("INSERT INTO notificacoes (titulo, mensagem, tipo, regra_exibicao, validade_dias, mostrar_feedback, ativa) VALUES (?, ?, ?, ?, ?, ?, 1)");
            $stmtPop->execute([$titulo, $mensagem, $tipo, $regra, $dias, $mostrar_f]);
            $msg_sucesso = "Novo pop-up configurado e ativado!";
        }
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao salvar pop-up: " . $e->getMessage();
    }
}

// Processa envio de Mensagem In-App
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['acao_enviar_mensagem'])) {
    $titulo = $_POST['msg_titulo'] ?? '';
    $mensagem = $_POST['msg_texto'] ?? '';
    $tipo = $_POST['msg_tipo'] ?? 'info';
    $destinatario_id = !empty($_POST['msg_destinatario']) ? (int)$_POST['msg_destinatario'] : null;
    $autor_id = $_SESSION['usuario_id'];
    
    $frequencia = $_POST['msg_frequencia'] ?? 'imediato';
    $data_hora = !empty($_POST['msg_data_hora']) ? $_POST['msg_data_hora'] : date('Y-m-d H:i:s');
    
    try {
        if ($frequencia == 'imediato') {
            $stmtMsg = $pdo->prepare("INSERT INTO mms_mensagens (titulo, mensagem, tipo, autor_id, destinatario_id) VALUES (?, ?, ?, ?, ?)");
            $stmtMsg->execute([$titulo, $mensagem, $tipo, $autor_id, $destinatario_id]);
            $msg_sucesso = "Mensagem disparada imediatamente!";
        } else {
            $stmtAg = $pdo->prepare("INSERT INTO mms_mensagens_agendadas (titulo, mensagem, tipo, autor_id, destinatario_id, frequencia, data_hora_proxima) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmtAg->execute([$titulo, $mensagem, $tipo, $autor_id, $destinatario_id, $frequencia, $data_hora]);
            $msg_sucesso = "Mensagem agendada com sucesso!";
        }
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao enviar/agendar mensagem: " . $e->getMessage();
    }
}

// Processa bloqueio de IP
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['acao_bloquear_ip'])) {
    if (hasPermission()) {
        $ip_alvo = $_POST['ip_alvo'] ?? '';
        $bloquear = (int)($_POST['bloquear'] ?? 1);
        if (!empty($ip_alvo)) {
            if ($bloquear) {
                $pdo->prepare("INSERT IGNORE INTO ips_bloqueados (ip, bloqueado_por) VALUES (?, ?)")->execute([$ip_alvo, $_SESSION['username']]);
                $_SESSION['msg_sucesso_temp'] = "IP {$ip_alvo} bloqueado com sucesso!";
            } else {
                $pdo->prepare("DELETE FROM ips_bloqueados WHERE ip = ?")->execute([$ip_alvo]);
                $_SESSION['msg_sucesso_temp'] = "IP {$ip_alvo} desbloqueado!";
            }
            header("Location: ./?tab=seguranca");
            exit();
        }
    }
}

// Processa mudança de nível de autoridade
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['acao_mudar_perfil'])) {
    if (!hasPermission()) {
        $msg_sucesso = 'Acesso negado: permissão insuficiente.';
    } else {
        $id_usuario = (int)$_POST['usuario_id'];
        $novo_nivel = (int)$_POST['nivel'];
        if ($id_usuario !== $_SESSION['usuario_id']) {
            try {
                $stmt = $pdo->prepare("UPDATE usuarios SET nivel_autoridade = ? WHERE id = ?");
                $stmt->execute([$novo_nivel, $id_usuario]);
                $msg_sucesso = "Nível de autoridade atualizado com sucesso!";
            } catch(Exception $e) {
                $msg_sucesso = "Erro ao atualizar permissão: " . $e->getMessage();
            }
        } else {
            $msg_sucesso = "Você não pode alterar seu próprio nível de acesso.";
        }
    }
}

// Busca as métricas (KPIs)
$total_relatorios = $pdo->query("SELECT COUNT(*) FROM relatorios")->fetchColumn();

try {
    $config_atual = $pdo->query("SELECT meses_retencao_midia FROM configuracoes WHERE id = 1")->fetchColumn();
    if(!$config_atual) $config_atual = 6;
} catch(Exception $e) {
    $config_atual = 6;
}

$filtro_mes_kpi = $_GET['kpi_mes'] ?? date('Y-m');
$ano_kpi = date('Y', strtotime($filtro_mes_kpi . '-01'));
$mes_kpi = date('m', strtotime($filtro_mes_kpi . '-01'));

$relatorios_hoje = $pdo->query("SELECT COUNT(*) FROM relatorios WHERE DATE(data_criacao) = CURDATE()")->fetchColumn();

$stmt_mes = $pdo->prepare("SELECT COUNT(*) FROM relatorios WHERE MONTH(data_criacao) = ? AND YEAR(data_criacao) = ?");
$stmt_mes->execute([$mes_kpi, $ano_kpi]);
$relatorios_mes = $stmt_mes->fetchColumn();

$stmt_usu = $pdo->prepare("SELECT COUNT(DISTINCT usuario_id) FROM relatorios WHERE MONTH(data_criacao) = ? AND YEAR(data_criacao) = ?");
$stmt_usu->execute([$mes_kpi, $ano_kpi]);
$usuarios_ativos = $stmt_usu->fetchColumn();

$usuarios_online = $pdo->query("SELECT COUNT(*) FROM visitantes_online WHERE ultima_atividade >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)")->fetchColumn();

// Processa Filtros de Busca
$where = "1=1";
$params = [];

if (!empty($_GET['f_empresa'])) {
    $where .= " AND empresa = ?";
    $params[] = $_GET['f_empresa'];
}
if (!empty($_GET['f_unidade'])) {
    $where .= " AND unidade LIKE ?";
    $params[] = '%' . $_GET['f_unidade'] . '%';
}
if (!empty($_GET['f_data_inicio'])) {
    $where .= " AND DATE(data_criacao) >= ?";
    $params[] = $_GET['f_data_inicio'];
}
if (!empty($_GET['f_data_fim'])) {
    $where .= " AND DATE(data_criacao) <= ?";
    $params[] = $_GET['f_data_fim'];
}
if (!empty($_GET['f_search_user'])) {
    $where .= " AND (u.username LIKE ? OR u.nome LIKE ?)";
    $params[] = '%' . $_GET['f_search_user'] . '%';
    $params[] = '%' . $_GET['f_search_user'] . '%';
}
if (!empty($_GET['f_usuario'])) {
    $where .= " AND r.usuario_id = ?";
    $params[] = $_GET['f_usuario'];
}

// Configuração da Paginação
$limite_por_pagina = 15;
$pagina_atual = isset($_GET['pg']) ? (int)$_GET['pg'] : 1;
if ($pagina_atual < 1) $pagina_atual = 1;
$offset = ($pagina_atual - 1) * $limite_por_pagina;

// Contar o total para a paginação
$sqlTotal = "
    SELECT COUNT(r.id)
    FROM relatorios r
    LEFT JOIN usuarios u ON r.usuario_id = u.id
    WHERE $where
";
$stmtTotal = $pdo->prepare($sqlTotal);
$stmtTotal->execute($params);
$total_registros_rel = $stmtTotal->fetchColumn();
$total_paginas_rel = ceil($total_registros_rel / $limite_por_pagina);

// Últimos relatórios (com join para pegar nome do autor) + Paginação
$sqlRel = "
    SELECT r.*, u.username as autor_username, u.nome as autor_nome 
    FROM relatorios r
    LEFT JOIN usuarios u ON r.usuario_id = u.id
    WHERE $where
    ORDER BY r.id DESC 
    LIMIT $limite_por_pagina OFFSET $offset
";
$stmtRel = $pdo->prepare($sqlRel);
$stmtRel->execute($params);
$relatorios = $stmtRel->fetchAll();

// Lista de usuários para o filtro
try {
    $usuarios_lista = $pdo->query("SELECT id, username, COALESCE(nome, username) AS nome FROM usuarios ORDER BY username ASC")->fetchAll();
} catch(\Throwable $e) {
    $usuarios_lista = $pdo->query("SELECT id, username, username AS nome FROM usuarios ORDER BY username ASC")->fetchAll();
}

// Últimos Logins
$stmtLogins = $pdo->query("SELECT r.ip, r.data_login, u.username FROM registro_logins r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.id DESC LIMIT 15");
$ultimos_logins = $stmtLogins->fetchAll();



// Acessos Falhos no painel
$acessos_falhos = [];
$total_falhas = 0;
try {
    $stmtFalhas = $pdo->query("SELECT * FROM coord_acessos_falhos ORDER BY id DESC LIMIT 50");
    $acessos_falhos = $stmtFalhas ? $stmtFalhas->fetchAll() : [];
    $stmtTF = $pdo->query("SELECT COUNT(*) FROM coord_acessos_falhos");
    $total_falhas = $stmtTF ? (int)$stmtTF->fetchColumn() : 0;
} catch(\Throwable $e) {}

// Pop-ups
$todos_popups = [];
try {
    $stmtTodasNotif = $pdo->query("SELECT * FROM notificacoes ORDER BY id DESC LIMIT 20");
    $todos_popups = $stmtTodasNotif ? $stmtTodasNotif->fetchAll() : [];
} catch(\Throwable $e) {}

// Interações
$interacoes = [];
try {
    $stmtInt = $pdo->query("
        SELECT i.*, u.username, u.nome, n.titulo as pop_titulo 
        FROM interacoes_popup i 
        LEFT JOIN usuarios u ON i.usuario_id = u.id 
        JOIN notificacoes n ON i.notificacao_id = n.id 
        ORDER BY i.data_interacao DESC 
        LIMIT 100
    ");
    $interacoes = $stmtInt ? $stmtInt->fetchAll() : [];
} catch(\Throwable $e) {}

// Histórico de Mensagens In-App
$historico_mensagens = [];
try {
    $stmtMsgs = $pdo->query("
        SELECT m.*, u.username, u.nome as dest_nome 
        FROM mms_mensagens m 
        LEFT JOIN usuarios u ON m.destinatario_id = u.id 
        ORDER BY m.data_envio DESC 
        LIMIT 50
    ");
    $historico_mensagens = $stmtMsgs ? $stmtMsgs->fetchAll() : [];
} catch(\Throwable $e) {}

// Mensagens Agendadas
$mensagens_agendadas = [];
try {
    $stmtAg = $pdo->query("
        SELECT a.*, u.username, u.nome as dest_nome 
        FROM mms_mensagens_agendadas a 
        LEFT JOIN usuarios u ON a.destinatario_id = u.id 
        ORDER BY a.data_hora_proxima ASC
    ");
    $mensagens_agendadas = $stmtAg ? $stmtAg->fetchAll() : [];
} catch(\Throwable $e) {}

// Excluir mensagem agendada
if (isset($_GET['del_agendada'])) {
    $id_ag_del = (int)$_GET['del_agendada'];
    try {
        $pdo->prepare("DELETE FROM mms_mensagens_agendadas WHERE id = ?")->execute([$id_ag_del]);
        $_SESSION['msg_sucesso_temp'] = "Agendamento cancelado com sucesso!";
        header("Location: ./?aba=mensagens");
        exit();
    } catch(Exception $e) {
        $msg_sucesso = "Erro ao apagar agendamento.";
    }
}

// Logs
$caminhoLog = __DIR__ . '/mms_erros_sistema.log';
$logs_sistema = file_exists($caminhoLog) ? file_get_contents($caminhoLog) : "Sistema operando 100%. Nenhum erro registrado.";
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
    <meta name="apple-mobile-web-app-title" content="Coordenação MMS">
    <meta name="theme-color" content="#0f172a">
    <title>Painel de Coordenação - MMS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/notifications.css">
    <link rel="stylesheet" href="assets/css/theme.css">
    <style>
        body { font-family: "Inter", sans-serif; background: var(--color-bg); color: var(--color-text); touch-action: pan-y; overscroll-behavior-y: none; }
        .log-box { font-family: 'Courier New', monospace; }
        /* ABAS */
        .tab-btn { color: #64748b; background: transparent; border: none; cursor: pointer; }
        .tab-btn:hover { background: #f1f5f9; color: #1e293b; }
        .tab-btn.active-tab { background: #1e293b; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
        .aba-content { animation: fadeIn .18s ease; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .hidden { display: none !important; }

        /* TRAVAMENTO DE TABELAS E ZOOM */
        .overflow-x-auto, table {
            touch-action: pan-y pinch-zoom;
            overscroll-behavior-x: none;
        }
        table {
            max-width: 100%;
        }
    </style>
    <script src="assets/js/notifications.js" defer></script>
</head>
<body class="transition-colors duration-300">

    <!-- Navbar Principal com Cabeçalho Customizado -->
    <nav class="bg-slate-900 text-white shadow-lg w-full z-50 sticky top-0">
        <div class="w-full max-w-[1600px] mx-auto p-3 md:py-4 md:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div class="flex items-center justify-between w-full sm:w-auto">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <span class="text-base md:text-xl font-black tracking-widest uppercase">Coordenação</span>
                </div>
                <div class="text-right text-[10px] text-slate-400 font-medium sm:hidden leading-tight truncate max-w-[150px]">
                    <div class="font-bold text-slate-300"><?php echo date('d/m/Y H:i'); ?></div>
                    <div class="truncate opacity-80" title="<?php echo htmlspecialchars(obterIPCliente()); ?>">IP: <?php echo htmlspecialchars(substr(obterIPCliente(), 0, 15) . (strlen(obterIPCliente()) > 15 ? '...' : '')); ?></div>
                </div>
            </div>
            
            <div class="flex items-center justify-between sm:justify-end gap-2 md:gap-4 w-full sm:w-auto border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0">
                <div class="text-right text-xs text-slate-400 font-medium hidden sm:block leading-tight border-r border-slate-700 pr-4">
                    <div class="font-bold text-slate-300"><?php echo date('d/m/Y \à\s H:i'); ?></div>
                    <div class="text-[10px] opacity-80">IP Conectado: <?php echo htmlspecialchars(obterIPCliente()); ?></div>
                </div>
                <div class="flex items-center justify-between w-full sm:w-auto gap-2">
                    <span class="text-xs md:text-sm font-medium">Olá, <b><?php echo htmlspecialchars($_SESSION['username'] ?? 'Admin'); ?></b></span>
                    <div class="flex items-center gap-3">
                        <button id="notificationBell" class="notification-bell text-white opacity-80 hover:opacity-100 transition-opacity" title="Notificações">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span class="badge hidden" id="notifCount"></span>
                        </button>
                        <a href="../" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">Voltar</a>
                        <a href="../logout.php" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">Sair</a>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <div class="w-full max-w-[1600px] mx-auto p-4 md:p-8 pb-24 md:pb-32 mt-4 min-h-screen">

        <!-- Alert de Sucesso -->
        <?php if ($msg_sucesso): ?>
            <div class="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl mb-6 text-sm font-semibold text-center">
                ✅ <?php echo $msg_sucesso; ?>
            </div>
        <?php endif; ?>

        <!-- Filtro de KPIs (Refinado) -->
        <div class="mb-8 flex flex-col md:flex-row justify-between items-center bg-white border border-slate-200/60 shadow-lg rounded-2xl p-4 gap-4 transition-all overflow-hidden w-full max-w-full">
            <div class="flex items-center gap-3 w-full md:w-auto">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 text-white shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <div class="overflow-hidden">
                    <h2 class="text-sm md:text-base font-black uppercase tracking-widest text-slate-800 truncate">Visão Geral</h2>
                    <p class="text-[10px] md:text-xs text-slate-500 font-medium truncate">Análise de métricas e performance</p>
                </div>
            </div>
            
            <form method="GET" class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto bg-slate-50 p-2 rounded-xl border border-slate-100 min-w-0">
                <div class="relative w-full flex-1 min-w-0">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg class="h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <input type="month" name="kpi_mes" value="<?php echo htmlspecialchars($filtro_mes_kpi); ?>" class="pl-9 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full max-w-full min-w-0 box-border transition-all shadow-sm">
                </div>
                <button type="submit" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-5 py-2.5 rounded-lg uppercase tracking-wider transition-all shadow-md shrink-0 flex items-center justify-center gap-2">
                    <span>Filtrar</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                </button>
            </form>
        </div>

        <!-- Seção de KPIs -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="card border-t-4 border-t-blue-500 p-5">
                <div class="text-blue-500 text-xs font-bold uppercase tracking-widest mb-1">Hoje</div>
                <div class="text-3xl font-black text-[var(--color-text)]"><?php echo $relatorios_hoje; ?></div>
                <div class="text-[var(--color-text)] opacity-70 text-[10px] mt-1 font-medium">relatórios gerados</div>
            </div>

            <div class="card border-t-4 border-t-emerald-500 p-5">
                <div class="text-emerald-500 text-xs font-bold uppercase tracking-widest mb-1">No Mês</div>
                <div class="text-3xl font-black text-[var(--color-text)]"><?php echo $relatorios_mes; ?></div>
                <div class="text-[var(--color-text)] opacity-70 text-[10px] mt-1 font-medium">em <?php echo date('m/Y', strtotime($filtro_mes_kpi . '-01')); ?></div>
            </div>

            <div class="card border-t-4 border-t-amber-500 p-5">
                <div class="text-amber-500 text-xs font-bold uppercase tracking-widest mb-1">Usuários Ativos</div>
                <div class="text-3xl font-black text-[var(--color-text)]"><?php echo $usuarios_online; ?></div>
                <div class="text-[var(--color-text)] opacity-70 text-[10px] mt-1 font-medium">online no momento</div>
            </div>

            <div class="card border-t-4 border-t-slate-500 p-5">
                <div class="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total Geral</div>
                <div class="text-3xl font-black text-[var(--color-text)]"><?php echo $total_relatorios; ?></div>
                <div class="text-[var(--color-text)] opacity-70 text-[10px] mt-1 font-medium">relatórios salvos</div>
            </div>
        </div>

        <!-- ABAS DE NAVEGAÇÃO -->
        <div class="mb-6">
            <div class="flex flex-wrap gap-1.5 card p-1.5">
                <button onclick="mudarAba('relatorios')" id="tab-relatorios"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    📊 Relatórios
                </button>
                <button onclick="mudarAba('ranking')" id="tab-ranking"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    🏆 Ranking
                </button>
                <button onclick="mudarAba('comunicados')" id="tab-comunicados"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    📢 Pop-ups
                </button>
                <button onclick="mudarAba('mensagens')" id="tab-mensagens"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    💬 Mensagens
                </button>
                <button onclick="mudarAba('seguranca')" id="tab-seguranca"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    🛡️ Segurança
                </button>
                <button onclick="mudarAba('sistema')" id="tab-sistema"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    ⚙️ Sistema
                </button>
                <button onclick="mudarAba('version')" id="tab-version"
                    class="tab-btn flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200">
                    🏷️ Version
                </button>
            </div>
        </div>

        <!-- ═══════════ ABA: RANKING ═══════════ -->
        <div id="aba-ranking" class="aba-content hidden">
            <div class="w-full">
                <div class="w-full space-y-6">
                <!-- Ranking de Usuários -->
                <div class="card overflow-hidden">
                    <div class="p-4 border-b border-[var(--color-card-border)] bg-gradient-to-r from-amber-50 to-orange-50/50">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-amber-800">Top Geradores</h3>
                                <p class="text-[10px] text-amber-600 font-medium">Ranking dos que mais geraram relatórios</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-0 overflow-x-auto">
                        <table class="w-full text-left text-sm table-fixed">
                            <thead class="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-100">
                                <tr>
                                    <th class="p-3 w-[15%] text-center">Posição</th>
                                    <th class="p-3 w-[65%]">Usuário / Preposto</th>
                                    <th class="p-3 w-[20%] text-center">Total</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <?php
                                $ranking = [];
                                try {
                                    $stmtRank = $pdo->query("
                                        SELECT 
                                            r.usuario_id,
                                            u.nome as autor_nome,
                                            u.username as autor_username,
                                            r.ip_origem,
                                            MAX(r.dados_json) as dados_json,
                                            COUNT(r.id) as total
                                        FROM relatorios r
                                        LEFT JOIN usuarios u ON r.usuario_id = u.id
                                        GROUP BY r.usuario_id, u.nome, u.username, r.ip_origem
                                        ORDER BY total DESC
                                        LIMIT 10
                                    ");
                                    $ranking = $stmtRank->fetchAll(PDO::FETCH_ASSOC);
                                } catch(\Throwable $e) {}
                                
                                $pos = 1;
                                foreach($ranking as $rk):
                                    $nome_display = '';
                                    if (!empty($rk['autor_nome']) || !empty($rk['autor_username'])) {
                                        $nome_display = htmlspecialchars($rk['autor_nome'] ?: $rk['autor_username']);
                                    } else {
                                        $ip_str = htmlspecialchars($rk['ip_origem'] ?? 'N/A');
                                        $prepostoStr = '';
                                        if (!empty($rk['dados_json'])) {
                                            $dj = json_decode($rk['dados_json'], true);
                                            if (!empty($dj['preposto'])) {
                                                $prepostoStr = ' (' . htmlspecialchars(substr($dj['preposto'], 0, 20)) . ')';
                                            }
                                        }
                                        $ip_short = strlen($ip_str) > 18 ? substr($ip_str, 0, 8) . '...' . substr($ip_str, -4) : $ip_str;
                                        $nome_display = '🌐 IP: ' . $ip_short . $prepostoStr;
                                    }
                                ?>
                                <tr class="hover:bg-slate-50/50 transition-colors">
                                    <td class="p-3 text-center">
                                        <?php if($pos == 1): ?>
                                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 font-black text-[10px] shadow-sm">1</span>
                                        <?php elseif($pos == 2): ?>
                                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-600 font-black text-[10px] shadow-sm">2</span>
                                        <?php elseif($pos == 3): ?>
                                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-orange-700 font-black text-[10px] shadow-sm">3</span>
                                        <?php else: ?>
                                            <span class="text-slate-400 font-bold text-xs"><?php echo $pos; ?></span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="p-3">
                                        <div class="font-bold text-slate-700 text-xs truncate" title="<?php echo htmlspecialchars($nome_display); ?>">
                                            <?php echo $nome_display; ?>
                                        </div>
                                    </td>
                                    <td class="p-3 text-center">
                                        <span class="bg-blue-50 text-blue-600 font-black px-2.5 py-1 rounded-md border border-blue-100 text-[10px]"><?php echo $rk['total']; ?></span>
                                    </td>
                                </tr>
                                <?php $pos++; endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            </div>
        </div>

        <!-- ═══════════ ABA: RELATÓRIOS ═══════════ -->
        <div id="aba-relatorios" class="aba-content hidden">
            <div class="w-full">
                <div class="w-full space-y-6">

                <!-- Relatórios Recentes -->
                <div class="card overflow-hidden">
                    <div class="p-4 border-b border-[var(--color-card-border)] flex flex-col gap-4">
                        <h3 class="font-black text-sm uppercase tracking-widest text-[var(--color-text)]">📊 Relatórios Gerados</h3>
                        <form method="GET" class="flex flex-wrap gap-2 items-center">
                            <div class="flex items-center gap-2 bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-lg px-3 py-1.5 shadow-sm">
                                <span class="text-[10px] font-black text-[var(--color-text)] opacity-60 uppercase tracking-widest">De:</span>
                                <input type="date" name="f_data_inicio" value="<?php echo htmlspecialchars($_GET['f_data_inicio'] ?? ''); ?>" class="text-xs outline-none border-none bg-transparent text-[var(--color-text)]">
                            </div>
                            <div class="flex items-center gap-2 bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-lg px-3 py-1.5 shadow-sm">
                                <span class="text-[10px] font-black text-[var(--color-text)] opacity-60 uppercase tracking-widest">Até:</span>
                                <input type="date" name="f_data_fim" value="<?php echo htmlspecialchars($_GET['f_data_fim'] ?? ''); ?>" class="text-xs outline-none border-none bg-transparent text-[var(--color-text)]">
                            </div>
                            <input type="text" name="f_search_user" placeholder="Buscar usuário..." value="<?php echo htmlspecialchars($_GET['f_search_user'] ?? ''); ?>" class="text-xs bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-[var(--color-text)] rounded-lg px-3 py-2 outline-none w-32 md:w-40 shadow-sm focus:ring-2 focus:ring-blue-500/50">
                            <input type="text" name="f_unidade" placeholder="Unidade..." value="<?php echo htmlspecialchars($_GET['f_unidade'] ?? ''); ?>" class="text-xs bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-[var(--color-text)] rounded-lg px-3 py-2 outline-none w-28 md:w-36 shadow-sm focus:ring-2 focus:ring-blue-500/50">
                            <select name="f_empresa" class="text-xs bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-[var(--color-text)] rounded-lg px-3 py-2 outline-none shadow-sm focus:ring-2 focus:ring-blue-500/50 cursor-pointer">
                                <option value="">Empresa...</option>
                                <option value="TECHNIP" <?php echo ($_GET['f_empresa'] ?? '') == 'TECHNIP' ? 'selected' : ''; ?>>TECHNIP</option>
                                <option value="DOF" <?php echo ($_GET['f_empresa'] ?? '') == 'DOF' ? 'selected' : ''; ?>>DOF</option>
                                <option value="TECHNIP/DOF" <?php echo ($_GET['f_empresa'] ?? '') == 'TECHNIP/DOF' ? 'selected' : ''; ?>>TECHNIP/DOF</option>
                                <option value="CONSTELLATION" <?php echo ($_GET['f_empresa'] ?? '') == 'CONSTELLATION' ? 'selected' : ''; ?>>CONSTELLATION</option>
                                <option value="ZONDA" <?php echo ($_GET['f_empresa'] ?? '') == 'ZONDA' ? 'selected' : ''; ?>>ZONDA</option>
                                <option value="OUTROS" <?php echo ($_GET['f_empresa'] ?? '') == 'OUTROS' ? 'selected' : ''; ?>>OUTROS</option>
                            </select>
                            <select name="f_usuario" class="text-xs bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-[var(--color-text)] rounded-lg px-3 py-2 outline-none shadow-sm focus:ring-2 focus:ring-blue-500/50 cursor-pointer">
                                <option value="">Usuário...</option>
                                <?php foreach($usuarios_lista as $ul): ?>
                                    <option value="<?php echo $ul['id']; ?>" <?php echo ($_GET['f_usuario'] ?? '') == $ul['id'] ? 'selected' : ''; ?>><?php echo htmlspecialchars($ul['nome'] ?: $ul['username']); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <div class="flex gap-2">
                                <button type="submit" class="bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-black px-4 py-2 rounded-lg uppercase tracking-wider transition-colors shadow-sm">Filtrar</button>
                                <a href="./" class="bg-slate-200 hover:bg-slate-300 text-slate-600 text-[11px] font-black px-4 py-2 rounded-lg uppercase tracking-wider transition-colors shadow-sm">Limpar</a>
                            </div>
                        </form>
                    </div>
                    <div class="max-h-[700px] overflow-y-auto overflow-x-hidden">
                        <table class="w-full text-left text-sm table-fixed">
                            <thead class="table-header text-slate-500 text-[10px] uppercase tracking-widest">
                                <tr>
                                    <th class="p-3 w-[70%] sm:w-[80%]">Unidade / Autor</th>
                                    <th class="p-3 w-[30%] sm:w-[20%] text-center">Empresa</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200">
                                <?php if(empty($relatorios)): ?>
                                    <tr><td colspan="3" class="p-6 text-center text-slate-400">Nenhum relatório encontrado.</td></tr>
                                <?php else: ?>
                                    <?php foreach($relatorios as $r): ?>
                                    <tr class="table-row">
                                        <td class="p-3 align-top">
                                            <div class="font-bold text-blue-600 text-xs uppercase truncate max-w-full" title="<?php echo htmlspecialchars($r['unidade']); ?>"><?php echo htmlspecialchars($r['unidade']); ?></div>
                                            <div class="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mb-2 truncate max-w-full">
                                                Por: 
                                                <?php 
                                                    if (!empty($r['autor_nome']) || !empty($r['autor_username'])) {
                                                        echo htmlspecialchars($r['autor_nome'] ?: $r['autor_username']);
                                                    } else {
                                                        $ip_str = htmlspecialchars($r['ip_origem'] ?? 'N/A');
                                                        
                                                        // Extrair preposto do JSON
                                                        $prepostoStr = '';
                                                        if (!empty($r['dados_json'])) {
                                                            $dadosJson = json_decode($r['dados_json'], true);
                                                            if (!empty($dadosJson['preposto'])) {
                                                                $prepostoStr = ' (' . htmlspecialchars(substr($dadosJson['preposto'], 0, 20)) . ')';
                                                            }
                                                        }
                                                        
                                                        if ($ip_str !== 'N/A') {
                                                            $ip_short = strlen($ip_str) > 18 ? substr($ip_str, 0, 8) . '...' . substr($ip_str, -4) : $ip_str;
                                                            echo '<span class="ip-geo" data-ip="'.$ip_str.'">🌐 IP: ' . $ip_short . $prepostoStr . '</span>';
                                                        } else {
                                                            echo '🌐 IP: N/A' . $prepostoStr;
                                                        }
                                                    }
                                                ?>
                                            </div>
                                            
                                            <div class="text-[var(--color-text)] opacity-70 text-[9px] font-bold uppercase tracking-wider mb-2 mt-1 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                                <?php echo date('d/m/Y \à\s H:i', strtotime($r['data_criacao'])); ?>
                                            </div>
                                            
                                            <!-- Ações (Download, Visualizar, Compartilhar, Excluir) -->
                                            <div class="flex flex-row items-center justify-start gap-1 sm:gap-2 flex-wrap mt-2">
                                                <a href="../download_pdf.php?id=<?php echo $r['id']; ?>" class="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg uppercase tracking-widest transition-all border border-blue-100 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                                    <span>Download</span>
                                                </a>
                                                <a href="../ver_relatorio.php?id=<?php echo $r['id']; ?>" target="_blank" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-black px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg uppercase tracking-widest transition-all border border-indigo-100 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                    <span>Visualizar</span>
                                                </a>
                                                <!-- Botão Editar -->
                                                <a href="../editar_relatorio.php?id=<?php echo $r['id']; ?>" class="bg-amber-50 hover:bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg uppercase tracking-widest transition-all border border-amber-100 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                                    <span>Editar</span>
                                                </a>
                                                <button onclick="compartilharRelatorio(<?php echo $r['id']; ?>)" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg uppercase tracking-widest transition-all border border-emerald-100 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                                                    <span>Compartilhar</span>
                                                </button>
                                                <a href="?del_relatorio=<?php echo $r['id']; ?>" onclick="return confirm('Tem certeza que deseja apagar?');" class="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9px] font-black px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg uppercase tracking-widest transition-all border border-rose-100 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                    <span>Excluir</span>
                                                </a>
                                            </div>
                                        </td>
                                        <td class="p-3 text-center align-top">
                                            <?php 
                                                $corEmpresa = 'bg-slate-200 text-slate-700';
                                                $empresa_texto = trim($r['empresa']) !== '' ? trim($r['empresa']) : 'N/A';
                                                $emp_check = trim(strtoupper($r['empresa']));
                                                
                                                if($emp_check == 'TECHNIP') $corEmpresa = 'bg-purple-100 text-purple-700';
                                                if($emp_check == 'DOF') $corEmpresa = 'bg-orange-100 text-orange-700';
                                                if($emp_check == 'TECHNIP/DOF') $corEmpresa = 'bg-pink-100 text-pink-700';
                                                if($emp_check == 'CONSTELLATION') $corEmpresa = 'bg-blue-100 text-blue-700';
                                                else if($emp_check == 'ZONDA') $corEmpresa = 'bg-lime-100 text-lime-800';
                                            ?>
                                            <span class="<?php echo $corEmpresa; ?> px-2 py-0.5 rounded text-[8px] font-bold uppercase"><?php echo htmlspecialchars($empresa_texto); ?></span>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Paginação HTML -->
                    <?php if($total_paginas_rel > 1): ?>
                    <div class="p-4 border-t border-[var(--color-card-border)] flex justify-center items-center gap-2">
                        <?php if($pagina_atual > 1): ?>
                            <?php 
                            $q = $_GET; 
                            $q['pg'] = $pagina_atual - 1; 
                            $link = '?' . http_build_query($q); 
                            ?>
                            <a href="<?php echo $link; ?>" class="bg-[var(--color-card-bg)] hover:bg-slate-50 text-[var(--color-text)] border border-[var(--color-card-border)] px-3 py-1.5 rounded text-[10px] font-bold uppercase transition">← Anterior</a>
                        <?php endif; ?>
                        
                        <span class="text-[10px] text-[var(--color-text)] opacity-70 font-bold mx-2 uppercase">Pág <?php echo $pagina_atual; ?> de <?php echo $total_paginas_rel; ?></span>
                        
                        <?php if($pagina_atual < $total_paginas_rel): ?>
                            <?php 
                            $q = $_GET; 
                            $q['pg'] = $pagina_atual + 1; 
                            $link = '?' . http_build_query($q); 
                            ?>
                            <a href="<?php echo $link; ?>" class="bg-[var(--color-card-bg)] hover:bg-slate-50 text-[var(--color-text)] border border-[var(--color-card-border)] px-3 py-1.5 rounded text-[10px] font-bold uppercase transition">Próxima →</a>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>
                    
                </div>


                </div>
        </div>
        </div>

        <!-- ═══════════ ABA: COMUNICADOS ═══════════ -->
        <div id="aba-comunicados" class="aba-content hidden">
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div class="space-y-6">
                <!-- Criar/Editar Pop-up -->
                <form method="POST" id="formPopup" class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all p-6">
                    <div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
                        </div>
                        <div>
                            <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Gerenciar Pop-ups</h3>
                            <p class="text-[10px] text-slate-500 font-medium">Crie comunicados em tela cheia</p>
                        </div>
                    </div>
                    
                    <!-- Esses campos ficam aqui o tempo todo. O JS apenas alterna o "modo" -->
                    <input type="hidden" name="acao_popup" id="acao_popup" value="criar">
                    <input type="hidden" name="popup_id" id="popup_id" value="">
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs text-slate-600 uppercase tracking-widest font-bold mb-2">Título do Pop-up</label>
                            <input type="text" name="popup_titulo" id="popup_titulo" required placeholder="Ex: Aviso Importante!" class="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-3.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-semibold">
                        </div>

                        <div>
                            <label class="block text-xs text-slate-600 uppercase tracking-widest font-bold mb-2">Mensagem</label>
                            <textarea name="popup_mensagem" id="popup_mensagem" required rows="4" placeholder="O que você deseja comunicar?" class="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-3.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"></textarea>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs text-slate-600 uppercase tracking-widest font-bold mb-2">Tipo / Cor</label>
                                <select name="popup_tipo" id="popup_tipo" class="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-3.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer">
                                    <option value="aviso">Aviso (Azul)</option>
                                    <option value="feedback">Feedback (Verde)</option>
                                    <option value="urgente">Urgente (Vermelho)</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs text-slate-600 uppercase tracking-widest font-bold mb-2">Exibição</label>
                                <select name="popup_regra" id="sel_regra" onchange="document.getElementById('div_dias').style.display = this.value === 'dias' ? 'block' : 'none'" class="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-3.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer">
                                    <option value="sempre">Sempre que abrir</option>
                                    <option value="uma_vez">Apenas 1 vez por usuário</option>
                                    <option value="dias">Por quantidade de dias</option>
                                </select>
                            </div>
                        </div>

                        <div class="flex items-center gap-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 hover:bg-indigo-50 transition-colors cursor-pointer" onclick="document.getElementById('mostrar_feedback').click()">
                            <input type="checkbox" name="mostrar_feedback" id="mostrar_feedback" checked class="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 pointer-events-none">
                            <div>
                                <label class="text-xs font-black text-indigo-900 uppercase tracking-widest cursor-pointer pointer-events-none">Habilitar Feedback</label>
                                <p class="text-[10px] text-indigo-600/80 font-medium mt-0.5">Permite que o usuário deixe um comentário e avaliação</p>
                            </div>
                        </div>

                        <div id="div_dias" style="display: none;">
                            <label class="block text-xs text-slate-600 uppercase tracking-widest font-bold mb-2">Validade (dias)</label>
                            <input type="number" name="popup_dias" id="popup_dias" min="1" value="7" class="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-3.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                        </div>

                        <div class="flex gap-3 pt-2">
                            <button type="submit" id="btnSubmitPopup" class="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-0.5">
                                CADASTRAR POP-UP
                            </button>
                            <button type="button" id="btnCancelarEdit" onclick="cancelarEdicao()" style="display:none" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-4 px-6 rounded-xl uppercase tracking-widest text-xs transition-all shadow-sm">
                                CANCELAR
                            </button>
                        </div>
                    </div>
                </form>


                <script>
                    function editarPopup(id, titulo, mensagem, tipo, regra, dias, mostrar_feedback) {
                        // Trocar para modo edição
                        document.getElementById('acao_popup').value = 'editar';
                        document.getElementById('popup_id').value = id;
                        
                        // Preencher os campos
                        document.getElementById('popup_titulo').value = titulo;
                        document.getElementById('popup_mensagem').value = mensagem;
                        document.getElementById('popup_tipo').value = tipo;
                        document.getElementById('sel_regra').value = regra;
                        document.getElementById('popup_dias').value = dias;
                        document.getElementById('mostrar_feedback').checked = (mostrar_feedback == 1);
                        
                        document.getElementById('div_dias').style.display = (regra === 'dias') ? 'block' : 'none';
                        document.getElementById('btnSubmitPopup').innerText = "Salvar Alterações";
                        document.getElementById('btnSubmitPopup').classList.remove('bg-blue-600', 'hover:bg-blue-700');
                        document.getElementById('btnSubmitPopup').classList.add('bg-amber-500', 'hover:bg-amber-600');
                        document.getElementById('btnCancelarEdit').style.display = 'block';
                        
                        window.scrollTo({ top: document.getElementById('formPopup').offsetTop - 80, behavior: 'smooth' });
                    }
                    
                    function cancelarEdicao() {
                        document.getElementById('acao_popup').value = 'criar';
                        document.getElementById('popup_id').value = '';
                        document.getElementById('formPopup').reset();
                        document.getElementById('div_dias').style.display = 'none';
                        document.getElementById('btnSubmitPopup').innerText = "Criar Pop-up";
                        document.getElementById('btnSubmitPopup').classList.add('bg-blue-600', 'hover:bg-blue-700');
                        document.getElementById('btnSubmitPopup').classList.remove('bg-amber-500', 'hover:bg-amber-600');
                        document.getElementById('btnCancelarEdit').style.display = 'none';
                    }
                </script>


                </div>
                <div class="space-y-6">
                <!-- Lista de Pop-ups (Gerenciamento) -->
                <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                    <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                        <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Pop-ups Cadastrados</h3>
                        <span class="text-xs font-medium text-slate-400 border border-slate-200 bg-white px-2.5 py-1 rounded-lg">Recentes</span>
                    </div>
                    <div class="overflow-x-auto max-h-[300px] overflow-y-auto">
                        <table class="w-full text-left text-sm">
                            <tbody class="divide-y divide-slate-100">
                                <?php if(empty($todos_popups)): ?>
                                    <tr><td class="p-10 text-center text-slate-400 font-medium bg-slate-50/50">Nenhum pop-up criado ainda.</td></tr>
                                <?php else: ?>
                                    <?php foreach($todos_popups as $p): ?>
                                    <tr class="hover:bg-slate-50/70 transition-colors group">
                                        <td class="p-4">
                                            <div class="flex items-center justify-between mb-2">
                                                <span class="font-black text-slate-800 text-xs truncate max-w-[200px]"><?php echo htmlspecialchars($p['titulo']); ?></span>
                                                <?php if($p['ativa']): ?>
                                                    <span class="bg-emerald-50 border border-emerald-200 text-emerald-600 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm">ATIVO</span>
                                                <?php else: ?>
                                                    <span class="bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm">INATIVO</span>
                                                <?php endif; ?>
                                            </div>
                                            <div class="flex items-center justify-between mt-3">
                                                <div class="flex gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                                    <a href="?toggle_popup=<?php echo $p['id']; ?>" class="text-[9px] <?php echo $p['ativa'] ? 'bg-white border border-amber-200 text-amber-600 hover:bg-amber-50' : 'bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50'; ?> px-3 py-1.5 rounded-lg font-black uppercase tracking-widest shadow-sm transition-all">
                                                        <?php echo $p['ativa'] ? 'DESATIVAR' : 'ATIVAR'; ?>
                                                    </a>
                                                    <button type="button" onclick='editarPopup(<?php echo $p['id']; ?>, <?php echo json_encode($p['titulo']); ?>, <?php echo json_encode($p['mensagem']); ?>, <?php echo json_encode($p['tipo']); ?>, <?php echo json_encode($p['regra_exibicao']); ?>, <?php echo (int)$p['validade_dias']; ?>, <?php echo (int)$p['mostrar_feedback']; ?>)' class="text-[9px] bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-black uppercase tracking-widest shadow-sm transition-all">EDITAR</button>
                                                    <a href="?del_popup=<?php echo $p['id']; ?>" onclick="return confirm('Excluir este pop-up?')" class="text-[9px] bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg font-black uppercase tracking-widest shadow-sm transition-all">EXCLUIR</a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Detalhes de Ciência e Avaliação -->
                <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                    <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50/50 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                        </div>
                        <div>
                            <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Relatório de Avaliações</h3>
                            <p class="text-[10px] text-slate-500 font-medium">Feedbacks e interações dos usuários</p>
                        </div>
                    </div>
                    <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="p-4 font-bold">Data/Hora</th>
                                    <th class="p-4 font-bold">Usuário</th>
                                    <th class="p-4 font-bold">Pop-up</th>
                                    <th class="p-4 font-bold text-center">Nota</th>
                                    <th class="p-4 font-bold">Feedback</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <?php if(empty($interacoes)): ?>
                                    <tr><td colspan="5" class="p-10 text-center text-slate-400 font-medium bg-slate-50/50">Nenhuma avaliação recebida.</td></tr>
                                <?php else: ?>
                                    <?php foreach($interacoes as $i): ?>
                                    <tr class="hover:bg-slate-50/80 transition-colors group">
                                        <td class="p-4 text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                                            <div class="flex flex-col">
                                                <span class="text-slate-700"><?php echo date('d/m/Y', strtotime($i['data_interacao'])); ?></span>
                                                <span class="opacity-60"><?php echo date('H:i', strtotime($i['data_interacao'])); ?></span>
                                            </div>
                                        </td>
                                        <td class="p-4">
                                            <a href="?f_usuario=<?php echo $i['usuario_id']; ?>" class="flex items-center gap-2">
                                                <div class="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[10px] shadow-sm">
                                                    <?php echo substr(htmlspecialchars($i['nome'] ?: $i['username']), 0, 1); ?>
                                                </div>
                                                <div class="flex flex-col">
                                                    <span class="font-bold text-slate-800 text-xs group-hover:text-blue-600 transition-colors"><?php echo htmlspecialchars($i['nome'] ?: $i['username']); ?></span>
                                                    <span class="text-[9px] text-slate-400 font-semibold uppercase">@<?php echo htmlspecialchars($i['username']); ?></span>
                                                </div>
                                            </a>
                                        </td>
                                        <td class="p-4">
                                            <span class="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider border border-slate-200 truncate max-w-[150px]" title="<?php echo htmlspecialchars($i['pop_titulo']); ?>">
                                                <?php echo htmlspecialchars($i['pop_titulo']); ?>
                                            </span>
                                        </td>
                                        <td class="p-4 text-center">
                                            <?php 
                                                $nota = $i['feedback_nota'];
                                                if ($nota === null || $nota == 0) {
                                                    echo '<span class="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-400 text-[9px] font-bold uppercase tracking-widest"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> Visto</span>';
                                                } else {
                                                    $cor_bg = 'bg-slate-100 text-slate-400';
                                                    if($nota == 1) $cor_bg = 'bg-rose-100 text-rose-600';
                                                    elseif($nota <= 3) $cor_bg = 'bg-amber-100 text-amber-600';
                                                    elseif($nota == 4) $cor_bg = 'bg-blue-100 text-blue-600';
                                                    elseif($nota == 5) $cor_bg = 'bg-emerald-100 text-emerald-600';
                                                    
                                                    echo '<div class="inline-flex flex-col items-center justify-center py-1 px-2 rounded-lg ' . $cor_bg . ' min-w-[50px] shadow-sm">';
                                                    echo '<span class="text-sm font-black leading-none flex items-center gap-0.5">' . $nota . '<svg class="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg></span>';
                                                    echo '</div>';
                                                }
                                            ?>
                                        </td>
                                        <td class="p-4">
                                            <?php if(!empty($i['feedback_texto'])): ?>
                                                <div class="relative group/tooltip">
                                                    <div class="text-[11px] text-slate-700 font-medium bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm relative z-0 italic">
                                                        <span class="text-slate-300 text-xl font-serif leading-none absolute -top-1 -left-1">"</span>
                                                        <span class="relative z-10 ml-2"><?php echo htmlspecialchars($i['feedback_texto']); ?></span>
                                                    </div>
                                                </div>
                                            <?php else: ?>
                                                <span class="text-[10px] text-slate-400 font-medium italic">Sem comentário</span>
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>


                        </div>
                    </div>
                </div>

        <!-- ═══════════ ABA: MENSAGENS IN-APP ═══════════ -->
        <div id="aba-mensagens" class="aba-content hidden">
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div class="space-y-6">
                    <!-- Disparar Nova Mensagem -->
                    <form method="POST" class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all p-6">
                        <div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Disparar Mensagem</h3>
                                <p class="text-[10px] text-slate-500 font-medium">Envie avisos in-app para a equipe</p>
                            </div>
                        </div>
                        <input type="hidden" name="acao_enviar_mensagem" value="1">
                        
                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Título da Mensagem</label>
                                <input type="text" name="msg_titulo" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm" placeholder="Ex: Relatório Pendente!">
                            </div>

                            <div>
                                <label class="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Mensagem</label>
                                <textarea name="msg_texto" required rows="3" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm" placeholder="Digite o alerta aqui..."></textarea>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Tipo / Cor</label>
                                    <select name="msg_tipo" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer">
                                        <option value="info">Info (Azul)</option>
                                        <option value="aviso">Aviso (Amarelo)</option>
                                        <option value="urgente">Urgente (Vermelho)</option>
                                        <option value="sucesso">Sucesso (Verde)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Destinatário</label>
                                    <select name="msg_destinatario" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer">
                                        <option value="">Todos os Usuários</option>
                                        <?php foreach($usuarios_lista as $ul): ?>
                                            <option value="<?php echo $ul['id']; ?>"><?php echo htmlspecialchars($ul['nome'] ?: $ul['username']); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Agendamento</label>
                                    <select name="msg_frequencia" id="msg_frequencia" onchange="document.getElementById('div_data_hora').style.display = this.value === 'imediato' ? 'none' : 'block'; document.getElementById('btn_submit_msg').innerHTML = this.value === 'imediato' ? '🚀 Enviar Mensagem Agora' : '⏳ Agendar Mensagem';" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer">
                                        <option value="imediato">Imediato (Agora)</option>
                                        <option value="unica">Programado (Uma Vez)</option>
                                        <option value="diaria">Recorrente (Diário)</option>
                                        <option value="semanal">Recorrente (Semanal)</option>
                                        <option value="mensal">Recorrente (Mensal)</option>
                                    </select>
                                </div>
                                <div id="div_data_hora" style="display: none;">
                                    <label class="block text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Data e Hora (1º Disparo)</label>
                                    <input type="datetime-local" name="msg_data_hora" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm">
                                </div>
                            </div>

                            <button type="submit" id="btn_submit_msg" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2 mt-4 transform hover:-translate-y-0.5">
                                🚀 Enviar Mensagem Agora
                            </button>
                        </div>
                    </form>
                </div>
                
                <div class="space-y-6">
                    <!-- Mensagens Agendadas -->
                    <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                        <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50/50 flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Mensagens Agendadas</h3>
                                <p class="text-[10px] text-slate-500 font-medium">Programações de envio automáticas</p>
                            </div>
                        </div>
                        <div class="overflow-x-auto max-h-[300px] overflow-y-auto p-4">
                            <div class="space-y-3">
                                <?php if(empty($mensagens_agendadas)): ?>
                                    <div class="p-6 text-center text-slate-400 font-medium bg-slate-50/50 rounded-xl border border-slate-100">Nenhuma mensagem agendada no momento.</div>
                                <?php else: ?>
                                    <?php foreach($mensagens_agendadas as $a): ?>
                                    <div class="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md transition-shadow group relative overflow-hidden">
                                        <div class="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                        <div class="flex items-start justify-between gap-4">
                                            <div class="flex-1">
                                                <div class="flex items-center gap-2 mb-1">
                                                    <h4 class="font-black text-slate-800 text-xs truncate"><?php echo htmlspecialchars($a['titulo']); ?></h4>
                                                    <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border border-slate-200">Freq: <?php echo $a['frequencia']; ?></span>
                                                </div>
                                                <p class="text-[11px] text-slate-500 mb-3 line-clamp-2"><?php echo htmlspecialchars($a['mensagem']); ?></p>
                                                <div class="flex items-center gap-2 bg-amber-50/50 px-2.5 py-1.5 rounded-lg border border-amber-100/50 inline-flex">
                                                    <svg class="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                    <span class="text-[10px] text-slate-600 font-bold uppercase">Próximo disparo: <strong class="text-amber-600 ml-1"><?php echo date('d/m H:i', strtotime($a['data_hora_proxima'])); ?></strong></span>
                                                </div>
                                            </div>
                                            <a href="?del_agendada=<?php echo $a['id']; ?>" onclick="return confirm('Deseja cancelar este agendamento?')" class="bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-rose-100" title="Cancelar Agendamento">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                            </a>
                                        </div>
                                    </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>

                    <!-- Histórico de Mensagens -->
                    <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                        <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100/50 flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-lg shadow-slate-500/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Histórico Recente</h3>
                                <p class="text-[10px] text-slate-500 font-medium">Últimas mensagens enviadas</p>
                            </div>
                        </div>
                        <div class="overflow-x-auto max-h-[400px] overflow-y-auto p-4">
                            <div class="space-y-3">
                                <?php if(empty($historico_mensagens)): ?>
                                    <div class="p-6 text-center text-slate-400 font-medium bg-slate-50/50 rounded-xl border border-slate-100">Nenhuma mensagem enviada ainda.</div>
                                <?php else: ?>
                                    <?php foreach($historico_mensagens as $m): ?>
                                    <div class="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md transition-shadow group relative overflow-hidden">
                                        <?php 
                                            $tipo_cor_bg = 'bg-blue-400';
                                            $tipo_badge = 'bg-blue-50 text-blue-600 border-blue-200';
                                            if($m['tipo'] == 'aviso') { $tipo_cor_bg = 'bg-amber-400'; $tipo_badge = 'bg-amber-50 text-amber-600 border-amber-200'; }
                                            if($m['tipo'] == 'urgente') { $tipo_cor_bg = 'bg-rose-400'; $tipo_badge = 'bg-rose-50 text-rose-600 border-rose-200'; }
                                            if($m['tipo'] == 'sucesso') { $tipo_cor_bg = 'bg-emerald-400'; $tipo_badge = 'bg-emerald-50 text-emerald-600 border-emerald-200'; }
                                        ?>
                                        <div class="absolute top-0 left-0 w-1 h-full <?php echo $tipo_cor_bg; ?>"></div>
                                        
                                        <div class="flex items-start justify-between gap-4">
                                            <div class="flex-1">
                                                <div class="flex items-center gap-2 mb-1">
                                                    <h4 class="font-black text-slate-800 text-xs truncate max-w-[200px]"><?php echo htmlspecialchars($m['titulo']); ?></h4>
                                                    <span class="<?php echo $tipo_badge; ?> px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border"><?php echo $m['tipo']; ?></span>
                                                </div>
                                                <p class="text-[11px] text-slate-600 mb-3 leading-relaxed"><?php echo htmlspecialchars($m['mensagem']); ?></p>
                                                
                                                <div class="flex items-center gap-3">
                                                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md border border-slate-100">Para: <?php echo empty($m['destinatario_id']) ? 'Todos' : htmlspecialchars($m['dest_nome'] ?: $m['username']); ?></span>
                                                    <span class="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                                        <?php echo date('d/m H:i', strtotime($m['data_envio'])); ?>
                                                    </span>
                                                </div>
                                            </div>
                                            <a href="?del_mensagem=<?php echo $m['id']; ?>" onclick="return confirm('Deseja excluir esta mensagem? Ela sumirá para todos que ainda não a apagaram.')" class="bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-rose-100" title="Excluir Mensagem">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </a>
                                        </div>
                                    </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══════════ ABA: SEGURANÇA ═══════════ -->
        <div id="aba-seguranca" class="aba-content hidden">
            <div class="w-full space-y-6">

                <!-- Últimos Logins (Auditoria) -->
                <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                    <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Auditoria de Logins</h3>
                                <p class="text-[10px] text-slate-500 font-medium">Histórico de acessos bem-sucedidos</p>
                            </div>
                        </div>
                    </div>
                    <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="table-header text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 bg-white">
                                <tr>
                                    <th class="p-3">Usuário</th>
                                    <th class="p-3">Acesso (Data e IP)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <?php if(empty($ultimos_logins)): ?>
                                    <tr><td colspan="2" class="p-6 text-center text-slate-400">Nenhum login registrado.</td></tr>
                                <?php else: ?>
                                    <?php foreach($ultimos_logins as $lg): ?>
                                    <tr class="hover:bg-slate-50 transition-colors">
                                        <td class="p-3 font-bold text-slate-800 text-xs"><?php echo htmlspecialchars($lg['username']); ?></td>
                                        <td class="p-3">
                                            <div class="text-slate-700 font-bold text-[10px] mb-1"><?php echo date('d/m/Y H:i', strtotime($lg['data_login'])); ?></div>
                                            <?php
                                                $ip_str = $lg['ip'];
                                                $ip_short = strlen($ip_str) > 18 ? substr($ip_str, 0, 8) . '...' . substr($ip_str, -4) : $ip_str;
                                            ?>
                                            <div class="text-slate-500 text-[11px] font-mono cursor-pointer hover:text-blue-600 flex items-center gap-1 transition-colors" onclick="alert('IP Completo: <?php echo htmlspecialchars($ip_str); ?>')" title="Ver IP Completo">
                                                🌐 <?php echo htmlspecialchars($ip_short); ?>
                                            </div>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- ACESSOS FALHOS NO PAINEL -->
                <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                    <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-rose-50 to-red-50/50 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Acessos Falhos ao Painel</h3>
                                <p class="text-[10px] text-slate-500 font-medium">Histórico de tentativas incorretas de login</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="bg-rose-100 text-rose-600 text-[10px] font-black px-3 py-1.5 rounded-lg border border-rose-200 shadow-sm"><?php echo $total_falhas; ?> TOTAL</span>
                            <?php if($total_falhas > 0): ?>
                                <a href="?limpar_falhas=1" onclick="return confirm('Limpar todo o histórico de acessos falhos?')" class="bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-200 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all shadow-sm">LIMPAR</a>
                            <?php endif; ?>
                        </div>
                    </div>
                    <div class="overflow-x-auto max-h-[800px] overflow-y-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="p-4 font-bold">Usuário</th>
                                    <th class="p-4 font-bold">IP</th>
                                    <th class="p-4 font-bold">Data/Hora</th>
                                    <th class="p-4 font-bold">Navegador</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <?php if(empty($acessos_falhos)): ?>
                                    <tr><td colspan="4" class="p-10 text-center text-slate-400 font-medium bg-slate-50/50">✅ Nenhuma tentativa de acesso falha registrada.</td></tr>
                                <?php else: ?>
                                    <?php foreach($acessos_falhos as $af): ?>
                                    <tr class="hover:bg-rose-50/30 transition-colors group">
                                        <td class="p-4">
                                            <div class="inline-flex items-center gap-2">
                                                <div class="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-[9px] shadow-sm uppercase">
                                                    <?php echo substr(htmlspecialchars($af['username'] ?: '?'), 0, 1); ?>
                                                </div>
                                                <span class="font-black text-rose-600 text-xs"><?php echo htmlspecialchars($af['username'] ?: 'desconhecido'); ?></span>
                                            </div>
                                        </td>
                                        <td class="p-4">
                                            <span class="bg-slate-100 text-slate-600 font-mono text-[10px] px-2.5 py-1 rounded-md border border-slate-200/60 font-bold"><?php echo htmlspecialchars($af['ip']); ?></span>
                                        </td>
                                        <td class="p-4 text-slate-500 text-[10px] font-semibold">
                                            <?php echo date('d/m/Y', strtotime($af['data_tentativa'])); ?> 
                                            <span class="opacity-60 ml-1"><?php echo date('H:i:s', strtotime($af['data_tentativa'])); ?></span>
                                        </td>
                                        <td class="p-4">
                                            <div class="text-slate-500 text-[10px] font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100/60 max-w-[350px] break-words whitespace-normal leading-relaxed text-left">
                                                <?php echo htmlspecialchars($af['user_agent']); ?>
                                            </div>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Gerenciamento de Usuários -->
                <div class="col-span-1 xl:col-span-2 space-y-6 mt-6">
                    <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                        <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50/50 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                                </div>
                                <div>
                                    <h3 class="font-black text-sm uppercase tracking-widest text-blue-800">Usuários Cadastrados</h3>
                                    <p class="text-[10px] text-blue-600 font-medium">Gerencie permissões de acesso ao painel admin</p>
                                </div>
                            </div>
                        </div>
                        <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
                            <?php
                            try {
                                $stmtUsuarios = $pdo->query("SELECT id, username, nome, email, nivel_autoridade FROM usuarios ORDER BY username ASC");
                                $lista_usuarios = $stmtUsuarios->fetchAll(PDO::FETCH_ASSOC);
                            } catch(Exception $e) {
                                $lista_usuarios = [];
                            }
                            ?>
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th class="p-4 font-bold">Usuário</th>
                                        <th class="p-4 font-bold">Email</th>
                                        <th class="p-4 font-bold text-center">Nível Atual</th>
                                        <th class="p-4 font-bold text-center">Ação</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    <?php if(empty($lista_usuarios)): ?>
                                        <tr><td colspan="4" class="p-10 text-center text-slate-400 font-medium bg-slate-50/50">Nenhum usuário encontrado.</td></tr>
                                    <?php else: ?>
                                        <?php foreach($lista_usuarios as $usu): ?>
                                        <tr class="hover:bg-slate-50 transition-colors group">
                                            <td class="p-4">
                                                <div class="font-black text-slate-800 text-xs"><?php echo htmlspecialchars($usu['username']); ?></div>
                                                <div class="text-[10px] text-slate-500"><?php echo htmlspecialchars($usu['nome'] ?? '-'); ?></div>
                                            </td>
                                            <td class="p-4 text-xs text-slate-600">
                                                <?php echo htmlspecialchars($usu['email'] ?? '-'); ?>
                                            </td>
                                            <td class="p-4 text-center">
                                                <?php if($usu['nivel_autoridade'] == 2): ?>
                                                    <span class="bg-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-md border border-blue-200 uppercase">Admin</span>
                                                <?php else: ?>
                                                    <span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-md border border-slate-200 uppercase">Padrão</span>
                                                <?php endif; ?>
                                            </td>
                                            <td class="p-4 text-center">
                                                <?php if($usu['id'] !== $_SESSION['usuario_id']): ?>
                                                    <form method="POST" class="inline-block" onsubmit="return confirm('Confirmar alteração de permissão para este usuário?');">
                                                        <input type="hidden" name="acao_mudar_perfil" value="1">
                                                        <input type="hidden" name="usuario_id" value="<?php echo $usu['id']; ?>">
                                                        <?php if($usu['nivel_autoridade'] == 2): ?>
                                                            <input type="hidden" name="nivel" value="1">
                                                            <button type="submit" class="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-md transition-colors uppercase">Remover Admin</button>
                                                        <?php else: ?>
                                                            <input type="hidden" name="nivel" value="2">
                                                            <button type="submit" class="bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-md transition-colors uppercase shadow-sm">Tornar Admin</button>
                                                        <?php endif; ?>
                                                    </form>
                                                <?php else: ?>
                                                    <span class="text-[10px] text-slate-400 font-medium italic">Você</span>
                                                <?php endif; ?>
                                            </td>
                                        </tr>
                                        <?php endforeach; ?>
                                    <?php endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Acessos ao Gerador (Identificação por IP/Preposto) -->
                <div class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all mt-6">
                    <div class="p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50/50 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-indigo-800">Usuários Cadastrados e Acessos ao Gerador</h3>
                                <p class="text-[10px] text-indigo-600 font-medium">Controle e bloqueio de quem acessa o gerador de relatórios</p>
                            </div>
                        </div>
                    </div>
                    <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <?php
                        try {
                            $stmtAcessos = $pdo->query("
                                SELECT a.ip, a.ultimo_acesso, a.ultimo_preposto, a.total_acessos, a.localizacao,
                                       (SELECT COUNT(*) FROM ips_bloqueados b WHERE b.ip = a.ip) as is_bloqueado
                                FROM mms_acessos_gerador a
                                ORDER BY a.ultimo_acesso DESC
                            ");
                            $lista_acessos = $stmtAcessos->fetchAll(PDO::FETCH_ASSOC);
                        } catch(Exception $e) {
                            $lista_acessos = [];
                        }
                        ?>
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] uppercase tracking-widest sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th class="p-4 font-bold">Usuário / Preposto</th>
                                    <th class="p-4 font-bold">IP e Localização</th>
                                    <th class="p-4 font-bold text-center">Último Acesso</th>
                                    <th class="p-4 font-bold text-center">Status / Ação</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <?php if(empty($lista_acessos)): ?>
                                    <tr><td colspan="4" class="p-10 text-center text-slate-400 font-medium bg-slate-50/50">Nenhum acesso registrado ainda.</td></tr>
                                <?php else: ?>
                                    <?php foreach($lista_acessos as $ac): ?>
                                    <tr class="hover:bg-slate-50 transition-colors group">
                                        <td class="p-4">
                                            <div class="font-black text-slate-800 text-xs uppercase"><?php echo htmlspecialchars(!empty($ac['ultimo_preposto']) ? $ac['ultimo_preposto'] : 'Apenas Acessou (Nenhum Relatório)'); ?></div>
                                            <div class="text-[10px] text-slate-500">Total de Acessos: <?php echo $ac['total_acessos']; ?></div>
                                        </td>
                                        <td class="p-4 text-xs font-mono text-slate-600 font-bold">
                                            <?php echo htmlspecialchars($ac['ip']); ?>
                                            <div class="text-[9px] text-slate-400 font-sans mt-0.5 whitespace-nowrap tracking-wide">📍 <?php echo htmlspecialchars($ac['localizacao'] ?? 'Desconhecida'); ?></div>
                                        </td>
                                        <td class="p-4 text-center text-xs text-slate-500">
                                            <?php echo date('d/m/Y H:i', strtotime($ac['ultimo_acesso'])); ?>
                                        </td>
                                        <td class="p-4 text-center">
                                            <form method="POST" class="inline-block" onsubmit="return confirm('Confirma a ação para este IP?');">
                                                <input type="hidden" name="acao_bloquear_ip" value="1">
                                                <input type="hidden" name="ip_alvo" value="<?php echo htmlspecialchars($ac['ip']); ?>">
                                                
                                                <?php if($ac['is_bloqueado']): ?>
                                                    <input type="hidden" name="bloquear" value="0">
                                                    <button type="submit" class="bg-red-100 hover:bg-red-200 text-red-600 text-[10px] font-bold px-3 py-1.5 rounded-md transition-colors uppercase shadow-sm flex items-center gap-1 mx-auto">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                                        Bloqueado (Desbloquear)
                                                    </button>
                                                <?php else: ?>
                                                    <input type="hidden" name="bloquear" value="1">
                                                    <button type="submit" class="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-md transition-colors uppercase flex items-center gap-1 mx-auto">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
                                                        Bloquear Acesso
                                                    </button>
                                                <?php endif; ?>
                                            </form>
                                        </td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>

        <!-- ═══════════ ABA: SISTEMA ═══════════ -->
        <div id="aba-sistema" class="aba-content hidden">
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div class="space-y-6">
                <!-- Configuração de Retenção -->
                <form method="POST" class="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all p-6">
                    <div class="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-900/20 text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        </div>
                        <div>
                            <h3 class="font-black text-sm uppercase tracking-widest text-slate-800">Configurações do Sistema</h3>
                            <p class="text-[10px] text-slate-500 font-medium">Parâmetros globais de funcionamento</p>
                        </div>
                    </div>
                    
                    <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p class="text-slate-600 text-xs mb-4 font-medium leading-relaxed">Defina o tempo máximo que fotos anexadas aos relatórios devem ser mantidas no servidor antes de serem excluídas automaticamente para poupar espaço.</p>
                        <div class="flex items-center gap-4">
                            <div class="flex items-stretch shadow-sm rounded-lg overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                                <input type="number" name="meses_retencao" min="1" max="24" value="<?php echo $config_atual; ?>" class="bg-white pl-4 py-2.5 text-sm font-black text-slate-800 w-20 outline-none border-none">
                                <span class="bg-slate-100 px-4 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest border-l border-slate-200 flex items-center justify-center">Meses</span>
                            </div>
                            <button type="submit" class="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-md hover:shadow-slate-900/20">SALVAR</button>
                        </div>
                    </div>
                </form>
                </div>
                
                <div class="space-y-6">
                <!-- Limpar Cache dos PDFs -->
                <div class="bg-white rounded-2xl border border-amber-200/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden transition-all">
                    <div class="p-5 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50/50 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </div>
                            <div>
                                <h3 class="font-black text-sm uppercase tracking-widest text-amber-800">Cache dos PDFs</h3>
                                <p class="text-[10px] text-amber-600 font-medium">Força a regeneração de todos os PDFs gerados</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-5">
                        <div class="bg-amber-50 border border-amber-200/80 rounded-xl p-4 mb-5 flex gap-3 items-start shadow-inner">
                            <svg class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <p class="text-[11px] text-amber-800 leading-relaxed font-medium">
                                Use esta opção <b>apenas após alterar o layout do relatório</b>. Todos os PDFs já gerados em cache serão descartados, e o servidor irá regerá-los do zero no próximo download. Esta ação é irreversível.
                            </p>
                        </div>
                        <form method="POST" id="form-limpar-cache" onsubmit="return confirmarLimpezaCache(event)">
                            <input type="hidden" name="acao_limpar_cache_pdf" value="1">
                            <input type="hidden" name="csrf_token_cache" value="<?php echo htmlspecialchars($csrfTokenCache); ?>">
                            <button type="submit"
                                class="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg hover:shadow-orange-500/30 flex items-center justify-center gap-2 transform hover:-translate-y-0.5">
                                Limpar Cache dos PDFs
                            </button>
                        </form>
                    </div>
                </div>
                </div>



            </div>
        </div>


        <!-- ═══════════ ABA: VERSION ═══════════ -->
        <div id="aba-version" class="aba-content hidden">
            <div class="w-full">
                <div class="card p-6">
                    <h3 class="font-black text-sm uppercase tracking-widest text-[var(--color-text)] mb-4">🏷️ Controle de Versões</h3>
                    <p class="text-xs text-slate-500 mb-6">Registre e controle as atualizações do sistema manualmente.</p>
                    
                    <form method="POST" class="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
                        <input type="hidden" name="save_version" value="1">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div class="md:col-span-1">
                                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Versão (Ex: V1.2.3)</label>
                                <input type="text" name="versao_numero" required placeholder="V1.0.0" class="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/50 uppercase font-black">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Descrição / Notas de Atualização</label>
                                <input type="text" name="versao_descricao" placeholder="Correções de layout..." class="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/50">
                            </div>
                            <div class="md:col-span-1">
                                <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2 rounded-lg uppercase tracking-wider transition-all shadow-md">Salvar Versão</button>
                            </div>
                        </div>
                    </form>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-100">
                                <tr>
                                    <th class="p-3">Data</th>
                                    <th class="p-3">Versão</th>
                                    <th class="p-3">Descrição</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <?php
                                $versoes = [];
                                try {
                                    $stmtV = $pdo->query("SELECT * FROM mms_versao_app ORDER BY id DESC LIMIT 50");
                                    $versoes = $stmtV->fetchAll(PDO::FETCH_ASSOC);
                                } catch(\Throwable $e) {}
                                ?>
                                <?php if(empty($versoes)): ?>
                                    <tr><td colspan="3" class="p-6 text-center text-slate-400">Nenhuma versão registrada.</td></tr>
                                <?php else: ?>
                                    <?php foreach($versoes as $v): ?>
                                    <tr class="hover:bg-slate-50/50 transition-colors">
                                        <td class="p-3 text-xs text-slate-500"><?php echo date('d/m/Y H:i', strtotime($v['data_criacao'])); ?></td>
                                        <td class="p-3 font-black text-blue-700 text-xs"><?php echo htmlspecialchars($v['versao']); ?></td>
                                        <td class="p-3 text-xs text-slate-600"><?php echo htmlspecialchars($v['descricao']); ?></td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>


    </div><!-- /main container -->

    <script>
        // ── SISTEMA DE ABAS ──
        const ABAS = ['relatorios', 'ranking', 'comunicados', 'mensagens', 'seguranca', 'sistema', 'version'];

        function mudarAba(aba) {
            sessionStorage.setItem('coord_aba', aba);

            ABAS.forEach(a => {
                const conteudo = document.getElementById('aba-' + a);
                const btn      = document.getElementById('tab-' + a);
                if (!conteudo || !btn) return;
                if (a === aba) {
                    conteudo.classList.remove('hidden');
                    btn.classList.add('active-tab');
                } else {
                    conteudo.classList.add('hidden');
                    btn.classList.remove('active-tab');
                }
            });
        }

        // Restaura última aba ao carregar
        window.addEventListener('DOMContentLoaded', () => {
            const saved = sessionStorage.getItem('coord_aba') || 'relatorios';
            mudarAba(saved);
        });

        function confirmarLimpezaCache(e) {
            e.preventDefault();
            if (!confirm('⚠️ Limpar o cache de PDFs?\n\nTodos os PDFs armazenados serão invalidados e regenerados no próximo download.\n\nClique em OK para continuar.')) {
                return false;
            }
            const confirmacao = prompt('Para confirmar, digite LIMPAR no campo abaixo:');
            if (confirmacao === null || confirmacao.trim().toUpperCase() !== 'LIMPAR') {
                alert('Ação cancelada. A confirmação não corresponde.');
                return false;
            }
            document.getElementById('form-limpar-cache').submit();
        }

        function compartilharRelatorio(id) {
            const urlDownload = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/') + '/download_pdf?id=' + id;
            if (navigator.share) {
                navigator.share({
                    title: 'Relatório MMS #' + id,
                    text: 'Segue o link para visualizar o relatório da MMS.',
                    url: urlDownload
                }).catch(console.error);
            } else {
                const msg = encodeURIComponent('Segue o link para visualizar o relatório da MMS: ' + urlDownload);
                window.open('https://api.whatsapp.com/send?text=' + msg, '_blank');
            }
        }

        // ── GEOLOCALIZAÇÃO DE IPs ──
        document.addEventListener("DOMContentLoaded", function() {
            const geoSpans = document.querySelectorAll('.ip-geo');
            if (geoSpans.length > 0) {
                const uniqueIps = [...new Set(Array.from(geoSpans).map(s => s.getAttribute('data-ip')))];
                uniqueIps.forEach(ip => {
                    if (ip && ip !== 'N/A' && ip !== 'Desconhecido') {
                        fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`)
                            .then(response => response.json())
                            .then(data => {
                                if(data && data.city) {
                                    const region = data.region ? ` - ${data.region}` : '';
                                    const locationStr = `(${data.city}${region})`;
                                    document.querySelectorAll(`.ip-geo[data-ip="${ip}"] .loc-texto`).forEach(el => {
                                        el.innerHTML = locationStr;
                                    });
                                }
                            })
                            .catch(err => console.error('Erro ao buscar geo para IP: ' + ip, err));
                    }
                });
            }
        });
    </script>

</body>
</html>
