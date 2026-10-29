<?php
/**
 * API - Relatórios (MySQL)
 */
require_once __DIR__ . '/db.php';

$pdo = getDatabaseConnection();
$input = getJsonInput();
$action = $_GET['action'] ?? ($input['action'] ?? 'listar');

switch ($action) {
    case 'salvar':
        salvarRelatorio($pdo, $input);
        break;

    case 'listar':
        listarRelatorios($pdo, $input);
        break;

    case 'obter':
        obterRelatorio($pdo, $input);
        break;

    case 'excluir':
        excluirRelatorio($pdo, $input);
        break;

    case 'estatisticas':
        obterEstatisticas($pdo, $input);
        break;

    case 'rankings':
        obterRankings($pdo);
        break;

    default:
        jsonResponse(['sucesso' => false, 'erro' => 'Ação de relatórios desconhecida.'], 400);
}

/**
 * Salva novo relatório ou atualiza existente
 */
function salvarRelatorio(PDO $pdo, array $input): void {
    $id = !empty($input['id']) ? (int)$input['id'] : null;
    $usuarioId = !empty($input['usuario_id']) ? (int)$input['usuario_id'] : null;
    $empresa = trim($input['empresa'] ?? ($input['grupo'] ?? 'OUTROS'));
    $unidade = trim($input['unidade'] ?? 'N/A');
    $local = trim($input['local_atendimento'] ?? ($input['local'] ?? 'N/A'));
    $pdfUrl = trim($input['pdf_url'] ?? '');
    $teveAnexo = !empty($input['teve_anexo']) || !empty($input['fotos']) ? 1 : 0;
    $ipOrigem = getClientIp();

    $dadosJson = $input['dados_json'] ?? null;
    if (is_array($dadosJson)) {
        $dadosJson = json_encode($dadosJson, JSON_UNESCAPED_UNICODE);
    } elseif (!is_string($dadosJson)) {
        // Se vier direto os campos do formulário no próprio input
        $dadosJson = json_encode($input, JSON_UNESCAPED_UNICODE);
    }

    try {
        if ($id && $id > 0) {
            // Atualização de relatório existente
            $stmt = $pdo->prepare("
                UPDATE relatorios 
                SET empresa = :empresa,
                    unidade = :unidade,
                    local_atendimento = :local,
                    dados_json = :dados_json,
                    teve_anexo = :teve_anexo,
                    pdf_url = COALESCE(NULLIF(:pdf_url, ''), pdf_url)
                WHERE id = :id
            ");
            $stmt->execute([
                ':empresa' => $empresa,
                ':unidade' => $unidade,
                ':local' => $local,
                ':dados_json' => $dadosJson,
                ':teve_anexo' => $teveAnexo,
                ':pdf_url' => $pdfUrl,
                ':id' => $id
            ]);

            jsonResponse([
                'sucesso' => true,
                'id' => $id,
                'mensagem' => 'Relatório atualizado com sucesso.'
            ]);
        } else {
            // Inserção de novo relatório
            $stmt = $pdo->prepare("
                INSERT INTO relatorios 
                (usuario_id, empresa, unidade, local_atendimento, pdf_url, dados_json, teve_anexo, ip_origem)
                VALUES 
                (:usuario_id, :empresa, :unidade, :local, :pdf_url, :dados_json, :teve_anexo, :ip_origem)
            ");
            $stmt->execute([
                ':usuario_id' => $usuarioId,
                ':empresa' => $empresa,
                ':unidade' => $unidade,
                ':local' => $local,
                ':pdf_url' => $pdfUrl,
                ':dados_json' => $dadosJson,
                ':teve_anexo' => $teveAnexo,
                ':ip_origem' => $ipOrigem
            ]);

            $novoId = (int)$pdo->lastInsertId();

            jsonResponse([
                'sucesso' => true,
                'id' => $novoId,
                'mensagem' => 'Relatório salvo com sucesso.'
            ]);
        }
    } catch (Exception $e) {
        jsonResponse([
            'sucesso' => false,
            'erro' => 'Erro ao salvar relatório no banco de dados.',
            'detalhe' => $e->getMessage()
        ], 500);
    }
}

/**
 * Lista relatórios com suporte a filtros, busca e paginação
 */
function listarRelatorios(PDO $pdo, array $input): void {
    $usuarioId = $_GET['usuario_id'] ?? ($input['usuario_id'] ?? null);
    $empresa = trim($_GET['empresa'] ?? ($input['empresa'] ?? ''));
    $unidade = trim($_GET['unidade'] ?? ($input['unidade'] ?? ''));
    $busca = trim($_GET['busca'] ?? ($input['busca'] ?? ''));
    $dataInicio = trim($_GET['data_inicio'] ?? ($input['data_inicio'] ?? ''));
    $dataFim = trim($_GET['data_fim'] ?? ($input['data_fim'] ?? ''));

    $pagina = max(1, (int)($_GET['pagina'] ?? ($input['pagina'] ?? 1)));
    $limite = min(200, max(1, (int)($_GET['limite'] ?? ($input['limite'] ?? 50))));
    $offset = ($pagina - 1) * $limite;

    $where = [];
    $params = [];

    if (!empty($usuarioId) && $usuarioId != 'all') {
        $where[] = "r.usuario_id = :usuario_id";
        $params[':usuario_id'] = (int)$usuarioId;
    }

    if (!empty($empresa) && $empresa !== 'ALL' && $empresa !== 'TODOS') {
        $where[] = "r.empresa = :empresa";
        $params[':empresa'] = $empresa;
    }

    if (!empty($unidade) && $unidade !== 'ALL' && $unidade !== 'TODOS') {
        $where[] = "r.unidade = :unidade";
        $params[':unidade'] = $unidade;
    }

    if (!empty($busca)) {
        $where[] = "(r.unidade LIKE :b1 OR r.local_atendimento LIKE :b2 OR r.empresa LIKE :b3 OR u.nome LIKE :b4 OR u.username LIKE :b5)";
        $params[':b1'] = "%{$busca}%";
        $params[':b2'] = "%{$busca}%";
        $params[':b3'] = "%{$busca}%";
        $params[':b4'] = "%{$busca}%";
        $params[':b5'] = "%{$busca}%";
    }

    if (!empty($dataInicio)) {
        $where[] = "r.data_criacao >= :data_inicio";
        $params[':data_inicio'] = $dataInicio . ' 00:00:00';
    }

    if (!empty($dataFim)) {
        $where[] = "r.data_criacao <= :data_fim";
        $params[':data_fim'] = $dataFim . ' 23:59:59';
    }

    $whereSql = count($where) > 0 ? "WHERE " . implode(' AND ', $where) : "";

    // Contagem total
    $stmtCount = $pdo->prepare("SELECT COUNT(*) as total FROM relatorios r LEFT JOIN usuarios u ON u.id = r.usuario_id {$whereSql}");
    $stmtCount->execute($params);
    $total = (int)$stmtCount->fetchColumn();

    // Consulta de registros
    $sql = "
        SELECT 
            r.id,
            r.usuario_id,
            r.empresa,
            r.unidade,
            r.local_atendimento,
            r.pdf_url,
            r.dados_json,
            r.teve_anexo,
            r.ip_origem,
            r.data_criacao,
            u.nome as preposto_nome,
            u.username as preposto_username
        FROM relatorios r
        LEFT JOIN usuarios u ON u.id = r.usuario_id
        {$whereSql}
        ORDER BY r.data_criacao DESC, r.id DESC
        LIMIT {$limite} OFFSET {$offset}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $relatorios = $stmt->fetchAll();

    jsonResponse([
        'sucesso' => true,
        'relatorios' => $relatorios,
        'total' => $total,
        'pagina' => $pagina,
        'limite' => $limite
    ]);
}

/**
 * Obtém detalhes completos de um relatório por ID
 */
function obterRelatorio(PDO $pdo, array $input): void {
    $id = (int)($_GET['id'] ?? ($input['id'] ?? 0));
    if ($id <= 0) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID inválido.'], 400);
    }

    $stmt = $pdo->prepare("
        SELECT 
            r.*,
            u.nome as preposto_nome,
            u.username as preposto_username
        FROM relatorios r
        LEFT JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.id = :id
        LIMIT 1
    ");
    $stmt->execute([':id' => $id]);
    $relatorio = $stmt->fetch();

    if (!$relatorio) {
        jsonResponse(['sucesso' => false, 'erro' => 'Relatório não encontrado.'], 404);
    }

    jsonResponse([
        'sucesso' => true,
        'relatorio' => $relatorio
    ]);
}

/**
 * Exclui relatório por ID
 */
function excluirRelatorio(PDO $pdo, array $input): void {
    $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));
    if ($id <= 0) {
        jsonResponse(['sucesso' => false, 'erro' => 'ID de relatório inválido.'], 400);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM relatorios WHERE id = :id");
        $stmt->execute([':id' => $id]);

        jsonResponse([
            'sucesso' => true,
            'mensagem' => 'Relatório excluído com sucesso.'
        ]);
    } catch (Exception $e) {
        jsonResponse([
            'sucesso' => false,
            'erro' => 'Falha ao excluir relatório.',
            'detalhe' => $e->getMessage()
        ], 500);
    }
}

