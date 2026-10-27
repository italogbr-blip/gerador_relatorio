<?php
/**
 * API - Autenticação e Gestão de Usuários (MySQL)
 */
require_once __DIR__ . '/db.php';

$pdo = getDatabaseConnection();
$input = getJsonInput();
$action = $_GET['action'] ?? ($input['action'] ?? '');

switch ($action) {
    case 'login':
        executarLogin($pdo, $input);
        break;

    case 'cadastro':
        executarCadastro($pdo, $input);
        break;

    case 'validar_sessao':
    case 'me':
        validarSessao($pdo, $input);
        break;

    case 'listar_usuarios':
        listarUsuarios($pdo, $input);
        break;

    case 'atualizar_usuario':
        atualizarStatusUsuario($pdo, $input);
        break;

    case 'historico_aprovacoes':
        carregarHistoricoAprovacoes($pdo);
        break;

    default:
        jsonResponse(['sucesso' => false, 'erro' => 'Ação de autenticação não especificada.'], 400);
}

/**
 * Autentica usuário com username/email e senha
 */
function executarLogin(PDO $pdo, array $input): void {
    $identificador = trim($input['username'] ?? ($input['login'] ?? ($input['email'] ?? '')));
    $senha = (string)($input['senha'] ?? ($input['password'] ?? ''));

    if (empty($identificador) || empty($senha)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Preencha o usuário e a senha.'], 400);
    }

    $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE LOWER(username) = LOWER(:id1) OR LOWER(email) = LOWER(:id2) LIMIT 1");
    $stmt->execute([':id1' => $identificador, ':id2' => $identificador]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(['sucesso' => false, 'erro' => 'Usuário ou senha inválidos.'], 401);
    }

    // Verifica status de aprovação
    $statusAprovacao = strtolower($user['status_aprovacao'] ?? 'aprovado');
    if ($statusAprovacao === 'bloqueado') {
        jsonResponse(['sucesso' => false, 'erro' => 'Seu acesso foi bloqueado pela coordenação.'], 403);
    }
    if ($statusAprovacao === 'pendente') {
        jsonResponse(['sucesso' => false, 'erro' => 'Seu cadastro está pendente de aprovação pela coordenação.'], 403);
    }

    // Verifica hash da senha
    $hashBanco = $user['senha'] ?? '';
    $senhaValida = false;

    if (password_verify($senha, $hashBanco)) {
        $senhaValida = true;
    } elseif (md5($senha) === $hashBanco) {
        // Upgrade automático de legado MD5 para Bcrypt moderno
        $senhaValida = true;
        try {
            $novoHash = password_hash($senha, PASSWORD_DEFAULT);
            $stmtUpd = $pdo->prepare("UPDATE usuarios SET senha = :s WHERE id = :id");
            $stmtUpd->execute([':s' => $novoHash, ':id' => $user['id']]);
        } catch (Exception $e) {}
    }

    if (!$senhaValida) {
        jsonResponse(['sucesso' => false, 'erro' => 'Usuário ou senha inválidos.'], 401);
    }

    // Gera remember token
    $token = bin2hex(random_bytes(32));
    try {
        $stmtToken = $pdo->prepare("UPDATE usuarios SET remember_token = :t WHERE id = :id");
        $stmtToken->execute([':t' => $token, ':id' => $user['id']]);

        // Grava no registro de logins
        $ip = getClientIp();
        $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);
        $stmtLog = $pdo->prepare("INSERT INTO registro_logins (usuario_id, ip, user_agent) VALUES (:uid, :ip, :ua)");
        $stmtLog->execute([':uid' => $user['id'], ':ip' => $ip, ':ua' => $ua]);
    } catch (Exception $e) {}

    jsonResponse([
        'sucesso' => true,
        'mensagem' => 'Login realizado com sucesso.',
        'user' => [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'nome' => $user['nome'] ?? $user['username'],
            'email' => $user['email'] ?? '',
            'nivel_autoridade' => (int)($user['nivel_autoridade'] ?? 1),
            'status_aprovacao' => $user['status_aprovacao'] ?? 'aprovado',
            'token' => $token
        ]
    ]);
}

/**
 * Cadastra novo usuário
 */
