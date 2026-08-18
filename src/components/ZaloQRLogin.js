import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { socket } from '../services/zaloSocketClient';
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import './ZaloChat.css';

const BACKEND_URL = process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

export default function ZaloQRLogin({ onLoginSuccess }) {
    const [qrCode, setQrCode] = useState('');
    const [status, setStatus] = useState('loading'); // loading | waiting | scanned | expired | success | error
    const [errorMsg, setErrorMsg] = useState('');

    const fetchQR = async () => {
        setStatus('loading');
        setErrorMsg('');
        try {
            const res = await axios.get(`${BACKEND_URL}/api/zalo/qr`, { timeout: 15000 });
            const data = res.data;
            if (data.qr) {
                setQrCode(data.qr);
                setStatus('waiting');
            } else if (data.status) {
                // Nếu chưa có QR, cập nhật trạng thái và chờ socket
                setStatus(data.status === 'waiting' ? 'waiting' : 'loading');
            } else {
                // Không có QR nhưng không error - chờ socket event
                setStatus('waiting');
            }
        } catch (err) {
            console.warn('Chưa lấy được QR từ REST API, đang chờ Socket.IO:', err.message);
            // KHÔNG set error - chờ Socket.IO sẽ deliver QR khi server sẵn sàng
            setStatus('waiting');
            setErrorMsg('Đang chờ server tạo mã QR...');
        }
    };

    useEffect(() => {
        // 1. Lắng nghe event QR update từ WebSockets realtime TRƯỚC
        const handleQrUpdate = (data) => {
            console.log('Zalo QR status updated:', data.status, '| hasQR:', !!data.qr);
            setErrorMsg('');
            if (data.qr) {
                setQrCode(data.qr);
                setStatus('waiting');
            }
            if (data.status === 'scanned') setStatus('scanned');
            if (data.status === 'expired') setStatus('expired');
            if (data.status === 'success') {
                setStatus('success');
                if (onLoginSuccess) onLoginSuccess(data.user);
            }
        };

        socket.on('zalo-qr-update', handleQrUpdate);

        // 2. Sau đó mới kiểm tra status + lấy QR
        axios.get(`${BACKEND_URL}/api/zalo/status`, { timeout: 10000 })
            .then(res => {
                if (res.data.isLoggedIn) {
                    setStatus('success');
                    if (onLoginSuccess) onLoginSuccess(res.data.user);
                } else {
                    fetchQR();
                }
            })
            .catch(() => {
                // Không kết nối được REST API, thử lấy QR trực tiếp
                fetchQR();
            });

        return () => {
            socket.off('zalo-qr-update', handleQrUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="zalo-qr-container">
            <div className="zalo-qr-card">
                <div className="zalo-logo-badge">Zalo</div>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#1e293b' }}>Đăng Nhập Zalo Bằng Mã QR</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Mở ứng dụng Zalo trên điện thoại để quét mã bên dưới
                </p>

                {/* Loading - chờ server tạo QR */}
                {(status === 'loading' || (status === 'waiting' && !qrCode)) && (
                    <div style={{ padding: '2.5rem 0', color: '#0068ff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                        <Loader2 className="spinner" size={40} />
                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>
                            {errorMsg || 'Đang khởi tạo kết nối Zalo...'}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            Kết nối tới: {BACKEND_URL}
                        </span>
                    </div>
                )}

                {/* Hiển thị QR */}
                {status === 'waiting' && qrCode && (
                    <div className="zalo-qr-image-wrapper">
                        <img src={qrCode} alt="Zalo QR Code" />
                    </div>
                )}

                {/* Đã quét */}
                {status === 'scanned' && (
                    <div style={{ color: '#059669', background: '#ecfdf5', padding: '0.8rem 1.2rem', borderRadius: '10px', margin: '1rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle2 size={20} />
                        <span>Đã quét mã thành công! Vui lòng xác nhận trên điện thoại...</span>
                    </div>
                )}

                {/* QR hết hạn */}
                {status === 'expired' && (
                    <div style={{ margin: '1.5rem 0', textAlign: 'center' }}>
                        <p style={{ color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                            <AlertTriangle size={18} /> Mã QR đã hết hạn.
                        </p>
                        <button className="zalo-btn-primary" onClick={fetchQR} style={{ marginTop: '0.8rem' }}>
                            <RefreshCw size={16} /> Tạo lại mã QR
                        </button>
                    </div>
                )}

                {/* Thành công */}
                {status === 'success' && (
                    <div style={{ color: '#059669', fontWeight: 700, padding: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle2 size={24} /> Bạn đã đăng nhập Zalo thành công!
                    </div>
                )}

                {/* Nút làm mới luôn hiển thị trừ khi đang loading */}
                {status !== 'loading' && status !== 'success' && (
                    <div style={{ marginTop: '1.5rem', width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <button className="zalo-btn-secondary" onClick={fetchQR} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <RefreshCw size={15} /> Làm mới / Thử lại
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}