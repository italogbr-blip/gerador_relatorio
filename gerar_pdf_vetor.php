<?php
// gerar_pdf_vetor.php - Endpoint dedicado para geração de PDF 100% Vetorial via DomPDF
ini_set('display_errors', 0);
error_reporting(0);
ini_set('memory_limit', '512M');
set_time_limit(120);

// Configuração completa de CORS para o webapp e requisições externas
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/dompdf/autoload.inc.php';
use Dompdf\Dompdf;
use Dompdf\Options;

require_once __DIR__ . '/mms_layout.php';

$dadosBrutos = file_get_contents("php://input");
$dados = json_decode($dadosBrutos, true);

if (!$dados && isset($_POST['dados_json'])) {
    $dados = json_decode($_POST['dados_json'], true);
}

if (!$dados || !isset($dados['unidade'])) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => 'Dados do relatório não fornecidos ou inválidos.']);
    exit;
}

try {
    $options = new Options();
    $options->set('isRemoteEnabled', true);
    $options->set('isHtml5ParserEnabled', true);
    $dompdf = new Dompdf($options);

    $unidade = htmlspecialchars($dados['unidade'] ?? 'N/A');
    $data = htmlspecialchars($dados['data'] ?? 'N/A');
    $partesData = explode('-', $data);
    $dataFormatada = count($partesData) === 3 ? "{$partesData[2]}/{$partesData[1]}/{$partesData[0]}" : $data;
    $local = htmlspecialchars($dados['local'] ?? 'N/A');
    $modal = htmlspecialchars($dados['modal'] ?? 'Helicóptero');
    $preposto = htmlspecialchars($dados['preposto'] ?? 'N/A');

    $info_bruto = $dados['info_troca'] ?? $dados['info'] ?? 'N/A';
    $info_bruto = str_ireplace(['<div>', '<p>'], '<br>', $info_bruto);
    $info_bruto = str_ireplace(['</div>', '</p>'], '', $info_bruto);
    $info = strip_tags($info_bruto, '<b><i><u><br><strong><em><ul><li><ol>');
    $info = str_replace('▪', '&bull;', $info);
    $info = preg_replace('/^(<br\s*\/?>)+/i', '', $info);
    $info = preg_replace('/(<br\s*\/?>)+$/i', '', $info);
    $info = preg_replace('/(<br\s*\/?>){3,}/i', '<br><br>', $info);
    if (trim($info) === '' || $info === 'N/A') {
        $info = 'N/A';
    }

    $saidasHTML = '';
    if (isset($dados['horarios']['saida_hotel']) && is_array($dados['horarios']['saida_hotel'])) {
        foreach ($dados['horarios']['saida_hotel'] as $saida) {
            $h1 = htmlspecialchars($saida['h1'] ?? ''); $m1 = htmlspecialchars($saida['m1'] ?? '');
            $h2 = htmlspecialchars($saida['h2'] ?? ''); $m2 = htmlspecialchars($saida['m2'] ?? '');
            $l1 = htmlspecialchars($saida['label1'] ?? 'Previsto');
            $l2 = htmlspecialchars($saida['label2'] ?? 'Real');
            $t1 = (strtoupper($h1) === 'N/A' || strtoupper($h1) === 'N' || strtoupper($h1) === 'NA') ? "N/A" : "{$h1} h {$m1} min";
            $t2 = (strtoupper($h2) === 'N/A' || strtoupper($h2) === 'N' || strtoupper($h2) === 'NA') ? "N/A" : "{$h2} h {$m2} min";
            $saidasHTML .= "<div style='margin-bottom: 4px;'><span style='font-weight:bold;'>{$l1}:</span> {$t1} &nbsp;&nbsp;&nbsp;&nbsp; <span style='font-weight:bold;'>{$l2}:</span> {$t2}</div>";
        }
    } else {
        $saidasHTML = "N/A";
    }

    $embPrev = htmlspecialchars($dados['horarios']['embarque_previsto'] ?? 'N/A');
    $embPrevFormatado = (stripos($embPrev, 'N/A') !== false || stripos($embPrev, 'N/') !== false) ? 'N/A' : str_replace(':', ' h ', $embPrev) . ' min';

    $embReal = htmlspecialchars($dados['horarios']['embarque_real'] ?? 'N/A');
    $embRealFormatado = (stripos($embReal, 'N/A') !== false || stripos($embReal, 'N/') !== false) ? 'N/A' : str_replace(':', ' h ', $embReal) . ' min';

    $atInicio = htmlspecialchars($dados['horarios']['atendimento_inicio'] ?? 'N/A');
    $atInicioFormatado = (stripos($atInicio, 'N/A') !== false) ? 'N/A' : str_replace(':', ' h ', $atInicio) . ' min';

    $atFim = htmlspecialchars($dados['horarios']['atendimento_fim'] ?? 'N/A');
    $atFimFormatado = (stripos($atFim, 'N/A') !== false) ? 'N/A' : str_replace(':', ' h ', $atFim) . ' min';

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
            $src = htmlspecialchars($foto['base64'] ?? $foto['uri'] ?? '');
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

    $logoPath = __DIR__ . '/images/logo.jpg';
    $logoBase64 = '';
    if (file_exists($logoPath)) {
        $logoBase64 = 'data:image/jpeg;base64,' . base64_encode(file_get_contents($logoPath));
    }
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
        'unidade' => $unidade
    ];

    $html = gerarHtmlPdf($bgBase64, $logoBase64, $varsHtml);

    $dompdf->loadHtml($html);
    $dompdf->setPaper('A4', 'portrait');
    $dompdf->render();

    $pdfOutput = $dompdf->output();

    $unidadeClean = strtoupper(trim(preg_replace('/\s+/', '_', $unidade)));
    $obsArquivo = strtoupper(trim(htmlspecialchars($dados['observacao_nome_arquivo'] ?? $dados['observacao'] ?? '')));
    $strObs = $obsArquivo !== '' ? "_{$obsArquivo}" : "";
    $embPrevistoStr = $dados['horarios']['embarque_previsto'] ?? '';
    $strEmb = "";
    if (trim($embPrevistoStr) !== '' && trim($embPrevistoStr) !== ':' && stripos($embPrevistoStr, 'N') === false) {
        $embFormatado = str_replace(':', 'h', $embPrevistoStr);
        $strEmb = "_({$embFormatado})";
    }

    $dataNome = count($partesData) === 3 ? "{$partesData[2]}-{$partesData[1]}-{$partesData[0]}" : $data;
    $nomeArquivoPDF = "{$unidadeClean}_{$dataNome}{$strEmb}{$strObs}.pdf";
    $nomeArquivoPDF = str_replace(['/', '\\'], '-', $nomeArquivoPDF);

    // Se solicitado salvar no disco e retornar JSON com a URL
    if (!empty($_GET['salvar']) || !empty($dados['salvar_disco'])) {
        if (!is_dir(__DIR__ . '/relatorios_pdf')) {
            mkdir(__DIR__ . '/relatorios_pdf', 0755, true);
        }
        $caminhoPdfRelativo = 'relatorios_pdf/' . uniqid() . '_' . $nomeArquivoPDF;
        file_put_contents(__DIR__ . '/' . $caminhoPdfRelativo, $pdfOutput);
        header('Content-Type: application/json');
        echo json_encode([
            'sucesso' => true,
            'pdf_url' => $caminhoPdfRelativo,
            'nome_arquivo' => $nomeArquivoPDF
        ]);
        exit;
    }

    // Retorna o PDF binário vetorial diretamente (Stream)
    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="' . $nomeArquivoPDF . '"');
    header('Content-Length: ' . strlen($pdfOutput));
    echo $pdfOutput;
    exit;

} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => $e->getMessage()]);
}
