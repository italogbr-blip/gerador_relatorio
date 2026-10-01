<?php
require 'mms_config.php';

echo "<h1>Setup de Banco de Dados: Histórico de Versões</h1>";

// 1. Criar a tabela se não existir
$sql = "CREATE TABLE IF NOT EXISTS historico_versoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    versao VARCHAR(20) NOT NULL,
    data_lancamento DATETIME NOT NULL,
    descricao TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

if ($conn->query($sql) === TRUE) {
    echo "<p>Tabela <b>historico_versoes</b> criada/verificada com sucesso.</p>";
} else {
    echo "<p>Erro ao criar tabela: " . $conn->error . "</p>";
}

// 2. Verificar se já existe a versão inicial para não duplicar
$check = $conn->query("SELECT id FROM historico_versoes WHERE versao = 'v1.2.0'");
if ($check->num_rows == 0) {
    $descricao_inicial = "Implementação do novo painel de histórico de versões, melhorias severas no controle de cache via Service Workers, repositionamento inteligente de alertas, e correção de layout responsivo na interface administrativa (tabelas sem scroll horizontal).";
    $stmt = $conn->prepare("INSERT INTO historico_versoes (versao, data_lancamento, descricao) VALUES (?, NOW(), ?)");
    $v = "v1.2.0";
    $stmt->bind_param("ss", $v, $descricao_inicial);
    
    if ($stmt->execute()) {
        echo "<p>Versão inicial <b>v1.2.0</b> inserida com sucesso.</p>";
    } else {
        echo "<p>Erro ao inserir versão inicial: " . $stmt->error . "</p>";
    }
    $stmt->close();
} else {
    echo "<p>A versão <b>v1.2.0</b> já está registrada no banco de dados.</p>";
}

$conn->close();
echo "<p>Setup concluído!</p>";
?>