function executarCadastro(PDO $pdo, array $input): void {
    $username = trim($input['username'] ?? '');
    $nome = trim($input['nome'] ?? '');
    $email = trim($input['email'] ?? '');
    $senha = (string)($input['senha'] ?? '');

    if (empty($username) || empty($nome) || empty($senha)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Por favor, preencha todos os campos obrigatórios.'], 400);
    }

    if (strlen($username) < 3) {
        jsonResponse(['sucesso' => false, 'erro' => 'O nome de usuário deve ter pelo menos 3 caracteres.'], 400);
    }

    if (strlen($senha) < 6) {
        jsonResponse(['sucesso' => false, 'erro' => 'A senha deve ter pelo menos 6 caracteres.'], 400);
    }

    // Verifica se já existe
    $stmtCheck = $pdo->prepare("SELECT id, username, email FROM usuarios WHERE LOWER(username) = LOWER(:u) OR (email IS NOT NULL AND email != '' AND LOWER(email) = LOWER(:e)) LIMIT 1");
    $stmtCheck->execute([':u' => $username, ':e' => $email]);
    if ($stmtCheck->fetch()) {
        jsonResponse(['sucesso' => false, 'erro' => 'Usuário ou e-mail já cadastrado.'], 409);
    }

    $hashSenha = password_hash($senha, PASSWORD_DEFAULT);
    $statusInicial = 'aprovado'; // Por padrão aprovado, ou configurável

    $stmtInsert = $pdo->prepare("
        INSERT INTO usuarios (username, nome, email, senha, nivel_autoridade, status_aprovacao)
        VALUES (:u, :n, :e, :s, 1, :st)
    ");
    $stmtInsert->execute([
        ':u' => $username,
        ':n' => $nome,
        ':e' => $email,
        ':s' => $hashSenha,
        ':st' => $statusInicial
    ]);

    $novoId = (int)$pdo->lastInsertId();
    $token = bin2hex(random_bytes(32));

    try {
        $stmtToken = $pdo->prepare("UPDATE usuarios SET remember_token = :t WHERE id = :id");
        $stmtToken->execute([':t' => $token, ':id' => $novoId]);
    } catch (Exception $e) {}

    jsonResponse([
        'sucesso' => true,
        'mensagem' => 'Cadastro realizado com sucesso!',
        'user' => [
            'id' => $novoId,
            'username' => $username,
            'nome' => $nome,
            'email' => $email,
            'nivel_autoridade' => 1,
            'status_aprovacao' => $statusInicial,
            'token' => $token
        ]
    ]);
}

/**
 * Valida a sessão via token ou ID
 */
function validarSessao(PDO $pdo, array $input): void {
    $token = trim($input['token'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    $token = str_ireplace('Bearer ', '', $token);
    $userId = $input['usuario_id'] ?? ($input['user_id'] ?? null);

    if (empty($token) && empty($userId)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Token ou identificador não fornecido.'], 401);
    }

    if (!empty($token)) {
        $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE remember_token = :t LIMIT 1");
        $stmt->execute([':t' => $token]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $userId]);
    }

    $user = $stmt->fetch();
    if (!$user) {
        jsonResponse(['sucesso' => false, 'erro' => 'Sessão inválida ou expirada.'], 401);
    }

    jsonResponse([
        'sucesso' => true,
        'user' => [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'nome' => $user['nome'] ?? $user['username'],
            'email' => $user['email'] ?? '',
            'nivel_autoridade' => (int)($user['nivel_autoridade'] ?? 1),
            'status_aprovacao' => $user['status_aprovacao'] ?? 'aprovado'
        ]
    ]);
}

/**
 * Lista todos os usuários cadastrados (para gestão do Coordenador)
 */
function listarUsuarios(PDO $pdo, array $input): void {
    $busca = trim($_GET['busca'] ?? ($input['busca'] ?? ''));

    $sql = "SELECT id, username, nome, email, nivel_autoridade, status_aprovacao, data_cadastro FROM usuarios";
    $params = [];

    if (!empty($busca)) {
        $sql .= " WHERE username LIKE :b1 OR nome LIKE :b2 OR email LIKE :b3";
        $params[':b1'] = "%{$busca}%";
        $params[':b2'] = "%{$busca}%";
        $params[':b3'] = "%{$busca}%";
    }

    $sql .= " ORDER BY data_cadastro DESC, id DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $usuarios = $stmt->fetchAll();

    jsonResponse([
        'sucesso' => true,
        'usuarios' => $usuarios
    ]);
}

/**
 * Atualiza status ou nível de autoridade de um usuário
 */
function atualizarStatusUsuario(PDO $pdo, array $input): void {
    $usuarioId = $input['usuario_id'] ?? null;
    if (!$usuarioId) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID do usuário obrigatório.'], 400);
    }

    $campos = [];
    $params = [':id' => $usuarioId];

    if (isset($input['status_aprovacao'])) {
        $campos[] = "status_aprovacao = :st";
        $params[':st'] = $input['status_aprovacao'];
    }

    if (isset($input['nivel_autoridade'])) {
        $campos[] = "nivel_autoridade = :nv";
        $params[':nv'] = (int)$input['nivel_autoridade'];
    }

    if (empty($campos)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Nenhum campo para atualizar.'], 400);
    }

    $sql = "UPDATE usuarios SET " . implode(', ', $campos) . " WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Registra no histórico se houver ação
    if (!empty($input['acao'])) {
        try {
            $stmtHist = $pdo->prepare("INSERT INTO historico_aprovacoes_usuarios (usuario_id, acao, detalhes) VALUES (:uid, :ac, :dt)");
            $stmtHist->execute([
                ':uid' => $usuarioId,
                ':ac' => $input['acao'],
                ':dt' => $input['detalhes'] ?? null
            ]);
        } catch (Exception $e) {}
    }

    jsonResponse(['sucesso' => true, 'mensagem' => 'Usuário atualizado com sucesso.']);
}

/**
 * Carrega histórico de aprovações/rejeições
 */
function carregarHistoricoAprovacoes(PDO $pdo): void {
    try {
        $stmt = $pdo->query("
            SELECT h.*, u.nome, u.username 
            FROM historico_aprovacoes_usuarios h
            LEFT JOIN usuarios u ON u.id = h.usuario_id
            ORDER BY h.id DESC LIMIT 100
        ");
        $registros = $stmt->fetchAll();
        jsonResponse(['sucesso' => true, 'historico' => $registros]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => true, 'historico' => []]);
    }
}
