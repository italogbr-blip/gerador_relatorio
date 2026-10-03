<?php
session_start();

// Proteção: Só acessa quem está logado
if (!isset($_SESSION['usuario_id'])) {
    header("Location: login");
    exit();
}

require 'mms_config.php';

// Busca os relatórios do usuário logado
$usuario_id = $_SESSION['usuario_id'];

// Filtros
$filtro_empresa = $_GET['empresa'] ?? '';
$filtro_busca = $_GET['busca'] ?? '';
$pagina = isset($_GET['pg']) ? (int)$_GET['pg'] : 1;
$por_pagina = 20;
$offset = ($pagina - 1) * $por_pagina;

// Construir query com filtros
$where_clauses = ["usuario_id = ?"];
$params = [$usuario_id];

if ($filtro_empresa && $filtro_empresa !== 'TODOS') {
    $where_clauses[] = "empresa = ?";
    $params[] = $filtro_empresa;
}

if ($filtro_busca) {
    $where_clauses[] = "(unidade LIKE ? OR local_atendimento LIKE ?)";
    $params[] = "%{$filtro_busca}%";
    $params[] = "%{$filtro_busca}%";
}

$where_sql = implode(' AND ', $where_clauses);

// Total de registros (para paginação)
$stmt_count = $pdo->prepare("SELECT COUNT(*) FROM relatorios WHERE {$where_sql}");
$stmt_count->execute($params);
$total_registros = $stmt_count->fetchColumn();
$total_paginas = ceil($total_registros / $por_pagina);

// Busca relatórios com paginação
$params[] = $por_pagina;
$params[] = $offset;
$stmt = $pdo->prepare("SELECT id, unidade, local_atendimento, teve_anexo, data_criacao, empresa, data_edicao FROM relatorios WHERE {$where_sql} ORDER BY id DESC LIMIT ? OFFSET ?");
$stmt->execute($params);
$relatorios = $stmt->fetchAll();
?>

