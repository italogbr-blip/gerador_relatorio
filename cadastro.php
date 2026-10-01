<?php
require 'mms_config.php';
$erro = '';
$sucesso = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = trim($_POST['username'] ?? '');
    $user_conf = trim($_POST['username_confirm'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $email_conf = trim($_POST['email_confirm'] ?? '');
    $pass = $_POST['senha'] ?? '';
    $pass_conf = $_POST['senha_confirm'] ?? '';

    $nome = trim($_POST['nome'] ?? '');

    // Validações duplas solicitadas
    if (empty($nome)) { $erro = "O campo Nome é obrigatório!"; }
    elseif ($user !== $user_conf) { $erro = "Os nomes de usuário não coincidem!"; }
    elseif ($email !== $email_conf) { $erro = "Os e-mails não coincidem!"; }
    elseif ($pass !== $pass_conf) { $erro = "As senhas não coincidem!"; }
    elseif (strlen($pass) < 6) { $erro = "A senha deve ter pelo menos 6 caracteres."; }
    else {
        // Tenta adicionar a coluna nome silenciosamente se não existir
        try {
            $pdo->exec("ALTER TABLE usuarios ADD COLUMN nome VARCHAR(100) NULL AFTER username");
        } catch (Exception $e) {}

        // Verifica se usuário ou email já existem
        try {
            // Tenta criar coluna email caso não exista
            try { $pdo->exec("ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NULL AFTER username"); } catch(Exception $e) {}

            $check = $pdo->prepare("SELECT id FROM usuarios WHERE username = ? OR email = ?");
            $check->execute([$user, $email]);
            if ($check->rowCount() > 0) {
                $erro = "Usuário ou E-mail já cadastrados no sistema.";
            } else {
                $hash = password_hash($pass, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare("INSERT INTO usuarios (username, nome, email, senha, nivel_autoridade) VALUES (?, ?, ?, ?, 1)");
                if ($stmt->execute([$user, $nome, $email, $hash])) {
                    if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
                        header('Content-Type: application/json');
                        echo json_encode(['sucesso' => true, 'mensagem' => 'Cadastro realizado com sucesso!']);
                        exit();
                    }
                    header("Location: login.php?cadastro_ok=1");
                    exit();
                } else { 
                    $erro = "Erro ao salvar no banco. Tente novamente."; 
                }
            }
        } catch (Exception $e) {
            $erro = "Erro interno do servidor. Por favor, tente novamente ou contate o suporte. " . $e->getMessage();
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
    <title>Criar Conta - MMS Logística</title>
    <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        body { 
            font-family: 'Outfit', sans-serif;
            background-color: #f8fafc;
        }
        .glass-panel {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6 relative overflow-y-auto overflow-x-hidden">

    <!-- Efeitos de Fundo -->
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>

    <div class="w-full max-w-xl glass-panel rounded-3xl shadow-2xl p-8 relative z-10 text-white my-10">
        
        <div class="flex justify-center mb-6">
            <div class="bg-white p-3 rounded-lg shadow-lg">
                <img src="images/logo.png" alt="Logo MMS" class="h-14 object-contain">
            </div>
        </div>
        
        <h2 class="text-3xl font-extrabold text-center tracking-tight mb-2">Criar Nova Conta</h2>
        <p class="text-center text-slate-400 text-sm mb-8 font-light">Junte-se à MMS Suporte Logístico</p>

        <?php if ($erro): ?>
            <div class="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-lg mb-6 text-sm font-semibold text-center tracking-wide">
                <?php echo $erro; ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="" class="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            <div class="md:col-span-2">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Nome Completo</label>
                <input type="text" name="nome" required placeholder="Seu nome real"
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                <p class="text-[10px] text-blue-400 mt-2 ml-1">* Este nome será preenchido automaticamente em "Nome do Preposto:" ao preencher o relatório.</p>
            </div>

            <div class="md:col-span-1">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Usuário</label>
                <input type="text" name="username" required
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>
            
            <div class="md:col-span-1">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Repetir Usuário</label>
                <input type="text" name="username_confirm" required
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>
            
            <div class="md:col-span-1">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">E-mail</label>
                <input type="email" name="email" required
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>
            
            <div class="md:col-span-1">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Repetir E-mail</label>
                <input type="email" name="email_confirm" required
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>
            
            <div class="md:col-span-1">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Senha</label>
                <input type="password" name="senha" required
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>
            
            <div class="md:col-span-1">
                <label class="block text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2 ml-1">Repetir Senha</label>
                <input type="password" name="senha_confirm" required
                    class="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
            </div>
            
            <div class="md:col-span-2 mt-2">
                <button type="submit" 
                    class="w-full bg-blue-600 text-white font-bold py-4 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] hover:bg-blue-500 transform hover:-translate-y-1 transition-all duration-200 tracking-wide mt-2">
                    Criar Cadastro
                </button>
            </div>
        </form>
        
        <div class="mt-8 pt-6 border-t border-slate-800 flex flex-col items-center">
            <p class="text-sm text-slate-400">Já tem uma conta? <a href="login.php" class="text-blue-400 font-bold hover:text-blue-300">Fazer Login</a></p>
        </div>

    </div>

</body>
</html>

