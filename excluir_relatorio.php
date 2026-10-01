<?php
session_start();

// Proteção: Apenas usuários logados e com nível de autoridade 2 podem excluir
if (!isset($_SESSION['usuario_id']) || ($_SESSION['nivel_autoridade'] ?? 0) != 2) {
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => 'Acesso negado. Permissão insuficiente.']);
    exit;
}

require 'mms_config.php';

$id = filter_input(INPUT_POST, 'id', FILTER_VALIDATE_INT);

if (!$id) {
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => 'ID de relatório inválido.']);
    exit;
}

try {
    // Busca o caminho do PDF para excluir o arquivo físico (se existir)
    $stmtPdf = $pdo->prepare("SELECT pdf_url FROM relatorios WHERE id = ?");
    $stmtPdf->execute([$id]);
    $linhaPdf = $stmtPdf->fetch();
    
    if (!empty($linhaPdf['pdf_url'])) {
        $caminhoPdf = realpath(__DIR__ . '/' . $linhaPdf['pdf_url']);
        $baseDir = realpath(__DIR__ . '/relatorios_pdf');
        
        // Garante que o arquivo está dentro do diretório correto antes de excluir
        if ($baseDir && $caminhoPdf && strpos($caminhoPdf, $baseDir) === 0 && is_file($caminhoPdf)) {
            @unlink($caminhoPdf);
        }
    }

    // Exclui do banco de dados
    $stmt = $pdo->prepare("DELETE FROM relatorios WHERE id = ?");
    $stmt->execute([$id]);

    header('Content-Type: application/json');
    echo json_encode(['sucesso' => true]);

} catch (Exception $e) {
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    error_log(date('[d/m/Y H:i:s] ') . "Erro ao excluir relatorio id={$id}: " . $e->getMessage() . "\n", 3, $caminhoLog);
    
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => 'Erro interno ao excluir do banco de dados.']);
}
?>
