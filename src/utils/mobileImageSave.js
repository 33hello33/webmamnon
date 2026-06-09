const MOBILE_DEVICE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

const CORS_PROXY_URLS = [
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

const fetchImageBlob = async (url) => {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }
  return response.blob();
};

const fetchImageBlobWithFallback = async (url) => {
  try {
    return await fetchImageBlob(url);
  } catch (directError) {
    let lastError = directError;
    for (const makeProxyUrl of CORS_PROXY_URLS) {
      try {
        return await fetchImageBlob(makeProxyUrl(url));
      } catch (proxyError) {
        lastError = proxyError;
      }
    }
    throw lastError;
  }
};

const triggerBrowserDownload = (blob, filename) => {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
};

export const saveImageToDevice = async (imageUrl, filename = 'anh.jpg') => {
  if (!imageUrl) return false;

  const isMobileDevice = MOBILE_DEVICE_REGEX.test(navigator.userAgent || '');
  const safeFilename = filename || 'anh.jpg';

  if (isMobileDevice) {
    try {
      const blob = await fetchImageBlobWithFallback(imageUrl);
      const file = new File([blob], safeFilename, {
        type: blob.type || 'image/jpeg'
      });

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: 'Lưu ảnh'
        });
        return true;
      }
    } catch (error) {
      console.warn('Không thể chia sẻ file ảnh trực tiếp:', error);
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Lưu ảnh',
          url: imageUrl
        });
        return true;
      }
    } catch (error) {
      console.warn('Không thể chia sẻ URL ảnh trực tiếp:', error);
    }

    window.open(imageUrl, '_blank', 'noopener,noreferrer');
    return false;
  }

  try {
    const blob = await fetchImageBlobWithFallback(imageUrl);
    triggerBrowserDownload(blob, safeFilename);
    return true;
  } catch (error) {
    console.warn('Tải ảnh trực tiếp thất bại, mở ảnh ở tab mới:', error);
    window.open(imageUrl, '_blank', 'noopener,noreferrer');
    return false;
  }
};
