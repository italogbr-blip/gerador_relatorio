<?php
// Desativa exibição de erros que podem corromper o PDF
ini_set('display_errors', 0);
error_reporting(0);

// Aumenta limites para geração de PDFs complexos
ini_set('memory_limit', '512M');
set_time_limit(120);

ob_start();
session_start();

// require 'mms_config.php' movido para baixo de session_start
require 'mms_config.php';
require_once __DIR__ . '/dompdf/autoload.inc.php';
use Dompdf\Dompdf;
use Dompdf\Options;

require_once __DIR__ . '/mms_layout.php'; // Adiciona carregamento do layout

$id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;
$file = isset($_GET['file']) ? trim($_GET['file']) : null;

if (!$id && !$file) { 
    ob_end_clean();
    die("Parâmetro inválido."); 
}

if ($file) {
    // Modo de download por arquivo direto (para visitantes ou relatórios recém gerados sem ID)
    // Proteção rigorosa contra path traversal
    $file = basename($file);
    $caminhoCompleto = __DIR__ . '/relatorios_pdf/' . $file;
    
    if (file_exists($caminhoCompleto)) {
        if (ob_get_length()) ob_end_clean();
        header('Content-Type: application/pdf');
        $nomeAmigavel = isset($_GET['name']) ? basename($_GET['name']) : $file;
        header('Content-Disposition: attachment; filename="' . $nomeAmigavel . '"');
        header('Content-Length: ' . filesize($caminhoCompleto));
        readfile($caminhoCompleto);
        exit;
    } else {
        ob_end_clean();
        die("Arquivo não encontrado.");
    }
}

$stmt = $pdo->prepare("SELECT * FROM relatorios WHERE id = ?");
$stmt->execute([$id]);
$relatorio = $stmt->fetch();

if (!$relatorio) { 
    ob_end_clean();
    die("Relatório não encontrado."); 
}

// TRAVA DE SEGURANÇA (IDOR): Apenas o dono do relatório ou Coordenador (nível 2) podem baixar
if ($_SESSION['nivel_autoridade'] != 2 && $relatorio['usuario_id'] != $_SESSION['usuario_id']) {
    ob_end_clean();
    die("Acesso negado. Você não tem permissão para baixar este relatório.");
}

// Garante que a pasta existe
if (!is_dir(__DIR__ . '/relatorios_pdf')) {
    mkdir(__DIR__ . '/relatorios_pdf', 0755, true);
}

// 1. VERIFICAR SE JÁ EXISTE O ARQUIVO NO BANCO E NO DISCO
if (!empty($relatorio['pdf_url'])) {
    $caminhoCompleto = __DIR__ . '/' . $relatorio['pdf_url'];
    if (file_exists($caminhoCompleto)) {
        if (ob_get_length()) ob_end_clean();
        header('Content-Type: application/pdf');
        
        // Define o nome do arquivo amigável: NOME_EMPRESA_DATA
        $unidadeRaw = $dados['unidade'] ?? 'MMS';
        $unidadeClean = strtoupper(trim(preg_replace('/\s+/', '_', $unidadeRaw)));
        $dataRaw = $dados['data'] ?? date('Y-m-d');
        $partesData = explode('-', $dataRaw);
        $dataFormatada = count($partesData) === 3 ? "{$partesData[2]}-{$partesData[1]}-{$partesData[0]}" : $dataRaw;
        $nomeArquivoDownload = "{$unidadeClean}_{$dataFormatada}.pdf";

        header('Content-Disposition: attachment; filename="' . $nomeArquivoDownload . '"');
        header('Content-Length: ' . filesize($caminhoCompleto));
        readfile($caminhoCompleto);
        exit;
    }
}

// 2. SE NÃO EXISTIR, GERA UM NOVO (IGUAL AO SALVAR_RELATORIO.PHP)
$dados = json_decode($relatorio['dados_json'], true);

$options = new Options();
$options->set('isRemoteEnabled', true);
$options->set('isHtml5ParserEnabled', true);
$dompdf = new Dompdf($options);

// Extração de dados
$unidade = htmlspecialchars($dados['unidade'] ?? 'N/A');
$data = htmlspecialchars($dados['data'] ?? 'N/A');
$partesData = explode('-', $data);
$dataFormatada = count($partesData) === 3 ? "{$partesData[2]}/{$partesData[1]}/{$partesData[0]}" : $data;
$local = htmlspecialchars($dados['local'] ?? 'N/A');
$modal = htmlspecialchars($dados['modal'] ?? 'N/A');
$preposto = htmlspecialchars($dados['preposto'] ?? 'N/A');

// Tratamento de Texto (Igual ao salvar_relatorio.php)
$info_bruto = $dados['info_troca'] ?? 'N/A';
$info_bruto = str_ireplace(['<div>', '<p>'], '<br>', $info_bruto);
$info_bruto = str_ireplace(['</div>', '</p>'], '', $info_bruto);
$info = strip_tags($info_bruto, '<b><i><u><br><strong><em><ul><li><ol>');
$info = str_replace('▪', '&bull;', $info);
$info = preg_replace('/^(<br\s*\/?>)+/i', '', $info);
$info = preg_replace('/(<br\s*\/?>)+$/i', '', $info);
$info = preg_replace('/(<br\s*\/?>){3,}/i', '<br><br>', $info);

if (trim($info) === '') {
    $info = 'N/A';
}

