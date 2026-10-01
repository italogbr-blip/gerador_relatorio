<?php
// perm_manager.php - Gerencia permissões e auditoria
// Uso: include_once 'perm_manager.php';

/**
 * Verifica se o usuário possui permissão suficiente.
 * @param int|array $requiredLevel Nível(s) mínimo(s) exigido(s). Pode ser um inteiro ou array de níveis permitidos.
 * @return bool
 */
function hasPermission($requiredLevel = 2): bool {
    if (!isset($_SESSION['nivel_autoridade'])) {
        return false;
    }
    $userLevel = (int)$_SESSION['nivel_autoridade'];
    if (is_array($requiredLevel)) {
        return in_array($userLevel, $requiredLevel, true);
    }
    return $userLevel >= (int)$requiredLevel;
}

/**
 * Registra auditoria de ações críticas.
 * @param string $acao Descrição da ação.
 * @param string $detalhes Detalhes adicionais (opcional).
 */
function logAudit(string $acao, string $detalhes = ''): void {
    global $pdo;
    $usuarioId = $_SESSION['usuario_id'] ?? null;
    try {
        $stmt = $pdo->prepare("INSERT INTO auditoria (usuario_id, acao, detalhes) VALUES (?, ?, ?)");
        $stmt->execute([$usuarioId, $acao, $detalhes]);
    } catch (Exception $e) {
        error_log('Falha ao registrar auditoria: ' . $e->getMessage());
    }
}
?>
