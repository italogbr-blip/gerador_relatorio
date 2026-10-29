<?php
/**
 * API - Configurações, Versões do App e Notificações (MySQL)
 */
require_once __DIR__ . '/db.php';

$pdo = getDatabaseConnection();
$input = getJsonInput();
$action = $_GET['action'] ?? ($input['action'] ?? 'obter_versao');

/**
 * Retorna o nome da tabela de versões ativa no banco
 */
function getTabelaVersao(PDO $pdo): string {
    static $tabela = null;
    if ($tabela !== null) return $tabela;
    try {
        $pdo->query("SELECT 1 FROM versao_app LIMIT 1");
        $tabela = 'versao_app';
    } catch (Exception $e) {
        $tabela = 'mms_versao_app';
    }
    return $tabela;
}

switch ($action) {
    case 'obter_versao':
        obterVersaoAtual($pdo);
        break;

    case 'listar_versoes':
        listarVersoes($pdo);
        break;

    case 'salvar_versao':
        salvarVersao($pdo, $input);
        break;

    case 'excluir_versao':
        excluirVersao($pdo, $input);
        break;

    case 'listar_notificacoes':
        listarNotificacoes($pdo);
        break;

    case 'salvar_notificacao':
        salvarNotificacao($pdo, $input);
        break;

    case 'excluir_notificacao':
        excluirNotificacao($pdo, $input);
        break;

    case 'obter_footer':
        obterConfigFooter($pdo);
        break;

    case 'salvar_footer':
        salvarConfigFooter($pdo, $input);
        break;

    case 'listar_empresas':
        listarEmpresas($pdo);
        break;

    case 'salvar_empresa':
        salvarEmpresa($pdo, $input);
        break;

    case 'excluir_empresa':
        excluirEmpresa($pdo, $input);
        break;

    default:
        jsonResponse(['sucesso' => false, 'erro' => 'Ação de configuração desconhecida.'], 400);
}

/**
 * Obtém a versão mais recente registrada no banco
 */
function obterVersaoAtual(PDO $pdo): void {
    $tabela = getTabelaVersao($pdo);
    try {
        $stmt = $pdo->query("SELECT * FROM {$tabela} ORDER BY id DESC LIMIT 1");
        $versao = $stmt->fetch();

        if ($versao) {
            jsonResponse([
                'sucesso' => true,
                'versao' => $versao['versao'],
                'obrigatoria' => (bool)$versao['obrigatoria'],
                'notas' => $versao['notas'] ?? ''
            ]);
        } else {
            jsonResponse([
                'sucesso' => true,
                'versao' => 'v1.0.0',
                'obrigatoria' => false,
                'notas' => ''
            ]);
        }
    } catch (Exception $e) {
        jsonResponse(['sucesso' => true, 'versao' => 'v1.0.0', 'obrigatoria' => false, 'notas' => '']);
    }
}

/**
 * Lista todas as versões cadastradas
 */
function listarVersoes(PDO $pdo): void {
    $tabela = getTabelaVersao($pdo);
    try {
        $stmt = $pdo->query("SELECT * FROM {$tabela} ORDER BY id DESC LIMIT 50");
        $versoes = $stmt->fetchAll();
        jsonResponse(['sucesso' => true, 'versoes' => $versoes]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => true, 'versoes' => []]);
    }
}

/**
 * Salva uma nova versão ou atualiza
 */