$saidasHTML = '';
if (isset($dados['horarios']['saida_hotel']) && is_array($dados['horarios']['saida_hotel'])) {
    foreach ($dados['horarios']['saida_hotel'] as $saida) {
        $h1 = htmlspecialchars($saida['h1'] ?? ''); $m1 = htmlspecialchars($saida['m1'] ?? '');
        $h2 = htmlspecialchars($saida['h2'] ?? ''); $m2 = htmlspecialchars($saida['m2'] ?? '');
        $l1 = htmlspecialchars($saida['label1'] ?? 'Previsto');
        $l2 = htmlspecialchars($saida['label2'] ?? 'Real');
        $saidasHTML .= "<div style='margin-bottom: 4px;'><span style='font-weight:bold;'>{$l1}:</span> {$h1} h {$m1} min &nbsp;&nbsp;&nbsp;&nbsp; <span style='font-weight:bold;'>{$l2}:</span> {$h2} h {$m2} min</div>";
    }
} else {
    $saidasHTML = "N/A";
}

$embPrev = htmlspecialchars($dados['horarios']['embarque_previsto'] ?? 'N/A');
$embPrevFormatado = $embPrev !== 'N/A' ? str_replace(':', ' h ', $embPrev) . ' min' : 'N/A';
$embReal = htmlspecialchars($dados['horarios']['embarque_real'] ?? 'N/A');
$embRealFormatado = $embReal !== 'N/A' ? str_replace(':', ' h ', $embReal) . ' min' : 'N/A';
$atInicio = htmlspecialchars($dados['horarios']['atendimento_inicio'] ?? 'N/A');
$atInicioFormatado = $atInicio !== 'N/A' ? str_replace(':', ' h ', $atInicio) . ' min' : 'N/A';
$atFim = htmlspecialchars($dados['horarios']['atendimento_fim'] ?? 'N/A');
$atFimFormatado = $atFim !== 'N/A' ? str_replace(':', ' h ', $atFim) . ' min' : 'N/A';

$pax1_bruto = htmlspecialchars($dados['pax_embarcando'] ?? 'N/A');
$pax1_bruto = preg_replace('/\*(.*?)\*/', '<b>$1</b>', $pax1_bruto);
$pax1 = nl2br($pax1_bruto);
$pax2_bruto = htmlspecialchars($dados['pax_desembarcando'] ?? 'N/A');
$pax2_bruto = preg_replace('/\*(.*?)\*/', '<b>$1</b>', $pax2_bruto);
$pax2 = nl2br($pax2_bruto);

$fotosHTML = '';
if (!empty($dados['fotos']) && is_array($dados['fotos'])) {
    foreach ($dados['fotos'] as $foto) {
        $titulo = htmlspecialchars($foto['titulo'] ?? 'ANEXO FOTOGRÁFICO');
        $src = htmlspecialchars($foto['base64'] ?? '');
        if ($src) {
            $fotosHTML .= "
                <div style='page-break-before: always; position: relative; page-break-inside: avoid;'>
                    <div style='padding-top: 10px; text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 10px; text-decoration: underline;'>{$titulo}</div>
                    <div style='text-align: center; width: 100%;'>
                        <img src='{$src}' style='max-width: 100%; max-height: 650px; object-fit: contain; border-radius: 4px;' />
                    </div>
                </div>";
        }
    }
}

$logoPath = __DIR__ . '/images/logo.png';
$logoBase64 = file_exists($logoPath) ? 'data:image/png;base64,' . base64_encode(file_get_contents($logoPath)) : '';
$bgPath = __DIR__ . '/images/background.png';
$bgBase64 = file_exists($bgPath) ? 'data:image/png;base64,' . base64_encode(file_get_contents($bgPath)) : '';

$varsHtml = [
    'data' => $data,
    'dataFormatada' => $dataFormatada,
    'local' => $local,
    'modal' => $modal,
    'saidasHTML' => $saidasHTML,
    'embPrevFormatado' => $embPrevFormatado,
    'embRealFormatado' => $embRealFormatado,
    'atInicioFormatado' => $atInicioFormatado,
    'atFimFormatado' => $atFimFormatado,
    'preposto' => $preposto,
    'info' => $info,
    'pax1' => $pax1,
    'pax2' => $pax2,
    'fotosHTML' => $fotosHTML,
    'unidade' => $unidade,
    'editado_por_admin' => $dados['editado_por_admin'] ?? ''
];

$html = gerarHtmlPdf($bgBase64, $logoBase64, $varsHtml);

$dompdf->loadHtml($html);
$dompdf->setPaper('A4', 'portrait');
$dompdf->render();

$pdfOutput = $dompdf->output();

if (empty($pdfOutput)) {
    ob_end_clean();
    die("Erro ao gerar o PDF. O conteúdo está vazio.");
}
$unidadeClean = strtoupper(trim(preg_replace('/\s+/', '_', $unidade)));
$nomeArquivoPDF = "{$unidadeClean}_{$dataFormatada}.pdf";
$nomeArquivoPDF = str_replace('/', '-', $nomeArquivoPDF);

// Limpa e encerra QUALQUER buffer de saída para garantir integridade total do binário
while (ob_get_level()) {
    ob_end_clean();
}

// Força o encerramento do buffer de saída do sistema, se houver
if (function_exists('header_remove')) {
    header_remove('X-Powered-By');
}

// Configurações de header para compatibilidade máxima (incluindo Mobile)
header('Content-Description: File Transfer');
header('Content-Type: application/pdf');
// RFC 6266: Suporte a nomes de arquivos com caracteres especiais em todos os browsers
header('Content-Disposition: attachment; filename="' . $nomeArquivoPDF . '"; filename*=UTF-8\'\'' . rawurlencode($nomeArquivoPDF));
header('Content-Transfer-Encoding: binary');
header('Expires: 0');
header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
header('Pragma: public');
header('Content-Length: ' . strlen($pdfOutput));
header('Connection: close');

echo $pdfOutput;
exit;
