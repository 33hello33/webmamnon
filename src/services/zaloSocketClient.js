import { io } from 'socket.io-client';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

export const getAppId = () => {
    const envAppId =
        process.env.REACT_APP_APP_ID ||
        process.env.REACT_APP_BUILD_PATH ||
        process.env.REACT_APP_SUPABASE_SCHEMA ||
        process.env.BUILD_PATH;

    if (envAppId) return envAppId;

    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return hostname;
    }

    return 'default';
};

export const socket = io(BACKEND_URL, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    query: { appId: getAppId() }
});

// Configure Axios defaults to auto-include X-App-Id for all HTTP requests to Zalo API
axios.interceptors.request.use((config) => {
    if (config.url && (config.url.includes(BACKEND_URL) || config.url.includes('/api/zalo'))) {
        config.headers['X-App-Id'] = getAppId();
    }
    return config;
}, (error) => Promise.reject(error));

