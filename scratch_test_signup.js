const path = require('path');
const { createClient } = require(path.join(__dirname, 'core-app', 'node_modules', '@supabase', 'supabase-js'));

const SUPABASE_URL = 'https://xtlhrlbdpnnrcivpiomv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YAXixrfXCtT87zdBNn_9sw_iO98WjED';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testSignUp() {
  console.log('Testando signUp no Supabase Auth...');
  const res = await supabase.auth.signUp({
    email: 'italogabriel1503@gmail.com',
    password: 'senhaSegura123!',
  });
  console.log('Resultado:', res);
}

testSignUp();
