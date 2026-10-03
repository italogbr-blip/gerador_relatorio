const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Importa Supabase SDK do node_modules do core-app
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const dumpFile = path.join(__dirname, 'u596152436_relatorios.sql');

// Mapeamento de colunas permitidas por tabela no Supabase (PostgreSQL)
const TABLE_ALLOWED_COLUMNS = {
  usuarios: ['id', 'username', 'nome', 'email', 'nivel_autoridade', 'remember_token', 'last_activity', 'data_cadastro'],
  relatorios: ['id', 'usuario_id', 'empresa', 'unidade', 'local_atendimento', 'pdf_url', 'dados_json', 'teve_anexo', 'ip_origem', 'data_criacao'],
  notificacoes: ['id', 'titulo', 'mensagem', 'tipo', 'ativa', 'regra_exibicao', 'validade_dias', 'mostrar_feedback', 'data_criacao'],
  interacoes_popup: ['id', 'notificacao_id', 'usuario_id', 'feedback_nota', 'feedback_texto', 'data_interacao'],
  registro_logins: ['id', 'usuario_id', 'ip', 'data_login'],
  mms_mensagens: ['id', 'titulo', 'mensagem', 'tipo', 'autor_id', 'destinatario_id', 'data_envio'],
  mms_mensagens_lidas: ['mensagem_id', 'usuario_id', 'data_leitura'],
  mms_mensagens_agendadas: ['id', 'titulo', 'mensagem', 'tipo', 'autor_id', 'destinatario_id', 'frequencia', 'data_hora_proxima', 'data_criacao'],
  mms_versao_app: ['id', 'versao', 'descricao', 'data_criacao'],
  ips_bloqueados: ['ip', 'data_bloqueio', 'bloqueado_por'],
  mms_acessos_gerador: ['ip', 'ultimo_acesso', 'ultimo_preposto', 'localizacao', 'total_acessos'],
  configuracoes: ['id', 'meses_retencao_midia', 'ultima_atualizacao'],
  visitantes_online: ['ip', 'ultima_atividade'],
  coord_senha: ['id', 'senha_hash', 'atualizada_em'],
  coord_acessos_falhos: ['id', 'usuario_id', 'username', 'ip', 'user_agent', 'data_tentativa']
};

console.log('==================================================');
console.log('IMPORTADOR AUTOMÁTICO SUPABASE (VERSÃO ESTÁVEL)');
console.log('==================================================');

function parseSqlValue(valStr) {
  valStr = valStr.trim();
  if (valStr.toUpperCase() === 'NULL') return null;
  if (valStr.toUpperCase() === 'TRUE') return true;
  if (valStr.toUpperCase() === 'FALSE') return false;
  
  if (valStr.startsWith("'") && valStr.endsWith("'")) {
    let inner = valStr.substring(1, valStr.length - 1);
    inner = inner.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    return inner;
  }
  
  if (!isNaN(valStr) && valStr !== '') {
    return Number(valStr);
  }
  
  return valStr;
}

function parseSqlRow(rowStr) {
  let str = rowStr.trim();
  if (str.startsWith('(')) str = str.substring(1);
  if (str.endsWith(')')) str = str.substring(0, str.length - 1);
  
  const values = [];
  let currentVal = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escapeNext) {
      currentVal += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      currentVal += char;
      escapeNext = true;
      continue;
    }
    
    if (char === "'") {
      inString = !inString;
      currentVal += char;
      continue;
    }
    
    if (char === ',' && !inString) {
      values.push(parseSqlValue(currentVal));
      currentVal = '';
      continue;
    }
    
    currentVal += char;
  }
  
  if (currentVal.trim() !== '') {
    values.push(parseSqlValue(currentVal));
  }
  
  return values;
}

