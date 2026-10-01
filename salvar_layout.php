<?php
session_start();
if (!isset($_SESSION['usuario_id']) || $_SESSION['nivel_autoridade'] != 2) {
    echo json_encode(['sucesso' => false, 'erro' => 'Acesso negado.']);
    exit;
}
if (empty($_SESSION['coord_panel_unlocked'])) {
    echo json_encode(['sucesso' => false, 'erro' => 'Painel não desbloqueado.']);
    exit;
}

require 'mms_config.php';

header('Content-Type: application/json');

$dadosBrutos = file_get_contents("php://input");
$dados = json_decode($dadosBrutos, true);

if (!$dados) {
    echo json_encode(['sucesso' => false, 'erro' => 'Dados inválidos.']);
    exit;
}

// Campos permitidos e seus tipos
$camposPermitidos = [
    'margem_topo'          => 'int',
    'margem_base'          => 'int',
    'margem_lateral'       => 'int',
    'margem_esq'           => 'int',
    'logo_topo'            => 'int',
    'logo_esq'             => 'int',
    'logo_largura'         => 'int',
    'logo_altura'          => 'int',
    'titulo_margem_topo'   => 'int',
    'titulo_margem_base'   => 'int',
    'titulo_tamanho'       => 'int',
    'titulo_sublinhado'    => 'string',
    'fonte_tamanho'        => 'int',
    'linha_altura'         => 'float',
    'espacamento_rows'     => 'int',
    'pax_col_esq_width'    => 'int',
    'pax_separador_cor'    => 'string',
    'pax_separador_esp'    => 'string',
    'pax_padding_direita'  => 'int',
    'pax_padding_esquerda' => 'int',
    'rodape_bottom'        => 'int',
    'rodape_tamanho'       => 'int',
];

$configLimpa = [];
foreach ($camposPermitidos as $campo => $tipo) {
    if (isset($dados[$campo])) {
        $val = $dados[$campo];
        if ($tipo === 'int')   $configLimpa[$campo] = (int)$val;
        if ($tipo === 'float') $configLimpa[$campo] = (float)$val;
        if ($tipo === 'string') $configLimpa[$campo] = htmlspecialchars(strip_tags((string)$val));
    }
}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS layout_relatorio (
        id INT PRIMARY KEY DEFAULT 1,
        config_json TEXT NOT NULL,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    $stmt = $pdo->prepare("INSERT INTO layout_relatorio (id, config_json) VALUES (1, ?)
                           ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)");
    $stmt->execute([json_encode($configLimpa, JSON_UNESCAPED_UNICODE)]);

    // Limpa cache de PDFs para que sejam regenerados com o novo layout
    $stmtLimpa = $pdo->prepare("UPDATE relatorios SET pdf_url = NULL");
    $stmtLimpa->execute();
    $qtdLimpos = $stmtLimpa->rowCount();

    echo json_encode([
        'sucesso' => true,
        'mensagem' => 'Layout salvo com sucesso.',
        'cache_limpo' => $qtdLimpos
    ]);
} catch (Exception $e) {
    echo json_encode(['sucesso' => false, 'erro' => $e->getMessage()]);
}
