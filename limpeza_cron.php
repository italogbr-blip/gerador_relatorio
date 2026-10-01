<?php
// Tenta incluir o arquivo de configuração de forma segura
$caminhoConfig = __DIR__ . '/mms_config.php';
if (!file_exists($caminhoConfig)) {
    die("Arquivo de configuração não encontrado.");
}
require $caminhoConfig;

try {
    // 1. Descobre qual é a regra de meses que você configurou no Painel
    $stmtConfig = $pdo->query("SELECT meses_retencao_midia FROM configuracoes WHERE id = 1");
    $meses_retencao = $stmtConfig->fetchColumn();

    // Segurança: se por algum motivo não achar, assume 6 meses como padrão
    if (!$meses_retencao) $meses_retencao = 6; 

    // 2. Busca os relatórios velhos que ainda estão marcados com fotos (teve_anexo = 1)
    $sql = "SELECT id, dados_json FROM relatorios 
            WHERE teve_anexo = 1 
            AND data_criacao < DATE_SUB(NOW(), INTERVAL :meses MONTH)";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['meses' => $meses_retencao]);
    $relatoriosAntigos = $stmt->fetchAll();

    $apagados = 0;

    // 3. O Robô abre cada relatório, apaga a foto pesada e guarda o texto de volta
    foreach ($relatoriosAntigos as $r) {
        $dados = json_decode($r['dados_json'], true);
        
        // Verifica se a matriz de fotos existe
        if (isset($dados['fotos']) && !empty($dados['fotos'])) {
            
            // EXCLUI as fotos da memória (o que libera o espaço em disco no servidor)
            unset($dados['fotos']);
            
            // Deixa uma "cicatriz" legal para o coordenador saber que a foto existia e foi apagada pela lei
            $dados['aviso_expiracao'] = "As mídias deste relatório expiraram e foram removidas automaticamente pelo sistema após $meses_retencao meses.";
            
            // Empacota o texto de volta
            $novo_json = json_encode($dados, JSON_UNESCAPED_UNICODE);
            
            // Atualiza o banco, e muda 'teve_anexo' para 0, para não precisar varrer ele de novo no futuro
            $update = $pdo->prepare("UPDATE relatorios SET dados_json = ?, teve_anexo = 0 WHERE id = ?");
            $update->execute([$novo_json, $r['id']]);
            
            $apagados++;
        }
    }

    echo "Rotina concluida. Total de relatórios higienizados (mídias apagadas): $apagados.";

} catch (PDOException $e) {
    // Salva o erro no nosso log silencioso
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    $mensagem = date('[d/m/Y H:i:s] ') . "ERRO CRON JOB: " . $e->getMessage() . "\n";
    error_log($mensagem, 3, $caminhoLog);
    echo "Falha. Verifique os logs do painel admin.";
}
?>