/**
 * Image compression utility
 */

export const compressImage = async (file, maxSizeKB = 150) => {
  const fileType = String(file?.type || '').toLowerCase();
  const supportedRasterTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const shouldConvertToJpeg = supportedRasterTypes.includes(fileType);

  if (!fileType.startsWith('image/') || !shouldConvertToJpeg) {
    return file;
  }

  if ((fileType === 'image/jpeg' || fileType === 'image/jpg') && file.size / 1024 <= maxSizeKB) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Step 1: Initial Resize if image is extremely large (optional but recommended)
        const maxDimension = 1600;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Use white background for JPEGs (to handle transparent PNGs)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        const targetSizeBytes = maxSizeKB * 1024;

        const attemptCompression = (q, currentWidth, currentHeight) => {
          canvas.width = currentWidth;
          canvas.height = currentHeight;
          const currentCtx = canvas.getContext('2d');
          currentCtx.fillStyle = '#FFFFFF';
          currentCtx.fillRect(0, 0, currentWidth, currentHeight);
          currentCtx.drawImage(img, 0, 0, currentWidth, currentHeight);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Compression failed'));
                return;
              }

              if (blob.size <= targetSizeBytes) {
                // Success!
                const extensionIndex = file.name.lastIndexOf('.');
                const baseName = extensionIndex > 0 ? file.name.substring(0, extensionIndex) : file.name;
                const compressedFile = new File([blob], `${baseName}.jpg`, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else if (q > 0.1) {
                // Try lower quality
                attemptCompression(q - 0.15, currentWidth, currentHeight);
              } else if (currentWidth > 400) {
                // Quality is already low, try reducing dimensions significantly
                attemptCompression(0.7, Math.floor(currentWidth * 0.6), Math.floor(currentHeight * 0.6));
              } else {
                // Give up and return the best we have
                const extensionIndex = file.name.lastIndexOf('.');
                const baseName = extensionIndex > 0 ? file.name.substring(0, extensionIndex) : file.name;
                const compressedFile = new File([blob], `${baseName}.jpg`, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              }
            },
            'image/jpeg',
            q
          );
        };

        attemptCompression(quality, width, height);
      };
      img.onerror = () => reject(new Error('Image load failed'));
    };
    reader.onerror = () => reject(new Error('File read failed'));
  });
};
