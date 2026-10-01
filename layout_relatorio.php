<?php
session_start();
if (!isset($_SESSION['usuario_id']) || $_SESSION['nivel_autoridade'] != 2) {
    header("Location: login"); exit();
}
if (empty($_SESSION['coord_panel_unlocked'])) {
    header("Location: coord.php"); exit();
}

require 'mms_config.php';

// Carrega config atual
$layoutConfig = [
    'margem_topo' => 30, 'margem_base' => 25, 'margem_lateral' => 15, 'margem_esq' => 15,
    'logo_topo' => -25, 'logo_esq' => 0, 'logo_largura' => 80, 'logo_altura' => 80,
    'titulo_margem_topo' => -5, 'titulo_margem_base' => 8, 'titulo_tamanho' => 16,
    'titulo_sublinhado' => 'border',
    'fonte_tamanho' => 14, 'linha_altura' => 1.4, 'espacamento_rows' => 6,
    'pax_col_esq_width' => 48, 'pax_separador_cor' => '#d1d5db',
    'pax_separador_esp' => '1.5px solid', 'pax_padding_direita' => 15, 'pax_padding_esquerda' => 30,
    'rodape_bottom' => -15, 'rodape_tamanho' => 13,
];

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS layout_relatorio (
        id INT PRIMARY KEY DEFAULT 1, config_json TEXT NOT NULL,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    $stmtL = $pdo->query("SELECT config_json, atualizado_em FROM layout_relatorio WHERE id = 1");
    $rowL = $stmtL->fetch();
    if ($rowL && !empty($rowL['config_json'])) {
        $saved = json_decode($rowL['config_json'], true);
        if (is_array($saved)) $layoutConfig = array_merge($layoutConfig, $saved);
        $ultimaAtualizacao = $rowL['atualizado_em'];
    }
} catch (Exception $e) {}

