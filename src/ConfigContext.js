import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

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
        setConfig(data);
        // Apply web name to title
        if (data.tenweb) document.title = data.tenweb;
        // Apply logo favicon if needed (simplification: inject link)
        if (data.logo) {
          const favicon = document.querySelector('link[rel="icon"]');
          if (favicon) favicon.href = data.logo;
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
           sonhanvientrogiang: 1,
           ngayquahan: 0,
           phanquyenrole: {
              'Quản lý': { full: true },
              'Nhân viên VP': { full: false, tabs: ['overview', 'finances', 'students'] },
              'Giáo viên': { full: false, tabs: ['students', 'timesheet'] }
           },
           gdrive_enabled: false,
           gdrive_auth_type: 'oauth',
           gdrive_client_id: '',
           gdrive_api_key: '',
           gdrive_folder_id: '',
           gdrive_service_json: null
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
  }, []);

  return (
    <ConfigContext.Provider value={{ config, setConfig, refreshConfig: fetchConfig, loading }}>
      {children}
    </ConfigContext.Provider>
  );
};
