import { uploadToR2 } from './cloudflareR2';
import { compressImage } from './imageUtils';

export const toFileArray = (files) => Array.from(files || []).filter(Boolean);

export const getFileSignature = (file) => {
  if (!file) return '';
  return `${file.name || 'file'}__${file.size || 0}__${file.lastModified || 0}`;
};

export const mergeFileLists = (currentFiles = [], nextFiles = []) => {
  const merged = [...currentFiles];
  const existing = new Set(currentFiles.map(getFileSignature));

  nextFiles.forEach((file) => {
    const signature = getFileSignature(file);
    if (!existing.has(signature)) {
      existing.add(signature);
      merged.push(file);
    }
  });

  return merged;
};

export const isImageFile = (file) => String(file?.type || '').toLowerCase().startsWith('image/');

export const splitFilesByKind = (files = []) => files.reduce((result, file) => {
  if (isImageFile(file)) result.images.push(file);
  else result.files.push(file);
  return result;
}, { images: [], files: [] });

export const uploadManagedFile = async ({
  file,
  config,
  supabase,
  prefix = 'upload',
  imageFolder = 'chat-images',
  fileFolder = 'chat-files'
}) => {
  if (!file) {
    throw new Error('Missing file');
  }

  const image = isImageFile(file);
  let fileToUpload = file;

  if (image) {
    try {
      fileToUpload = await compressImage(file, 150);
    } catch (error) {
      console.error('Compression failed, using original file:', error);
    }
  }

  let url = '';
  if (config?.r2_enabled) {
    url = await uploadToR2(
      fileToUpload,
      config.r2_endpoint,
      config.r2_access_key_id,
      config.r2_secret_access_key,
      config.r2_bucket_name,
      config.r2_public_url
    );
  } else {
    const folder = image ? imageFolder : fileFolder;
    const safeName = `${prefix}_${Date.now()}_${fileToUpload.name}`;
    const storagePath = `${folder}/${safeName}`;
    const { error } = await supabase.storage.from('assets').upload(storagePath, fileToUpload);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(storagePath);
    url = publicUrl;
  }

  return {
    url,
    isImage: image,
    fileName: file.name || fileToUpload.name,
    mimeType: file.type || fileToUpload.type || ''
  };
};