function salvarVersao(PDO $pdo, array $input): void {
    $versao = trim($input['versao'] ?? '');
    $notas = trim($input['notas'] ?? ($input['descricao'] ?? ''));
    $obrigatoria = !empty($input['obrigatoria']) ? 1 : 0;

    if (empty($versao)) {
        jsonResponse(['sucesso' => false, 'erro' => 'O campo versão é obrigatório.'], 400);
    }

    try {
        $tabela = getTabelaVersao($pdo);
        $stmt = $pdo->prepare("INSERT INTO {$tabela} (versao, obrigatoria, notas) VALUES (:v, :o, :n)");
        $stmt->execute([':v' => $versao, ':o' => $obrigatoria, ':n' => $notas]);
        $novoId = (int)$pdo->lastInsertId();

        // Tenta também sincronizar na tabela mms_versao_app caso ambas existam
        if ($tabela !== 'mms_versao_app') {
            try {
                $stmtLeg = $pdo->prepare("INSERT INTO mms_versao_app (versao, obrigatoria, notas) VALUES (:v, :o, :n)");
                $stmtLeg->execute([':v' => $versao, ':o' => $obrigatoria, ':n' => $notas]);
            } catch (Exception $e) {}
        }

        jsonResponse([
            'sucesso' => true,
            'id' => $novoId,
            'mensagem' => 'Versão registrada com sucesso.'
        ]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => 'Erro ao salvar versão.', 'detalhe' => $e->getMessage()], 500);
    }
}

/**
 * Exclui versão do app
 */
function excluirVersao(PDO $pdo, array $input): void {
    $idOrVersao = $input['id'] ?? ($input['versao'] ?? ($_GET['id'] ?? ''));
    if (empty($idOrVersao)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Identificador não fornecido.'], 400);
    }

    try {
        $tabela = getTabelaVersao($pdo);
        if (is_numeric($idOrVersao)) {
            $stmt = $pdo->prepare("DELETE FROM {$tabela} WHERE id = :id");
            $stmt->execute([':id' => (int)$idOrVersao]);
            try { $pdo->prepare("DELETE FROM mms_versao_app WHERE id = :id")->execute([':id' => (int)$idOrVersao]); } catch(Exception $e){}
        } else {
            $stmt = $pdo->prepare("DELETE FROM {$tabela} WHERE versao = :v");
            $stmt->execute([':v' => $idOrVersao]);
            try { $pdo->prepare("DELETE FROM mms_versao_app WHERE versao = :v")->execute([':v' => $idOrVersao]); } catch(Exception $e){}
        }
        jsonResponse(['sucesso' => true, 'mensagem' => 'Versão removida.']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => $e->getMessage()], 500);
    }
}

/**
 * Lista notificações ativas ou todas
 */
function listarNotificacoes(PDO $pdo): void {
    $apenasAtivas = !isset($_GET['todas']);

    try {
        $sql = "SELECT * FROM notificacoes";
        if ($apenasAtivas) {
            $sql .= " WHERE ativa = 1";
        }
        $sql .= " ORDER BY id DESC LIMIT 50";

        $stmt = $pdo->query($sql);
        $notificacoes = $stmt->fetchAll();

        jsonResponse([
            'sucesso' => true,
            'notificacoes' => $notificacoes
        ]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => true, 'notificacoes' => []]);
    }
}

/**
 * Salva nova notificação ou comunicado
 */
function salvarNotificacao(PDO $pdo, array $input): void {
    $titulo = trim($input['titulo'] ?? '');
    $mensagem = trim($input['mensagem'] ?? '');
    $tipo = trim($input['tipo'] ?? 'aviso');
    $ativa = isset($input['ativa']) ? (int)$input['ativa'] : 1;
    $regra = trim($input['regra_exibicao'] ?? 'sempre');
    $validade = (int)($input['validade_dias'] ?? 0);
    $mostrarFeedback = isset($input['mostrar_feedback']) ? (int)$input['mostrar_feedback'] : 1;

    if (empty($titulo) || empty($mensagem)) {
        jsonResponse(['sucesso' => false, 'erro' => 'Título e mensagem são obrigatórios.'], 400);
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO notificacoes 
            (titulo, mensagem, tipo, ativa, regra_exibicao, validade_dias, mostrar_feedback)
            VALUES 
            (:t, :m, :tp, :at, :re, :vd, :mf)
        ");
        $stmt->execute([
            ':t' => $titulo,
            ':m' => $mensagem,
            ':tp' => $tipo,
            ':at' => $ativa,
            ':re' => $regra,
            ':vd' => $validade,
            ':mf' => $mostrarFeedback
        ]);

        jsonResponse([
            'sucesso' => true,
            'id' => (int)$pdo->lastInsertId(),
            'mensagem' => 'Notificação publicada com sucesso.'
        ]);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => 'Erro ao salvar notificação.', 'detalhe' => $e->getMessage()], 500);
    }
}

