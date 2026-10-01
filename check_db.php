<?php
require 'mms_config.php';
$stmt = $pdo->query("SELECT id, unidade, pdf_url FROM relatorios ORDER BY id DESC LIMIT 5");
while ($row = $stmt->fetch()) {
    echo "ID: " . $row['id'] . " | Unidade: " . $row['unidade'] . " | URL: " . $row['pdf_url'] . "\n";
}
