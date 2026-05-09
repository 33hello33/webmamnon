import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const uploadToR2 = async (file, endpoint, accessKeyId, secretAccessKey, bucketName, publicUrlPrefix) => {
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Cấu hình Cloudflare R2 chưa đầy đủ.');
  }

  const s3Client = new S3Client({
    region: "auto",
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });

  const fileExtension = file.name.split('.').pop() || 'tmp';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExtension}`;
  
  const uploadParams = {
    Bucket: bucketName,
    Key: fileName,
    Body: file,
    ContentType: file.type,
    // Note: Cloudflare R2 does not support ACLs, so do not set ACL: 'public-read'
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    // Construct the public URL
    const cleanPublicUrlPrefix = publicUrlPrefix?.replace(/\/+$/, '') || endpoint?.replace(/\/+$/, '');
    return `${cleanPublicUrlPrefix}/${fileName}`;
  } catch (err) {
    console.error('R2 Upload Error:', err);
    throw new Error(err.message || 'Lỗi tải lên Cloudflare R2');
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
    if (fileKey.startsWith('/')) {
      fileKey = fileKey.substring(1);
    }
  } else {
      // attempt to extract from normal URL
      try {
          const urlObj = new URL(fileUrl);
          fileKey = urlObj.pathname.substring(1); // remove leading slash
      } catch (e) {
          // fallback
          console.warn('Could not parse R2 File URL for deletion', fileUrl);
      }
  }

  const s3Client = new S3Client({
    region: "auto",
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });

  const deleteParams = {
    Bucket: bucketName,
    Key: fileKey,
  };

  try {
    await s3Client.send(new DeleteObjectCommand(deleteParams));
    return true;
  } catch (err) {
    console.error('R2 Delete Error:', err);
    throw new Error(err.message || 'Lỗi xóa file trên Cloudflare R2');
  }
};
