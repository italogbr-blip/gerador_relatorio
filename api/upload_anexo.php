<?php
/**
 * ENDPOINT DE UPLOAD DE ANEXOS SEGUROS
 * 
 * Recebe fotos enviadas pelo aplicativo (via FormData ou Base64),
 * valida tipos MIME, salva em diretório protegido contra acessos externos
 * e retorna uma URL assinada digitalmente com token HMAC.
 */

// 1. Configurações de CORS para permitir requisições do App e Web
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-API-KEY, Authorization");
header("Content-Type: application/json; charset=utf-8");

// Responde requisições pre-flight OPTIONS do navegador
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config_anexos.php';

// 2. Validação da Chave de API Secreta
$headers = function_exists('getallheaders') ? getallheaders() : [];
$providedKey = $headers['X-API-KEY'] 
    ?? $headers['x-api-key'] 
    ?? $_SERVER['HTTP_X_API_KEY'] 
    ?? $_POST['api_key'] 
    ?? '';

if (!hash_equals(API_SECRET_KEY, $providedKey)) {
    http_response_code(401);
    echo json_encode([
        'sucesso' => false,
        'erro' => 'Acesso não autorizado. Chave X-API-KEY ausente ou inválida.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 3. Garante que o diretório de armazenamento existe e possui trava .htaccess
$storageDir = STORAGE_DIR;
if (!is_dir($storageDir)) {
    mkdir($storageDir, 0755, true);
}

$htaccessPath = rtrim($storageDir, '/') . '/.htaccess';
if (!file_exists($htaccessPath)) {
    $htaccessContent = "# Bloqueio Total de Acesso Direto aos Anexos\n"
        . "Options -Indexes\n"
        . "<IfModule mod_authz_core.c>\n"
        . "    Require all denied\n"
        . "</IfModule>\n"
        . "<IfModule !mod_authz_core.c>\n"
        . "    Deny from all\n"
        . "</IfModule>\n";
    @file_put_contents($htaccessPath, $htaccessContent);
}

$allowedMimeTypes = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

$tempFilePath = null;
$originalExtension = 'jpg';
$fileSize = 0;

// 4. Modo A: Upload tradicional multipart/form-data (campo 'foto' ou 'file')
if (!empty($_FILES['foto']) || !empty($_FILES['file'])) {
    $fileObj = !empty($_FILES['foto']) ? $_FILES['foto'] : $_FILES['file'];
    
    if ($fileObj['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode([
            'sucesso' => false,
            'erro' => 'Erro no envio do arquivo (Código: ' . $fileObj['error'] . ')'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    $tempFilePath = $fileObj['tmp_name'];
    $fileSize = $fileObj['size'];
} else {
    // 5. Modo B: Upload via JSON / Base64 payload { "base64": "data:image/jpeg;base64,..." }
    $rawInput = file_get_contents('php://input');
    $jsonData = json_decode($rawInput, true);
    
    $base64String = $jsonData['base64'] ?? $jsonData['foto'] ?? $_POST['base64'] ?? '';
    
    if (!empty($base64String)) {
        if (preg_match('/^data:image\/(\w+);base64,/', $base64String, $matches)) {
            $base64String = substr($base64String, strpos($base64String, ',') + 1);
        }
        
        $decoded = base64_decode($base64String);
        if ($decoded === false) {
            http_response_code(400);
            echo json_encode([
                'sucesso' => false,
                'erro' => 'String Base64 corrompida ou inválida.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        
        $tempFilePath = tempnam(sys_get_temp_dir(), 'mms_up_');
        file_put_contents($tempFilePath, $decoded);
        $fileSize = strlen($decoded);
    }
}

if (!$tempFilePath || !file_exists($tempFilePath)) {
    http_response_code(400);
    echo json_encode([
        'sucesso' => false,
        'erro' => 'Nenhum arquivo ou dado de imagem foi enviado.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 6. Validação de Tamanho Máximo
if ($fileSize > MAX_FILE_SIZE_BYTES) {
    if (isset($decoded)) @unlink($tempFilePath);
    http_response_code(413);
    echo json_encode([
        'sucesso' => false,
        'erro' => 'Arquivo excede o limite máximo permitido de ' . (MAX_FILE_SIZE_BYTES / (1024 * 1024)) . 'MB.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 7. Validação Criteriosa de Tipo MIME Real (Magic Bytes)
$finfo = new finfo(FILEINFO_MIME_TYPE);
$detectedMime = $finfo->file($tempFilePath);

if (!isset($allowedMimeTypes[$detectedMime])) {
    if (isset($decoded)) @unlink($tempFilePath);
    http_response_code(415);
    echo json_encode([
        'sucesso' => false,
        'erro' => 'Formato não permitido (' . $detectedMime . '). Apenas imagens JPEG, PNG ou WEBP são aceitas.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 8. Gera Nome Imprevisível e Criptograficamente Seguro
$extension = $allowedMimeTypes[$detectedMime];
$safeFileName = bin2hex(random_bytes(16)) . '_' . time() . '.' . $extension;
$destinationPath = rtrim($storageDir, '/') . '/' . $safeFileName;

// Move ou copia o arquivo final
$saved = false;
if (is_uploaded_file($tempFilePath)) {
    $saved = move_uploaded_file($tempFilePath, $destinationPath);
} else {
    $saved = rename($tempFilePath, $destinationPath);
    if (!$saved && file_exists($tempFilePath)) {
        $saved = copy($tempFilePath, $destinationPath);
        @unlink($tempFilePath);
    }
}

if (!$saved) {
    http_response_code(500);
    echo json_encode([
        'sucesso' => false,
        'erro' => 'Não foi possível salvar o anexo no disco do servidor. Verifique permissões de escrita.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 9. Gera Token de Assinatura Digital HMAC SHA-256
$token = hash_hmac('sha256', $safeFileName, API_SECRET_KEY);
$baseUrl = getApiBaseUrl();
$urlVisualizacao = "{$baseUrl}/ver_anexo.php?file={$safeFileName}&token={$token}";

// 10. Resposta de Sucesso
http_response_code(200);
echo json_encode([
    'sucesso' => true,
    'mensagem' => 'Anexo salvo com sucesso e protegido.',
    'arquivo_id' => $safeFileName,
    'mime_type' => $detectedMime,
    'tamanho_bytes' => $fileSize,
    'url_visualizacao' => $urlVisualizacao,
], JSON_UNESCAPED_UNICODE);
exit;
