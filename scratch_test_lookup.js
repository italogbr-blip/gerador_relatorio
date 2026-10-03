const path = require('path');
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testUserLookup(inputStr) {
  console.log(`Buscando por: "${inputStr}"`);
  
  // Teste 1: eq
  const { data: d1, error: e1 } = await supabase
    .from('usuarios')
    .select('*')
    .or(`email.eq.${inputStr},username.eq.${inputStr}`)
    .maybeSingle();
  console.log('Teste .eq:', d1 ? `Encontrado (ID ${d1.id}, Username: ${d1.username})` : 'Nenhum', e1?.message || '');

  // Teste 2: ilike
  const { data: d2, error: e2 } = await supabase
    .from('usuarios')
    .select('*')
    .or(`email.ilike.${inputStr},username.ilike.${inputStr}`)
    .maybeSingle();
  console.log('Teste .ilike:', d2 ? `Encontrado (ID ${d2.id}, Username: ${d2.username})` : 'Nenhum', e2?.message || '');
}

async function runAll() {
  await testUserLookup('italogabriel');
  await testUserLookup('italogabriel1503@gmail.com');
  await testUserLookup('Silas Miguel');
  await testUserLookup('Joao1234');
}

runAll();
