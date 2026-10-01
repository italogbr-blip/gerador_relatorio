<?php
ob_start();
session_start();
require 'mms_config.php'; 

// Carrega o autoloader do DomPDF
require_once __DIR__ . '/dompdf/autoload.inc.php';
use Dompdf\Dompdf;
use Dompdf\Options;

// Função para obter IP real do cliente
function obterIPCliente() {
    $headers = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 'HTTP_X_CLUSTER_CLIENT_IP', 'HTTP_FORWARDED_FOR', 'HTTP_FORWARDED', 'REMOTE_ADDR'];
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ip = explode(',', $_SERVER[$h])[0];
            $ip = trim($ip);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'Desconhecido';
}

$dadosBrutos = file_get_contents("php://input");
$dados = json_decode($dadosBrutos, true);

if (!$dados || !isset($dados['unidade'])) {
    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => 'Dados inválidos ou em branco.']);
    exit;
}

try {
    $usuario_id = $_SESSION['usuario_id'] ?? null;
    $empresa = htmlspecialchars(strip_tags($dados['grupo'] ?? 'OUTROS'));
    $teve_anexo = !empty($dados['fotos']) ? 1 : 0;
    $ip_origem = obterIPCliente();
    
    $stmtB = $pdo->prepare("SELECT ip FROM ips_bloqueados WHERE ip = ?");
    $stmtB->execute([$ip_origem]);
    if ($stmtB->fetch()) {
        throw new Exception("Acesso bloqueado.");
    }

    $preposto_atual = htmlspecialchars(strip_tags($dados['preposto'] ?? ''));
    $pdo->prepare("INSERT INTO mms_acessos_gerador (ip, ultimo_preposto) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_preposto = ?")->execute([$ip_origem, $preposto_atual, $preposto_atual]);
    
    $unidadeLimpa = htmlspecialchars(strip_tags($dados['unidade']));
    $localLimpo = htmlspecialchars(strip_tags($dados['local']));
    $dados_json = json_encode($dados, JSON_UNESCAPED_UNICODE);

    $id_gerado = null;

    // Tenta garantir silenciosamente que o banco aceite relatórios anônimos (NULL)
    try {
        $pdo->exec("ALTER TABLE relatorios MODIFY usuario_id INT NULL");
    } catch (Exception $e) {}

    try {
        $stmt = $pdo->prepare("
            INSERT INTO relatorios (usuario_id, empresa, unidade, local_atendimento, dados_json, teve_anexo, ip_origem) 
            VALUES (:usuario_id, :empresa, :unidade, :local_atendimento, :dados_json, :teve_anexo, :ip_origem)
        ");
        $stmt->execute([
            ':usuario_id' => $usuario_id,
            ':empresa' => $empresa,
            ':unidade' => $unidadeLimpa,
            ':local_atendimento' => $localLimpo,
            ':dados_json' => $dados_json,
            ':teve_anexo' => $teve_anexo,
            ':ip_origem' => $ip_origem
        ]);
        $id_gerado = $pdo->lastInsertId();
    } catch (Exception $e) {
        // Se ainda assim o banco recusar (falta de permissão de ALTER TABLE ou foreign key rígida),
        // ignora o erro de inserção e continua a geração do PDF como Visitante Anônimo.
        error_log(date('[d/m/Y H:i:s] ') . "Aviso: Nao foi possivel salvar no banco (Visitante). PDF sera gerado normalmente.\n", 3, __DIR__ . '/mms_erros_sistema.log');
    }

    // =============== INÍCIO DA GERAÇÃO DO PDF (DOMPDF) ===============
    
    // Configurações do DomPDF
    $options = new Options();
    $options->set('isRemoteEnabled', true);
    $options->set('isHtml5ParserEnabled', true);
    $dompdf = new Dompdf($options);

    require_once __DIR__ . '/mms_layout.php'; // Adiciona carregamento do layout

    // Preparar variáveis
    $unidade = htmlspecialchars($dados['unidade'] ?? 'N/A');
    $data = htmlspecialchars($dados['data'] ?? 'N/A');
    
    $partesData = explode('-', $data);
    $dataFormatada = count($partesData) === 3 ? "{$partesData[2]}/{$partesData[1]}/{$partesData[0]}" : $data;
    
    $local = htmlspecialchars($dados['local'] ?? 'N/A');
    $modal = htmlspecialchars($dados['modal'] ?? 'N/A');
    $preposto = htmlspecialchars($dados['preposto'] ?? 'N/A');
    
    // ===== CORREÇÃO CRÍTICA: Mantém formatação HTML e quebras de linha =====
    $info_bruto = $dados['info_troca'] ?? 'N/A';
    
    // Converte <div> e <p> em <br> mas remove duplicatas para evitar "pular" linhas demais
    $info_bruto = str_ireplace(['<div>', '<p>'], '<br>', $info_bruto);
    $info_bruto = str_ireplace(['</div>', '</p>'], '', $info_bruto);
    
    // Limpa tags e converte símbolo de bullet
    $info = strip_tags($info_bruto, '<b><i><u><br><strong><em><ul><li><ol>');
    $info = str_replace('▪', '&bull;', $info);
    
    // Remove <br> duplicados no início ou fim
    $info = preg_replace('/^(<br\s*\/?>)+/i', '', $info);
    $info = preg_replace('/(<br\s*\/?>)+$/i', '', $info);
    // Remove triplos <br> que causam buracos no texto
    $info = preg_replace('/(<br\s*\/?>){3,}/i', '<br><br>', $info);

    if (trim($info) === '' || $info === 'N/A') {
        $info = 'N/A';
    }
    // ===== FIM DA CORREÇÃO =====
    
    // Tratamento das Saídas
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

    // Tratamento dos passageiros
    $pax1_bruto = htmlspecialchars($dados['pax_embarcando'] ?? 'N/A');
    $pax1_bruto = preg_replace('/\*(.*?)\*/', '<b>$1</b>', $pax1_bruto);
    $pax1 = nl2br($pax1_bruto);

    $pax2_bruto = htmlspecialchars($dados['pax_desembarcando'] ?? 'N/A');
    $pax2_bruto = preg_replace('/\*(.*?)\*/', '<b>$1</b>', $pax2_bruto);
    $pax2 = nl2br($pax2_bruto);

    // Tratamento de Fotos
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

    // Logo em Base64 para garantir carregamento
    $logoPath = __DIR__ . '/images/logo.jpg';
    $logoBase64 = '';
    if (file_exists($logoPath)) {
        $logoData = file_get_contents($logoPath);
        $logoBase64 = 'data:image/jpeg;base64,' . base64_encode($logoData);
    }
    
    // Background azul
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
    
    $obsArquivo = strtoupper(trim(htmlspecialchars($dados['observacao_nome_arquivo'] ?? '')));
    $strObs = $obsArquivo !== '' ? "_{$obsArquivo}" : "";
    
    $embPrevistoStr = $dados['horarios']['embarque_previsto'] ?? '';
    $strEmb = "";
    if (trim($embPrevistoStr) !== '' && trim($embPrevistoStr) !== ':' && stripos($embPrevistoStr, 'N') === false) {
        $embFormatado = str_replace(':', 'h', $embPrevistoStr);
        $strEmb = "_({$embFormatado})";
    }
    
    $nomeArquivoPDF = "{$unidadeClean}_{$dataFormatada}{$strEmb}{$strObs}.pdf";
    $nomeArquivoPDF = str_replace('/', '-', $nomeArquivoPDF); // Evita erros de pasta

    $caminhoPdfRelativo = 'relatorios_pdf/' . uniqid() . '_' . $nomeArquivoPDF;
    $caminhoPdfAbsoluto = __DIR__ . '/' . $caminhoPdfRelativo;

    file_put_contents($caminhoPdfAbsoluto, $pdfOutput);

    if ($id_gerado !== null) {
        // Salva o caminho no banco de dados
        $stmtPath = $pdo->prepare("UPDATE relatorios SET pdf_url = ? WHERE id = ?");
        $stmtPath->execute([$caminhoPdfRelativo, $id_gerado]);
    }

    ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode([
        'sucesso' => true, 
        'id_relatorio' => $id_gerado,
        'pdf_url' => $caminhoPdfRelativo,
        'nome_arquivo' => $nomeArquivoPDF
    ]);

} catch (Exception $e) {
    ob_end_clean();
    header('Content-Type: application/json');
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    $mensagem = date('[d/m/Y H:i:s] ') . "Erro Salvamento (Relatório): " . $e->getMessage() . "\n";
    error_log($mensagem, 3, $caminhoLog);
    
    echo json_encode(['sucesso' => false, 'erro' => 'Falha interna no servidor.', 'detalhe' => $e->getMessage()]);
}
?>
