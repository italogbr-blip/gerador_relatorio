const path = require('path');
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkData() {
  const { data: users, count: userCount } = await supabase.from('usuarios').select('*', { count: 'exact' });
  const { data: rels, count: relCount } = await supabase.from('relatorios').select('*', { count: 'exact' });
  
  console.log('--- STATUS DA BASE DE DADOS SUPABASE ---');
  console.log(`- Usuários cadastrados: ${userCount || users?.length}`);
  console.log(`- Relatórios cadastrados: ${relCount || rels?.length}`);
  if (rels && rels.length > 0) {
    console.log('Exemplo de relatório no Supabase:', JSON.stringify(rels[0], null, 2));
  }
}

checkData();
