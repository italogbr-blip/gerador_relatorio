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

    case 'excluir_usuario':
        excluirUsuario($pdo, $input);
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
    $identificador = trim((string)($input['username'] ?? ($input['login'] ?? ($input['email'] ?? ''))));
    $senha = (string)($input['senha'] ?? ($input['password'] ?? ''));

    if (empty($identificador) || empty($senha)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Preencha o usuário e a senha.'], 400);
    }

    // 1. Busca por username, email ou nome (exato ou case-insensitive)
    $stmt = $pdo->prepare("
        SELECT * FROM usuarios 
        WHERE LOWER(username) = LOWER(:id1) 
           OR LOWER(email) = LOWER(:id2)
           OR LOWER(nome) = LOWER(:id3)
           OR username = :id4
           OR email = :id5
           OR nome = :id6
        ORDER BY nivel_autoridade DESC, id ASC
        LIMIT 1
    ");
    $stmt->execute([
        ':id1' => $identificador,
        ':id2' => $identificador,
        ':id3' => $identificador,
        ':id4' => $identificador,
        ':id5' => $identificador,
        ':id6' => $identificador,
    ]);
    $user = $stmt->fetch();

    // 2. Se não encontrou, tenta buscar por início do username ou nome (ex: "italo" -> "italogabriel")
    if (!$user) {
        $stmtLike = $pdo->prepare("
            SELECT * FROM usuarios 
            WHERE LOWER(username) LIKE LOWER(:l1)
               OR LOWER(email) LIKE LOWER(:l2)
               OR LOWER(nome) LIKE LOWER(:l3)
            ORDER BY nivel_autoridade DESC, id ASC
            LIMIT 1
        ");
        $prefix = $identificador . '%';
        $stmtLike->execute([':l1' => $prefix, ':l2' => $prefix, ':l3' => $prefix]);
        $user = $stmtLike->fetch();
    }

    if (!$user) {
        jsonResponse(['sucesso' => false, 'erro' => 'Usuário ou senha inválidos.'], 401);
    }

    // Verifica status de aprovação caso a coluna exista
    if (isset($user['status_aprovacao'])) {
        $statusAprovacao = strtolower($user['status_aprovacao']);
        if ($statusAprovacao === 'bloqueado') {
            jsonResponse(['sucesso' => false, 'erro' => 'Seu acesso foi bloqueado pela coordenação.'], 403);
        }
        if ($statusAprovacao === 'pendente') {
            jsonResponse(['sucesso' => false, 'erro' => 'Seu cadastro está pendente de aprovação pela coordenação.'], 403);
        }
    }

    // Hashes originais de segurança da base original (u596152436_relatorios.sql)
    $hashesOriginais = [
        1 => '$2y$10$NquzSoDbJl1am5leC2DTV.RnGP7YO0hFVRK6PR/3k1slzP/vtVUHy', // italogabriel
        2 => '$2y$10$KTGljA3AaxH70.qjTfhiCug8bA8vk.bAvoSehB2vvFfzkbiff4vka', // Silas Miguel
        3 => '$2y$10$ILM/UJGEmhu22hHmVQyNJeSX..4siUq.dTV1OkUKRqRClpyiJP1GW', // ottoncferreira
        4 => '$2y$10$79HTRUpqQPeCYVxz.5qOZunVGN6rB0oQA7/nRwsQC6X4WAAlUZcjO', // Rayssa pacheco
        5 => '$2y$10$VNXxdZ9rsDaLdu1tYTiY3uxKToFsy61jzwKSX/GEdgNs455TaRgp.', // jotaluizribeiro
        6 => '$2y$10$WjeJiEZH.j66ytzGc/wKVOEusqVJS/aK7KEjAx/tWUXmhfQqZqt7S', // sthefany
        7 => '$2y$10$f8hBRNQQ/UXz0h3kbWbbwuz9IIdFzQ7U6Kl2QCcupxdM.eEvs5FcO', // Joao1234
        8 => '$2y$10$1ASCMntN5h8hwL.cvDoQ1.e2W6dqSXenL31CniFg7bqDY5j0tWT6a', // Kielce Rodrigues
        9 => '$2y$10$UMs7MMUGI8LSGm1YnHd8FOqlQ3.NiT3Lh32NNjSsVqK7u2vFYsA3C', // Pablo cruz
        11 => '$2y$10$l8wDtg.o/K7KtWx1tqmcFeLMIW2iaKRfIgYLmjxJEQMC6M0hZSW3u', // anajulia
    ];

    $hashBanco = trim((string)($user['senha'] ?? ''));
    if (empty($hashBanco) && isset($hashesOriginais[(int)$user['id']])) {
        $hashBanco = $hashesOriginais[(int)$user['id']];
    }

    $senhaValida = false;
    $candidatos = array_unique([$senha, trim($senha)]);

    foreach ($candidatos as $cand) {
        if (!empty($hashBanco)) {
            if (password_verify($cand, $hashBanco)) {
                $senhaValida = true;
                break;
            }
            // Compatibilidade entre variantes de bcrypt ($2y$, $2a$, $2b$)
            if (str_starts_with($hashBanco, '$2y$')) {
                $hash2a = str_replace('$2y$', '$2a$', $hashBanco);
                if (password_verify($cand, $hash2a)) {
                    $senhaValida = true;
                    break;
                }
            }
            if (str_starts_with($hashBanco, '$2a$')) {
                $hash2y = str_replace('$2a$', '$2y$', $hashBanco);
                if (password_verify($cand, $hash2y)) {
                    $senhaValida = true;
                    break;
                }
            }
            // MD5 legado ou texto simples
            if (md5($cand) === $hashBanco || $cand === $hashBanco) {
                $senhaValida = true;
                try {
                    $novoHash = password_hash($cand, PASSWORD_DEFAULT);
                    $stmtUpd = $pdo->prepare("UPDATE usuarios SET senha = :s WHERE id = :id");
                    $stmtUpd->execute([':s' => $novoHash, ':id' => $user['id']]);
                } catch (Exception $e) {}
                break;
            }
        }
    }

    // Se ainda não validou e o usuário é coordenador (nível 2), permite a senha da tabela coord_senha
    if (!$senhaValida && (int)($user['nivel_autoridade'] ?? 1) === 2) {
        try {
            $stmtC = $pdo->query("SELECT senha_hash FROM coord_senha WHERE id = 1 LIMIT 1");
            $cRow = $stmtC ? $stmtC->fetch() : null;
            if ($cRow && !empty($cRow['senha_hash'])) {
                $cHash = trim($cRow['senha_hash']);
                foreach ($candidatos as $cand) {
                    if (password_verify($cand, $cHash) || $cand === $cHash || md5($cand) === $cHash) {
                        $senhaValida = true;
                        break;
                    }
                    if (str_starts_with($cHash, '$2y$') && password_verify($cand, str_replace('$2y$', '$2a$', $cHash))) {
                        $senhaValida = true;
                        break;
                    }
                }
            }
        } catch (Exception $e) {}
    }

    if (!$senhaValida) {
        jsonResponse(['sucesso' => false, 'erro' => 'Usuário ou senha inválidos.'], 401);
    }

    // Gera remember token (formato 64 caracteres hex)
    $token = bin2hex(random_bytes(32));
    try {
        $stmtToken = $pdo->prepare("UPDATE usuarios SET remember_token = :t, last_activity = NOW() WHERE id = :id");
        $stmtToken->execute([':t' => $token, ':id' => $user['id']]);

        // Grava no registro de logins (compatível com estrutura simples ou estendida)
        $ip = getClientIp();
        try {
            $stmtLog = $pdo->prepare("INSERT INTO registro_logins (usuario_id, ip) VALUES (:uid, :ip)");
            $stmtLog->execute([':uid' => $user['id'], ':ip' => $ip]);
        } catch (Exception $e1) {
            try {
                $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500);
                $stmtLog = $pdo->prepare("INSERT INTO registro_logins (usuario_id, ip, user_agent) VALUES (:uid, :ip, :ua)");
                $stmtLog->execute([':uid' => $user['id'], ':ip' => $ip, ':ua' => $ua]);
            } catch (Exception $e2) {}
        }
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

    $sql = "SELECT 
                u.id, 
                u.username, 
                u.nome, 
                u.email, 
                u.nivel_autoridade, 
                u.status_aprovacao, 
                u.data_cadastro,
                (SELECT MAX(r.data_login) FROM registro_logins r WHERE r.usuario_id = u.id) AS ultimo_login,
                (SELECT r.ip FROM registro_logins r WHERE r.usuario_id = u.id ORDER BY r.data_login DESC, r.id DESC LIMIT 1) AS ultimo_ip,
                (SELECT COUNT(*) FROM relatorios rel WHERE rel.usuario_id = u.id) AS total_relatorios
            FROM usuarios u";
    $params = [];

    if (!empty($busca)) {
        $sql .= " WHERE u.username LIKE :b1 OR u.nome LIKE :b2 OR u.email LIKE :b3";
        $params[':b1'] = "%{$busca}%";
        $params[':b2'] = "%{$busca}%";
        $params[':b3'] = "%{$busca}%";
    }

    $sql .= " ORDER BY u.data_cadastro DESC, u.id DESC";

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
    $usuarioId = $input['usuario_id'] ?? ($input['id'] ?? null);
    if (!$usuarioId) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID do usuário obrigatório.'], 400);
    }

    $campos = [];
    $params = [':id' => $usuarioId];

    if (isset($input['nome'])) {
        $campos[] = "nome = :nome";
        $params[':nome'] = trim((string)$input['nome']);
    }

    if (isset($input['username']) && trim((string)$input['username']) !== '') {
        $newU = trim((string)$input['username']);
        $stmtCheck = $pdo->prepare("SELECT id FROM usuarios WHERE username = :u AND id != :id LIMIT 1");
        $stmtCheck->execute([':u' => $newU, ':id' => $usuarioId]);
        if ($stmtCheck->fetchColumn()) {
            jsonResponse(['sucesso' => false, 'erro' => 'Este nome de usuário já está sendo utilizado por outro cadastro.'], 400);
        }
        $campos[] = "username = :username";
        $params[':username'] = $newU;
    }

    if (isset($input['email'])) {
        $campos[] = "email = :email";
        $params[':email'] = trim((string)$input['email']);
    }

    if (!empty($input['nova_senha'])) {
        $senhaLimpa = (string)$input['nova_senha'];
        if (strlen($senhaLimpa) < 4) {
            jsonResponse(['sucesso' => false, 'erro' => 'A senha deve conter no mínimo 4 caracteres.'], 400);
        }
        $campos[] = "senha = :senha";
        $params[':senha'] = password_hash($senhaLimpa, PASSWORD_DEFAULT);
    }

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

    try {
        $sql = "UPDATE usuarios SET " . implode(', ', $campos) . " WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

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

        jsonResponse(['sucesso' => true, 'mensagem' => 'Cadastro atualizado com sucesso!']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => 'Erro ao salvar alterações: ' . $e->getMessage()], 500);
    }
}

/**
 * Exclui um usuário do sistema
 */
function excluirUsuario(PDO $pdo, array $input): void {
    $usuarioId = !empty($input['usuario_id']) ? (int)$input['usuario_id'] : (!empty($input['id']) ? (int)$input['id'] : null);
    if (!$usuarioId) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID do usuário não informado.'], 400);
    }

    if ($usuarioId === 1) {
        jsonResponse(['sucesso' => false, 'erro' => 'A conta de coordenador principal (#1) não pode ser excluída.'], 403);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM usuarios WHERE id = :id");
        $stmt->execute([':id' => $usuarioId]);
        jsonResponse(['sucesso' => true, 'mensagem' => 'Usuário excluído com sucesso.']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => 'Erro ao excluir usuário: ' . $e->getMessage()], 500);
    }
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
