<?php
/**
 * MMS API - Coordenação e Auditoria de Segurança (MySQL)
 */
require_once __DIR__ . '/db.php';

$pdo = getDatabaseConnection();
$input = getJsonInput();
$action = $_GET['action'] ?? ($input['action'] ?? '');

switch ($action) {
    case 'verificar_senha':
        verificarSenhaCoord($pdo, $input);
        break;

    case 'alterar_senha':
        alterarSenhaCoord($pdo, $input);
        break;

    case 'acessos_falhos':
        listarAcessosFalhos($pdo);
        break;

    case 'limpar_acessos_falhos':
        limparAcessosFalhos($pdo);
        break;

    case 'logins':
        listarLogins($pdo);
        break;

    default:
        jsonResponse(['sucesso' => false, 'erro' => 'Ação de coordenação desconhecida.'], 400);
}

/**
 * Valida a senha da coordenação com proteção contra força bruta
 */
function verificarSenhaCoord(PDO $pdo, array $input): void {
    $senha = (string)($input['senha'] ?? ($input['password'] ?? ''));
    $ip = getClientIp();
    $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);
    $username = trim($input['username'] ?? 'anonimo');
    $usuarioId = !empty($input['usuario_id']) ? (int)$input['usuario_id'] : null;

    if (empty($senha)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Senha não informada.'], 400);
    }

    // Rate Limiting: Verifica tentativas falhadas deste IP nos últimos 15 minutos
    try {
        $stmtCheckRate = $pdo->prepare("
            SELECT COUNT(*) FROM coord_acessos_falhos 
            WHERE ip = :ip AND data_tentativa >= (NOW() - INTERVAL 15 MINUTE)
        ");
        $stmtCheckRate->execute([':ip' => $ip]);
        $falhasRecentes = (int)$stmtCheckRate->fetchColumn();

        if ($falhasRecentes >= 5) {
            jsonResponse([
                'sucesso' => false,
                'erro' => 'Muitas tentativas incorretas. Acesso ao painel temporariamente bloqueado por 15 minutos.'
            ], 429);
        }
    } catch (Exception $e) {}

    // Busca hash cadastrado na tabela coord_senha
    $stmt = $pdo->query("SELECT senha_hash FROM coord_senha WHERE id = 1 LIMIT 1");
    $row = $stmt->fetch();

    $senhaCorreta = false;

    if ($row && !empty($row['senha_hash'])) {
        $hash = $row['senha_hash'];
        if (password_verify($senha, $hash) || $senha === $hash || md5($senha) === $hash) {
            $senhaCorreta = true;
            // Se estava em texto puro ou md5, atualiza para bcrypt
            if (!password_get_info($hash)['algo']) {
                $novoHash = password_hash($senha, PASSWORD_DEFAULT);
                $stmtUp = $pdo->prepare("UPDATE coord_senha SET senha_hash = :h WHERE id = 1");
                $stmtUp->execute([':h' => $novoHash]);
            }
        }
    } else {
        // Se ainda não foi definida senha na tabela, define a primeira como inicial
        $hashPadrao = password_hash($senha, PASSWORD_DEFAULT);
        $pdo->prepare("INSERT INTO coord_senha (id, senha_hash) VALUES (1, :h) ON DUPLICATE KEY UPDATE senha_hash = :h2")
            ->execute([':h' => $hashPadrao, ':h2' => $hashPadrao]);
        $senhaCorreta = true;
    }

    if ($senhaCorreta) {
        jsonResponse([
            'sucesso' => true,
            'mensagem' => 'Acesso autorizado ao painel de coordenação.'
        ]);
    } else {
        // Grava tentativa incorreta
        try {
            $stmtFalha = $pdo->prepare("
                INSERT INTO coord_acessos_falhos (usuario_id, username, ip, user_agent)
                VALUES (:uid, :u, :ip, :ua)
            ");
            $stmtFalha->execute([
                ':uid' => $usuarioId,
                ':u' => $username,
                ':ip' => $ip,
                ':ua' => $ua
            ]);
        } catch (Exception $e) {}

        jsonResponse([
            'sucesso' => false,
            'erro' => 'Senha da Coordenação incorreta.'
        ], 401);
    }
}

/**
 * Altera a senha do painel de coordenação
 */
function alterarSenhaCoord(PDO $pdo, array $input): void {
    $novaSenha = (string)($input['nova_senha'] ?? ($input['novaSenha'] ?? ''));

    if (empty($novaSenha) || strlen($novaSenha) < 4) {
        jsonResponse(['sucesso' => false, 'erro' => 'A nova senha deve ter pelo menos 4 caracteres.'], 400);
    }

    $novoHash = password_hash($novaSenha, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("
        INSERT INTO coord_senha (id, senha_hash) VALUES (1, :h)
        ON DUPLICATE KEY UPDATE senha_hash = :h2
    ");
    $stmt->execute([':h' => $novoHash, ':h2' => $novoHash]);

    jsonResponse([
        'sucesso' => true,
        'mensagem' => 'Senha da coordenação atualizada com sucesso!'
    ]);
}

/**
 * Lista tentativas de acessos falhos
 */
function listarAcessosFalhos(PDO $pdo): void {
    try {
        $stmt = $pdo->query("SELECT * FROM coord_acessos_falhos ORDER BY data_tentativa DESC LIMIT 100");
        $falhas = $stmt->fetchAll();
        jsonResponse(['sucesso' => true, 'falhas' => $falhas]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => true, 'falhas' => []]);
    }
}

/**
 * Limpa o histórico de tentativas falhadas / desbloqueia
 */
function limparAcessosFalhos(PDO $pdo): void {
    try {
        $pdo->exec("DELETE FROM coord_acessos_falhos");
        jsonResponse(['sucesso' => true, 'mensagem' => 'Registro de tentativas falhadas limpo com sucesso.']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => $e->getMessage()], 500);
    }
}

/**
 * Lista auditoria de logins
 */
function listarLogins(PDO $pdo): void {
    try {
        $stmt = $pdo->query("
            SELECT r.*, u.nome, u.username
            FROM registro_logins r
            LEFT JOIN usuarios u ON u.id = r.usuario_id
            ORDER BY r.id DESC LIMIT 100
        ");
        $logins = $stmt->fetchAll();
        jsonResponse(['sucesso' => true, 'logins' => $logins]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => true, 'logins' => []]);
    }
}
