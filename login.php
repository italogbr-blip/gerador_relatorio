<?php
session_start();
require 'mms_config.php';

// ===== RATE LIMITING - Proteção contra Força Bruta =====
$max_tentativas = 3;
$tempo_bloqueio = 900; // 15 minutos

// Identificador único para rate limiting
$ip_usuario = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$chave_rate = 'login_attempts_' . md5($ip_usuario);

// Verifica tentativas armazenadas
if (!isset($_SESSION[$chave_rate])) {
    $_SESSION[$chave_rate] = [
        'tentativas' => 0,
        'bloqueado_ate' => 0
    ];
}

$rate_data = $_SESSION[$chave_rate];

// Verifica se está bloqueado
if ($rate_data['bloqueado_ate'] > time()) {
    $tempo_restante = ceil(($rate_data['bloqueado_ate'] - time()) / 60);
    $erro = "Muitas tentativas falhadas. Tente novamente em {$tempo_restante} minutos.";
} else {
    // Reset se o bloqueio expirou
    if ($rate_data['bloqueado_ate'] > 0 && $rate_data['bloqueado_ate'] <= time()) {
        $_SESSION[$chave_rate] = [
            'tentativas' => 0,
            'bloqueado_ate' => 0
        ];
        $rate_data = $_SESSION[$chave_rate];
    }
}

// Cria tabela de logs silenciosamente se não existir
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS registro_logins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT,
        ip VARCHAR(45),
        data_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )");
    
    // Tabela de tentativas falhadas
    $pdo->exec("CREATE TABLE IF NOT EXISTS tentativas_login_falhadas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50),
        ip VARCHAR(45),
        data_tentativa TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
} catch (Exception $e) {}

// Se já logado, manda pro gerador
if (isset($_SESSION['usuario_id'])) {
    header("Location: index.php");
    exit();
}

