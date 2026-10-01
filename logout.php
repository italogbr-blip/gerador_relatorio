<?php
session_start();
require 'mms_config.php';

// Limpa token persistente se existir
if(isset($_SESSION['usuario_id'])) {
    try {
        $pdo->prepare("UPDATE usuarios SET remember_token = NULL WHERE id = ?")->execute([$_SESSION['usuario_id']]);
    } catch(Exception $e) {}
}

// Invalida o cookie "Lembrar-me"
setcookie('mms_remember_token', '', time() - 3600, '/');

session_destroy();
header("Location: index.php");
exit();
?>