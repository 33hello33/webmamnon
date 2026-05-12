const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yedyciampbkjaxauxhwa.supabase.co';
const supabaseKey = 'sb_publishable_gEzQS2jjwFZ33BWBpiHJwQ_5w4QK3Bg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  const { data, error } = await supabase.from('tbl_suckhoe').select('*').limit(1);
  if (error) {
    console.log('tbl_suckhoe does not exist or error:', error.message);
  } else {
    console.log('tbl_suckhoe exists!');
  }
}

checkTable();
