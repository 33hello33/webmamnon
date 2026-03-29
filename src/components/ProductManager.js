import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useConfig } from '../ConfigContext';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import * as XLSX from 'xlsx';
import { Search, PlusCircle, Edit, Trash2, DownloadCloud, UploadCloud, PackageOpen, X, Info, Plus } from 'lucide-react';
import './ProductManager.css';

const pCur = (val) => parseInt(String(val || 0).replace(/,/g, ''), 10) || 0;

export default function ProductManager({ currentUser }) {
   const { config } = useConfig();
   
   const walletsConfig = useMemo(() => (config ? [
      { id: 'vi1', name: config.vi1?.name || '' },
      { id: 'vi2', name: config.vi2?.name || '' },
      { id: 'vi3', name: config.vi3?.name || '' },
      { id: 'vi4', name: config.vi4?.name || '' }
   ].filter(w => w.name.trim() !== '') : []), [config]);

   const [products, setProducts] = useState([]);
   const [loading, setLoading] = useState(false);
   const [searchTerm, setSearchTerm] = useState('');
   const fileRef = useRef(null);

   // Modal Thêm/Sửa
   const [isFormOpen, setIsFormOpen] = useState(false);
   const [isEdit, setIsEdit] = useState(false);
   const [formData, setFormData] = useState({ mahang: '', tenhang: '', dvt: '' });

   // Modal Nhập Kho
   const [isImportOpen, setIsImportOpen] = useState(false);
   const [importData, setImportData] = useState({ 
      mahang: '', tenhang: '', soluongThem: '', gianhap: '', giaban: '', 
      soluongCu: 0, nhacungcap: '', 
      hinhthuc: walletsConfig[0]?.name || 'Tiền mặt' 
   });

   // Batch Import
   const [nvMap, setNvMap] = useState({});
   const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
   const [batchImportData, setBatchImportData] = useState({
      nhacungcap: '',
      hinhthuc: walletsConfig[0]?.name || 'Tiền mặt',
      manv: '',
      rows: []
   });

   const fetchItems = async () => {
      setLoading(true);
      const { data } = await supabase.from('tbl_hanghoa').select('*').order('mahang');
      setProducts((data || []).filter(p => p.daxoa !== 'Đã Xóa'));
      setLoading(false);
   };

   useEffect(() => {
      fetchItems();
      const fetchNv = async () => {
         const { data: nvs } = await supabase.from('tbl_nv').select('manv, tennv');
         const nVM = {}; (nvs || []).forEach(n => nVM[n.manv] = n.tennv); setNvMap(nVM);
      };
      fetchNv();
   }, []);

   // Format currency wrapper
   const fCur = (val) => {
      if (!val) return '0';
      const parsed = parseInt(String(val).replace(/,/g, ''), 10);
      return isNaN(parsed) ? '0' : parsed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
   };

   const generateCode = () => {
      let highest = 0;
      products.forEach(p => {
         const num = parseInt(p.mahang.replace(/\D/g, ''), 10);
         if (!isNaN(num) && num > highest) highest = num;
      });
      return `SP${String(highest + 1).padStart(3, '0')}`;
   };

   const handleOpenAdd = () => {
      setFormData({ mahang: generateCode(), tenhang: '', dvt: 'Cái' });
      setIsEdit(false);
      setIsFormOpen(true);
   };

   const handleOpenEdit = (prod) => {
      setFormData({ mahang: prod.mahang, tenhang: prod.tenhang, dvt: prod.dvt || 'Cái' });
      setIsEdit(true);
      setIsFormOpen(true);
   };

   const handleSaveProduct = async (e) => {
      e.preventDefault();
      if (isEdit) {
         await supabase.from('tbl_hanghoa').update({ tenhang: formData.tenhang, dvt: formData.dvt }).eq('mahang', formData.mahang);
      } else {
         await supabase.from('tbl_hanghoa').insert([{
            mahang: formData.mahang,
            tenhang: formData.tenhang,
            dvt: formData.dvt,
            soluong: 0,
            giaban: '0',
            gianhap: '0',
            daxoa: null
         }]);
      }
      setIsFormOpen(false);
      fetchItems();
   };

   const handleDelete = async (masp) => {
      if (!window.confirm("Cập nhật trạng thái: Bạn có chắc chắn muốn Xóa mặt hàng này khỏi kho chứ?")) return;
      await supabase.from('tbl_hanghoa').update({ daxoa: 'Đã Xóa' }).eq('mahang', masp);
      fetchItems();
   };

   const handleOpenImport = (prod) => {
      setImportData({
         mahang: prod.mahang,
         tenhang: prod.tenhang,
         soluongThem: '',
         gianhap: fCur(prod.gianhap || 0),
         giaban: fCur(prod.giaban || 0),
         soluongCu: pCur(prod.soluong),
         nhacungcap: '',
         hinhthuc: walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt'
      });
      setIsImportOpen(true);
   };

   const handleSaveImport = async (e) => {
      e.preventDefault();
      const rawSoluongThem = pCur(importData.soluongThem);
      const totalQuantity = pCur(importData.soluongCu) + rawSoluongThem;
      const rawGianhap = String(importData.gianhap).replace(/,/g, '');
      const rawGiaban = String(importData.giaban).replace(/,/g, '');

      // 1. Cập nhật tồn kho vào Hàng Hóa gốc
      await supabase.from('tbl_hanghoa').update({
         soluong: totalQuantity,
         gianhap: rawGianhap,
         giaban: rawGiaban
      }).eq('mahang', importData.mahang);

      // 2. Ghi chú log lịch sử Nhập Kho
      if (rawSoluongThem > 0) {
         const manv = currentUser?.manv || '';

         const { data: recentNK } = await supabase.from('tbl_nhapkho').select('manhapkho').order('manhapkho', { ascending: false }).limit(1);
         let nextNum = 1;
         if (recentNK && recentNK.length > 0 && recentNK[0].manhapkho) {
            const numPart = recentNK[0].manhapkho.replace(/\D/g, '');
            if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
         }
         const newMaNK = `NK${String(nextNum).padStart(5, '0')}`;

         const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();
         const thanhtien = (rawSoluongThem * parseInt(rawGianhap || 0)).toString();

         await supabase.from('tbl_nhapkho').insert([{
            manhapkho: newMaNK,
            ngaynhap: localNow,
            mahang: importData.mahang,
            gianhap: rawGianhap,
            soluong: rawSoluongThem,
            thanhtien: thanhtien,
            manv: manv,
            nhacungcap: importData.nhacungcap || '',
            hinhthuc: importData.hinhthuc || (walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt'),
            daxoa: null
         }]);
      }

      setIsImportOpen(false);
      fetchItems();
   };

   const handleOpenBatchImport = () => {
      const manv = currentUser?.manv || currentUser?.username || Object.keys(nvMap)[0] || '';
      setBatchImportData({
         nhacungcap: '',
         hinhthuc: walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt',
         manv: manv,
         rows: [{ id: Date.now(), mahang: '', soluongThem: '', gianhap: '' }]
      });
      setIsBatchImportOpen(true);
   };

   const handleRowChange = (id, field, val) => {
      setBatchImportData(prev => ({
         ...prev,
         rows: prev.rows.map(r => r.id === id ? { ...r, [field]: val } : r)
      }));
   };

   const handleAddRow = () => {
      setBatchImportData(prev => ({
         ...prev,
         rows: [...prev.rows, { id: Date.now(), mahang: '', soluongThem: '', gianhap: '' }]
      }));
   };

   const handleRemoveRow = (id) => {
      setBatchImportData(prev => ({
         ...prev,
         rows: prev.rows.filter(r => r.id !== id)
      }));
   };

   const handleSaveBatchImport = async (e) => {
      e.preventDefault();
      const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();
      const validRows = batchImportData.rows.filter(r => r.mahang && parseInt(r.soluongThem) > 0);

      if (validRows.length === 0) {
         alert('Vui lòng chọn ít nhất 1 mặt hàng với số lượng > 0!');
         return;
      }

      const { data: recentNK } = await supabase.from('tbl_nhapkho').select('manhapkho').order('manhapkho', { ascending: false }).limit(1);
      let nextNum = 1;
      if (recentNK && recentNK.length > 0 && recentNK[0].manhapkho) {
         const numPart = recentNK[0].manhapkho.replace(/\D/g, '');
         if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
      }

      for (let i = 0; i < validRows.length; i++) {
         const row = validRows[i];
         const spRaw = products.find(p => p.mahang === row.mahang);

         const rawSoluongThem = pCur(row.soluongThem);
         const oldQty = pCur(spRaw?.soluong);
         const totalQuantity = oldQty + rawSoluongThem;

         let rawGianhap = String(row.gianhap).replace(/,/g, '');
         if (!rawGianhap) rawGianhap = (spRaw?.gianhap || 0).toString();

         const thanhtien = (rawSoluongThem * pCur(rawGianhap)).toString();
         const newMaNK = `NK${String(nextNum + i).padStart(5, '0')}`;

         await supabase.from('tbl_hanghoa').update({
            soluong: totalQuantity,
            gianhap: rawGianhap
         }).eq('mahang', row.mahang);

         await supabase.from('tbl_nhapkho').insert([{
            manhapkho: newMaNK,
            ngaynhap: localNow,
            mahang: row.mahang,
            gianhap: rawGianhap,
            soluong: rawSoluongThem,
            thanhtien: thanhtien,
            manv: batchImportData.manv || null,
            nhacungcap: batchImportData.nhacungcap || '',
            hinhthuc: batchImportData.hinhthuc || (walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt')
         }]);
      }

      setIsBatchImportOpen(false);
      fetchItems();
   };

   const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
         const bstr = evt.target.result;
         const wb = XLSX.read(bstr, { type: 'binary' });
         const wsname = wb.SheetNames[0];
         const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);

         const inserts = data.map((row, i) => ({
            mahang: row['Mã Hàng'] || generateCode() + i,
            tenhang: row['Tên Hàng'],
            soluong: parseInt(row['Số Lượng'], 10) || 0,
            dvt: row['ĐVT'] || 'Cái',
            gianhap: (row['Giá Nhập'] || 0).toString(),
            giaban: (row['Giá Bán'] || 0).toString(),
            daxoa: null
         })).filter(r => r.tenhang);

         for (const item of inserts) {
            await supabase.from('tbl_hanghoa').upsert([item], { onConflict: 'mahang' });
         }
         fetchItems();
      };
      reader.readAsBinaryString(file);
      e.target.value = ''; // Reset ref
   };

   const handleExport = () => {
      const ws = XLSX.utils.json_to_sheet(products.map(p => ({
         'Mã Hàng': p.mahang,
         'Tên Hàng': p.tenhang,
         'ĐVT': p.dvt,
         'Số Lượng': p.soluong,
         'Giá Nhập': fCur(p.gianhap),
         'Giá Bán': fCur(p.giaban)
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "HangHoa");
      XLSX.writeFile(wb, "DanhSachKeHangHoa.xlsx");
   };

   return (
      <div className="product-manager animate-fade-in">
         <div className="pm-toolbar">
            <div className="search-box">
               <Search size={16} className="text-muted" />
               <input type="text" placeholder="Tìm tên hàng, mã hàng hóa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="action-buttons">
               <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={handleFileUpload} accept=".xlsx, .xls" />
               <button className="btn btn-outline" onClick={() => fileRef.current.click()}><UploadCloud size={16} /> Nhập Excel</button>
               <button className="btn btn-outline" onClick={handleExport}><DownloadCloud size={16} /> Xuất Excel</button>
               <button className="btn btn-primary" style={{ background: '#3b82f6' }} onClick={handleOpenBatchImport}>
                  <Plus size={16} /> Nhập Hàng Loạt
               </button>
               <button className="btn btn-primary" onClick={handleOpenAdd}><PlusCircle size={16} /> Nhập Hàng Mới</button>
            </div>
         </div>

         <div className="pm-table-wrapper table-container">
            <table className="data-table mb-0">
               <thead>
                  <tr>
                     <th>Mã Hàng</th>
                     <th>Tên Hàng</th>
                     <th>ĐVT</th>
                     <th>Tồn Kho</th>
                     <th>Giá Nhập</th>
                     <th>Giá Bán</th>
                     <th>Thao Tác</th>
                  </tr>
               </thead>
               <tbody>
                  {loading ? (
                     <tr><td colSpan="7" className="text-center p-4">Đang đồng bộ cơ sở dữ liệu kho...</td></tr>
                  ) : (
                     products.filter(p => !searchTerm || p.tenhang?.toLowerCase().includes(searchTerm.toLowerCase()) || p.mahang?.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                        <tr key={p.mahang}>
                           <td><strong className="text-muted">{p.mahang}</strong></td>
                           <td className="text-primary font-bold">{p.tenhang}</td>
                           <td>{p.dvt}</td>
                           <td><span className={`stock-badge ${p.soluong > 0 ? 'in-stock' : 'out-stock'}`}>{p.soluong}</span></td>
                           <td className="text-bold">{fCur(p.gianhap)} ₫</td>
                           <td className="text-bold text-success">{fCur(p.giaban)} ₫</td>
                           <td>
                              <div className="action-flex">
                                 <button className="btn-icon btn-blue" title="Tiến hành Nhập Kho cập nhật số lượng và giá" onClick={() => handleOpenImport(p)}><PackageOpen size={16} /></button>
                                 <button className="btn-icon" title="Cập nhật cấu hình mô tả hàng" onClick={() => handleOpenEdit(p)}><Edit size={16} /></button>
                                 <button className="btn-icon text-danger" title="Gỡ mặt hàng" onClick={() => handleDelete(p.mahang)}><Trash2 size={16} /></button>
                              </div>
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
         </div>

         {/* ✅ CARD LIST (mobile-only) */}
         <div className="product-card-list">
            {loading ? (
               <div className="text-center p-8 text-muted">Đang tải dữ liệu kho...</div>
            ) : (
               products
                  .filter(p => !searchTerm || p.tenhang?.toLowerCase().includes(searchTerm.toLowerCase()) || p.mahang?.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(p => (
                     <div key={p.mahang} className="product-card animate-fade-in">
                        <div className="card-main">
                           <div className="card-header">
                              <span className="mahang-code">{p.mahang}</span>
                              <span className={`stock-badge ${p.soluong > 0 ? 'in-stock' : 'out-stock'}`}>
                                 {p.soluong} {p.dvt}
                              </span>
                           </div>
                           <div className="tenhang-val">{p.tenhang}</div>
                           <div className="price-info-row">
                              <div className="price-item">
                                 <label>Giá Nhập</label>
                                 <span>{fCur(p.gianhap)} ₫</span>
                              </div>
                              <div className="price-item">
                                 <label>Giá Bán</label>
                                 <span className="text-success">{fCur(p.giaban)} ₫</span>
                              </div>
                           </div>
                        </div>
                        <div className="card-actions-row">
                           <button className="card-btn btn-blue" onClick={() => handleOpenImport(p)}>
                              <PackageOpen size={16} /> Nhập Kho
                           </button>
                           <button className="card-btn" onClick={() => handleOpenEdit(p)}>
                              <Edit size={16} /> Sửa
                           </button>
                           <button className="card-btn text-danger" onClick={() => handleDelete(p.mahang)}>
                              <Trash2 size={16} /> Xóa
                           </button>
                        </div>
                     </div>
                  ))
            )}
            {products.length === 0 && !loading && <div className="text-center p-8 text-muted">Kho hàng trống.</div>}
         </div>


         {/* POPUP THÊM + SỬA */}
         {/* POPUP THÊM + SỬA */}
         {isFormOpen && document.body ? createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 9999 }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '400px' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>{isEdit ? 'Sửa Hàng Hóa' : 'Thêm Hàng Hóa'}</h3>
                     <button className="close-btn" onClick={() => setIsFormOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveProduct} style={{ padding: '1.5rem' }}>
                     <div className="form-alert info mb-4">
                        <Info size={16} /> Lưu ý: Tại đây chỉ thiết lập cấu hình Nhận diện & Đơn vị tính. Số lượng tồn kho và Mức giá sẽ được nạp gộp vào hệ thống sau khi bạn sử dụng chức năng "Nhập Kho".
                     </div>
                     <div className="form-group full-width" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Mã Hàng (Auto)</label>
                        <input type="text" value={formData.mahang} disabled style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc' }} />
                     </div>
                     <div className="form-group full-width" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Tên Hàng Hóa</label>
                        <input type="text" value={formData.tenhang} onChange={e => setFormData({ ...formData, tenhang: e.target.value })} required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                     </div>
                     <div className="form-group full-width" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Đơn Vị Tính (Cái, Lốc, Hộp, Quyển...)</label>
                        <input type="text" value={formData.dvt} onChange={e => setFormData({ ...formData, dvt: e.target.value })} required style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                     </div>
                     <div className="form-actions full-width">
                        <button type="submit" className="btn btn-primary w-full" style={{ padding: '0.85rem', fontWeight: 700 }}>{isEdit ? 'Cập Nhật' : 'Tạo Hàng Mới'}</button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         ) : null}

         {/* POPUP NHẬP KHO CHUẨN */}
         {isImportOpen && document.body ? createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 9999 }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '500px' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Nhập Kho - Cập Nhật Số Lượng</h3>
                     <button className="close-btn" onClick={() => setIsImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveImport} style={{ padding: '1.5rem' }}>
                     <div className="form-group full-width p-4 flex-col gap-2 rounded-lg mb-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                        <div className="font-bold text-primary" style={{ fontWeight: 700, color: '#3b82f6' }}>{importData.tenhang} <span className="text-muted font-normal" style={{ fontWeight: 400, color: '#64748b' }}>({importData.mahang})</span></div>
                        <div className="text-muted" style={{ fontSize: '0.9rem', color: '#64748b' }}>Lượng Tồn Kho Hiện Tại: <span className="font-bold text-black px-2 py-1 bg-white rounded" style={{ fontWeight: 700, color: '#0f172a', background: 'white', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>{importData.soluongCu}</span></div>
                     </div>

                     <div className="form-group full-width" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Số Lượng Hàng Nhập Kho (Lượng Cộng Thêm)</label>
                        <input type="number" min="0" value={importData.soluongThem} onChange={e => setImportData({ ...importData, soluongThem: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} placeholder="Nhập số dương..." required />
                     </div>

                     <div className="form-group full-width" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Giá Nhập Của Lô Này (VNĐ)</label>
                        <input type="text" value={importData.gianhap} onChange={e => setImportData({ ...importData, gianhap: fCur(e.target.value.replace(/\D/g, '')) })} style={{ width: '100%', textAlign: 'right', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} required />
                     </div>

                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div className="form-group">
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Hình Thức</label>
                           <select value={importData.hinhthuc} onChange={e => setImportData({ ...importData, hinhthuc: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                              {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                              {walletsConfig.map(w => (
                                 <option key={w.id} value={w.name}>{w.name}</option>
                              ))}
                           </select>
                        </div>
                        <div className="form-group">
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Nhà Cung Cấp</label>
                           <input type="text" value={importData.nhacungcap} onChange={e => setImportData({ ...importData, nhacungcap: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} placeholder="VD: NPP Hà Nội" />
                        </div>
                     </div>

                     <div className="form-group full-width" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Giá Bán Ra (VNĐ)</label>
                        <input type="text" value={importData.giaban} onChange={e => setImportData({ ...importData, giaban: fCur(e.target.value.replace(/\D/g, '')) })} style={{ width: '100%', textAlign: 'right', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} required />
                     </div>

                     <div className="form-actions full-width">
                        <button type="submit" className="btn btn-success w-full" style={{ padding: '0.85rem', fontWeight: 700, background: '#10b981', color: 'white', border: 'none', borderRadius: '8px' }}>Chốt Nhập & Ấn Định Bảng Giá Mới</button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         ) : null}
         {isBatchImportOpen && document.body ? createPortal(
            <div className="fm-modal-overlay" style={{ zIndex: 9999 }}>
               <div className="fm-modal animate-slide-up" style={{ maxWidth: '850px', width: '95%' }}>
                  <div className="fm-modal-header" style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Nhập Lô Hàng Hoá</h3>
                     <button type="button" onClick={() => setIsBatchImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveBatchImport} style={{ padding: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>
                     <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Nhà Cung Cấp</label>
                           <input type="text" value={batchImportData.nhacungcap} onChange={e => setBatchImportData({ ...batchImportData, nhacungcap: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} placeholder="VD: NPP Hà Nội" />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Hình Thức Thanh Toán</label>
                           <select value={batchImportData.hinhthuc} onChange={e => setBatchImportData({ ...batchImportData, hinhthuc: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                              {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                              {walletsConfig.map(w => (
                                 <option key={w.id} value={w.name}>{w.name}</option>
                              ))}
                           </select>
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                           <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>Nhân Viên Nhập</label>
                           <select disabled value={batchImportData.manv} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, cursor: 'not-allowed' }}>
                              <option value={batchImportData.manv}>{nvMap[batchImportData.manv] || currentUser?.tennv || currentUser?.username || batchImportData.manv || '-- Nhân viên --'}</option>
                           </select>
                        </div>
                     </div>

                     <div style={{ marginBottom: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: '#334155' }}>Danh sách sản phẩm nhập</h4>
                        {batchImportData.rows.map((row, i) => (
                           <div key={row.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                              <div style={{ flex: '2 1 250px' }}>
                                 <select required value={row.mahang} onChange={e => {
                                    const prod = products.find(p => p.mahang === e.target.value);
                                    handleRowChange(row.id, 'mahang', e.target.value);
                                    if (prod) handleRowChange(row.id, 'gianhap', fCur(prod.gianhap || 0));
                                 }} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <option value="">-- Chọn hàng hoá... --</option>
                                    {products.map(p => (
                                       <option key={p.mahang} value={p.mahang}>{p.tenhang} ({p.mahang})</option>
                                    ))}
                                 </select>
                              </div>
                              <div style={{ flex: '1 1 100px' }}>
                                 <input type="number" min="1" required placeholder="SL nhập" value={row.soluongThem} onChange={e => handleRowChange(row.id, 'soluongThem', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                              </div>
                              <div style={{ flex: '1.5 1 150px' }}>
                                 <input type="text" required placeholder="Giá nhập/SP" value={row.gianhap} onChange={e => handleRowChange(row.id, 'gianhap', fCur(e.target.value.replace(/\D/g, '')))} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }} />
                              </div>
                              <div style={{ flex: '1.5 1 150px', display: 'flex', alignItems: 'center', height: '100%' }}>
                                 <input type="text" disabled value={fCur((parseInt(row.soluongThem || 0) * parseInt((row.gianhap || '').toString().replace(/,/g, '') || 0)))} style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, textAlign: 'right' }} />
                              </div>
                              {batchImportData.rows.length > 1 && (
                                 <button type="button" onClick={() => handleRemoveRow(row.id)} style={{ padding: '0.65rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                              )}
                           </div>
                        ))}
                        <button type="button" onClick={handleAddRow} style={{ marginTop: '0.5rem', background: 'none', border: '1px dashed #cbd5e1', color: '#3b82f6', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <Plus size={16} /> Thêm dòng sản phẩm
                        </button>
                     </div>

                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                           Tổng giá trị nhập lô: <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>{fCur(batchImportData.rows.reduce((sum, r) => sum + (parseInt(r.soluongThem || 0) * parseInt((r.gianhap || '').toString().replace(/,/g, '') || 0)), 0))} VNĐ</span>
                        </div>
                        <button type="submit" style={{ padding: '0.85rem 2rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
                           Xác Nhận Nhập Kho Lô Hàng
                        </button>
                     </div>
                  </form>
               </div>
            </div>,
            document.body
         ) : null}
      </div>
   )
}
