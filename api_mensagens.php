<?php
require_once 'mms_config.php';
session_start();

header('Content-Type: application/json');

$usuario_id = $_SESSION['usuario_id'] ?? null;
$is_anonimo = isset($_GET['anonimo']) && $_GET['anonimo'] == '1';

if (!$usuario_id && !$is_anonimo) {
    echo json_encode(['erro' => 'Não autenticado', 'mensagens' => [], 'qtd_novas' => 0]);
    exit();
}

$usuario_id = $_SESSION['usuario_id'];

// Garantir que a tabela existe
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_mensagens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(150) NOT NULL,
        mensagem TEXT NOT NULL,
        tipo VARCHAR(50) DEFAULT 'info',
        autor_id INT NOT NULL,
        destinatario_id INT DEFAULT NULL,
        data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_mensagens_lidas (
        mensagem_id INT NOT NULL,
        usuario_id INT NOT NULL,
        data_leitura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (mensagem_id, usuario_id)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_mensagens_excluidas (
        mensagem_id INT NOT NULL,
        usuario_id INT NOT NULL,
        data_exclusao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (mensagem_id, usuario_id)
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS mms_mensagens_agendadas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(150) NOT NULL,
        mensagem TEXT NOT NULL,
        tipo VARCHAR(50) DEFAULT 'info',
        autor_id INT NOT NULL,
        destinatario_id INT DEFAULT NULL,
        frequencia VARCHAR(50) DEFAULT 'unica', -- unica, diaria, semanal, mensal
        data_hora_proxima DATETIME NOT NULL,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
} catch(Exception $e) {}

// ==========================================
// PSEUDO-CRON: Processa mensagens agendadas
// ==========================================
try {
    $agora = date('Y-m-d H:i:s');
    $stmtAgendadas = $pdo->prepare("SELECT * FROM mms_mensagens_agendadas WHERE data_hora_proxima <= ?");
    $stmtAgendadas->execute([$agora]);
    $pendentes = $stmtAgendadas->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($pendentes) > 0) {
        $stmtInsertMsg = $pdo->prepare("INSERT INTO mms_mensagens (titulo, mensagem, tipo, autor_id, destinatario_id, data_envio) VALUES (?, ?, ?, ?, ?, ?)");
        $stmtUpdateAg = $pdo->prepare("UPDATE mms_mensagens_agendadas SET data_hora_proxima = ? WHERE id = ?");
        $stmtDelAg = $pdo->prepare("DELETE FROM mms_mensagens_agendadas WHERE id = ?");
        
        foreach ($pendentes as $ag) {
            // Insere na tabela oficial de envio
            $stmtInsertMsg->execute([$ag['titulo'], $ag['mensagem'], $ag['tipo'], $ag['autor_id'], $ag['destinatario_id'], $agora]);
            
            // Calcula próxima data ou deleta
            if ($ag['frequencia'] == 'unica') {
                $stmtDelAg->execute([$ag['id']]);
            } else {
                $time_proxima = strtotime($ag['data_hora_proxima']);
                if ($ag['frequencia'] == 'diaria') {
                    $time_proxima = strtotime('+1 day', $time_proxima);
                } elseif ($ag['frequencia'] == 'semanal') {
                    $time_proxima = strtotime('+1 week', $time_proxima);
                } elseif ($ag['frequencia'] == 'mensal') {
                    $time_proxima = strtotime('+1 month', $time_proxima);
                }
                // Se a próxima data ainda for no passado (ex: o sistema ficou muito tempo off), ajusta para o futuro
                while ($time_proxima <= time()) {
                    if ($ag['frequencia'] == 'diaria') $time_proxima = strtotime('+1 day', $time_proxima);
                    if ($ag['frequencia'] == 'semanal') $time_proxima = strtotime('+1 week', $time_proxima);
                    if ($ag['frequencia'] == 'mensal') $time_proxima = strtotime('+1 month', $time_proxima);
                }
                $stmtUpdateAg->execute([date('Y-m-d H:i:s', $time_proxima), $ag['id']]);
            }
        }
    }
} catch(Exception $e) {}
// ==========================================

