<?php
// exportar.php - Exporta relatórios em CSV ou PDF (usando FPDF)
// Recebe via GET ou POST: data_inicio, data_fim, usuarios[] (ids), formato (csv|pdf)

require __DIR__ . '/mms_config.php';

header('Content-Type: text/plain; charset=UTF-8'); // fallback

$data_inicio = $_GET['data_inicio'] ?? '';
$data_fim = $_GET['data_fim'] ?? '';
$usuarios = $_GET['usuarios'] ?? [];
$formato = $_GET['formato'] ?? 'csv';

$where = [];
$params = [];
if ($data_inicio) { $where[] = "data_criacao >= ?"; $params[] = $data_inicio . " 00:00:00"; }
if ($data_fim)   { $where[] = "data_criacao <= ?"; $params[] = $data_fim . " 23:59:59"; }
if (!empty($usuarios)) { $placeholders = implode(',', array_fill(0, count($usuarios), '?')); $where[] = "usuario_id IN ($placeholders)"; $params = array_merge($params, $usuarios); }

$sql = "SELECT r.id, r.unidade, r.empresa, r.data_criacao, u.nome AS autor_nome, u.username AS autor_user FROM relatorios r LEFT JOIN usuarios u ON r.usuario_id = u.id";
if ($where) $sql .= " WHERE " . implode(' AND ', $where);
$sql .= " ORDER BY r.data_criacao DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (strtolower($formato) === 'pdf') {
    // gera PDF usando FPDF (library must be available)
    require_once __DIR__ . '/vendor/fpdf/fpdf.php'; // ajuste caminho se necessário
    $pdf = new FPDF();
    $pdf->AddPage();
    $pdf->SetFont('Arial','B',12);
    $pdf->Cell(0,10,'Exportação de Relatórios',0,1,'C');
    $pdf->SetFont('Arial','',10);
    foreach ($rows as $r) {
        $line = "{$r['id']} | {$r['unidade']} | {$r['empresa']} | {$r['data_criacao']} | {$r['autor_nome']} ({$r['autor_user']})";
        $pdf->Cell(0,6,$line,0,1);
    }
    $pdf->Output('D', 'relatorios_export.pdf');
    exit();
}

// CSV padrão
header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="relatorios_export.csv"');
$output = fopen('php://output', 'w');
// Cabeçalho CSV
fputcsv($output, ['ID','Unidade','Empresa','Data Criação','Autor Nome','Autor Usuário']);
foreach ($rows as $r) {
    fputcsv($output, [$r['id'],$r['unidade'],$r['empresa'],$r['data_criacao'],$r['autor_nome'],$r['autor_user']]);
}
fclose($output);
?>