/**
 * Retorna estatísticas de relatórios para o painel de coordenação
 */
function obterEstatisticas(PDO $pdo, array $input): void {
    $hoje = date('Y-m-d');
    $primeiroDiaMes = date('Y-m-01');

    try {
        // Total geral
        $stmtTotal = $pdo->query("SELECT COUNT(*) FROM relatorios");
        $totalGeral = (int)$stmtTotal->fetchColumn();

        // Total hoje
        $stmtHoje = $pdo->prepare("SELECT COUNT(*) FROM relatorios WHERE data_criacao >= :h");
        $stmtHoje->execute([':h' => $hoje . ' 00:00:00']);
        $totalHoje = (int)$stmtHoje->fetchColumn();

        // Total mês atual
        $stmtMes = $pdo->prepare("SELECT COUNT(*) FROM relatorios WHERE data_criacao >= :m");
        $stmtMes->execute([':m' => $primeiroDiaMes . ' 00:00:00']);
        $totalMes = (int)$stmtMes->fetchColumn();

        // Por empresa
        $stmtEmpresas = $pdo->query("
            SELECT COALESCE(NULLIF(empresa, ''), 'OUTROS') as empresa, COUNT(*) as qtd
            FROM relatorios
            GROUP BY empresa
            ORDER BY qtd DESC
        ");
        $porEmpresa = $stmtEmpresas->fetchAll();

        // Top Unidades
        $stmtUnidades = $pdo->query("
            SELECT COALESCE(NULLIF(unidade, ''), 'N/A') as unidade, COUNT(*) as qtd
            FROM relatorios
            GROUP BY unidade
            ORDER BY qtd DESC
            LIMIT 10
        ");
        $porUnidade = $stmtUnidades->fetchAll();

        jsonResponse([
            'sucesso' => true,
            'estatisticas' => [
                'total_geral' => $totalGeral,
                'total_hoje' => $totalHoje,
                'total_mes' => $totalMes,
                'por_empresa' => $porEmpresa,
                'por_unidade' => $porUnidade
            ]
        ]);
    } catch (Exception $e) {
        jsonResponse([
            'sucesso' => false,
            'erro' => 'Erro ao calcular estatísticas.',
            'detalhe' => $e->getMessage()
        ], 500);
    }
}


/**
 * Retorna o Ranking Completo de Prepostos e Empresas com números reais de toda a base ou filtrado por período
 */
function obterRankings(PDO $pdo): void {
    try {
        $periodo = trim($_GET['periodo'] ?? ''); // '2026-10', '2026-05', etc., ou 'todos'
        $mes = isset($_GET['mes']) ? (int)$_GET['mes'] : 0;
        $ano = isset($_GET['ano']) ? (int)$_GET['ano'] : 0;

        if (!empty($periodo) && preg_match('/^(\d{4})-(\d{1,2})$/', $periodo, $m)) {
            $ano = (int)$m[1];
            $mes = (int)$m[2];
        }

        $temFiltroData = ($ano >= 2000 && $mes >= 1 && $mes <= 12);
        $whereEmp = "";
        $wherePrep = "";
        $params = [];

        if ($temFiltroData) {
            $dtInicio = sprintf('%04d-%02d-01 00:00:00', $ano, $mes);
            $dtFim = date('Y-m-t 23:59:59', strtotime($dtInicio));
            $whereEmp = "WHERE data_criacao >= :dt1 AND data_criacao <= :dt2";
            $wherePrep = "WHERE r.data_criacao >= :dt1 AND r.data_criacao <= :dt2";
            $params = [
                ':dt1' => $dtInicio,
                ':dt2' => $dtFim
            ];
        }

        // 1. Ranking de Empresas (Direto via SQL agrupado)
        $sqlEmp = "
            SELECT 
                COALESCE(NULLIF(TRIM(empresa), ''), 'OUTROS') AS empresa, 
                COUNT(*) AS total
            FROM relatorios
            {$whereEmp}
            GROUP BY COALESCE(NULLIF(TRIM(empresa), ''), 'OUTROS')
            ORDER BY total DESC
        ";
        $stmtEmp = $pdo->prepare($sqlEmp);
        $stmtEmp->execute($params);
        $empresas = $stmtEmp ? $stmtEmp->fetchAll() : [];

        // 2. Ranking de Prepostos (Processa relatórios para totalização fiel)
        $sqlPrep = "
            SELECT 
                r.id, 
                r.usuario_id, 
                COALESCE(NULLIF(TRIM(r.empresa), ''), 'OUTROS') AS empresa, 
                r.ip_origem, 
                r.dados_json,
                u.nome AS user_nome,
                u.username AS user_username
            FROM relatorios r
            LEFT JOIN usuarios u ON u.id = r.usuario_id
            {$wherePrep}
            ORDER BY r.id DESC
        ";
        $stmtPrep = $pdo->prepare($sqlPrep);
        $stmtPrep->execute($params);
        $rows = $stmtPrep ? $stmtPrep->fetchAll() : [];

        $mapaPrepostos = [];
        foreach ($rows as $r) {
            $nomePreposto = null;
            if (!empty($r['dados_json'])) {
                $parsed = json_decode($r['dados_json'], true);
                if (is_array($parsed)) {
                    $rawPrep = $parsed['preposto'] ?? ($parsed['nome_preposto'] ?? ($parsed['preposto_nome'] ?? ($parsed['responsavel'] ?? '')));
                    if (is_string($rawPrep) && trim($rawPrep) !== '') {
                        $cand = trim($rawPrep);
                        $candUpper = strtoupper($cand);
                        if ($candUpper !== 'N/A' && $candUpper !== 'NULL' && $candUpper !== 'UNDEFINED') {
                            $nomePreposto = $cand;
                        }
                    }
                }
            }

            if (!$nomePreposto) {
                if (!empty($r['user_nome']) && trim($r['user_nome']) !== '') {
                    $nomePreposto = trim($r['user_nome']);
                } elseif (!empty($r['user_username']) && trim($r['user_username']) !== '') {
                    $nomePreposto = trim($r['user_username']);
                } elseif (!empty($r['ip_origem']) && $r['ip_origem'] !== 'N/A' && $r['ip_origem'] !== '127.0.0.1') {
                    $nomePreposto = '🌐 IP: ' . $r['ip_origem'];
                } else {
                    $nomePreposto = 'Preposto não identificado';
                }
            }

            $emp = $r['empresa'];
            if (!isset($mapaPrepostos[$nomePreposto])) {
                $mapaPrepostos[$nomePreposto] = [
                    'nome' => $nomePreposto,
                    'total' => 0,
                    'ultimaEmpresa' => $emp
                ];
            }
            $mapaPrepostos[$nomePreposto]['total'] += 1;
            if ($emp !== 'OUTROS') {
                $mapaPrepostos[$nomePreposto]['ultimaEmpresa'] = $emp;
            }
        }

        $rankingPrepostos = array_values($mapaPrepostos);
        usort($rankingPrepostos, fn($a, $b) => $b['total'] <=> $a['total']);

        jsonResponse([
            'sucesso' => true,
            'periodo' => $temFiltroData ? sprintf('%04d-%02d', $ano, $mes) : 'todos',
            'ranking_empresas' => $empresas,
            'ranking_prepostos' => $rankingPrepostos,
            'total_relatorios' => count($rows)
        ]);
    } catch (Exception $e) {
        jsonResponse([
            'sucesso' => false,
            'erro' => 'Falha ao processar rankings: ' . $e->getMessage()
        ], 500);
    }
}