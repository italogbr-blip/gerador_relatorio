<?php
/**
 * Conexão Central e Utilitários de Banco de Dados MySQL
 */

// -------------------------------------------------------------
// 1. CORS Headers para permitir requisições do App e Web
// -------------------------------------------------------------
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Api-Key');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// -------------------------------------------------------------
// 2. Fuso Horário e Carregamento de Configurações
// -------------------------------------------------------------
date_default_timezone_set('America/Sao_Paulo');

require_once __DIR__ . '/config_db.php';

$envVars = [];
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';

$rawCandidates = [
    // Caminhos relativos a partir da pasta /api/
    dirname(__DIR__, 6) . '/.env',
    dirname(__DIR__, 6) . '/.mms_env',
    dirname(__DIR__, 5) . '/.env',
    dirname(__DIR__, 5) . '/.mms_env',
    dirname(__DIR__, 4) . '/.env',
    dirname(__DIR__, 4) . '/.mms_env',
    dirname(__DIR__, 3) . '/.env',
    dirname(__DIR__, 3) . '/.mms_env',
    dirname(__DIR__, 2) . '/.env',
    dirname(__DIR__, 2) . '/.mms_env',
    dirname(__DIR__) . '/.env',
    dirname(__DIR__) . '/.mms_env',
    __DIR__ . '/.env',
    __DIR__ . '/.mms_env',
    // Caminhos baseados no DocumentRoot da Hospedagem
    $docRoot ? $docRoot . '/../.env' : '',
    $docRoot ? $docRoot . '/../.mms_env' : '',
    $docRoot ? $docRoot . '/.env' : '',
    $docRoot ? $docRoot . '/.mms_env' : '',
    // Caminhos estruturados da hospedagem Hostinger
    '/home/u596152436/domains/mmssuportelogistica.com.br/.mms_env',
    '/home/u596152436/domains/mmssuportelogistica.com.br/.env',
    '/home/u596152436/domains/relatorios.atmai.com.br/.mms_env',
    '/home/u596152436/domains/relatorios.atmai.com.br/.env',
    '/home/u596152436/domains/atmai.com.br/.mms_env',
    '/home/u596152436/domains/atmai.com.br/.env',
    '/home/u596152436/.mms_env',
    '/home/u596152436/.env',
];

$envCandidates = array_values(array_unique(array_filter($rawCandidates)));

foreach ($envCandidates as $envFile) {
    if (is_file($envFile) && is_readable($envFile)) {
        $linhas = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($linhas) {
            foreach ($linhas as $linha) {
                $linha = trim($linha);
                if ($linha === '' || $linha[0] === '#') continue;
                if (strpos($linha, '=') === false) continue;
                [$chave, $valor] = explode('=', $linha, 2);
                $chave = trim($chave);
                $valor = trim($valor, " \t\n\r\0\x0B\"'");
                if ($chave !== '') {
                    $envVars[$chave] = $valor;
                }
            }
            break;
        }
    }
}

$dbHost = $envVars['DB_HOST'] ?? (defined('DB_HOST') ? DB_HOST : 'localhost');
$dbName = $envVars['DB_NAME'] ?? (defined('DB_NAME') ? DB_NAME : 'u596152436_relatorios');
$dbUser = $envVars['DB_USER'] ?? (defined('DB_USER') ? DB_USER : 'u596152436_admin_mms');
$dbPass = $envVars['DB_PASS'] ?? (defined('DB_PASS') ? DB_PASS : '');

// Se a senha estiver vazia, tenta reaproveitar a conexão PDO ativa do script original mms_config.php
$legacyConfigCandidates = array_values(array_unique(array_filter([
    dirname(__DIR__) . '/mms_config.php',
    dirname(__DIR__, 2) . '/mms_config.php',
    $docRoot ? $docRoot . '/mms_config.php' : '',
    $docRoot ? $docRoot . '/../mms_config.php' : '',
    '/home/u596152436/domains/mmssuportelogistica.com.br/public_html/mms_config.php',
    '/home/u596152436/domains/relatorios.atmai.com.br/public_html/mms_config.php',
])));

foreach ($legacyConfigCandidates as $cfgPath) {
    if (is_file($cfgPath) && is_readable($cfgPath)) {
        try {
            require_once $cfgPath;
            if (isset($pdo) && $pdo instanceof PDO) {
                $globalPdo = $pdo;
                break;
            }
        } catch (Exception $e) {}
    }
}

/**
 * Obtém ou inicializa a conexão PDO com MySQL
 */
function getDatabaseConnection(): PDO {
    global $globalPdo, $dbHost, $dbName, $dbUser, $dbPass;

    if (isset($globalPdo) && $globalPdo instanceof PDO) {
        return $globalPdo;
    }

    if (empty($dbName) || empty($dbUser)) {
        jsonResponse([
            'sucesso' => false,
            'erro' => 'Configuração do banco de dados MySQL incompleta. Configure o arquivo .env ou api/config_db.php.'
        ], 500);
    }

    try {
        $dsn = "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";
        $opcoes = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
        ];

        $pdo = new PDO($dsn, $dbUser, $dbPass, $opcoes);
        $globalPdo = $pdo;
        inicializarTabelasSeNecessario($pdo);
        return $pdo;
    } catch (PDOException $e) {
        $logFile = __DIR__ . '/api_erros.log';
        @file_put_contents($logFile, date('[d/m/Y H:i:s] ') . "Erro Conexao MySQL: " . $e->getMessage() . "\n", FILE_APPEND);
        jsonResponse([
            'sucesso' => false,
            'erro' => 'Falha ao conectar com o banco de dados MySQL.',
            'detalhe' => $e->getMessage()
        ], 500);
    }
}

/**
 * Garante que a estrutura básica de tabelas exista
 */
