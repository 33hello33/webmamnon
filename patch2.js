const fs = require('fs');
const path = require('path');
const filePath = 'd:\\lap trinh\\website mầm non\\src\\components\\FinanceManager.js';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Helpers
const helpers = `
const dataUrlToBlob = (dataUrl) => {
   const [meta, base64] = dataUrl.split(',');
   const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/png';
   const binary = atob(base64);
   const bytes = new Uint8Array(binary.length);
   for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
   return new Blob([bytes], { type: mime });
};
const sanitizeFileSegment = (value, fallback = 'file') => {
   const normalized = String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\\s+/g, ' ').trim().replace(/\\s/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
   return normalized || fallback;
};
const buildStoredImageKey = (folder, studentId, recordId, extension = 'jpg') => {
   const safeFolder = sanitizeFileSegment(folder, 'exports');
   const safeStudentId = sanitizeFileSegment(studentId, 'student');
   const safeRecordId = sanitizeFileSegment(recordId, 'record');
   const safeExtension = sanitizeFileSegment(extension, 'jpg').replace(/^\\.+/, '') || 'jpg';
   return \`\${safeFolder}/\${safeStudentId}/\${Date.now()}_\${safeRecordId}.\${safeExtension}\`;
};
const uploadGeneratedImage = async (file, storedImageKey, currentConfig) => {
   if (currentConfig?.r2_enabled) {
      const uploadedUrl = await uploadToR2(file, currentConfig.r2_endpoint, currentConfig.r2_access_key_id, currentConfig.r2_secret_access_key, currentConfig.r2_bucket_name, currentConfig.r2_public_url, { key: storedImageKey });
      if (!uploadedUrl) throw new Error('Không nhận được đường dẫn ảnh từ Cloudflare R2.');
      return uploadedUrl;
   }
   const { error: upErr } = await supabase.storage.from('assets').upload(storedImageKey, file, { upsert: true, contentType: file.type || 'image/jpeg', cacheControl: '3600' });
   if (upErr) throw upErr;
   const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(storedImageKey);
   if (!publicUrl) throw new Error('Lỗi Supabase Storage.');
   return publicUrl;
};
const updateGeneratedImageUrl = async (tableName, studentId, recordId, imageUrl) => {
   for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from(tableName).update({ image_url: imageUrl }).eq('mahv', studentId).eq('mahd', recordId);
      if (!error) return;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
   }
};
`;

if (!code.includes('const dataUrlToBlob =')) {
   code = code.replace(
      /export default function FinanceManager[^{]*\{/,
      match => helpers + '\n' + match
   );
}

// 2. States
const states = `
   const [downloadingInvoice, setDownloadingInvoice] = useState(null);
   const [previewImg, setPreviewImg] = useState(null);
   const configRef = React.useRef(config);
   configRef.current = config;
   const invoiceExportLockRef = React.useRef(null);

   useEffect(() => {
      if (downloadingInvoice) {
         if (invoiceExportLockRef.current === downloadingInvoice.mahd) return;
         invoiceExportLockRef.current = downloadingInvoice.mahd;
         const processPng = async () => {
            try {
               await new Promise(r => setTimeout(r, 1500));
               const node = document.getElementById('download-invoice-node');
               if (node) {
                  node.style.position = 'fixed';
                  node.style.top = '0';
                  node.style.left = '0';
                  node.style.zIndex = '9999';
                  node.style.opacity = '1';
                  node.style.visibility = 'visible';
                  const images = node.querySelectorAll('img');
                  await Promise.all(Array.from(images).map(img => {
                     if (img.complete) return Promise.resolve();
                     return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
                  }));
                  await new Promise(requestAnimationFrame);
                  await new Promise(r => setTimeout(r, 500));
                  const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#ffffff' });
                  node.style.position = 'static';
                  node.style.opacity = '0.01';
                  if (window.innerWidth <= 991) {
                     setPreviewImg(dataUrl);
                  } else {
                     const link = document.createElement('a');
                     link.download = \`HoaDon_\${sanitizeFileSegment(downloadingInvoice.tenhv, 'Student')}_\${downloadingInvoice.mahd}.png\`;
                     link.href = dataUrl;
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                  }
                  try {
                     const fileName = \`HoaDon_\${sanitizeFileSegment(downloadingInvoice.tenhv, 'Student')}_\${downloadingInvoice.mahd}.png\`;
                     const blob = dataUrlToBlob(dataUrl);
                     const pngFile = new File([blob], fileName, { type: 'image/png' });
                     const file = await compressImage(pngFile, 150);
                     const storedImageKey = buildStoredImageKey('invoice-images', downloadingInvoice.mahv, downloadingInvoice.mahd, file.name.split('.').pop() || 'jpg');
                     const imageUrl = await uploadGeneratedImage(file, storedImageKey, configRef.current);
                     await updateGeneratedImageUrl('tbl_hd', downloadingInvoice.mahv, downloadingInvoice.mahd, imageUrl);
                  } catch (err) { console.error('Lỗi upload PNG:', err); }
               }
            } catch (err) { console.error('Lỗi xuất PNG:', err); }
            finally {
               if (invoiceExportLockRef.current === downloadingInvoice.mahd) invoiceExportLockRef.current = null;
               setDownloadingInvoice(null);
            }
         };
         processPng();
      }
   }, [downloadingInvoice]);

   const triggerDownloadInvoice = (r) => {
      const phuthuStr = typeof r.phuthu === 'string' ? r.phuthu : JSON.stringify(r.phuthu || []);
      let parsedPt = [];
      try { parsedPt = JSON.parse(phuthuStr); } catch (e) { }
      
      setDownloadingInvoice({
         mahd: r.mahd, mahv: r.mahv, ngaylap: r.ngaylap,
         tenhv: r.tenhv || r.mahv?.tenhv || '', sdt: r.sdt || '',
         tenlop: r.tenlop, ngaybatdau: r.ngaybatdau, ngayketthuc: r.ngayketthuc,
         hocphi: fCur(r.hocphi), giamhocphi: fCur(r.giamhocphi), sobuoihoc: r.sobuoihoc,
         tongcong: fCur(r.tongcong), dadong: fCur(r.dadong), conno: fCur(r.conno), nocu: '0',
         hinhthuc: r.hinhthuc, ghichu: r.ghichu,
         nhanvien: r.nhanvien || r.manv || 'Thu Ngân',
         thoiluong: r.thoiluong, phuthu: parsedPt,
         actualMealRefund: r.trutienan, actualTuitionRefund: r.tiennghiphep, ngoaiKhoaDeduction: r.trutiendangoai,
         deductionSum: Number(r.trutienan||0) + Number(r.tiennghiphep||0) + Number(r.trutiendangoai||0)
      });
   };
`;

if (!code.includes('const [downloadingInvoice, setDownloadingInvoice] = useState(null)')) {
   code = code.replace(
      /const \{ config \} = useConfig\(\);/,
      match => match + '\n' + states
   );
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('FinanceManager.js states and helpers patched successfully!');