<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meus Relatórios - MMS</title>
    <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
    <style>
        body { font-family: "Times New Roman", Times, serif; background-color: #f8fafc; }
    </style>
</head>
<body class="text-slate-800">

    <nav class="bg-slate-900 text-white p-4 shadow-lg">
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
                <span class="text-xl font-black tracking-widest uppercase block md:inline">MMS | Meus Relatórios</span>
                <span class="text-xs text-slate-400 block md:hidden">Olá, <b><?php echo htmlspecialchars($_SESSION['username'] ?? 'Usuário'); ?></b></span>
            </div>
            <div class="flex items-center gap-2 md:gap-4 flex-wrap">
                <span class="text-sm font-medium hidden md:block">Olá, <b><?php echo htmlspecialchars($_SESSION['username'] ?? 'Usuário'); ?></b></span>
                <a href="index" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">Voltar</a>
                <a href="logout" class="bg-rose-600 hover:bg-rose-700 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">Sair</a>
            </div>
        </div>
    </nav>

    <div class="max-w-6xl mx-auto p-4 md:p-8 mt-4">
        
        <!-- Header -->
        <div class="mb-6">
            <h1 class="text-2xl md:text-3xl font-black text-slate-800 uppercase tracking-widest">Histórico de Relatórios.</h1>
            <p class="text-sm text-slate-500 font-medium mt-1">Consulte todos os relatórios gerados e salvos.</p>
        </div>

        <!-- Filtros -->
        <form method="GET" class="bg-white rounded-lg shadow-[0_2px_8px_rgba(15,23,42,0.05)] border border-white p-4 mb-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <!-- Filtro Empresa -->
                <div>
                    <label class="block text-xs text-slate-600 font-bold uppercase tracking-widest mb-2">Empresa</label>
                    <select name="empresa" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Todas</option>
                        <option value="TECHNIP" <?php echo $filtro_empresa === 'TECHNIP' ? 'selected' : ''; ?>>TECHNIP</option>
                        <option value="DOF" <?php echo $filtro_empresa === 'DOF' ? 'selected' : ''; ?>>DOF</option>
                        <option value="TECHNIP/DOF" <?php echo $filtro_empresa === 'TECHNIP/DOF' ? 'selected' : ''; ?>>TECHNIP/DOF</option>
                        <option value="CONSTELLATION" <?php echo $filtro_empresa === 'CONSTELLATION' ? 'selected' : ''; ?>>CONSTELLATION</option>
                        <option value="ZONDA" <?php echo $filtro_empresa === 'ZONDA' ? 'selected' : ''; ?>>ZONDA</option>
                        <option value="OUTROS" <?php echo $filtro_empresa === 'OUTROS' ? 'selected' : ''; ?>>OUTROS</option>
                    </select>
                </div>

                <!-- Busca -->
                <div>
                    <label class="block text-xs text-slate-600 font-bold uppercase tracking-widest mb-2">Buscar Unidade/Local</label>
                    <input type="text" name="busca" value="<?php echo htmlspecialchars($filtro_busca); ?>" placeholder="Digite para buscar..." class="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                </div>

                <!-- Botões -->
                <div class="flex items-end gap-2">
                    <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-xs uppercase tracking-wider transition-colors">
                        Filtrar
                    </button>
                    <a href="meus_relatorios.php" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-lg text-xs uppercase tracking-wider transition-colors text-center">
                        Limpar
                    </a>
                </div>
            </div>

            <!-- Contador de Resultados -->
            <div class="mt-4 text-xs text-slate-500 font-medium">
                Mostrando <b><?php echo count($relatorios); ?></b> de <b><?php echo $total_registros; ?></b> relatórios
            </div>
        </form>

        <!-- DESKTOP: Tabela -->
        <div class="hidden md:block bg-white rounded-lg shadow-[0_2px_8px_rgba(15,23,42,0.05)] border border-white overflow-hidden">
            <div class="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 class="font-black text-sm uppercase tracking-widest text-slate-700">Registros Salvos</h3>
                <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest"><?php echo $total_registros; ?> Total</span>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-100 text-slate-500 text-[10px] uppercase tracking-widest">
                        <tr>
                            <th class="p-4 font-bold">Data/Hora</th>
                            <th class="p-4 font-bold">Unidade</th>
                            <th class="p-4 font-bold">Local</th>
                            <th class="p-4 font-bold text-center">Empresa</th>
                            <th class="p-4 font-bold text-center">Fotos?</th>
                            <th class="p-4 font-bold text-center">Ação</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <?php if(empty($relatorios)): ?>
                            <tr><td colspan="6" class="p-8 text-center text-slate-400 font-medium">Nenhum relatório encontrado.</td></tr>
                        <?php else: ?>
                            <?php foreach($relatorios as $r): ?>
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="p-4 font-medium">
                                    <?php echo date('d/m/Y H:i', strtotime($r['data_criacao'])); ?>
                                    <?php if(!empty($r['data_edicao']) && $r['data_edicao'] !== '0000-00-00 00:00:00' && abs(strtotime($r['data_edicao']) - strtotime($r['data_criacao'])) > 60): ?>
                                        <br><span class="text-[9px] text-amber-600 font-bold bg-amber-50 px-1 py-0.5 rounded">Editado: <?php echo date('d/m H:i', strtotime($r['data_edicao'])); ?></span>
                                    <?php endif; ?>
                                </td>
                                <td class="p-4 font-bold text-blue-700"><?php echo htmlspecialchars($r['unidade']); ?></td>
                                <td class="p-4 text-slate-600 truncate max-w-[200px]"><?php echo htmlspecialchars($r['local_atendimento']); ?></td>
                                <td class="p-4 text-center">
                                      <?php 
                                          $corEmpresa = 'bg-slate-100 text-slate-600';
                                          $empresa_texto = trim($r['empresa']) !== '' ? trim($r['empresa']) : 'N/A';
                                          $emp_check = trim(strtoupper($r['empresa']));
                                          if($emp_check == 'TECHNIP') $corEmpresa = 'bg-purple-100 text-purple-700';
                                          if($emp_check == 'DOF') $corEmpresa = 'bg-orange-100 text-orange-700';
                                          if($emp_check == 'TECHNIP/DOF') $corEmpresa = 'bg-pink-100 text-pink-700';
                                          if($emp_check == 'CONSTELLATION') $corEmpresa = 'bg-blue-100 text-blue-700';
                                          else if($emp_check == 'ZONDA') $corEmpresa = 'bg-lime-100 text-lime-800';
                                      ?>
                                      <span class="<?php echo $corEmpresa; ?> px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider"><?php echo htmlspecialchars($empresa_texto); ?></span>
                                  </td>
                                <td class="p-4 text-center">
                                    <?php if($r['teve_anexo']): ?>
                                        <span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Sim</span>
                                    <?php else: ?>
                                        <span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Não</span>
                                    <?php endif; ?>
                                </td>
                                <td class="p-4 text-center">
                                    <div class="flex items-center justify-center gap-2">
                                        <a href="editar_relatorio?id=<?php echo $r['id']; ?>" class="text-[10px] bg-amber-50 border border-amber-200 hover:border-amber-400 hover:text-amber-700 text-amber-600 px-3 py-2 rounded font-bold uppercase tracking-wider transition inline-block">Editar</a>
                                        <a href="ver_relatorio?id=<?php echo $r['id']; ?>" target="_blank" class="text-[10px] bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 px-3 py-2 rounded font-bold uppercase tracking-wider transition inline-block">Ver</a>
                                        <a href="download_pdf.php?id=<?php echo $r['id']; ?>" class="text-[10px] bg-slate-800 text-white border border-slate-800 hover:bg-slate-900 px-3 py-2 rounded font-bold uppercase tracking-wider transition inline-block">Baixar</a>
                                        <?php if(($_SESSION['nivel_autoridade'] ?? 0) == 2): ?>
                                            <button onclick="excluirRelatorio(<?php echo $r['id']; ?>)" class="text-[10px] bg-rose-50 border border-rose-200 hover:border-rose-400 hover:text-rose-700 text-rose-600 px-3 py-2 rounded font-bold uppercase tracking-wider transition inline-block cursor-pointer">Excluir</button>
                                        <?php endif; ?>
                                    </div>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- MOBILE: Cards -->
        <div class="md:hidden space-y-3">
            <?php if(empty($relatorios)): ?>
                <div class="bg-white rounded-lg p-6 text-center text-slate-400 font-medium shadow-sm border border-slate-200">
                    Nenhum relatório encontrado.
                </div>
            <?php else: ?>
                <?php foreach($relatorios as $r): ?>
                <div class="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h3 class="font-black text-blue-700 text-base"><?php echo htmlspecialchars($r['unidade']); ?></h3>
                            <p class="text-xs text-slate-500 mt-1">
                                <?php echo date('d/m/Y às H:i', strtotime($r['data_criacao'])); ?>
                                <?php if(!empty($r['data_edicao']) && $r['data_edicao'] !== '0000-00-00 00:00:00' && abs(strtotime($r['data_edicao']) - strtotime($r['data_criacao'])) > 60): ?>
                                    <br><span class="text-[9px] text-amber-600 font-bold bg-amber-50 px-1 py-0.5 rounded inline-block mt-0.5">Editado: <?php echo date('d/m/Y H:i', strtotime($r['data_edicao'])); ?></span>
                                <?php endif; ?>
                            </p>
                        </div>
                          <?php 
                              $corEmpresa = 'bg-slate-100 text-slate-600';
                              $empresa_texto = trim($r['empresa']) !== '' ? trim($r['empresa']) : 'N/A';
                              $emp_check = trim(strtoupper($r['empresa']));
                              if($emp_check == 'TECHNIP') $corEmpresa = 'bg-purple-100 text-purple-700';
                              if($emp_check == 'DOF') $corEmpresa = 'bg-orange-100 text-orange-700';
                              if($emp_check == 'TECHNIP/DOF') $corEmpresa = 'bg-pink-100 text-pink-700';
                              if($emp_check == 'CONSTELLATION') $corEmpresa = 'bg-blue-100 text-blue-700';
                              else if($emp_check == 'ZONDA') $corEmpresa = 'bg-lime-100 text-lime-800';
                          ?>
                          <span class="<?php echo $corEmpresa; ?> px-3 py-1 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"><?php echo htmlspecialchars($empresa_texto); ?></span>
                      </div>

                    <div class="text-sm text-slate-600 mb-3">
                        <p class="truncate"><span class="font-bold">Local:</span> <?php echo htmlspecialchars($r['local_atendimento']); ?></p>
                    </div>

                    <div class="flex justify-between items-center pt-3 border-t border-slate-100">
                        <div class="text-xs">
                            <?php if($r['teve_anexo']): ?>
                                <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded font-bold uppercase tracking-wider">📷 Com Fotos</span>
                            <?php else: ?>
                                <span class="bg-slate-100 text-slate-500 px-3 py-1 rounded font-bold uppercase tracking-wider">Sem Fotos</span>
                            <?php endif; ?>
                        </div>
                        <div class="flex items-center gap-2">
                            <?php if(($_SESSION['nivel_autoridade'] ?? 0) == 2): ?>
                                <button onclick="excluirRelatorio(<?php echo $r['id']; ?>)" class="bg-rose-100 hover:bg-rose-200 text-rose-800 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer">
                                    Excluir
                                </button>
                            <?php endif; ?>
                            <a href="editar_relatorio.php?id=<?php echo $r['id']; ?>" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition">
                                Editar
                            </a>
                            <a href="ver_relatorio.php?id=<?php echo $r['id']; ?>" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition">
                                Visualizar
                            </a>
                            <a href="download_pdf.php?id=<?php echo $r['id']; ?>" class="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition">
                                Baixar
                            </a>
                        </div>
                    </div>
                </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>

        <!-- Paginação -->
        <?php if($total_paginas > 1): ?>
        <div class="mt-8 flex justify-center items-center gap-2">
            <?php if($pagina > 1): ?>
                <a href="?pg=<?php echo $pagina - 1; ?>&empresa=<?php echo urlencode($filtro_empresa); ?>&busca=<?php echo urlencode($filtro_busca); ?>" class="bg-white border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold transition">
                    ← Anterior
                </a>
            <?php endif; ?>

            <div class="flex gap-1">
                <?php 
                $inicio = max(1, $pagina - 2);
                $fim = min($total_paginas, $pagina + 2);
                
                for($i = $inicio; $i <= $fim; $i++): 
                ?>
                    <a href="?pg=<?php echo $i; ?>&empresa=<?php echo urlencode($filtro_empresa); ?>&busca=<?php echo urlencode($filtro_busca); ?>" class="<?php echo $i === $pagina ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'; ?> px-4 py-2 rounded-lg text-sm font-bold transition">
                        <?php echo $i; ?>
                    </a>
                <?php endfor; ?>
            </div>

            <?php if($pagina < $total_paginas): ?>
                <a href="?pg=<?php echo $pagina + 1; ?>&empresa=<?php echo urlencode($filtro_empresa); ?>&busca=<?php echo urlencode($filtro_busca); ?>" class="bg-white border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold transition">
                    Próxima →
                </a>
            <?php endif; ?>
        </div>

        <div class="mt-4 text-center text-xs text-slate-500">
            Página <?php echo $pagina; ?> de <?php echo $total_paginas; ?>
        </div>
        <?php endif; ?>

    </div>

    <script>
        async function excluirRelatorio(id) {
            if (!confirm('Tem certeza que deseja excluir este relatório? Esta ação não pode ser desfeita.')) {
                return;
            }
            
            try {
                const res = await fetch('excluir_relatorio.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: 'id=' + id
                });
                
                const data = await res.json();
                
                if (data.sucesso) {
                    // Recarrega a página para atualizar a listagem
                    window.location.reload();
                } else {
                    alert('Erro ao excluir: ' + (data.erro || 'Desconhecido'));
                }
            } catch (e) {
                console.error(e);
                alert('Erro na comunicação com o servidor.');
            }
        }
    </script>
</body>
</html>


