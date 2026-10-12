import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { DEFAULT_CONSECUTIVE_REFUND_CONFIG, normalizeConsecutiveRefundConfig } from './utils/consecutiveLeaveRefund';

const ConfigContext = createContext();

export const useConfig = () => useContext(ConfigContext);

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase.from('tbl_config').select('*').single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching config:', error);
      }

      if (data) {
        setConfig({
          ...data,
          nghilientiep: normalizeConsecutiveRefundConfig(data.nghilientiep, data)
        });
        // Apply web name to title
        if (data.tenweb) document.title = data.tenweb;
        // Apply logo favicon if needed (simplification: inject link)
        if (data.logo) {
          const favicon = document.querySelector('link[rel="icon"]');
          if (favicon) favicon.href = data.logo;
        }
        if (data.appleicon || data.logo) {
          const iconUrl = data.appleicon || data.logo;
          const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
          if (appleIcon) appleIcon.href = iconUrl;

          // Dynamically generate manifest.json for Android Chrome PWA
          const manifestObj = {
            short_name: data.tenweb || "Trường Mầm Non",
            name: data.tenweb || "Hệ thống Quản lý Mầm Non",
            icons: [
              {
                src: iconUrl,
                type: "image/png",
                sizes: "192x192"
              },
              {
                src: iconUrl,
                type: "image/png",
                sizes: "512x512"
              }
            ],
            start_url: ".",
            display: "standalone",
            theme_color: "#ffffff",
            background_color: "#ffffff"
          };

          const manifestBlob = new Blob([JSON.stringify(manifestObj)], { type: 'application/json' });
          const manifestUrl = URL.createObjectURL(manifestBlob);
          let manifestLink = document.querySelector('link[rel="manifest"]');
          if (!manifestLink) {
            manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            document.head.appendChild(manifestLink);
          }
          manifestLink.href = manifestUrl;
        }
      } else {
        // Fallback or initialization
        setConfig({
          tenweb: process.env.REACT_APP_VI_NAME || 'Quản lý TT',
          motaweb: 'Hệ thống quản lý cơ sở',
          logo: '/logo.png',
          tencongty: process.env.REACT_APP_COMPANY_NAME || 'Công ty TNHH ABC',
          diachicongty: 'Địa chỉ công ty',
          sdtcongty: '0123456789',
          vi1: { name: 'Tiền mặt', bankId: '', accNo: '', accName: '' },
          hangmucthu: [],
          hangmucchi: [],
          tiendangoai: '0',
          sonhanvientrogiang: 1,
          ngayquahan: 0,
          nghilientiep: DEFAULT_CONSECUTIVE_REFUND_CONFIG,
          phanquyenrole: {
            'Quản lý': { full: true },
            'Nhân viên VP': { full: false, tabs: ['overview', 'finances', 'students', 'student_list'] },
            'Giáo viên': { full: false, tabs: ['students', 'timesheet'] }
          },
          r2_enabled: false,
          r2_endpoint: '',
          r2_access_key_id: '',
          r2_secret_access_key: '',
          r2_bucket_name: '',
          r2_public_url: ''
        });
      }
    } catch (err) {
      console.error('Unexpected error loading config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();

    const handleSchemaChange = () => {
      fetchConfig();
    };

    window.addEventListener('schema_changed', handleSchemaChange);
    return () => {
      window.removeEventListener('schema_changed', handleSchemaChange);
    };
  }, []);

  const getTruTienAn = (hocphiInput) => {
    if (!config || !config.trutienan) return 0;

    const hocphi = parseInt(String(hocphiInput || '0').replace(/\D/g, ''));
    let trutienanConfig = config.trutienan;

    if (typeof trutienanConfig === 'string' && trutienanConfig.startsWith('{')) {
      try {
        trutienanConfig = JSON.parse(trutienanConfig);
      } catch (e) {
        trutienanConfig = null;
      }
    }

    if (trutienanConfig && typeof trutienanConfig === 'object') {
      // Find match exactly
      if (trutienanConfig[hocphi]) {
        return parseInt(trutienanConfig[hocphi].tru_nghi) || 0;
      }
      // Fallback matching
      const match = Object.entries(trutienanConfig).find(([k]) => parseInt(k) === hocphi);
      if (match) return parseInt(match[1].tru_nghi) || 0;

      // If no match and it's a JSON but has no matching keys, return 0 or default
      return 0;
    }

    // Default to handling as a number string
    return parseInt(String(trutienanConfig).replace(/\D/g, '')) || 0;
  };

  const getTienAnTiers = () => {
    if (!config || !config.trutienan) return [];
    let trutienanConfig = config.trutienan;

    if (typeof trutienanConfig === 'string' && trutienanConfig.startsWith('{')) {
      try {
        trutienanConfig = JSON.parse(trutienanConfig);
      } catch (e) {
        trutienanConfig = null;
      }
    }

    if (trutienanConfig && typeof trutienanConfig === 'object') {
      return Object.entries(trutienanConfig).map(([k, v]) => {
        const amt = parseInt(String(k).replace(/\D/g, ''), 10) || 0;
        const tru = parseInt(String((typeof v === 'object' ? (v?.tru_nghi ?? v?.amount) : v) ?? amt).replace(/\D/g, ''), 10) || amt;
        return {
          amount: amt || tru,
          tru_nghi: tru || amt
        };
      }).filter(t => t.amount > 0 || t.tru_nghi > 0);
    }

    const val = parseInt(String(config.trutienan || '0').replace(/\D/g, ''), 10) || 0;
    if (val > 0) return [{ amount: val, tru_nghi: val }];
    return [];
  };

  const getTienAnConfig = (mealTierInput) => {
    if (!config || !config.trutienan) return { amount: Number(mealTierInput) || 0, tru_nghi: Number(mealTierInput) || 0 };

    const mealTier = parseInt(String(mealTierInput || '0').replace(/\D/g, ''), 10) || 0;
    let trutienanConfig = config.trutienan;

    if (typeof trutienanConfig === 'string' && trutienanConfig.startsWith('{')) {
      try {
        trutienanConfig = JSON.parse(trutienanConfig);
      } catch (e) {
        trutienanConfig = null;
      }
    }

    if (trutienanConfig && typeof trutienanConfig === 'object') {
      const keys = Object.keys(trutienanConfig);
      if (keys.length === 0) return { amount: mealTier, tru_nghi: mealTier };

      // Find match exactly
      if (mealTier > 0 && trutienanConfig[mealTier]) {
        const item = trutienanConfig[mealTier];
        const tru = parseInt(String((typeof item === 'object' ? (item?.tru_nghi ?? item?.amount) : item) ?? mealTier).replace(/\D/g, ''), 10) || mealTier;
        return { amount: mealTier, tru_nghi: tru };
      }

      // Fallback matching
      if (mealTier > 0) {
        const match = Object.entries(trutienanConfig).find(([k]) => parseInt(k, 10) === mealTier);
        if (match) {
          const item = match[1];
          const kAmt = parseInt(match[0], 10);
          const tru = parseInt(String((typeof item === 'object' ? (item?.tru_nghi ?? item?.amount) : item) ?? kAmt).replace(/\D/g, ''), 10) || kAmt;
          return { amount: kAmt, tru_nghi: tru };
        }
        return { amount: mealTier, tru_nghi: mealTier };
      }

      // Default to first tier if no match
      const firstKey = keys[0];
      const item = trutienanConfig[firstKey];
      const kAmt = parseInt(firstKey, 10);
      const tru = parseInt(String((typeof item === 'object' ? (item?.tru_nghi ?? item?.amount) : item) ?? kAmt).replace(/\D/g, ''), 10) || kAmt;
      return { amount: kAmt, tru_nghi: tru };
    }

    const val = parseInt(String(trutienanConfig).replace(/\D/g, ''), 10) || 0;
    return { amount: mealTier || val, tru_nghi: mealTier || val };
  };

  return (
    <ConfigContext.Provider value={{ config, setConfig, refreshConfig: fetchConfig, loading, getTruTienAn, getTienAnConfig, getTienAnTiers }}>
      {children}
    </ConfigContext.Provider>
  );
};
