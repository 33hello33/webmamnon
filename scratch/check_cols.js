const { createClient } = require('@supabase/supabase-client');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://jmqmsqzvzqzvzqzvzqzv.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '...';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase.from('tbl_hv').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]));
  } else {
    console.log('No data in tbl_hv');
    // Try to get columns from another table just in case
    const { data: cols } = await supabase.rpc('get_column_names', { table_name: 'tbl_hv' });
    console.log('Columns from RPC:', cols);
  }
}

checkColumns();
