const path = require('path');
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectUsers() {
  const { data: users, error } = await supabase.from('usuarios').select('*');
  if (error) {
    console.error('Erro ao buscar usuarios:', error.message);
  } else {
    console.log('--- USUÁRIOS NO SUPABASE (public.usuarios) ---');
    console.log(JSON.stringify(users, null, 2));
  }
}

inspectUsers();