/**
 * Exclui ou desativa uma notificação
 */
function excluirNotificacao(PDO $pdo, array $input): void {
    $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));
    if ($id <= 0) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID inválido.'], 400);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM notificacoes WHERE id = :id");
        $stmt->execute([':id' => $id]);
        jsonResponse(['sucesso' => true, 'mensagem' => 'Notificação excluída com sucesso.']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => $e->getMessage()], 500);
    }
}


/**
 * Obtém a configuração salva do rodapé (footer_config)
 */
function obterConfigFooter(PDO $pdo): void {
    try {
        $stmt = $pdo->prepare("SELECT valor FROM configuracoes WHERE chave = 'footer_config' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['valor'])) {
            $parsed = json_decode($row['valor'], true);
            jsonResponse(['sucesso' => true, 'config' => $parsed ?: []]);
        }
    } catch (Exception $e) {}
    jsonResponse(['sucesso' => true, 'config' => null]);
}

/**
 * Salva a configuração personalizada do rodapé
 */
function salvarConfigFooter(PDO $pdo, array $input): void {
    $config = $input['config'] ?? $input;
    if (is_array($config)) {
        unset($config['action']);
    }
    $json = json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    try {
        $stmt = $pdo->prepare("
            INSERT INTO configuracoes (chave, valor) VALUES ('footer_config', :val)
            ON DUPLICATE KEY UPDATE valor = :val2
        ");
        $stmt->execute([':val' => $json, ':val2' => $json]);
        jsonResponse(['sucesso' => true, 'mensagem' => 'Configuração do rodapé salva no MySQL com sucesso!']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => $e->getMessage()], 500);
    }
}

/**
 * Garante que a tabela empresas exista e tenha as empresas padrão
 */
function garantirTabelaEmpresas(PDO $pdo): void {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS empresas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(150) NOT NULL UNIQUE,
            ativa TINYINT(1) DEFAULT 1,
            data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Remove permanentemente do banco quaisquer empresas fictícias legadas
        $pdo->exec("DELETE FROM empresas WHERE UPPER(nome) LIKE '%ALPHA%' OR UPPER(nome) LIKE '%NEXUS%' OR UPPER(nome) LIKE '%OCEANIC%' OR UPPER(nome) LIKE '%SOLARIS%' OR UPPER(nome) LIKE '%VANGUARD%'");

        $count = (int)$pdo->query("SELECT COUNT(*) FROM empresas")->fetchColumn();
        if ($count === 0) {
            $defaultEmpresas = [
                'TECHNIP', 'DOF', 'TECHNIP/DOF', 'CONSTELLATION', 'ZONDA', 'OUTROS'
            ];
            $stmt = $pdo->prepare("INSERT IGNORE INTO empresas (nome, ativa) VALUES (:nome, 1)");
            foreach ($defaultEmpresas as $emp) {
                $stmt->execute([':nome' => $emp]);
            }
        }
    } catch (Exception $e) {}
}

/**
 * Lista todas as empresas cadastradas com total de relatórios gerados
 */
