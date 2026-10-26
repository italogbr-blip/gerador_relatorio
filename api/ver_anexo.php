<?php
/**
 * GATEWAY DE VISUALIZAÇÃO SEGURA DE ANEXOS
 * 
 * Permite que o aplicativo e o gerador de PDF acessem fotos
 * que estão gravadas na pasta protegida (com .htaccess Deny from all).
 * 
 * Só entrega a imagem se a assinatura digital HMAC for 100% válida.
 */

// 1. Permite carregar a imagem em tags <img> e no jsPDF via CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config_anexos.php';

// 2. Extrai parâmetros com proteção rigorosa contra Path Traversal
$rawFile = $_GET['file'] ?? '';
$safeFileName = basename($rawFile);
$providedToken = trim($_GET['token'] ?? '');

if (empty($safeFileName) || empty($providedToken)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    die('Parâmetros de arquivo ou token de assinatura ausentes.');
}

// 3. Validação Criptográfica do Token HMAC SHA-256
$expectedToken = hash_hmac('sha256', $safeFileName, API_SECRET_KEY);

if (!hash_equals($expectedToken, $providedToken)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    die('Acesso negado: Assinatura de autenticação inválida.');
}

// 4. Localização do Arquivo no Disco Local Protegido
$fullPath = rtrim(STORAGE_DIR, '/') . '/' . $safeFileName;

if (!file_exists($fullPath) || !is_file($fullPath)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    die('Anexo não encontrado.');
}

// 5. Detecta o Tipo MIME Real do Arquivo
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($fullPath);

if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'])) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    die('Tipo de arquivo não permitido para exibição.');
}

// 6. Limpa buffers para não corromper o binário da imagem
while (ob_get_level()) {
    ob_end_clean();
}

// 7. Headers de Entrega e Cache Seguro
header('Content-Type: ' . $mimeType);
header('Content-Length: ' . filesize($fullPath));
header('Content-Disposition: inline; filename="' . $safeFileName . '"');
header('Cache-Control: private, max-age=604800, immutable'); // Cache seguro de 7 dias
header('Expires: ' . gmdate('D, d M Y H:i:s \G\M\T', time() + 604800));
header('Pragma: cache');

readfile($fullPath);
exit;
