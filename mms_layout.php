<?php
// mms_layout.php - Layout fixo adaptado do modelo original html2pdf do cliente

function gerarHtmlPdf(string $bgBase64, string $logoBase64, array $vars): string
{
    // Injeta imagem absoluta em background com z-index negativo
    $bgTag = $bgBase64 ? "<img src='{$bgBase64}' style='position: fixed; top: -30mm; left: -15mm; width: 210mm; height: 297mm; z-index: -1000;' />" : "";
    
    // Extrai variáveis do array
    $unidade = $vars['unidade'] ?? 'N/A';
    $dataFormatada = $vars['dataFormatada'] ?? 'N/A';
    $local = $vars['local'] ?? 'N/A';
    $modal = $vars['modal'] ?? 'Helicóptero';
    $preposto = $vars['preposto'] ?? 'N/A';
    $info = $vars['info'] ?? 'N/A';
    
    $saidasHTML = $vars['saidasHTML'] ?? 'N/A';
    $embPrevFormatado = $vars['embPrevFormatado'] ?? 'N/A';
    $embRealFormatado = $vars['embRealFormatado'] ?? 'N/A';
    $atInicioFormatado = $vars['atInicioFormatado'] ?? 'N/A';
    $atFimFormatado = $vars['atFimFormatado'] ?? 'N/A';
    
    $pax1 = $vars['pax1'] ?? 'N/A';
    $pax2 = $vars['pax2'] ?? 'N/A';
    $fotosHTML = $vars['fotosHTML'] ?? '';
    
    $pax1_linhas = explode('<br />', str_replace(['<br>', '<br/>'], '<br />', $pax1));
    $pax2_linhas = explode('<br />', str_replace(['<br>', '<br/>'], '<br />', $pax2));
    $max_linhas = max(count($pax1_linhas), count($pax2_linhas));
    
    $col1_lines = array_map('trim', $pax1_linhas);
    $col2_lines = array_map('trim', $pax2_linhas);
    
    $max_linhas = max(count($col1_lines), count($col2_lines));
    
    $paxRows = '';
    $itemsPerPage = 20;
    $numPages = ceil($max_linhas / $itemsPerPage);
    if ($numPages == 0) $numPages = 1;

    for ($p = 0; $p < $numPages; $p++) {
        $start = $p * $itemsPerPage;
        $chunk1_lines = array_slice($col1_lines, $start, $itemsPerPage);
        $chunk2_lines = array_slice($col2_lines, $start, $itemsPerPage);

        $chunk1 = empty($chunk1_lines) ? 'N/A' : implode('', array_map(function($l) {
            return $l === '' ? "<div style='margin-bottom: 3px;'>&nbsp;</div>" : "<div style='margin-bottom: 3px; word-wrap: break-word;'>{$l}</div>";
        }, $chunk1_lines));
        
        $chunk2 = empty($chunk2_lines) ? 'N/A' : implode('', array_map(function($l) {
            return $l === '' ? "<div style='margin-bottom: 3px;'>&nbsp;</div>" : "<div style='margin-bottom: 3px; word-wrap: break-word;'>{$l}</div>";
        }, $chunk2_lines));

        $titleSuffix = $p > 0 ? ' (Cont.)' : '';
        $pageBreak = $p > 0 ? "page-break-before: always;" : "";

        $paxRows .= "
        <div style='width: 100%; overflow: hidden; margin-top: 40px; {$pageBreak}'>
            <div style='box-sizing: border-box; width: 50%; float: left; border-right: 1px solid #ccc; padding-right: 2%; overflow-wrap: break-word; word-wrap: break-word;'>
                <div class='pax-title' style='margin-bottom: 5px; font-weight: bold; font-size: 16px;'>Nomes Passageiros Embarcando{$titleSuffix}:</div>
                <div style='line-height: 1.4;'>{$chunk1}</div>
            </div>
            <div style='box-sizing: border-box; width: 50%; float: right; padding-left: 2%; overflow-wrap: break-word; word-wrap: break-word;'>
                <div class='pax-title' style='margin-bottom: 5px; font-weight: bold; font-size: 16px;'>Nomes Passageiros Desembarcados{$titleSuffix}:</div>
                <div style='line-height: 1.4;'>{$chunk2}</div>
            </div>
            <div style='clear: both;'></div>
        </div>";
    }

    return "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='UTF-8'>
        <title>Relatório - {$unidade}</title>
        <style>
            @page { margin: 30mm 15mm 20mm 15mm; }
            body { 
                font-family: 'Times-Roman', 'Times New Roman', Times, serif; 
                font-size: 14px; 
                color: #000;
                margin: 0;
                padding: 0;
                background-color: #ffffff;
            }
            .fixed-logo {
                position: fixed;
                top: -25mm;
                left: 0mm;
                width: 80px;
                height: 80px;
            }
            .fixed-logo img {
                width: 80px;
                height: 80px;
                object-fit: contain;
            }
            .header-logo {
                width: 100%;
                margin-bottom: 0px;
                margin-left: 10px;
                margin-top: 10px;
            }
            .header-logo img {
                width: 80px;
                height: 80px;
                object-fit: contain;
            }
            .titulo-pdf {
                text-align: center;
                font-weight: bold;
                font-size: 16px;
                text-decoration: underline;
                margin-top: -2mm;
                margin-bottom: 5mm;
            }
            .row { margin-bottom: 7px; }
            .label { font-weight: bold; }
            .content-box { margin-left: 20px; margin-top: 6px; margin-bottom: 10px; }
            .info-box { margin-top: 0px; margin-bottom: 10px; text-align: left; }
            
            .table-pax {
                width: 100%;
                margin-top: 40px;
                border-collapse: separate;
                border-spacing: 0;
                page-break-inside: avoid;
            }
            .table-pax tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            .table-pax th, .table-pax td {
                vertical-align: top;
            }
            .pax-title {
                font-weight: bold;
                font-size: 16px;
                margin-bottom: 15px;
            }
            .footer {
                position: fixed;
                bottom: -12mm;
                left: 0;
                right: 0;
                text-align: center;
                font-size: 14px;
                font-weight: bold;
                color: #000;
                padding-top: 10px;
            }
            .page-number-box {
                position: fixed;
                bottom: -12mm;
                right: 40px;
                text-align: right;
                font-weight: bold;
                font-size: 14px;
            }
            .page-number:after { content: counter(page); }
        </style>
    </head>
    <body>
        {$bgTag}
        
        <div class='fixed-logo'>
            " . ($logoBase64 ? "<img src='{$logoBase64}' />" : "") . "
        </div>
        
        <div class='titulo-pdf'>RELATÓRIO DE TROCA DE TURMA</div>
        
        <div class='row'><span class='label'>Unidade:</span> {$unidade}</div>
        <div class='row'><span class='label'>Data:</span> {$dataFormatada}</div>
        <div class='row'><span class='label'>Local:</span> {$local}</div>
        <div class='row'><span class='label'>Modal:</span> {$modal}</div>
        
        <div class='row' style='margin-top:5px;'><span class='label'>Horário de Saída do Hotel (Previsto e Real):</span></div>
        <div class='content-box'>{$saidasHTML}</div>
        
        <div class='row' style='margin-top:5px;'><span class='label'>Horários de Embarque (Previsto e Real):</span></div>
        <div class='content-box'>
            <span class='label'>Previsto:</span> {$embPrevFormatado} &nbsp;&nbsp;&nbsp;&nbsp; <span class='label'>Real:</span> {$embRealFormatado}
        </div>
        
        <div class='row' style='margin-top:5px;'><span class='label'>Horário Inicial e de Finalização:</span></div>
        <div class='content-box'>
            <span class='label'>Início:</span> {$atInicioFormatado} &nbsp;às&nbsp; <span class='label'>Fim:</span> {$atFimFormatado}
        </div>
        
        <div class='row' style='margin-top:5px;'><span class='label'>Nome do Preposto:</span> {$preposto}</div>
        
        <div class='row' style='margin-top:5px;'><span class='label'>Informações sobre a troca de turma:</span></div>
        <div class='info-box'>{$info}</div>
        
        {$paxRows}

        {$fotosHTML}

        " . (isset($vars['editado_por_admin']) && $vars['editado_por_admin'] ? "
        <div style='text-align: center; font-size: 10px; color: #666; margin-top: 15px; border-top: 1px solid #ccc; padding-top: 5px; page-break-inside: avoid;'>
            {$vars['editado_por_admin']}
        </div>" : "") . "

        <!-- Rodapé fixo em todas as páginas -->
        <div class='footer'>
            Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>
            E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
        </div>
        
        <div class='page-number-box'><span class='page-number'></span></div>
    </body>
    </html>
    ";
}

