<?php
session_start();

// Trava de segurança: só o admin logado pode apagar o arquivo
if (isset($_SESSION['usuario_id']) && $_SESSION['nivel_autoridade'] == 2) {
    $caminhoLog = __DIR__ . '/mms_erros_sistema.log';
    
    // Se o arquivo existir, ele substitui o conteúdo por "nada" (esvazia)
    if (file_exists($caminhoLog)) {
        file_put_contents($caminhoLog, ''); 
    }
}

// Redireciona de volta para o painel usando a URL limpa que você configurou!
header("Location: coord"); 
exit();
?>