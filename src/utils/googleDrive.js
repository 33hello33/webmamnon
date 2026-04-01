/**
 * Google Drive Upload Helper with OAuth 2.0 and Service Account support
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export const uploadToGDrive = async (file, folderId, clientId, apiKey, authType = 'oauth', serviceJson = null) => {
  let token = '';

  if (authType === 'service' && serviceJson) {
     token = await getServiceAccountToken(serviceJson);
  } else {
     token = await getOAuthToken(clientId);
  }

  if (!token) throw new Error('Không thể xác thực Google Drive');

  // Perform Multipart Upload
  const metadata = {
    name: file.name,
    mimeType: file.type,
    parents: folderId ? [folderId] : []
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem('gdrive_token');
      sessionStorage.removeItem('gdrive_service_token');
      return uploadToGDrive(file, folderId, clientId, apiKey, authType, serviceJson);
    }
    const err = await response.json();
    throw new Error(err.error?.message || 'Lỗi tải lên Google Drive');
  }

  const result = await response.json();
  return {
    id: result.id,
    webViewLink: result.webViewLink,
    webContentLink: result.webContentLink
  };
};

// --- OAuth Flow ---
export const getOAuthToken = (clientId) => {
  let token = sessionStorage.getItem('gdrive_token');
  if (token) return Promise.resolve(token);

  return new Promise((resolve) => {
    if (!window.google) {
      const script = document.createElement('script');
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => initAuth(clientId, resolve);
      document.head.appendChild(script);
    } else {
      initAuth(clientId, resolve);
    }
  });
};

const initAuth = (clientId, resolve) => {
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        resolve(null);
      } else {
        sessionStorage.setItem('gdrive_token', response.access_token);
        resolve(response.access_token);
      }
    },
  });
  client.requestAccessToken();
};

// --- Service Account Flow (JWT RS256) ---
const getServiceAccountToken = async (json) => {
  const cached = sessionStorage.getItem('gdrive_service_token');
  if (cached) {
     const { token, expiry } = JSON.parse(cached);
     if (Date.now() < expiry - 60000) return token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: json.client_email,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = b64(JSON.stringify(header));
  const encodedClaim = b64(JSON.stringify(claim));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;
  
  const signature = await signRS256(json.private_key, signatureInput);
  const jwt = `${signatureInput}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const data = await response.json();
  if (data.access_token) {
     sessionStorage.setItem('gdrive_service_token', JSON.stringify({
        token: data.access_token,
        expiry: Date.now() + (data.expires_in * 1000)
     }));
     return data.access_token;
  }
  throw new Error('Service Account Auth Failed: ' + (data.error_description || data.error));
};

const b64 = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const signRS256 = async (privateKeyPem, str) => {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) binaryDer[i] = binaryDerString.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};