$cfg = $layoutConfig;
?>
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Layout do Relatório — MMS</title>
    <script src="js/tailwindcss.js?v=<?php echo time(); ?>"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: "Inter", sans-serif; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); min-height: 100vh; }
        .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
        .section-title { font-size: 10px; font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 16px; }
        .field-group { display: flex; flex-direction: column; gap: 4px; }
        .field-group label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
        .field-group input[type="number"], .field-group input[type="text"], .field-group input[type="color"], .field-group select {
            border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font-size: 13px;
            color: #1e293b; background: #f8fafc; outline: none; transition: border-color .2s;
            font-family: "Inter", sans-serif;
        }
        .field-group input:focus, .field-group select:focus { border-color: #3b82f6; background: #fff; }
        .field-group .hint { font-size: 10px; color: #94a3b8; }
        /* Preview A4 */
        #preview-wrap { width: 100%; overflow-x: auto; }
        #preview-a4 {
            width: 210mm; min-height: 297mm; background: white; position: relative;
            box-shadow: 0 8px 32px rgba(0,0,0,0.18); margin: 0 auto; font-family: "Times New Roman", serif;
            font-size: 14px; color: #000; overflow: hidden; border-radius: 4px;
        }
        .prev-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: url('images/background.png') no-repeat top left; background-size: 100% 100%; z-index: 0; pointer-events: none; }
        .prev-logo { position: absolute; z-index: 2; }
        .prev-logo img { object-fit: contain; }
        .prev-content { position: relative; z-index: 1; }
        .prev-titulo { text-align: center; font-weight: bold; display: table; line-height: 1.1; text-transform: uppercase; }
        .prev-row { margin-bottom: 6px; }
        .prev-label { font-weight: bold; }
        .prev-pax { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
        .prev-footer { position: absolute; left: 0; right: 0; text-align: center; font-weight: bold; color: #000; }
        @media (max-width: 900px) {
            #preview-a4 { transform-origin: top left; }
        }
    </style>
</head>
<body class="p-4 md:p-8">

<div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div>
            <a href="coord.php" class="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">← Voltar ao Painel</a>
            <h1 class="text-2xl font-black text-white mt-1">🎨 Layout do Relatório</h1>
            <p class="text-slate-400 text-xs mt-0.5">Ajuste o visual do PDF gerado. As alterações se aplicam a todos os relatórios novos e ao redownload dos existentes.</p>
        </div>
        <?php if (!empty($ultimaAtualizacao)): ?>
        <div class="text-right hidden md:block">
            <p class="text-slate-500 text-[10px] uppercase tracking-widest">Última atualização</p>
            <p class="text-slate-300 text-xs font-bold"><?php echo date('d/m/Y \à\s H:i', strtotime($ultimaAtualizacao)); ?></p>
        </div>
        <?php endif; ?>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <!-- COLUNA ESQUERDA: CONTROLES -->
        <div class="space-y-4">

            <!-- MARGENS -->
            <div class="card p-5">
                <div class="section-title">📐 Margens da Página (mm)</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label>Topo</label>
                        <input type="number" id="margem_topo" value="<?= $cfg['margem_topo'] ?>" min="0" max="60">
                    </div>
                    <div class="field-group">
                        <label>Base</label>
                        <input type="number" id="margem_base" value="<?= $cfg['margem_base'] ?>" min="0" max="60">
                    </div>
                    <div class="field-group">
                        <label>Lateral Direita</label>
                        <input type="number" id="margem_lateral" value="<?= $cfg['margem_lateral'] ?>" min="0" max="40">
                    </div>
                    <div class="field-group">
                        <label>Lateral Esquerda</label>
                        <input type="number" id="margem_esq" value="<?= $cfg['margem_esq'] ?>" min="0" max="40">
                    </div>
                </div>
            </div>

            <!-- LOGO -->
            <div class="card p-5">
                <div class="section-title">🖼️ Logo</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label>Posição Topo (mm)</label>
                        <input type="number" id="logo_topo" value="<?= $cfg['logo_topo'] ?>" min="-50" max="50">
                        <span class="hint">Negativo = acima da margem</span>
                    </div>
                    <div class="field-group">
                        <label>Posição Esquerda (mm)</label>
                        <input type="number" id="logo_esq" value="<?= $cfg['logo_esq'] ?>" min="-20" max="50">
                    </div>
                    <div class="field-group">
                        <label>Largura (px)</label>
                        <input type="number" id="logo_largura" value="<?= $cfg['logo_largura'] ?>" min="30" max="200">
                    </div>
                    <div class="field-group">
                        <label>Altura (px)</label>
                        <input type="number" id="logo_altura" value="<?= $cfg['logo_altura'] ?>" min="30" max="200">
                    </div>
                </div>
            </div>

            <!-- TÍTULO -->
            <div class="card p-5">
                <div class="section-title">📝 Título "RELATÓRIO DE TROCA DE TURMA"</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label>Margem Topo (mm)</label>
                        <input type="number" id="titulo_margem_topo" value="<?= $cfg['titulo_margem_topo'] ?>" min="-30" max="30">
                        <span class="hint">Negativo sobe o título</span>
                    </div>
                    <div class="field-group">
                        <label>Espaço Título → Unidade: (mm)</label>
                        <input type="number" id="titulo_margem_base" value="<?= $cfg['titulo_margem_base'] ?>" min="0" max="50">
                        <span class="hint">Distância entre o título e o campo Unidade:</span>
                    </div>
                    <div class="field-group">
                        <label>Tamanho da Fonte (px)</label>
                        <input type="number" id="titulo_tamanho" value="<?= $cfg['titulo_tamanho'] ?>" min="10" max="28">
                    </div>
                    <div class="field-group">
                        <label>Estilo de Sublinhado</label>
                        <select id="titulo_sublinhado">
                            <option value="border" <?= $cfg['titulo_sublinhado']==='border'?'selected':'' ?>>Linha abaixo (border)</option>
                            <option value="underline" <?= $cfg['titulo_sublinhado']==='underline'?'selected':'' ?>>Sublinhado CSS</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- CONTEÚDO -->
            <div class="card p-5">
                <div class="section-title">📄 Conteúdo</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label>Fonte (px)</label>
                        <input type="number" id="fonte_tamanho" value="<?= $cfg['fonte_tamanho'] ?>" min="10" max="20">
                    </div>
                    <div class="field-group">
                        <label>Altura da Linha</label>
                        <input type="number" id="linha_altura" value="<?= $cfg['linha_altura'] ?>" min="1" max="2.5" step="0.05">
                    </div>
                    <div class="field-group col-span-2">
                        <label>Espaçamento entre Campos (px)</label>
                        <input type="number" id="espacamento_rows" value="<?= $cfg['espacamento_rows'] ?>" min="0" max="20">
                    </div>
                </div>
            </div>

            <!-- PASSAGEIROS -->
            <div class="card p-5">
                <div class="section-title">👥 Colunas de Passageiros</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label>Largura Coluna Esq (%)</label>
                        <input type="number" id="pax_col_esq_width" value="<?= $cfg['pax_col_esq_width'] ?>" min="30" max="70">
                    </div>
                    <div class="field-group">
                        <label>Cor do Separador</label>
                        <input type="color" id="pax_separador_cor" value="<?= $cfg['pax_separador_cor'] ?>">
                    </div>
                    <div class="field-group">
                        <label>Padding Esq → Dir (px)</label>
                        <input type="number" id="pax_padding_direita" value="<?= $cfg['pax_padding_direita'] ?>" min="0" max="40">
                    </div>
                    <div class="field-group">
                        <label>Padding Dir ← (px)</label>
                        <input type="number" id="pax_padding_esquerda" value="<?= $cfg['pax_padding_esquerda'] ?>" min="0" max="40">
                    </div>
                </div>
            </div>

            <!-- RODAPÉ -->
            <div class="card p-5">
                <div class="section-title">📌 Rodapé</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label>Posição Bottom (mm)</label>
                        <input type="number" id="rodape_bottom" value="<?= $cfg['rodape_bottom'] ?>" min="-40" max="0">
                        <span class="hint">Negativo = abaixo da margem</span>
                    </div>
                    <div class="field-group">
                        <label>Tamanho da Fonte (px)</label>
                        <input type="number" id="rodape_tamanho" value="<?= $cfg['rodape_tamanho'] ?>" min="8" max="16">
                    </div>
                </div>
            </div>

            <!-- BOTÕES -->
            <div class="flex gap-3">
                <button onclick="salvarLayout()" id="btn-salvar"
                    class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-xs transition-colors shadow-lg">
                    💾 Salvar Layout
                </button>
                <button onclick="resetarPadrao()"
                    class="bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3.5 px-5 rounded-xl uppercase tracking-widest text-xs transition-colors">
                    ↺ Padrão
                </button>
            </div>

            <div id="msg-status" class="hidden text-center text-sm font-bold py-3 rounded-xl"></div>
        </div>

        <!-- COLUNA DIREITA: PREVIEW -->
        <div class="space-y-4">
            <div class="card p-4">
                <div class="section-title">👁️ Pré-visualização (aprox.)</div>
                <p class="text-xs text-slate-500 mb-3">O preview é aproximado. O PDF final pode ter pequenas variações por conta do motor dompdf.</p>
                <div id="preview-wrap">
                    <div id="preview-a4" style="padding: 30mm 15mm 25mm 15mm; box-sizing: border-box;">
                        <div class="prev-bg"></div>
                        <div class="prev-logo" id="prev-logo" style="top:-20mm; left:0mm; width:80px; height:80px;">
                            <img src="images/logo.png" style="width:80px; height:80px; object-fit:contain;">
                        </div>
                        <div class="prev-content">
                            <div class="prev-titulo" id="prev-titulo" style="font-size:16px; margin:-5mm auto 15mm auto; border-bottom:1.5px solid black; padding-bottom:1mm;">
                                RELATÓRIO DE TROCA DE TURMA
                            </div>
                            <div class="prev-row" id="prev-row-ex"><span class="prev-label">Unidade:</span> EXEMPLO LTDA</div>
                            <div class="prev-row"><span class="prev-label">Data:</span> 05/05/2026</div>
                            <div class="prev-row"><span class="prev-label">Local:</span> Aeroporto de Cabo Frio</div>
                            <div class="prev-row"><span class="prev-label">Modal:</span> Helicóptero</div>
                            <div class="prev-row" style="margin-top:8px;"><span class="prev-label">Horário de Saída do Hotel (Previsto e Real):</span></div>
                            <div style="margin-left:15px; margin-bottom:10px;"><span class="prev-label">Previsto:</span> 09 h 30 min &nbsp;&nbsp; <span class="prev-label">Real:</span> 09 h 36 min</div>
                            <div class="prev-row"><span class="prev-label">Horários de Embarque (Previsto e Real):</span></div>
                            <div style="margin-left:15px; margin-bottom:10px;"><span class="prev-label">Previsto:</span> 12 h 30 min &nbsp;&nbsp; <span class="prev-label">Real:</span> 12 h 48 min</div>
                            <div class="prev-row"><span class="prev-label">Nome do Preposto:</span> Ítalo Gabriel</div>
                            <div class="prev-row"><span class="prev-label">Informações:</span></div>
                            <div style="margin-bottom:12px;">Embarque e desembarque apenas de terceirizados.</div>
                            <div class="prev-pax-container" id="prev-pax-wrap" style="width: 100%; clear: both; margin-top: 8px;">
                                <div id="prev-pax-col1" style="width:48%; float:left; box-sizing:border-box; padding-right:10px; border-right:1.5px solid #ccc;">
                                    <p class="prev-label" style="margin-bottom:6px;">Nomes Passageiros Embarcando:</p>
                                    <div>1. JOÃO SILVA<br>2. MARIA SOUZA<br>3. PEDRO LIMA</div>
                                </div>
                                <div id="prev-pax-col2" style="width:52%; float:right; box-sizing:border-box; padding-left:10px;">
                                    <p class="prev-label" style="margin-bottom:6px;">Nomes Passageiros Desembarcados:</p>
                                    <div>1. ANA COSTA<br>2. CARLOS MELO<br>3. LUCIA RAMOS</div>
                                </div>
                                <div style="clear: both;"></div>
                            </div>
                        </div>
                        <div class="prev-footer" id="prev-footer" style="bottom:10mm; font-size:12px;">
                            Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br>
                            E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    // Valores padrão
    const DEFAULTS = {
        margem_topo: 30, margem_base: 25, margem_lateral: 15, margem_esq: 15,
        logo_topo: -25, logo_esq: 0, logo_largura: 80, logo_altura: 80,
        titulo_margem_topo: -5, titulo_margem_base: 8, titulo_tamanho: 16,
        titulo_sublinhado: 'border',
        fonte_tamanho: 14, linha_altura: 1.4, espacamento_rows: 6,
        pax_col_esq_width: 48, pax_separador_cor: '#d1d5db',
        pax_separador_esp: '1.5px solid', pax_padding_direita: 15, pax_padding_esquerda: 30,
        rodape_bottom: -15, rodape_tamanho: 13
    };

    function getVal(id) {
        const el = document.getElementById(id);
        if (!el) return DEFAULTS[id];
        return el.type === 'number' ? parseFloat(el.value) : el.value;
    }

    function atualizarPreview() {
        const a4 = document.getElementById('preview-a4');
        const mTop = getVal('margem_topo');
        const mBot = getVal('margem_base');
        const mLat = getVal('margem_lateral');
        const mEsq = getVal('margem_esq');
        a4.style.padding = `${mTop}mm ${mLat}mm ${mBot}mm ${mEsq}mm`;

        // Logo
        const logo = document.getElementById('prev-logo');
        const lW = getVal('logo_largura');
        const lH = getVal('logo_altura');
        logo.style.top = getVal('logo_topo') + 'mm';
        logo.style.left = getVal('logo_esq') + 'mm';
        logo.style.width = lW + 'px';
        logo.style.height = lH + 'px';
        logo.querySelector('img').style.width = lW + 'px';
        logo.querySelector('img').style.height = lH + 'px';

        // Título
        const titulo = document.getElementById('prev-titulo');
        titulo.style.fontSize = getVal('titulo_tamanho') + 'px';
        titulo.style.marginTop = getVal('titulo_margem_topo') + 'mm';
        titulo.style.marginBottom = getVal('titulo_margem_base') + 'mm';
        const sub = getVal('titulo_sublinhado');
        if (sub === 'underline') {
            titulo.style.borderBottom = 'none';
            titulo.style.textDecoration = 'underline';
        } else {
            titulo.style.textDecoration = 'none';
            titulo.style.borderBottom = '1.5px solid black';
        }

        // Conteúdo
        const fontSize = getVal('fonte_tamanho');
        const lineH = getVal('linha_altura');
        const rowSpacing = getVal('espacamento_rows');
        document.getElementById('preview-a4').style.fontSize = fontSize + 'px';
        document.getElementById('preview-a4').style.lineHeight = lineH;
        document.querySelectorAll('.prev-row').forEach(el => {
            el.style.marginBottom = rowSpacing + 'px';
        });

        // Passageiros
        const col1 = document.getElementById('prev-pax-col1');
        const col2 = document.getElementById('prev-pax-col2');
        const colW = getVal('pax_col_esq_width');
        const cor = getVal('pax_separador_cor');
        const padD = getVal('pax_padding_direita');
        const padE = getVal('pax_padding_esquerda');
        col1.style.width = colW + '%';
        col1.style.paddingRight = padD + 'px';
        col1.style.borderRight = `1.5px solid ${cor}`;
        col2.style.width = (100 - colW) + '%';
        col2.style.paddingLeft = padE + 'px';

        // Rodapé (cálculo compensando a margem base para igualar ao dompdf)
        const footer = document.getElementById('prev-footer');
        const calcBottom = mBot + getVal('rodape_bottom');
        footer.style.bottom = calcBottom + 'mm';
        footer.style.fontSize = getVal('rodape_tamanho') + 'px';

        // Escala do preview para caber na tela
        const wrap = document.getElementById('preview-wrap');
        const wrapW = wrap.offsetWidth;
        const a4W = 794; // ~210mm em px
        if (wrapW < a4W) {
            const scale = wrapW / a4W;
            a4.style.transform = `scale(${scale})`;
            a4.style.transformOrigin = 'top left';
            wrap.style.height = (297 * 3.7795 * scale) + 'px'; // 297mm em px
        } else {
            a4.style.transform = '';
            wrap.style.height = 'auto';
        }
    }

    function coletarDados() {
        return {
            margem_topo: getVal('margem_topo'),
            margem_base: getVal('margem_base'),
            margem_lateral: getVal('margem_lateral'),
            margem_esq: getVal('margem_esq'),
            logo_topo: getVal('logo_topo'),
            logo_esq: getVal('logo_esq'),
            logo_largura: getVal('logo_largura'),
            logo_altura: getVal('logo_altura'),
            titulo_margem_topo: getVal('titulo_margem_topo'),
            titulo_margem_base: getVal('titulo_margem_base'),
            titulo_tamanho: getVal('titulo_tamanho'),
            titulo_sublinhado: getVal('titulo_sublinhado'),
            fonte_tamanho: getVal('fonte_tamanho'),
            linha_altura: getVal('linha_altura'),
            espacamento_rows: getVal('espacamento_rows'),
            pax_col_esq_width: getVal('pax_col_esq_width'),
            pax_separador_cor: getVal('pax_separador_cor'),
            pax_separador_esp: '1.5px solid',
            pax_padding_direita: getVal('pax_padding_direita'),
            pax_padding_esquerda: getVal('pax_padding_esquerda'),
            rodape_bottom: getVal('rodape_bottom'),
            rodape_tamanho: getVal('rodape_tamanho'),
        };
    }

    async function salvarLayout() {
        const btn = document.getElementById('btn-salvar');
        const msg = document.getElementById('msg-status');
        btn.textContent = '⏳ Salvando...';
        btn.disabled = true;

        try {
            const resp = await fetch('salvar_layout.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(coletarDados())
            });
            const data = await resp.json();

            msg.classList.remove('hidden', 'bg-rose-50', 'text-rose-700', 'bg-emerald-50', 'text-emerald-700');
            if (data.sucesso) {
                msg.className = 'text-center text-sm font-bold py-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200';
                msg.textContent = `✅ ${data.mensagem} (${data.cache_limpo} PDFs em cache limpos)`;
            } else {
                msg.className = 'text-center text-sm font-bold py-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200';
                msg.textContent = '❌ Erro: ' + (data.erro || 'Falha ao salvar.');
            }
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 5000);
        } catch(e) {
            alert('Erro de rede: ' + e.message);
        } finally {
            btn.textContent = '💾 Salvar Layout';
            btn.disabled = false;
        }
    }

    function resetarPadrao() {
        if (!confirm('Restaurar todos os valores para o padrão original?')) return;
        for (const [id, val] of Object.entries(DEFAULTS)) {
            const el = document.getElementById(id);
            if (el) el.value = val;
        }
        atualizarPreview();
    }

    // Escuta todos os inputs para atualizar o preview em tempo real
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', atualizarPreview);
        el.addEventListener('change', atualizarPreview);
    });

    // Preview inicial
    window.addEventListener('load', () => {
        atualizarPreview();
    });
    window.addEventListener('resize', atualizarPreview);
</script>
</body>
</html>


