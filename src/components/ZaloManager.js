import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ZaloQRLogin from './ZaloQRLogin';
import ZaloChatApp from './ZaloChatApp';
import { Loader2 } from 'lucide-react';
import './ZaloChat.css';

const BACKEND_URL = process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

export default function ZaloManager() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    const checkStatus = async () => {
        setCheckingSession(true);
        try {
            const res = await axios.get(`${BACKEND_URL}/api/zalo/status`, { timeout: 10000 });
            if (res.data && res.data.isLoggedIn) {
                setIsLoggedIn(true);
            } else {
                setIsLoggedIn(false);
            }
        } catch (err) {
            console.warn('Không kết nối được Zalo backend, hiển thị màn hình QR:', err.message);
            setIsLoggedIn(false);
        } finally {
            setCheckingSession(false);
        }
    };

    useEffect(() => {
        checkStatus();
    }, []);

    const handleLoginSuccess = () => {
        setIsLoggedIn(true);
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
    };

    if (checkingSession) {
        return (
            <div className="zalo-loading-container">
                <Loader2 className="spinner" size={40} style={{ color: '#0068ff', marginBottom: '1rem' }} />
                <h4 style={{ margin: 0, color: '#1e293b' }}>Đang kiểm tra kết nối Zalo Service...</h4>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.5rem' }}>{BACKEND_URL}</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }}>
            {isLoggedIn ? (
                <ZaloChatApp onLogout={handleLogout} />
            ) : (
                <ZaloQRLogin onLoginSuccess={handleLoginSuccess} />
            )}
        </div>
    );
}