async function runImport() {
  const validUserIds = new Set();
  
  try {
    const { data: userRows } = await supabase.from('usuarios').select('id');
    if (userRows) {
      userRows.forEach(u => validUserIds.add(u.id));
    }
  } catch (e) {}

  const fileContent = fs.readFileSync(dumpFile, 'utf8');
  const lines = fileContent.split(/\r?\n/);
  
  let currentTable = null;
  let currentColumns = [];
  let inInsert = false;
  let fullStatement = '';
  
  const stats = {};

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    const trimmed = line.trim();
    
    if (trimmed.toUpperCase().startsWith('INSERT INTO')) {
      inInsert = true;
      const match = trimmed.match(/INSERT INTO\s+[`"]?([^`"\s\(]+)[`"]?\s*\(([^\)]+)\)/i);
      if (match) {
        currentTable = match[1].toLowerCase().replace(/[^a-z0-9_]/g, '');
        currentColumns = match[2].split(',').map(c => c.trim().replace(/[`"]/g, ''));
      }
      fullStatement = trimmed + ' ';
      continue;
    }
    
    if (inInsert) {
      fullStatement += line + ' ';
      if (trimmed.endsWith(';')) {
        inInsert = false;
        
        const valuesMatch = fullStatement.match(/VALUES\s*([\s\S]+);/i);
        if (valuesMatch && currentTable && currentColumns.length > 0) {
          const allowedCols = TABLE_ALLOWED_COLUMNS[currentTable];
          
          if (!allowedCols) {
            fullStatement = '';
            continue;
          }
          
          const valuesContent = valuesMatch[1].trim();
          const rowsList = [];
          let currentTuple = '';
          let depth = 0;
          let inStr = false;
          let esc = false;
          
          for (let i = 0; i < valuesContent.length; i++) {
            const ch = valuesContent[i];
            
            if (esc) {
              currentTuple += ch;
              esc = false;
              continue;
            }
            if (ch === '\\') {
              currentTuple += ch;
              esc = true;
              continue;
            }
            if (ch === "'") {
              inStr = !inStr;
            }
            if (ch === '(' && !inStr) {
              depth++;
            }
            if (depth > 0) {
              currentTuple += ch;
            }
            if (ch === ')' && !inStr) {
              depth--;
              if (depth === 0) {
                const parsedVals = parseSqlRow(currentTuple);
                if (parsedVals.length === currentColumns.length) {
                  const rawObj = {};
                  currentColumns.forEach((col, idx) => {
                    rawObj[col] = parsedVals[idx];
                  });
                  
                  if (currentTable === 'usuarios' && rawObj.id) {
                    validUserIds.add(rawObj.id);
                  }

                  if (rawObj.usuario_id && !validUserIds.has(rawObj.usuario_id)) {
                    rawObj.usuario_id = null;
                  }

                  if (currentTable === 'relatorios') {
                    if (!rawObj.pdf_url && rawObj.caminho_pdf) {
                      rawObj.pdf_url = rawObj.caminho_pdf;
                    }
                    if (typeof rawObj.dados_json === 'string') {
                      try {
                        rawObj.dados_json = JSON.parse(rawObj.dados_json);
                      } catch (e) {}
                    }
                    if (rawObj.teve_anexo !== undefined) {
                      rawObj.teve_anexo = Boolean(rawObj.teve_anexo);
                    }
                  }

                  const cleanObj = {};
                  for (const col of allowedCols) {
                    if (rawObj.hasOwnProperty(col)) {
                      cleanObj[col] = rawObj[col];
                    }
                  }
                  
                  rowsList.push(cleanObj);
                }
                currentTuple = '';
              }
            }
          }
          
          if (rowsList.length > 0) {
            const BATCH_SIZE = 10;
            for (let i = 0; i < rowsList.length; i += BATCH_SIZE) {
              const batch = rowsList.slice(i, i + BATCH_SIZE);
              try {
                const { error } = await supabase.from(currentTable).upsert(batch);
                if (error) {
                  console.error(`\n❌ [${currentTable}] Erro:`, error.message);
                } else {
                  stats[currentTable] = (stats[currentTable] || 0) + batch.length;
                  process.stdout.write(`\r✅ [${currentTable}]: ${stats[currentTable]} registros inseridos...`);
                }
              } catch (err) {
                console.error(`\n❌ [${currentTable}] Exceção:`, err.message);
              }
            }
            console.log('');
          }
        }
        
        fullStatement = '';
      }
    }
  }
  
  console.log('\n==================================================');
  console.log('IMPORTAÇÃO FINALIZADA COM SUCESSO!');
  console.log('==================================================');
  for (const [tbl, count] of Object.entries(stats)) {
    console.log(` - ${tbl.padEnd(25)}: ${count} registro(s) no Supabase.`);
  }
}

runImport().catch(err => console.error('Erro fatal:', err));
