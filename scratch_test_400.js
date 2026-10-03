const path = require('path');
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testQueryWithSpaces() {
  const inputWithSpace = 'Silas Miguel';
  console.log(`Testando busca com espaco: "${inputWithSpace}"`);

  // Teste 1: com ilike sem aspas no or
  const res1 = await supabase
    .from('usuarios')
    .select('*')
    .or(`email.ilike.${inputWithSpace},username.ilike.${inputWithSpace}`);
  console.log('Resultado 1 (unquoted space):', res1.error ? `ERRO ${res1.error.code}: ${res1.error.message}` : 'Sucesso');

  // Teste 2: com aspas ou urlencode no or
  const encodedStr = encodeURIComponent(inputWithSpace);
  const res2 = await supabase
    .from('usuarios')
    .select('*')
    .or(`email.ilike."*${inputWithSpace}*",username.ilike."*${inputWithSpace}*"`);
  console.log('Resultado 2 (quoted):', res2.error ? `ERRO ${res2.error.code}: ${res2.error.message}` : 'Sucesso');

  // Teste 3: buscando direto sem .or() com falha
  const res3 = await supabase.from('usuarios').select('*');
  console.log('Resultado 3 (select all & find):', res3.data ? `Encontrados ${res3.data.length} usuários` : 'Erro');
}

testQueryWithSpaces();