function inicializarTabelasSeNecessario(PDO $pdo): void {
    static $inicializado = false;
    if ($inicializado) return;
    $inicializado = true;

    try {
        // 1. Tabela de usuários
        $pdo->exec("CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            nome VARCHAR(100) NULL,
            email VARCHAR(150) NULL,
            senha VARCHAR(255) NOT NULL,
            nivel_autoridade INT DEFAULT 1,
            status_aprovacao VARCHAR(20) DEFAULT 'aprovado',
            remember_token VARCHAR(100) NULL,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Migração automática para garantir colunas na tabela usuarios
        try {
            $colsStmt = $pdo->query("SHOW COLUMNS FROM usuarios");
            if ($colsStmt) {
                $cols = $colsStmt->fetchAll(PDO::FETCH_COLUMN);
                if (!in_array('status_aprovacao', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN status_aprovacao VARCHAR(20) DEFAULT 'aprovado'");
                }
                if (!in_array('data_cadastro', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
                }
                if (!in_array('remember_token', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN remember_token VARCHAR(100) NULL");
                }
                if (!in_array('nome', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN nome VARCHAR(100) NULL");
                }
                if (!in_array('email', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NULL");
                }
                if (!in_array('nivel_autoridade', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN nivel_autoridade INT DEFAULT 1");
                }
                if (!in_array('last_activity', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN last_activity DATETIME NULL");
                }
                if (!in_array('aprovado_por', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN aprovado_por VARCHAR(100) NULL");
                }
                if (!in_array('data_aprovacao', $cols)) {
                    $pdo->exec("ALTER TABLE usuarios ADD COLUMN data_aprovacao DATETIME NULL");
                }
            }
        } catch (Exception $eCol) {}

        // 2. Tabela de relatórios
        $pdo->exec("CREATE TABLE IF NOT EXISTS relatorios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NULL,
            empresa VARCHAR(100) NULL,
            unidade VARCHAR(100) NULL,
            local_atendimento VARCHAR(100) NULL,
            pdf_url VARCHAR(255) NULL,
            dados_json LONGTEXT NULL,
            teve_anexo TINYINT(1) DEFAULT 0,
            ip_origem VARCHAR(45) NULL,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rel_data (data_criacao),
            INDEX idx_rel_user (usuario_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 3. Senha de coordenação
        $pdo->exec("CREATE TABLE IF NOT EXISTS coord_senha (
            id INT PRIMARY KEY DEFAULT 1,
            senha_hash VARCHAR(255) NOT NULL,
            atualizada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 4. Acessos falhos da coordenação
        $pdo->exec("CREATE TABLE IF NOT EXISTS coord_acessos_falhos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NULL,
            username VARCHAR(100) NULL,
            ip VARCHAR(45) NULL,
            user_agent VARCHAR(500) NULL,
            data_tentativa TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 5. Registro de logins
        $pdo->exec("CREATE TABLE IF NOT EXISTS registro_logins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NULL,
            ip VARCHAR(45) NULL,
            user_agent VARCHAR(500) NULL,
            data_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 6. Notificações / Avisos / Popups
        $pdo->exec("CREATE TABLE IF NOT EXISTS notificacoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(150) NOT NULL,
            mensagem TEXT NOT NULL,
            tipo VARCHAR(50) DEFAULT 'aviso',
            ativa TINYINT(1) DEFAULT 1,
            regra_exibicao VARCHAR(50) DEFAULT 'sempre',
            validade_dias INT DEFAULT 0,
            mostrar_feedback TINYINT(1) DEFAULT 1,
            data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 7. Versão do App (padronizada e legada)
        $pdo->exec("CREATE TABLE IF NOT EXISTS versao_app (
            id INT AUTO_INCREMENT PRIMARY KEY,
            versao VARCHAR(30) NOT NULL,
            obrigatoria TINYINT(1) DEFAULT 0,
            notas TEXT NULL,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS mms_versao_app (
            id INT AUTO_INCREMENT PRIMARY KEY,
            versao VARCHAR(30) NOT NULL,
            obrigatoria TINYINT(1) DEFAULT 0,
            notas TEXT NULL,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 8. Histórico de aprovações
        $pdo->exec("CREATE TABLE IF NOT EXISTS historico_aprovacoes_usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NULL,
            acao VARCHAR(100) NOT NULL,
            detalhes TEXT NULL,
            data TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 9. Tabela de IPs bloqueados (Firewall)
        $pdo->exec("CREATE TABLE IF NOT EXISTS ips_bloqueados (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip VARCHAR(45) NOT NULL UNIQUE,
            motivo VARCHAR(255) NULL,
            bloqueado_por VARCHAR(100) NULL,
            data_bloqueio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 10. Configurações gerais Chave-Valor (Rodapé, etc)
        $pdo->exec("CREATE TABLE IF NOT EXISTS configuracoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave VARCHAR(100) NOT NULL UNIQUE,
            valor LONGTEXT NOT NULL,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    } catch (Exception $e) {
        // Silencioso se usuário não tem privilégios DDL
    }
}

/**
 * Responde em formato JSON e encerra a execução
 */
function jsonResponse(array $data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

/**
 * Lê o corpo da requisição JSON (php://input ou $_POST)
 */
function getJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    return $_POST ?: [];
}

/**
 * Obtém o IP do cliente
 */
function getClientIp(): string {
    $headers = [
        'HTTP_CLIENT_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_FORWARDED',
        'HTTP_X_CLUSTER_CLIENT_IP',
        'HTTP_FORWARDED_FOR',
        'HTTP_FORWARDED',
        'REMOTE_ADDR'
    ];
    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ipList = explode(',', $_SERVER[$header]);
            $ip = trim($ipList[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}