function gerarCssPreview(): string
{
    return "
        .page-a4 {
            width: 210mm; min-height: 297mm; background: white; margin: 0 auto 20mm auto;
            padding: 30mm 15mm 30mm 15mm; position: relative; box-sizing: border-box;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
            font-family: 'Times-Roman', 'Times New Roman', Times, serif; 
            font-size: 14px; color: #000;
        }
        .bg-pagina {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: url('images/background.png') no-repeat center center;
            background-size: cover; z-index: 0; pointer-events: none;
        }
        .conteudo-pdf { position: relative; z-index: 1; }
        .fixed-logo { position: absolute; top: 5mm; left: 15mm; z-index: 1; }
        .fixed-logo img { width: 80px; height: 80px; object-fit: contain; }
        
        .titulo-pdf {
            text-align: center; font-weight: bold; font-size: 16px;
            text-decoration: underline; margin-top: -2mm; margin-bottom: 5mm;
        }
        .row { margin-bottom: 7px; }
        .label { font-weight: bold; }
        .content-box { margin-left: 20px; margin-top: 6px; margin-bottom: 10px; }
        .info-box { margin-top: 0px; margin-bottom: 10px; text-align: left; }
        
        .table-pax {
            width: 100%; margin-top: 40px; border-collapse: separate; border-spacing: 0; page-break-inside: avoid;
        }
        .table-pax tr { page-break-inside: avoid; page-break-after: auto; }
        .table-pax th, .table-pax td { vertical-align: top; }
        .pax-title { font-weight: bold; font-size: 16px; margin-bottom: 15px; }
        
        .footer {
            position: absolute; bottom: 10mm; left: 15mm; right: 15mm;
            text-align: center; font-size: 14px; font-weight: bold; color: #000;
            padding-top: 10px; z-index: 1;
        }
        
        @media print {
            body { padding: 0; background: white; }
            .toolbar { display: none !important; }
            .page-a4 { box-shadow: none; margin: 0; }
        }
    ";
}
