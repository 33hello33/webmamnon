import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Search, Trash2, Plus, Minus, CreditCard, CheckCircle, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import './SalesPOS.css';
import { useConfig } from '../ConfigContext';

export default function SalesPOS() {
   const { config } = useConfig();
   const walletsConfig = (config ? [
      { id: 'vi1', name: config.vi1?.name || '' },
      { id: 'vi2', name: config.vi2?.name || '' },
      { id: 'vi3', name: config.vi3?.name || '' },
      { id: 'vi4', name: config.vi4?.name || '' }
   ].filter(w => w.name.trim() !== '') : []);
   const [students, setStudents] = useState([]);
   const [products, setProducts] = useState([]);
   const [classes, setClasses] = useState([]);

   const [studentSearch, setStudentSearch] = useState('');
   const [productSearch, setProductSearch] = useState('');

   const [selectedStudent, setSelectedStudent] = useState(null);
   const [cart, setCart] = useState([]);

   // Bill details
   const [giamGia, setGiamGia] = useState('');
   const [daDong, setDaDong] = useState('0');
   const [hinhThuc, setHinhThuc] = useState(walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt');
   const [ghiChu, setGhiChu] = useState('');
   const [noCu, setNoCu] = useState(0);

   // Messages
   const [message, setMessage] = useState({ type: '', text: '' });
   const [isSaving, setIsSaving] = useState(false);
   const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
   const [currentStep, setCurrentStep] = useState(1); // 1: Students, 2: Products, 3: Bill
   const [posPrintData, setPosPrintData] = useState(null);
   const [previewImg, setPreviewImg] = useState(null);

   const fetchBaseData = async () => {
      // hv
      const { data: stRaw } = await supabase.from('tbl_hv').select('*, malop').neq('trangthai', 'Đã Nghỉ').order('tenhv');
      const st = (stRaw || []).map(s => ({
         ...s,
         malop_list: s.malop ? [s.malop] : []
      }));
      setStudents(st || []);
      // hanghoa
      const { data: hh } = await supabase.from('tbl_hanghoa').select('*').order('tenhang');
      setProducts((hh || []).filter(p => !p.daxoa || p.daxoa.toLowerCase() !== 'đã xóa'));
      // lop
      const { data: cls } = await supabase.from('tbl_lop').select('malop, tenlop').neq('daxoa', 'Đã Xóa');
      setClasses(cls || []);
   };

   useEffect(() => { fetchBaseData(); }, []);

   const fCur = (val) => val ? val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : '0';
   const pCur = (val) => parseInt(String(val).replace(/,/g, ''), 10) || 0;

   const calculateOldDebt = async (mahv) => {
      try {
         let totalDebt = 0;
         const { data: bills } = await supabase.from('tbl_billhanghoa').select('conno, daxoa').eq('mahv', mahv);
         (bills || []).filter(x => (x.daxoa || '').toLowerCase() !== 'đã xóa').forEach(x => totalDebt += pCur(x.conno));
         setNoCu(totalDebt);
      } catch (e) {
         console.error(e);
      }
   };

   const handleSelectStudent = (st) => {
      setSelectedStudent(st);
      calculateOldDebt(st.mahv);
      if (window.innerWidth <= 991) setCurrentStep(2);
   };

   const handleDoubleProduct = (prod) => {
      if (prod.soluong <= 0) return window.alert('Hàng này đã hết tồn kho gốc! Vui lòng nhập kho thêm để bán.');
      setCart(prev => {
         const existing = prev.find(p => p.mahang === prod.mahang);
         if (existing) {
            if (existing.qty >= prod.soluong) {
               window.alert(`Hệ thống từ chối: Tồn kho chỉ còn ${prod.soluong} ${prod.dvt}`);
               return prev;
            }
            return prev.map(p => p.mahang === prod.mahang ? { ...p, qty: p.qty + 1 } : p);
         }
         return [...prev, { ...prod, qty: 1 }];
      });
   };

   const updateCartQty = (mahang, delta) => {
      setCart(prev => {
         return prev.map(p => {
            if (p.mahang === mahang) {
               const dbProd = products.find(dp => dp.mahang === mahang);
               let newQty = p.qty + delta;
               if (newQty > (dbProd?.soluong || 0)) {
                  window.alert('Vượt giới hạn tồn kho!');
                  newQty = p.qty;
               }
               if (newQty < 1) newQty = 1;
               return { ...p, qty: newQty };
            }
            return p;
         });
      });
   };

   const removeCartItem = (mahang) => setCart(prev => prev.filter(p => p.mahang !== mahang));

   const tongGiaoDich = cart.reduce((sum, item) => sum + (pCur(item.giaban) * item.qty), 0);
   const thanhTien = tongGiaoDich - pCur(giamGia);
   const tongCongBill = thanhTien + noCu;

   useEffect(() => {
      setDaDong('0');
   }, [tongCongBill]);

   const conLai = tongCongBill - pCur(daDong);

   useEffect(() => {
      if (selectedStudent) {
         setHinhThuc(selectedStudent.hinhthucdong || (walletsConfig.length > 0 ? walletsConfig[0].name : 'Tiền mặt'));
      }
   }, [selectedStudent, walletsConfig]);

   const handleSaveBill = async () => {
      if (!selectedStudent) return window.alert('Vui lòng chọn học sinh để lưu Bill!');
      if (cart.length === 0) return window.alert('Giỏ hàng trống!');
      setIsSaving(true);

      try {
         const auth = JSON.parse(localStorage.getItem('auth_session') || '{}');
         const cashier = auth.user?.tennv || auth.user?.username || '';

         // Generate mabill
         const { data: recentBill } = await supabase.from('tbl_billhanghoa').select('mabill').order('mabill', { ascending: false }).limit(1);
         let nextNum = 1;
         if (recentBill && recentBill.length > 0 && recentBill[0].mabill) {
            const numPart = recentBill[0].mabill.replace(/\D/g, '');
            if (!isNaN(parseInt(numPart, 10))) nextNum = parseInt(numPart, 10) + 1;
         }
         const newMaBill = `BH${String(nextNum).padStart(5, '0')}`;
         const localNow = new Date(new Date() - new Date().getTimezoneOffset() * 60000).toISOString();

         const calcLoiNhuan = cart.reduce((sum, item) => sum + ((pCur(item.giaban) - pCur(item.gianhap || 0)) * item.qty), 0) - pCur(giamGia);

         let csvStr = "Mã Hàng,Tên Hàng,Đơn Vị Tính,Số Lượng,Đơn Giá,Thành Tiền\n";
         csvStr += cart.map(c => {
            const mahang = `"${(c.mahang || '').replace(/"/g, '""')}"`;
            const tenhang = `"${(c.tenhang || '').replace(/"/g, '""')}"`;
            const dvt = `"${(c.dvt || '').replace(/"/g, '""')}"`;
            const sl = c.qty;
            const dg = `"${fCur(c.giaban)}"`;
            const tt = `"${fCur(pCur(c.giaban) * c.qty)}"`;
            return `${mahang},${tenhang},${dvt},${sl},${dg},${tt}`;
         }).join('\n');

         const serializedHangHoa = csvStr;

         const insertData = {
            mabill: newMaBill,
            ngaylap: localNow,
            mahv: selectedStudent.mahv,
            hanghoa: serializedHangHoa,
            nhanvien: cashier,
            chietkhau: fCur(pCur(giamGia)),
            tongcong: fCur(tongCongBill),
            dadong: fCur(pCur(daDong)),
            conno: fCur(conLai),
            noidung: ghiChu,
            daxoa: null,
            loinhuan: fCur(calcLoiNhuan),
            hinhthuc: hinhThuc,
            daxacnhan: false
         };

         let res = await supabase.from('tbl_billhanghoa').insert([insertData]);

         if (res.error) {
            throw res.error;
         }

         // Cập nhật nợ cũ trong tbl_billhanghoa (gộp vào bill mới)
         if (noCu > 0) {
            await supabase.from('tbl_billhanghoa')
               .update({ conno: '0' })
               .eq('mahv', selectedStudent.mahv)
               .neq('mabill', newMaBill);
         }

         // Trừ kho & đẩy chi tiết vào bảng phụ nếu có, nhưng hiện hệ thống dùng JSON logic hoặc ko yêu cầu tbl_chitiet. 
         // Chỉ trừ tồn kho thôi.
         for (const item of cart) {
            const dbProd = products.find(p => p.mahang === item.mahang);
            if (dbProd) {
               const finalQty = dbProd.soluong - item.qty;
               await supabase.from('tbl_hanghoa').update({ soluong: finalQty }).eq('mahang', item.mahang);
            }
         }

         fetchBaseData();

         const printObj = {
            mabill: newMaBill,
            ngaylap: localNow,
            tenhv: selectedStudent.tenhv,
            sdt: selectedStudent.sdt,
            cart: [...cart],
            nocu: noCu,
            tongcong: tongCongBill,
            chietkhau: pCur(giamGia),
            dadong: pCur(daDong),
            conno: conLai,
            nhanvien: cashier,
            hinhthuc: hinhThuc,
            noidung: ghiChu
         };

         setSuccessModal({
            isOpen: true,
            title: 'Thành công',
            message: `Tạo Bill ${newMaBill} thành công! Đang tải xuống PDF...`
         });

         // Auto download image PNG
         const finalPrintData = {
            mabill: newMaBill,
            ngaylap: localNow,
            tenhv: selectedStudent.tenhv,
            sdt: selectedStudent.sdt,
            cart: [...cart],
            nocu: noCu,
            tongcong: tongGiaoDich,
            giamgia: pCur(giamGia),
            thanhtien: thanhTien,
            tongcong_bill: tongCongBill,
            dadong: pCur(daDong),
            conno: conLai,
            nhanvien: cashier,
            hinhthuc: hinhThuc
         };
         setPosPrintData(finalPrintData);

         setTimeout(() => {
            const element = document.getElementById('pos-print-temp');
            if (!element) return;

            toPng(element, { cacheBust: true, backgroundColor: '#fff' })
               .then((dataUrl) => {
                  if (window.innerWidth <= 991) {
                     // Mobile: Preview for long-press
                     setPreviewImg(dataUrl);
                  } else {
                     // Desktop: Auto download
                     const link = document.createElement('a');
                     link.download = `Bill_${newMaBill}.png`;
                     link.href = dataUrl;
                     link.click();
                  }

                  setCart([]);
                  setDaDong('');
                  setGiamGia('');
                  setGhiChu('');
                  setSelectedStudent(null);
                  setPosPrintData(null);
                  if (window.innerWidth <= 991) setCurrentStep(1);
               })
               .catch((err) => {
                  console.error('Lỗi xuất ảnh bill POS:', err);
               });
         }, 1000);

      } catch (err) {
         console.error(err);
         window.alert('Lỗi tạo Bill: ' + err.message);
      }
      setIsSaving(false);
   };

   return (
      <div className={`sales-pos animate-fade-in step-${currentStep}`}>

         {/* MOBILE TAB NAVIGATION */}
         <div className="sp-mobile-tabs">
            <button className={currentStep === 1 ? 'active' : ''} onClick={() => setCurrentStep(1)}>1. Học Sinh</button>
            <button className={currentStep === 2 ? 'active' : ''} onClick={() => setCurrentStep(2)}>2. Hàng Hóa</button>
            <button className={currentStep === 3 ? 'active' : ''} onClick={() => setCurrentStep(3)}>3. Thanh Toán ({cart.length})</button>
         </div>

         {/* CỘT 1: DANH SÁCH HỌC SINH */}
         <div className={`sp-col-1 ${currentStep === 1 ? 'mobile-active' : 'mobile-hide'}`}>
            <div className="sp-col-header">DANH SÁCH HỌC SINH</div>
            <div className="sp-search">
               <Search size={16} className="text-muted" />
               <input type="text" placeholder="Tìm theo tên học sinh" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
            </div>
            <div className="sp-items-container">
               {students.filter(s => (s.tenhv && s.tenhv.toLowerCase().includes(studentSearch.toLowerCase())) || (s.sdt && s.sdt.includes(studentSearch))).map(st => (
                  <div key={st.mahv} className={`sp-item-card ${selectedStudent?.mahv === st.mahv ? 'active' : ''}`} onClick={() => handleSelectStudent(st)}>
                     <div className="sp-ic-title">{st.tenhv}</div>
                     <div className="sp-ic-sub">SDT: {st.sdt || '_'}</div>
                     <div className="sp-ic-sub">Lớp: {st.malop_list && st.malop_list.length > 0
                        ? st.malop_list.map(ml => classes.find(c => c.malop === ml)?.tenlop || ml).join(', ')
                        : 'Học sinh bảo lưu'}</div>
                  </div>
               ))}
               {students.length === 0 && <div className="text-center p-4 text-muted">Đang tải HS...</div>}
            </div>
         </div>

         {/* CỘT 2: DANH SÁCH HÀNG HÓA */}
         <div className={`sp-col-2 ${currentStep === 2 ? 'mobile-active' : 'mobile-hide'}`}>
            <div className="sp-col-header">DANH SÁCH HÀNG HÓA</div>
            <div className="sp-search">
               <Search size={16} className="text-muted" />
               <input type="text" placeholder="Tìm theo tên hàng" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            </div>
            <div className="sp-items-container">
               {products.filter(p => !productSearch || (p.tenhang && p.tenhang.toLowerCase().includes(productSearch.toLowerCase())) || (p.mahang && p.mahang.toLowerCase().includes(productSearch.toLowerCase()))).map(pd => {
                  const cartItem = cart.find(c => c.mahang === pd.mahang);
                  const qInCart = cartItem ? cartItem.qty : 0;
                  return (
                     <div key={pd.mahang} className={`sp-product-card ${qInCart > 0 ? 'in-cart' : ''}`} onDoubleClick={() => handleDoubleProduct(pd)}>
                        <div className="sp-prod-info">
                           <div className="sp-ic-title">{pd.tenhang}</div>
                           <div className="sp-ic-sub">Giá: {fCur(pd.giaban)} | Kho: {pd.soluong}</div>
                        </div>
                        <div className="sp-prod-actions">
                           {qInCart > 0 && (
                              <button className="sp-btn-minus" onClick={(e) => { e.stopPropagation(); updateCartQty(pd.mahang, -1); if (qInCart === 1) removeCartItem(pd.mahang); }}>
                                 <Minus size={14} />
                              </button>
                           )}
                           {qInCart > 0 && <span className="sp-q-badge">{qInCart}</span>}
                           <button className="sp-btn-plus" onClick={(e) => { e.stopPropagation(); handleDoubleProduct(pd); }}>
                              <Plus size={14} />
                           </button>
                        </div>
                     </div>
                  );
               })}
            </div>
            {cart.length > 0 && (
               <div className="sp-mobile-next-btn">
                  <button onClick={() => setCurrentStep(3)}>
                     Xem Giỏ Hàng & Thanh Toán ({cart.length})
                  </button>
               </div>
            )}
         </div>

         {/* CỘT 3: THÔNG TIN BILL HÀNG */}
         <div className={`sp-col-3 ${currentStep === 3 ? 'mobile-active' : 'mobile-hide'}`}>
            <div className="sp-col-header" style={{ display: 'flex', justifyContent: 'space-between', alignContent: 'center', borderBottom: 'none' }}>
               <span>THÔNG TIN BILL HÀNG</span>
               {message.text && <span className={`sp-msg text-${message.type === 'error' ? 'danger' : 'success'}`} style={{ fontSize: '0.85rem', textTransform: 'none' }}>{message.text}</span>}
            </div>

            <div className="sp-bill-info">
               <div className="sp-student-info">
                  <div className="sp-info-row">
                     <span className="lbl">Họ và tên:</span>
                     <span className="val">{selectedStudent?.tenhv || '_'}</span>
                  </div>
                  <div className="sp-info-row">
                     <span className="lbl">Sđt:</span>
                     <span className="val">{selectedStudent?.sdt || '_'}</span>
                  </div>
               </div>
            </div>

            <div className="sp-cart">
               <table className="sp-cart-table">
                  <thead>
                     <tr>
                        <th>Mã hàng</th>
                        <th>Tên hàng</th>
                        <th>DVT</th>
                        <th style={{ textAlign: 'center' }}>SL</th>
                        <th style={{ textAlign: 'right' }}>Đơn giá</th>
                        <th style={{ textAlign: 'right' }}>Thành tiền</th>
                        <th></th>
                     </tr>
                  </thead>
                  <tbody>
                     {cart.map((c, i) => (
                        <tr key={i}>
                           <td className="text-muted">{c.mahang}</td>
                           <td style={{ fontWeight: 600, color: '#334155' }}>{c.tenhang}</td>
                           <td>{c.dvt}</td>
                           <td>
                              <div className="sp-qty-ctrl">
                                 <button onClick={() => updateCartQty(c.mahang, -1)}><Minus size={12} /></button>
                                 <span>{c.qty}</span>
                                 <button onClick={() => updateCartQty(c.mahang, 1)}><Plus size={12} /></button>
                              </div>
                           </td>
                           <td style={{ textAlign: 'right' }}>{fCur(c.giaban)}</td>
                           <td style={{ textAlign: 'right', fontWeight: 700 }}>{fCur(pCur(c.giaban) * c.qty)}</td>
                           <td style={{ textAlign: 'center', width: '40px' }}>
                              <button className="sp-btn-del" onClick={() => removeCartItem(c.mahang)}><Trash2 size={14} /></button>
                           </td>
                        </tr>
                     ))}
                     {cart.length === 0 && (
                        <tr>
                           <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontStyle: 'italic', borderBottom: 'none' }}>
                              Giỏ hàng đang trống. Nhấn đúp (Double-click) vào danh sách hàng hóa để chọn.
                           </td>
                        </tr>
                     )}
                  </tbody>
               </table>
            </div>

            <div className="sp-checkout">
               <div className="sp-co-row base">
                  <span>Trị giá hàng mới (Tổng rổ):</span>
                  <span className="sp-val-sum text-primary">{fCur(tongGiaoDich)} ₫</span>
               </div>
               {noCu > 0 && (
                  <div className="sp-co-row base">
                     <span>Nợ cũ tích lũy (Hàng hóa):</span>
                     <span className="sp-val-sum text-danger">{fCur(noCu)} ₫</span>
                  </div>
               )}
               <div className="sp-co-row base input-line">
                  <span>Mã Voucher / Cấp trừ (VNĐ):</span>
                  <div className="sp-input-wrap">
                     <input type="text" value={fCur(pCur(giamGia))} onChange={e => setGiamGia(e.target.value)} />
                  </div>
               </div>

               <div className="sp-divider"></div>

               <div className="sp-co-row sp-co-grand">
                  <span>TỔNG CỘNG THEO BILL:</span>
                  <span>{fCur(tongCongBill)} ₫</span>
               </div>
               <div className="sp-co-row sp-co-highlight">
                  <span>Khách Trả:</span>
                  <div className="sp-input-wrap lg">
                     <input type="text" value={fCur(pCur(daDong))} onChange={e => setDaDong(e.target.value)} />
                  </div>
               </div>
               <div className="sp-co-row base mb-1">
                  <span>Còn lại:</span>
                  <span className={`sp-val-debt ${conLai > 0 ? 'text-danger' : 'text-success'}`}>{fCur(conLai)} ₫</span>
               </div>

               <div className="sp-co-config mt-2">
                  <div className="cfg-item">
                     <label>Hình thức thanh toán</label>
                     <select value={hinhThuc} onChange={e => setHinhThuc(e.target.value)} disabled={!!selectedStudent}>
                        {walletsConfig.length === 0 && <option value="Tiền mặt">Tiền mặt</option>}
                        {walletsConfig.map(w => (
                           <option key={w.id} value={w.name}>{w.name}</option>
                        ))}
                     </select>
                  </div>
                  <div className="cfg-item flex-2">
                     <label>GHI CHÚ BIÊN LAI</label>
                     <input type="text" placeholder="Ghi chú..." value={ghiChu} onChange={e => setGhiChu(e.target.value)} />
                  </div>
               </div>

               <button className="sp-btn-checkout" onClick={handleSaveBill} disabled={isSaving}>
                  <CreditCard size={22} />
                  {isSaving ? 'Đang mã hóa dữ liệu đơn...' : 'PAY POS - Xuất Bill Ngay'}
               </button>
            </div>
         </div>

         {successModal.isOpen && (
            <div className="sp-modal-overlay">
               <div className="sp-success-modal animate-slide-up">
                  <button
                     className="sp-close-btn"
                     onClick={() => setSuccessModal({ ...successModal, isOpen: false })}
                  >
                     <X size={20} />
                  </button>

                  <div className="sp-success-icon">
                     <CheckCircle size={52} />
                  </div>

                  <h3>{successModal.title}</h3>
                  <p>{successModal.message}</p>

                  <div className="sp-modal-actions">
                     <button
                        className="sp-btn-success-ok"
                        onClick={() => setSuccessModal({ ...successModal, isOpen: false })}
                     >
                        OK
                     </button>
                  </div>
               </div>
            </div>
         )}

         {previewImg && (
            <div className="sp-modal-overlay" onClick={() => setPreviewImg(null)} style={{ zIndex: 2000 }}>
               <div className="sp-success-modal animate-slide-up" onClick={e => e.stopPropagation()} style={{ padding: '20px', maxWidth: '90%' }}>
                  <button className="sp-close-btn" onClick={() => setPreviewImg(null)}><X size={20} /></button>
                  <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '10px', color: '#0369a1' }}>
                     NHẤN GIỮ HÌNH ĐỂ LƯU / CHIA SẺ
                  </p>
                  <img src={previewImg} alt="Preview Bill" style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <div style={{ marginTop: '15px', textAlign: 'center' }}>
                     <button className="sp-btn-success-ok" onClick={() => setPreviewImg(null)}>HOÀN TẤT</button>
                  </div>
               </div>
            </div>
         )}
         {/* HIDDEN PRINT TEMPLATE FOR PDF EXPORT - MATCHING FINANCE MANAGER LAYOUT */}
         <div style={{ position: 'fixed', left: '-9999px', top: '0', zIndex: -1 }}>
            <div id="pos-print-temp" style={{ position: 'relative', overflow: 'hidden', padding: '30px', background: 'white', color: '#000', width: '800px', fontFamily: 'Arial, sans-serif' }}>



               <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                     <div>
                        <h3 style={{ margin: 0 }}>{config?.tencongty || 'Tên Công Ty'}</h3>
                        <p style={{ margin: '4px 0' }}>ĐC: {config?.diachicongty}</p>
                        <p style={{ margin: '4px 0' }}>SĐT: {config?.sdtcongty}</p>
                     </div>
                     <div style={{ textAlign: 'right' }}>
                        <div>Mã Bill: <b>{posPrintData?.mabill || '...'}</b></div>
                        <div>Ngày lập: {posPrintData ? new Date(posPrintData.ngaylap).toLocaleDateString('vi-VN') : '...'}</div>
                        {config?.logo && <img src={config.logo} alt="logo" crossOrigin="anonymous" style={{ width: 80, marginTop: 5 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                        {!config?.logo && <div style={{ height: 20 }}></div>}
                     </div>
                  </div>

                  <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "18pt", margin: "10px 0" }}>
                     BIÊN LAI BÁN HÀNG
                  </div>

                  <div style={{ fontSize: "13pt", lineHeight: "1.8", marginBottom: '15px' }}>
                     <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Họ và tên: <b>{posPrintData?.tenhv || 'Khách vãng lai'}</b></div>
                        <div>SĐT: <b>{posPrintData?.sdt || "_"}</b></div>
                     </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                     <thead>
                        <tr style={{ borderBottom: '2px solid black', background: '#f8fafc' }}>
                           <th style={{ padding: '10px', textAlign: 'left' }}>Tên Hàng</th>
                           <th style={{ padding: '10px', textAlign: 'center' }}>Số Lượng</th>
                           <th style={{ padding: '10px', textAlign: 'right' }}>Đơn giá</th>
                           <th style={{ padding: '10px', textAlign: 'right' }}>Thành tiền</th>
                        </tr>
                     </thead>
                     <tbody>
                        {posPrintData?.cart?.map((c, i) => (
                           <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '10px' }}>{c.tenhang}</td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>{c.qty}</td>
                              <td style={{ padding: '10px', textAlign: 'right' }}>{fCur(c.giaban)}</td>
                              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{fCur(pCur(c.giaban) * c.qty)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>

                  <div style={{ marginTop: '15px', padding: '12px 0', borderTop: '2.5px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12pt" }}>
                        <div>Nợ cũ hàng: <b>{fCur(posPrintData?.nocu)}</b></div>
                        <div>Tổng bill: <b style={{ fontSize: '14pt' }}>{fCur(posPrintData?.tongcong_bill)}</b></div>
                        <div style={{ color: '#0ea5e9', fontWeight: 'bold' }}>Hình thức: {posPrintData?.hinhthuc}</div>
                     </div>
                     <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5pt", paddingTop: '8px', borderTop: '1px dashed #ddd', fontWeight: 'bold' }}>
                        <div style={{ color: '#16a34a' }}>Đã trả: {fCur(posPrintData?.dadong)}</div>
                        <div style={{ color: (posPrintData?.conno > 0 ? '#ef4444' : '#16a34a') }}>
                           Nợ còn lại: {fCur(posPrintData?.conno)}
                        </div>
                     </div>
                  </div>

                  <div style={{ marginTop: 40, fontSize: "12pt", display: "flex", justifyContent: "space-between" }}>
                     <div>
                        {config?.tencongty || 'Tên Công ty'} <br />
                        SĐT/Zalo: {config?.sdtcongty || 'Số điện thoại'}
                     </div>
                     <div style={{ textAlign: "center" }}>
                        Nhân viên thu tiền <br /><br /><br />
                        <b>{posPrintData?.nhanvien}</b>
                     </div>
                  </div>

                  <div style={{ marginTop: "30px", textAlign: "center", fontStyle: "italic", borderTop: '1px dashed #ccc', paddingTop: '10px', fontSize: '10pt' }}>
                     Cảm ơn quý khách đã tin dùng dịch vụ của chúng tôi!
                  </div>
               </div>
            </div>
         </div>
      </div>
   )
}

