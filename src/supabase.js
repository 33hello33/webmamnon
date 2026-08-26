import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
export const SUPABASE_SCHEMA = process.env.REACT_APP_SUPABASE_SCHEMA || 'public';

export const baseSupabase = createClient(
   supabaseUrl || 'https://placeholder.supabase.co',
   supabaseKey || 'placeholder-key'
);

export const supabase = createClient(
   supabaseUrl || 'https://placeholder.supabase.co',
   supabaseKey || 'placeholder-key',
   process.env.REACT_APP_SUPABASE_SCHEMA ? { db: { schema: process.env.REACT_APP_SUPABASE_SCHEMA } } : undefined
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
         const table = match[1].split('?')[0].replace(/\/$/, '');
         // Exclude tables that have manual logging to avoid duplicates
         const manualLoggedTables = [
            'tbl_log', 'tbl_hv', 'tbl_nv', 'tbl_hanghoa', 'tbl_lop',
            'tbl_ghichu', 'tbl_hd', 'tbl_nhapkho', 'tbl_thongbao',
            'tbl_config', 'tbl_phieuchi', 'tbl_billhanghoa',
            'tbl_diemdanh', 'hv_messages', 'documents'
         ];
         if (!manualLoggedTables.includes(table)) {
            let action = '';
            if (method === 'POST') action = 'Nhập mới dòng vào DB';
            if (method === 'PATCH') action = 'Sửa/Cập nhật dòng ở DB';
            if (method === 'DELETE') action = 'Xóa dòng khỏi DB';

            if (response.ok) {
               let extraInfo = '';
               try {
                  const body = args[1]?.body ? JSON.parse(args[1].body) : null;
                  if (body) {
                     const data = Array.isArray(body) ? body[0] : body;
                     // Try to find identifying fields
                     const identityFields = [
                        'tenhv', 'tennv', 'tenlop', 'ten_hanghoa', 'tensp',
                        'ten_kh', 'ma_hanghoa', 'mahv', 'manv', 'malop',
                        'so_hd', 'sohoadon', 'tieude'
                     ];
                     const foundField = identityFields.find(f => data[f]);
                     if (foundField) {
                        extraInfo = ` | Chi tiết: ${data[foundField]}`;
                     }

                     // For updates, we might want to know what changed if the body is small
                     if (method === 'PATCH' && Object.keys(data).length <= 5) {
                        const changes = Object.entries(data)
                           .filter(([k]) => !['updated_at', 'created_at'].includes(k))
                           .map(([k, v]) => `${k}=${v}`)
                           .join(', ');
                        if (changes) extraInfo += ` (${changes})`;
                     }
                  }
               } catch (e) {
                  console.warn('Could not parse request body for logging', e);
               }

               // Extract ID from URL if possible for PATCH/DELETE
               if ((method === 'PATCH' || method === 'DELETE') && !extraInfo) {
                  const idMatch = url.match(/[?&]([^=]+)=eq\.([^&]+)/);
                  if (idMatch) {
                     extraInfo = ` | ID: ${idMatch[2]}`;
                  }
               }

               insertLog(`[${action}] Bảng: ${table}${extraInfo}`);
            } else {
               insertLog(`[LỖI ${action}] Bảng: ${table}`);
            }
         }
      }
   }

   return response;
};