if (empty($erro)) {
    $erro = '';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && empty($erro)) {
    // Verifica se não está bloqueado
    if ($rate_data['bloqueado_ate'] <= time()) {
        
        $user = trim($_POST['username'] ?? '');
        $pass = trim($_POST['senha'] ?? '');

        if (empty($user) || empty($pass)) {
            $erro = "Por favor, preencha todos os campos.";
        } else {
            $stmt = $pdo->prepare("SELECT id, username, nome, senha, nivel_autoridade FROM usuarios WHERE username = ?");
            $stmt->execute([$user]);
            $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($usuario && password_verify($pass, $usuario['senha'])) {
                // ===== SEGURANÇA: Regenera Session ID =====
                session_regenerate_id(true);
                
                // Login aprovado
                $_SESSION['usuario_id'] = $usuario['id'];
                $_SESSION['username'] = $usuario['username'];
                $_SESSION['nome'] = $usuario['nome'] ?? $usuario['username'];
                $_SESSION['nivel_autoridade'] = $usuario['nivel_autoridade'];

                // ===== PERSISTÊNCIA DE SESSÃO (LEMBRAR-ME PWA) =====
                try {
                    $token = bin2hex(random_bytes(32));
                    $stmtToken = $pdo->prepare("UPDATE usuarios SET remember_token = ? WHERE id = ?");
                    $stmtToken->execute([$token, $usuario['id']]);
                    // Define o cookie para 30 dias com path global
                    setcookie('mms_remember_token', $token, time() + (86400 * 30), "/");
                } catch(Exception $e) {}

                // Reset rate limiting
                $_SESSION[$chave_rate] = [
                    'tentativas' => 0,
                    'bloqueado_ate' => 0
                ];

                // Registrar IP
                $ip = $_SERVER['REMOTE_ADDR'] ?? 'Desconhecido';
                try {
                    $stmtLog = $pdo->prepare("INSERT INTO registro_logins (usuario_id, ip) VALUES (?, ?)");
                    $stmtLog->execute([$usuario['id'], $ip]);
                } catch (Exception $e) {}

                if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
                    header('Content-Type: application/json');
                    echo json_encode(['sucesso' => true]);
                    exit();
                }

                header("Location: index.php"); // Todos vão para o gerador
                exit();
            } else {
                // Incrementa tentativas
                $rate_data['tentativas']++;
                
                // Registra tentativa falhada
                try {
                    $stmtFalha = $pdo->prepare("INSERT INTO tentativas_login_falhadas (username, ip) VALUES (?, ?)");
                    $stmtFalha->execute([$user, $ip_usuario]);
                } catch (Exception $e) {}
                
                // Se atingiu o máximo, bloqueia
                if ($rate_data['tentativas'] >= $max_tentativas) {
                    $rate_data['bloqueado_ate'] = time() + $tempo_bloqueio;
                    $tempo_restante = ceil($tempo_bloqueio / 60);
                    $erro = "Muitas tentativas falhadas. Bloqueado por {$tempo_restante} minutos.";
                } else {
                    $tentativas_restantes = $max_tentativas - $rate_data['tentativas'];
                    $erro = "Credenciais inválidas! Você tem mais {$tentativas_restantes} tentativa(s).";
                }
                
                // Salva na sessão
                $_SESSION[$chave_rate] = $rate_data;
            }
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
    header('Content-Type: application/json');
    echo json_encode(['sucesso' => false, 'erro' => $erro]);
    exit();
}
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Entrar - MMS Logística</title>
    <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Outfit', sans-serif;
            background-color: #f8fafc;
        }
        .light-panel {
            background: #ffffff;
            border: 1px solid #e2e8f0;
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6 relative overflow-y-auto overflow-x-hidden bg-slate-50">

    <div class="w-full max-w-md light-panel rounded-3xl shadow-xl p-8 relative z-10 text-slate-800">
        
        <div class="flex justify-center mb-6">
            <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <img src="images/logo.png" alt="Logo MMS" class="h-14 object-contain">
            </div>
        </div>
        
        <h2 class="text-3xl font-extrabold text-center tracking-tight mb-2 text-slate-800">Bem-vindo de volta</h2>
        <p class="text-center text-slate-500 text-sm mb-8 font-normal">Acesse o portal da MMS Suporte Logístico</p>

        <?php if ($erro): ?>
            <div class="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg mb-6 text-sm font-semibold text-center tracking-wide">
                <?php echo $erro; ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="" class="space-y-5">
            
            <div>
                <label class="block text-xs text-slate-600 uppercase tracking-widest font-semibold mb-2 ml-1">Usuário</label>
                <input type="text" name="username" placeholder="Seu nome de usuário" required
                    class="w-full bg-slate-50 border border-slate-300 rounded-lg p-4 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>

            <div>
                <label class="block text-xs text-slate-600 uppercase tracking-widest font-semibold mb-2 ml-1">Senha</label>
                <input type="password" name="senha" placeholder="••••••••" required
                    class="w-full bg-slate-50 border border-slate-300 rounded-lg p-4 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>

            <button type="submit" <?php echo ($rate_data['bloqueado_ate'] > time()) ? 'disabled' : ''; ?>
                class="w-full bg-blue-600 text-white font-bold py-4 rounded-lg shadow-md hover:bg-blue-700 transform hover:-translate-y-0.5 transition-all duration-200 mt-6 tracking-wide <?php echo ($rate_data['bloqueado_ate'] > time()) ? 'opacity-50 cursor-not-allowed' : ''; ?>">
                <?php echo ($rate_data['bloqueado_ate'] > time()) ? 'Bloqueado Temporariamente' : 'Acessar Plataforma'; ?>
            </button>
        </form>
        
        <div class="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center">
            <p class="text-sm text-slate-500">Não tem uma conta? <a href="cadastro.php" class="text-blue-600 font-bold hover:text-blue-700">Cadastre-se</a></p>
        </div>

        <?php if($rate_data['tentativas'] > 0 && $rate_data['bloqueado_ate'] <= time()): ?>
        <div class="mt-4 text-center text-xs text-amber-600">
            ⚠️ <?php echo $rate_data['tentativas']; ?> tentativa(s) falhada(s)
        </div>
        <?php endif; ?>

    </div>

</body>
</html>


