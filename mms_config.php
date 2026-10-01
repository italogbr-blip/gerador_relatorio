<?php
/**
 * Configuração de Conexão MMS
 *
 * As credenciais ficam em um arquivo .mms_env FORA do public_html.
 * Estrutura esperada na Hostinger:
 *   /home/u596152436/domains/mmssuportelogistica.com.br/.mms_env
 *   /home/u596152436/domains/mmssuportelogistica.com.br/public_html/mms_config.php
 *
 * Ou seja: o .mms_env fica UM NÍVEL acima do public_html.
 *
 * Permissão recomendada do .mms_env: 600 (somente o dono lê).
 */

// -----------------------------------------------------------------------------
// 1) Localiza e lê o .mms_env
// -----------------------------------------------------------------------------
$envCandidates = [
    dirname(__DIR__, 6) . '/.mms_env',
    dirname(__DIR__, 5) . '/.mms_env',
    dirname(__DIR__, 4) . '/.mms_env',
    dirname(__DIR__, 3) . '/.mms_env',
    dirname(__DIR__, 2) . '/.mms_env',
    dirname(__DIR__) . '/.mms_env',
    __DIR__ . '/.mms_env',
];

$envVars = [];

foreach ($envCandidates as $envFile) {
    if (is_file($envFile) && is_readable($envFile)) {
        $linhas = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($linhas as $linha) {
            $linha = trim($linha);
            // Pula linhas em branco e comentários
            if ($linha === '' || $linha[0] === '#') { continue; }
            // Pula linhas sem '='
            if (strpos($linha, '=') === false) { continue; }
            // Quebra em chave/valor
            [$chave, $valor] = explode('=', $linha, 2);
            $chave = trim($chave);
            // Remove espaços e aspas em volta do valor
            $valor = trim($valor, " \t\n\r\0\x0B\"'");
            if ($chave !== '') {
                $envVars[$chave] = $valor;
            }
        }
        break; // achou um .env válido, para de procurar
    }
}

// -----------------------------------------------------------------------------
// 2) Lê as credenciais do array (sem depender de getenv/putenv)
// -----------------------------------------------------------------------------
$host     = $envVars['DB_HOST'] ?? 'localhost';
$dbname   = $envVars['DB_NAME'] ?? '';
$username = $envVars['DB_USER'] ?? '';
$password = $envVars['DB_PASS'] ?? null;

if ($dbname === '' || $username === '' || $password === null || $password === '') {
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    error_log(date('[d/m/Y H:i:s] ') . "Erro: variáveis do banco não encontradas no .mms_env.\n", 3, $caminhoLog);
    die("Erro interno de configuração. Contate o administrador.");
}

date_default_timezone_set('America/Sao_Paulo');

// -----------------------------------------------------------------------------
// 3) Conexão PDO endurecida
// -----------------------------------------------------------------------------
try {
    $dsn = "mysql:host={$host};dbname={$dbname};charset=utf8mb4";

    $opcoes = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
        PDO::ATTR_PERSISTENT         => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
    ];

    $pdo = new PDO($dsn, $username, $password, $opcoes);

} catch (PDOException $e) {
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    $mensagem = date('[d/m/Y H:i:s] ') . "Erro Conexão: " . $e->getMessage() . "\n";
    error_log($mensagem, 3, $caminhoLog);

    die("Erro interno de conexão. Tente novamente mais tarde.");
}

// -----------------------------------------------------------------------------
// 4) Update Online Status (Todos os visitantes)
// -----------------------------------------------------------------------------
try {
    $visitante_ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $visitante_ip = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
    }
    $visitante_ip = trim($visitante_ip);
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS visitantes_online (ip VARCHAR(45) PRIMARY KEY, ultima_atividade TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
    $stmt_ping = $pdo->prepare("INSERT INTO visitantes_online (ip, ultima_atividade) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE ultima_atividade = NOW()");
    $stmt_ping->execute([$visitante_ip]);
} catch(Exception $e) {}

// -----------------------------------------------------------------------------
// 5) Persistência de Login (Lembrar-me) - Ideal para WebApps (PWA)
// -----------------------------------------------------------------------------
try {
    // Adiciona coluna de token silenciosamente caso não exista
    $pdo->exec("ALTER TABLE usuarios ADD COLUMN remember_token VARCHAR(255) NULL DEFAULT NULL");
    
    // Configura as tabelas de notificações In-App caso não existam
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS mms_mensagens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(255) NOT NULL,
            mensagem TEXT NOT NULL,
            tipo VARCHAR(50) DEFAULT 'info',
            data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
            autor_id INT NOT NULL,
            destinatario_id INT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
    
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS mms_mensagens_lidas (
            mensagem_id INT NOT NULL,
            usuario_id INT NOT NULL,
            data_leitura DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (mensagem_id, usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
} catch(Exception $e) {}

if (!isset($_SESSION['usuario_id']) && isset($_COOKIE['mms_remember_token'])) {
    $token = $_COOKIE['mms_remember_token'];
    try {
        $stmt_auto = $pdo->prepare("SELECT id, username, nome, nivel_autoridade FROM usuarios WHERE remember_token = ?");
        $stmt_auto->execute([$token]);
        $userAuto = $stmt_auto->fetch();
        if ($userAuto) {
            $_SESSION['usuario_id'] = $userAuto['id'];
            $_SESSION['username'] = $userAuto['username'];
            $_SESSION['nome'] = $userAuto['nome'] ?? $userAuto['username'];
            $_SESSION['nivel_autoridade'] = $userAuto['nivel_autoridade'];
            
            // Renova o token de sessão para evitar fixação
            session_regenerate_id(true);
        }
    } catch(Exception $e) {}
}

// -----------------------------------------------------------------------------
// 6) Limpeza da memória
// -----------------------------------------------------------------------------
unset($password, $username, $dbname, $host, $dsn, $opcoes, $envVars);
