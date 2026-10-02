/**
 * Helper xử lý mã QR VietQR chuẩn hóa
 */

export const getQRUrl = (hoaDon, walletsConfig, qrTemplate = '') => {
  if (!walletsConfig || walletsConfig.length === 0 || !hoaDon) return null;

  const isNotice = String(hoaDon.mahd || '').startsWith('TB');
  const hinhThucRaw = String(hoaDon.hinhthuc || '').trim();
  const hinhThucTrim = hinhThucRaw.toLowerCase();

  // Nếu là hóa đơn thanh toán thông thường và đã thu tiền mặt thì không cần QR
  if (!isNotice && (hinhThucTrim.includes('tiền mặt') || hinhThucTrim.includes('tien mat'))) {
    return null;
  }

  // 1. Tìm ví khớp chính xác tên hình thức
  let matchedWallet = walletsConfig.find(w => String(w.name || '').trim().toLowerCase() === hinhThucTrim && w.bankId && w.accNo);

  // 2. Tìm ví khớp chuỗi chứa nhau
  if (!matchedWallet) {
    matchedWallet = walletsConfig.find(w => {
      const wName = String(w.name || '').trim().toLowerCase();
      return wName && (hinhThucTrim.includes(wName) || wName.includes(hinhThucTrim)) && w.bankId && w.accNo;
    });
  }

  // 3. Tìm ví khớp theo từ khóa của tên lớp hoặc hình thức (ví dụ lớp "Bee" nằm trong ví "Lớp mickey+panda+bee")
  if (!matchedWallet) {
    const classWords = [hoaDon.tenlop, hoaDon.malop, ...hinhThucTrim.split(/[\s,+-]+/)]
      .filter(Boolean)
      .map(w => String(w).trim().toLowerCase())
      .filter(w => w.length >= 2 && w !== 'lớp' && w !== 'lop');

    matchedWallet = walletsConfig.find(w => {
      if (!w.bankId || !w.accNo) return false;
      const wName = String(w.name || '').toLowerCase();
      return classWords.some(word => wName.includes(word));
    });
  }

  // 4. Nếu là phiếu thông báo học phí (TB...) và vẫn chưa tìm thấy ví (hoặc hình thức ghi là Tiền mặt)
  // Fallback về ví ngân hàng đầu tiên có tài khoản để phụ huynh có mã QR chuyển khoản
  if (!matchedWallet && isNotice) {
    matchedWallet = walletsConfig.find(w => w.bankId && w.accNo);
  }

  if (matchedWallet && matchedWallet.bankId && matchedWallet.accNo) {
    const amountStr = (hoaDon.tongcong || hoaDon.conno || hoaDon.hocphi || "0").toString().replace(/\D/g, "");

    let shortName = '';
    if (hoaDon.tenhv) {
      const parts = hoaDon.tenhv.trim().split(' ');
      shortName = parts.length >= 2 ? parts.slice(-2).join(' ') : hoaDon.tenhv;
    }

    let addInfoText = '';
    if (qrTemplate && qrTemplate.trim()) {
      addInfoText = qrTemplate
        .replace(/\{mahv\}/gi, hoaDon.mahv || '')
        .replace(/\{tenhv\}/gi, hoaDon.tenhv || '')
        .replace(/\{ten\}/gi, shortName)
        .replace(/\{mahd\}/gi, hoaDon.mahd || '')
        .replace(/\{tenlop\}/gi, hoaDon.tenlop || '')
        .replace(/\{sdt\}/gi, hoaDon.sdt || '')
        .replace(/\{thoiluong\}/gi, hoaDon.thoiluong || '')
        .trim().replace(/\s+/g, ' ');
    } else {
      addInfoText = `${hoaDon.mahv || ''}${shortName ? ' ' + shortName : ''}`.trim();
    }

    const info = encodeURIComponent(addInfoText);
    const uniqueTag = hoaDon._t || `${hoaDon.mahd || ''}_${amountStr}`;
    return `https://img.vietqr.io/image/${matchedWallet.bankId}-${matchedWallet.accNo}-compact2.png?amount=${amountStr}&addInfo=${info}&accountName=${encodeURIComponent(matchedWallet.accName || '')}&tag=${encodeURIComponent(uniqueTag)}`;
  }

  return null;
};

/**
 * Tải ảnh từ URL (ví dụ VietQR) và chuyển thành Base64 Data URL
 * Giúp triệt tiêu lỗi CORS, cache và ngăn tình trạng ảnh bị blank khi chụp html-to-image hoặc in
 */
export const fetchQrAsBase64 = async (url) => {
  if (!url) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Fetch VietQR failed');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Lỗi chuyển ảnh QR sang base64:', err);
    return url;
  }
};
