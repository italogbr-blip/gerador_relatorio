const path = require('path');
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkUsuariosCols() {
  const { data, error } = await supabase.from('usuarios').select('*').limit(1);
  if (data && data[0]) {
    console.log('COLUNAS DA TABELA usuarios:', Object.keys(data[0]));
    console.log('DADO EXEMPLO:', data[0]);
  } else {
    console.log('Erro ou sem dados:', error);
  }
}

checkUsuariosCols();
