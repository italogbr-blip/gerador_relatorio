<?php
session_start();
require 'mms_config.php';

if (!isset($_SESSION['usuario_id'])) {
    echo json_encode(['sucesso' => false]);
    exit;
}

$dadosBrutos = file_get_contents("php://input");
$dados = json_decode($dadosBrutos, true);

if ($dados && isset($dados['notificacao_id'])) {
    $notif_id = $dados['notificacao_id'];
    $usuario_id = $_SESSION['usuario_id'];
    $nota = $dados['nota'] ?? null;
    $texto = $dados['texto'] ?? null;

    try {
        // Verifica se já existe interação para essa notificação/usuário
        $stmtCheck = $pdo->prepare("SELECT id FROM interacoes_popup WHERE notificacao_id = ? AND usuario_id = ?");
        $stmtCheck->execute([$notif_id, $usuario_id]);
        $existe = $stmtCheck->fetch();

        if ($existe) {
            // Update
            $stmtUpdate = $pdo->prepare("UPDATE interacoes_popup SET feedback_nota = ?, feedback_texto = ? WHERE notificacao_id = ? AND usuario_id = ?");
            $stmtUpdate->execute([$nota, $texto, $notif_id, $usuario_id]);
        } else {
            // Insert
            $stmtInsert = $pdo->prepare("INSERT INTO interacoes_popup (notificacao_id, usuario_id, feedback_nota, feedback_texto) VALUES (?, ?, ?, ?)");
            $stmtInsert->execute([$notif_id, $usuario_id, $nota, $texto]);
        }
        echo json_encode(['sucesso' => true]);
    } catch (Exception $e) {
        echo json_encode(['sucesso' => false, 'erro' => $e->getMessage()]);
    }
} else {
    echo json_encode(['sucesso' => false]);
}
?>