function listarEmpresas(PDO $pdo): void {
    garantirTabelaEmpresas($pdo);
    try {
        // Assegura limpeza de empresas fictícias
        $pdo->exec("DELETE FROM empresas WHERE UPPER(nome) LIKE '%ALPHA%' OR UPPER(nome) LIKE '%NEXUS%' OR UPPER(nome) LIKE '%OCEANIC%' OR UPPER(nome) LIKE '%SOLARIS%' OR UPPER(nome) LIKE '%VANGUARD%'");

        $sql = "
            SELECT 
                e.id, 
                e.nome, 
                e.ativa, 
                e.data_cadastro,
                (SELECT COUNT(*) FROM relatorios r WHERE UPPER(TRIM(r.empresa)) = UPPER(TRIM(e.nome))) AS total_relatorios
            FROM empresas e 
            WHERE UPPER(e.nome) NOT LIKE '%ALPHA%' 
              AND UPPER(e.nome) NOT LIKE '%NEXUS%' 
              AND UPPER(e.nome) NOT LIKE '%OCEANIC%' 
              AND UPPER(e.nome) NOT LIKE '%SOLARIS%' 
              AND UPPER(e.nome) NOT LIKE '%VANGUARD%'
            ORDER BY total_relatorios DESC, e.nome ASC
        ";
        $stmt = $pdo->query($sql);
        $empresas = $stmt ? $stmt->fetchAll() : [];
        foreach ($empresas as &$item) {
            $item['total_relatorios'] = isset($item['total_relatorios']) ? (int)$item['total_relatorios'] : 0;
            $item['ativa'] = (int)$item['ativa'];
            $item['id'] = (int)$item['id'];
        }
        jsonResponse(['sucesso' => true, 'empresas' => $empresas]);
    } catch (Exception $e) {
        try {
            $stmt = $pdo->query("SELECT id, nome, ativa, data_cadastro, 0 AS total_relatorios FROM empresas WHERE UPPER(nome) NOT LIKE '%ALPHA%' AND UPPER(nome) NOT LIKE '%NEXUS%' AND UPPER(nome) NOT LIKE '%OCEANIC%' AND UPPER(nome) NOT LIKE '%SOLARIS%' AND UPPER(nome) NOT LIKE '%VANGUARD%' ORDER BY nome ASC");
            $empresas = $stmt ? $stmt->fetchAll() : [];
            jsonResponse(['sucesso' => true, 'empresas' => $empresas]);
        } catch (Exception $e2) {
            jsonResponse(['sucesso' => false, 'empresas' => [], 'erro' => $e->getMessage()]);
        }
    }
}

/**
 * Salva ou atualiza uma empresa
 */
function salvarEmpresa(PDO $pdo, array $input): void {
    garantirTabelaEmpresas($pdo);
    $id = !empty($input['id']) ? (int)$input['id'] : null;
    $nome = trim((string)($input['nome'] ?? ''));
    $ativa = isset($input['ativa']) ? (int)$input['ativa'] : 1;

    if (empty($nome)) {
        jsonResponse(['sucesso' => false, 'erro' => 'O nome da empresa não pode ser vazio.'], 400);
    }

    try {
        if ($id) {
            $stmt = $pdo->prepare("UPDATE empresas SET nome = :nome, ativa = :ativa WHERE id = :id");
            $stmt->execute([':nome' => $nome, ':ativa' => $ativa, ':id' => $id]);
            jsonResponse(['sucesso' => true, 'mensagem' => 'Empresa atualizada com sucesso!']);
        } else {
            $stmtCheck = $pdo->prepare("SELECT id FROM empresas WHERE UPPER(TRIM(nome)) = UPPER(TRIM(:nome)) LIMIT 1");
            $stmtCheck->execute([':nome' => $nome]);
            if ($stmtCheck->fetchColumn()) {
                jsonResponse(['sucesso' => false, 'erro' => 'Já existe uma empresa cadastrada com este nome.'], 400);
            }
            $stmt = $pdo->prepare("INSERT INTO empresas (nome, ativa) VALUES (:nome, :ativa)");
            $stmt->execute([':nome' => $nome, ':ativa' => $ativa]);
            jsonResponse(['sucesso' => true, 'id' => (int)$pdo->lastInsertId(), 'mensagem' => 'Empresa cadastrada com sucesso!']);
        }
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => 'Erro ao salvar empresa: ' . $e->getMessage()], 500);
    }
}

/**
 * Exclui uma empresa
 */
function excluirEmpresa(PDO $pdo, array $input): void {
    garantirTabelaEmpresas($pdo);
    $id = !empty($input['id']) ? (int)$input['id'] : null;
    if (!$id) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID da empresa não informado.'], 400);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM empresas WHERE id = :id");
        $stmt->execute([':id' => $id]);
        jsonResponse(['sucesso' => true, 'mensagem' => 'Empresa excluída com sucesso!']);
    } catch (Exception $e) {
        jsonResponse(['sucesso' => false, 'erro' => 'Erro ao excluir empresa: ' . $e->getMessage()], 500);
    }
}
