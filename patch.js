const fs = require('fs');
const path = require('path');
const filePath = 'd:\\lap trinh\\website mầm non\\src\\components\\FinanceManager.js';
let code = fs.readFileSync(filePath, 'utf8');

if (!code.includes('import { toPng }')) {
   code = code.replace(
      "import './FinanceManager.css';",
      "import { toPng } from 'html-to-image';\nimport { uploadToR2 } from '../utils/cloudflareR2';\nimport { compressImage } from '../utils/imageUtils';\nimport './FinanceManager.css';"
   );
}

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
      'export default function FinanceManager({ showToast }) {',
      helpers + '\\nexport default function FinanceManager({ showToast }) {'
   );
}

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
         nhanvien: r.nhanvien || r.manv || authRef.current?.user?.username || 'Thu Ngân',
         thoiluong: r.thoiluong, phuthu: parsedPt,
         actualMealRefund: r.trutienan, actualTuitionRefund: r.tiennghiphep, ngoaiKhoaDeduction: r.trutiendangoai,
         deductionSum: Number(r.trutienan||0) + Number(r.tiennghiphep||0) + Number(r.trutiendangoai||0)
      });
   };
`;

if (!code.includes('const [downloadingInvoice, setDownloadingInvoice] = useState(null)')) {
   code = code.replace(
      "const [activeSubTab, setActiveSubTab] = useState('tongquan');",
      "const [activeSubTab, setActiveSubTab] = useState('tongquan');\\n" + states
   );
}

if (code.includes("alert('Tạo hóa đơn thành công!');") && !code.includes("triggerDownloadInvoice(")) {
   code = code.replace(
      "alert('Tạo hóa đơn thành công!');",
      "alert('Tạo hóa đơn thành công! Hệ thống đang xuất ảnh...');\\n         triggerDownloadInvoice({ ...insertData, mahv: r.mahv, dadong: r.tongcong, conno: '0' });"
   );
}

if (code.includes("handleOpenEditInvoice(r)}><Edit2 size={14} /> Sửa</button>") && !code.includes("triggerDownloadInvoice(r)")) {
   code = code.replace(
      "handleOpenEditInvoice(r)}><Edit2 size={14} /> Sửa</button>",
      "handleOpenEditInvoice(r)}><Edit2 size={14} /> Sửa</button>\\n<button className=\"btn-blue-sm\" style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => { const hv = hvMap[r.mahv] || {}; triggerDownloadInvoice({ ...r, tenhv: hv.tenhv, sdt: hv.sdt, nhanvien: nvMap[r.manv] || r.nhanvien }); }}><DownloadCloud size={14} /> Tải Ảnh</button>"
   );
}

if (code.includes("handleOpenEditInvoice(r)} style={{ color: '#f59e0b', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={16} /></button>") && !code.includes("title=\"Tải ảnh Hóa Đơn\"")) {
   code = code.replace(
      "handleOpenEditInvoice(r)} style={{ color: '#f59e0b', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={16} /></button>",
      "handleOpenEditInvoice(r)} style={{ color: '#f59e0b', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}><Edit2 size={16} /></button>\\n<button title=\"Tải ảnh Hóa Đơn\" onClick={() => { const hv = hvMap[r.mahv] || {}; triggerDownloadInvoice({ ...r, tenhv: hv.tenhv, sdt: hv.sdt, nhanvien: nvMap[r.manv] || r.nhanvien }); }} style={{ color: '#0284c7', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}><DownloadCloud size={16} /></button>"
   );
}

const hiddenJSX = `
         <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden', opacity: 0.01, zIndex: -100, pointerEvents: 'none', background: '#ffffff' }}>
            <div id="download-invoice-node" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>
               <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.2, pointerEvents: 'none', backgroundImage: \`url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 20 50 10 T 100 10' fill='none' stroke='%230066cc' stroke-width='0.5'/%3E%3Cpath d='M0 5 Q 25 15 50 5 T 100 5' fill='none' stroke='%230066cc' stroke-width='0.3' opacity='0.5'/%3E%3C/svg%3E")\`, backgroundRepeat: 'repeat' }} />
               <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-30deg)', fontSize: '60pt', fontWeight: 'bold', color: 'rgba(0, 102, 204, 0.05)', zIndex: 0, pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center', width: '150%' }}>
                  {config?.tencongty || 'ĐÃ THANH TOÁN'}
               </div>
               <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ width: '180px', textAlign: 'left' }}>
                        <img crossOrigin="anonymous" src={config?.logo || "/logo.png"} alt="logo" style={{ maxWidth: '160px', maxHeight: '160px', objectFit: 'contain' }} onError={(e) => { e.target.src = "/logo.png" }} />
                     </div>
                     <div style={{ flex: 1, textAlign: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>{config?.tencongty || 'Tên Công Ty'}</h2>
                        <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 600, color: '#4b5563' }}>Địa chỉ: {config?.diachicongty}</p>
                     </div>
                     <div style={{ width: '150px', textAlign: 'right', fontSize: '14px' }}>
                        <div>Mã HĐ: <b style={{ fontWeight: 950 }}>{downloadingInvoice?.mahd}</b></div>
                        <div>Ngày lập: <span style={{ fontWeight: 600 }}>{downloadingInvoice?.ngaylap ? new Date(downloadingInvoice.ngaylap).toLocaleDateString("vi-VN") : ""}</span></div>
                     </div>
                  </div>
                  <div style={{ textAlign: "center", fontWeight: "950", fontSize: "20pt", margin: "15px 0", color: '#000', textTransform: 'uppercase', textDecoration: 'underline' }}>BIÊN LAI THU HỌC PHÍ</div>
                  <div style={{ fontSize: "14pt", lineHeight: "1.8", margin: '20px 0' }}>
                     <div style={{ display: "flex", justifyContent: "space-between", marginBottom: '5px' }}>
                        <div>Họ và tên: <b>{downloadingInvoice?.tenhv}</b></div>
                        <div>SĐT: <b>{downloadingInvoice?.sdt || ""}</b></div>
                     </div>
                     <div>Khóa học: <b>{downloadingInvoice?.tenlop}</b></div>
                     <div>Tháng đóng học phí/Thời lượng: <b>{downloadingInvoice?.thoiluong || "..."}</b></div>
                     <div style={{ marginTop: '5px' }}>Hình thức đóng tiền: <b>{downloadingInvoice?.hinhthuc || "..."}</b></div>
                     <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />
                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Học phí: <b>{downloadingInvoice?.hocphi} đ</b></div>
                        <div>Giảm HP: <b>{downloadingInvoice?.giamhocphi} đ</b></div>
                        <div>{downloadingInvoice?.nocu && String(downloadingInvoice.nocu).startsWith('-') ? 'Tiền dư đối trừ' : 'Nợ cũ'}: <b>{downloadingInvoice?.nocu} đ</b></div>
                     </div>
                     {downloadingInvoice?.phuthu && downloadingInvoice.phuthu.length > 0 && (
                        <div style={{ marginTop: '5px', padding: '5px', background: '#f9fafb', borderRadius: '4px' }}>
                           {downloadingInvoice.phuthu.map((pt, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt' }}>
                                 <span>+ {pt.name || 'Phụ thu'}:</span><b>{fCur(pt.amount)} đ</b>
                              </div>
                           ))}
                        </div>
                     )}
                     {downloadingInvoice?.deductionSum > 0 && (
                        <div style={{ marginTop: '5px', padding: '8px', background: '#ecfdf5', borderRadius: '4px', color: '#065f46', fontSize: '11pt' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>- Hoàn trả tiền ăn (Nghỉ liên tiếp ≥3 ngày):</span><b>-{fCur(downloadingInvoice?.actualMealRefund || 0)} đ</b>
                           </div>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                              <span>- Hoàn trả học phí (Nghỉ liên tiếp ≥6 ngày):</span><b>-{fCur(Math.round(downloadingInvoice?.actualTuitionRefund || 0))} đ</b>
                           </div>
                           {(Number(downloadingInvoice?.ngoaiKhoaDeduction) || 0) > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                 <span>- Trừ tiền dã ngoại tháng trước:</span><b>-{fCur(downloadingInvoice?.ngoaiKhoaDeduction || 0)} đ</b>
                              </div>
                           )}
                        </div>
                     )}
                     <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginTop: '5px' }}>
                        <div>Tổng cộng: <b>{downloadingInvoice?.tongcong} đ</b></div>
                        <div>Đã đóng: <b style={{ color: '#059669' }}>{downloadingInvoice?.dadong} đ</b></div>
                        <div>Còn lại: <b style={{ color: '#dc2626' }}>{downloadingInvoice?.conno} đ</b></div>
                     </div>
                     <div style={{ marginTop: '10px' }}>Ghi chú: {downloadingInvoice?.ghichu || ""}</div>
                  </div>
                  <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
                     <div>Facebook: Doremi <br />SĐT/Zalo: {config?.sdtcongty}</div>
                     <div style={{ textAlign: "center" }}>Nhân viên thu tiền <br /><br /><br /><b>{downloadingInvoice?.nhanvien}</b></div>
                  </div>
               </div>
            </div>
         </div>
         {previewImg && (
            <div className="sp-modal-overlay" onClick={() => setPreviewImg(null)} style={{ zIndex: 3000, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: '15px' }}>
               <div className="sp-success-modal animate-slide-up" onClick={e => e.stopPropagation()} style={{ padding: '20px', maxWidth: '100%', width: '450px', background: 'white', borderRadius: '12px', position: 'relative' }}>
                  <button onClick={() => setPreviewImg(null)} style={{ position: 'absolute', right: 10, top: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
                  <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '10px', color: '#0369a1', fontSize: '1rem' }}>NHẤN GIỮ HÌNH ĐỂ LƯU / CHIA SẺ HÓA ĐƠN</p>
                  <img src={previewImg} alt="Preview Invoice" style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <div style={{ marginTop: '15px', textAlign: 'center' }}>
                     <button style={{ width: '100%', padding: '10px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }} onClick={() => setPreviewImg(null)}>HOÀN TẤT</button>
                  </div>
               </div>
            </div>
         )}
`;

if (!code.includes('id="download-invoice-node"')) {
   const lastDivIndex = code.lastIndexOf('</div>');
   code = code.substring(0, lastDivIndex) + hiddenJSX + code.substring(lastDivIndex);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('FinanceManager.js patched successfully!');