// Apagar notificação (apenas para o usuário atual)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['apagar_msg'])) {
    $msg_id = (int)$_POST['apagar_msg'];
    try {
        $stmtInsert = $pdo->prepare("INSERT IGNORE INTO mms_mensagens_excluidas (mensagem_id, usuario_id) VALUES (?, ?)");
        $stmtInsert->execute([$msg_id, $usuario_id]);
        echo json_encode(['sucesso' => true]);
        exit();
    } catch(Exception $e) {
        echo json_encode(['erro' => $e->getMessage()]);
        exit();
    }
}

// Marcar como lidas
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['marcar_lidas'])) {
    try {
        $stmtPendentes = $pdo->prepare("
            SELECT m.id 
            FROM mms_mensagens m 
            LEFT JOIN mms_mensagens_lidas ml ON m.id = ml.mensagem_id AND ml.usuario_id = ? 
            WHERE (m.destinatario_id IS NULL OR m.destinatario_id = ?) 
            AND ml.mensagem_id IS NULL
        ");
        $stmtPendentes->execute([$usuario_id, $usuario_id]);
        $pendentes = $stmtPendentes->fetchAll(PDO::FETCH_COLUMN);
        
        if (!empty($pendentes)) {
            $sqlInsert = "INSERT IGNORE INTO mms_mensagens_lidas (mensagem_id, usuario_id) VALUES ";
            $valores = [];
            $params = [];
            foreach ($pendentes as $msg_id) {
                $valores[] = "(?, ?)";
                $params[] = $msg_id;
                $params[] = $usuario_id;
            }
            $sqlInsert .= implode(", ", $valores);
            $stmtInsert = $pdo->prepare($sqlInsert);
            $stmtInsert->execute($params);
        }
        echo json_encode(['sucesso' => true]);
        exit();
    } catch(Exception $e) {
        echo json_encode(['erro' => $e->getMessage()]);
        exit();
    }
}

// Buscar mensagens
try {
    // Buscar as últimas 20 mensagens para este usuário ou para todos
    $stmtMsgs = $pdo->prepare("
        SELECT m.*, 
               (CASE WHEN ml.data_leitura IS NOT NULL THEN 1 ELSE 0 END) as lida,
               DATE_FORMAT(m.data_envio, '%d/%m %H:%i') as data_formatada
        FROM mms_mensagens m 
        LEFT JOIN mms_mensagens_lidas ml ON m.id = ml.mensagem_id AND ml.usuario_id = ? 
        LEFT JOIN mms_mensagens_excluidas me ON m.id = me.mensagem_id AND me.usuario_id = ?
        WHERE (m.destinatario_id IS NULL OR m.destinatario_id = ?) 
        AND me.mensagem_id IS NULL
        ORDER BY m.data_envio DESC 
        LIMIT 20
    ");
    $stmtMsgs->execute([$usuario_id, $usuario_id, $usuario_id]);
    $mensagens = $stmtMsgs->fetchAll(PDO::FETCH_ASSOC);
    
    $qtd_novas = 0;
    $resultado_msgs = [];
    foreach ($mensagens as $m) {
        if (!$m['lida']) {
            $qtd_novas++;
        }
        $resultado_msgs[] = [
            'id' => $m['id'],
            'titulo' => $m['titulo'],
            'mensagem' => $m['mensagem'],
            'tipo' => $m['tipo'],
            'data_envio' => $m['data_formatada'],
            'lida' => (bool)$m['lida']
        ];
    }
    
    echo json_encode([
        'sucesso' => true,
        'mensagens' => $resultado_msgs,
        'qtd_novas' => $qtd_novas
    ]);
    
} catch(Exception $e) {
    echo json_encode(['erro' => $e->getMessage(), 'mensagens' => [], 'qtd_novas' => 0]);
}
