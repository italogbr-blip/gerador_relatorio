<?php
/**
 * CONFIGURAÇÕES DA API DE ANEXOS SEGUROS
 * 
 * Este arquivo centraliza a chave de segurança e os caminhos
 * para armazenamento protegido de fotos na hospedagem.
 */

// Chave secreta de autenticação entre o aplicativo e a sua hospedagem PHP.
// Recomenda-se manter uma chave forte e nunca compartilhá-la publicamente.
define('API_SECRET_KEY', 'e94a8f61c32b50d998a4c146e28fb05cf711d9546059d2489e2171ec55fb8f29');

// Diretório local onde os arquivos físicos serão salvos
define('STORAGE_DIR', __DIR__ . '/storage_anexos/');

// Tamanho máximo permitido por foto (em bytes). Padrão: 12MB
define('MAX_FILE_SIZE_BYTES', 12 * 1024 * 1024);

// Domínio base ou URL onde a pasta /api/ está instalada
// Se deixado vazio (''), a URL será detectada automaticamente pelo script.
define('BASE_API_URL', '');

/**
 * Função utilitária para obter a URL base da API
 */
function getApiBaseUrl(): string {
    if (defined('BASE_API_URL') && !empty(BASE_API_URL)) {
        return rtrim(BASE_API_URL, '/');
    }
    $isHttps = (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        ($_SERVER['SERVER_PORT'] ?? 80) == 443 ||
        (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    );
    $protocol = $isHttps ? 'https://' : 'http://';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scriptDir = dirname($_SERVER['SCRIPT_NAME'] ?? '');
    $scriptDir = str_replace('\\', '/', $scriptDir);
    return rtrim($protocol . $host . $scriptDir, '/');
}

