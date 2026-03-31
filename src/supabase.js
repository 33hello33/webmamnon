import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(
   supabaseUrl || 'https://placeholder.supabase.co',
   supabaseKey || 'placeholder-key'
);

const getManv = () => {
   try {
      const s = localStorage.getItem('auth_session');
      if (s) {
         const d = JSON.parse(s);
         return d?.user?.manv || d?.user?.username || 'Khách';
      }
   } catch (e) { }
   return 'Khách';
};

export const generateId = async (tableName, idColumn, prefix, padding) => {
   const { data, error } = await supabase
      .from(tableName)
      .select(idColumn)
      .filter(idColumn, 'ilike', `${prefix}%`)
      .order(idColumn, { ascending: false })
      .limit(1);

   if (error || !data || data.length === 0) {
      return `${prefix}${String(1).padStart(padding, '0')}`;
   }
   const maxId = data[0][idColumn];
   const numStr = maxId.substring(prefix.length);
   const num = parseInt(numStr, 10);
   if (isNaN(num)) return `${prefix}${String(1).padStart(padding, '0')}`;
   return `${prefix}${String(num + 1).padStart(padding, '0')}`;
};

const notifyLogEvent = (mota, manv) => {
   const e = new CustomEvent('app_log_inserted', { detail: { mota, manv, created_at: new Date() } });
   window.dispatchEvent(e);
};

export const insertLog = async (mota) => {
   try {
      const manv = getManv();
      // Non-blocking fire and forget
      supabase.from('tbl_log').insert([{ manv, mota }]).then(({ error }) => {
         if (!error) notifyLogEvent(mota, manv);
      });
   } catch (err) { console.error('Lỗi khi ghi log:', err) }
};

// Global interceptor for auto-logging Supabase REST API requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
   let url = typeof args[0] === 'string' ? args[0] : args[0].url;
   let method = args[1]?.method || (args[0] && args[0].method) || 'GET';

   // Process the request
   const response = await originalFetch(...args);

   if (url.includes('/rest/v1/') && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      const match = url.match(/\/rest\/v1\/([^?]+)/);
      if (match) {
         const table = match[1];
         if (table !== 'tbl_log') {
            let action = '';
            if (method === 'POST') action = 'Nhập mới dòng vào DB';
            if (method === 'PATCH') action = 'Sửa/Cập nhật dòng ở DB';
            if (method === 'DELETE') action = 'Xóa dòng khỏi DB';

            if (response.ok) {
               insertLog(`[${action}] Bảng: ${table}`);
            } else {
               insertLog(`[LỖI ${action}] Bảng: ${table}`);
            }
         }
      }
   }

   return response;
};
