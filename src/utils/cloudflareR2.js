/**
 * Cloudflare R2 upload/delete via S3 REST API (browser-compatible, no AWS SDK)
 * Uses AWS Signature V4 signing with native browser crypto/fetch.
 */

// --- AWS Signature V4 helpers ---

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, message) {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secretAccessKey, date, region, service) {
  const kDate = await hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

function getAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
}

async function signRequest({ method, endpoint, bucket, key, body, contentType, accessKeyId, secretAccessKey }) {
  const url = new URL(`${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`);
  const now = new Date();
  const amzDate = getAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const payloadHash = body
    ? await sha256Bytes(body)
    : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const headers = {
    'host': url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...(contentType ? { 'content-type': contentType } : {}),
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}`).join('\n') + '\n';
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: url.toString(),
    headers: {
      ...headers,
      Authorization: authorization,
    },
  };
}

// --- Public API ---

export const uploadToR2 = async (file, endpoint, accessKeyId, secretAccessKey, bucketName, publicUrlPrefix, options = {}) => {
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Cau hinh Cloudflare R2 chua day du.');
  }

  const fileExtension = file.name.split('.').pop() || 'tmp';
  const customKey = typeof options === 'string' ? options : options?.key;
  const normalizedCustomKey = customKey ? String(customKey).replace(/^\/+/, '') : '';
  const fileName = normalizedCustomKey || `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExtension}`;

  const arrayBuffer = await file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  const { url, headers } = await signRequest({
    method: 'PUT',
    endpoint,
    bucket: bucketName,
    key: fileName,
    body,
    contentType: file.type,
    accessKeyId,
    secretAccessKey,
  });

  try {
    const res = await fetch(url, { method: 'PUT', headers, body });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`R2 upload that bai (${res.status}): ${text}`);
    }
    const cleanPublicUrlPrefix = publicUrlPrefix?.replace(/\/+$/, '') || endpoint?.replace(/\/+$/, '');
    return `${cleanPublicUrlPrefix}/${fileName}`;
  } catch (err) {
    console.error('R2 Upload Error:', err);
    throw new Error(err.message || 'Loi tai len Cloudflare R2');
  }
};

export const deleteFromR2 = async (fileUrl, endpoint, accessKeyId, secretAccessKey, bucketName, publicUrlPrefix) => {
  if (!fileUrl || !endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    return false;
  }

  const cleanPublicUrlPrefix = publicUrlPrefix?.replace(/\/+$/, '') || endpoint?.replace(/\/+$/, '');
  let fileKey = fileUrl;

  if (fileUrl.startsWith(cleanPublicUrlPrefix)) {
    fileKey = fileUrl.substring(cleanPublicUrlPrefix.length);
    if (fileKey.startsWith('/')) fileKey = fileKey.substring(1);
  } else {
    try {
      const urlObj = new URL(fileUrl);
      fileKey = urlObj.pathname.substring(1);
    } catch (e) {
      console.warn('Could not parse R2 File URL for deletion', fileUrl);
    }
  }

  const { url, headers } = await signRequest({
    method: 'DELETE',
    endpoint,
    bucket: bucketName,
    key: fileKey,
    accessKeyId,
    secretAccessKey,
  });

  try {
    const res = await fetch(url, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`R2 delete that bai (${res.status}): ${text}`);
    }
    return true;
  } catch (err) {
    console.error('R2 Delete Error:', err);
    throw new Error(err.message || 'Loi xoa file tren Cloudflare R2');
  }
};