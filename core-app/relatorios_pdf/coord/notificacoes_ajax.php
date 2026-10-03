<?php
// notificacoes_ajax.php - Endpoint para buscar notificações ativas em formato JSON
// Retorna um array de notificações com id, titulo, mensagem, tipo, data_criacao

require __DIR__ . '/mms_config.php';

header('Content-Type: application/json');

try {
    $stmt = $pdo->prepare("SELECT id, titulo, mensagem, tipo, data_criacao FROM notificacoes WHERE ativa = 1 ORDER BY data_criacao DESC");
    $stmt->execute();
    $notificacoes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['status' => 'ok', 'data' => $notificacoes]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
?>
