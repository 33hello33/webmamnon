/**
 * Thay thế các từ khóa dạng [tenkhoa] trong mẫu tin nhắn Zalo.
 * Từ khóa không có giá trị tương ứng sẽ được giữ nguyên.
 */
export const formatZaloMessage = (template, values = {}) => {
  if (!template) return '';
  return String(template).replace(/\[([a-z0-9_]+)\]/gi, (match, key) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
};

/**
 * Dựng caption gửi kèm ảnh Zalo: dùng mẫu trong tbl_config, nếu chưa cấu hình thì dùng câu mặc định.
 */
export const buildZaloCaption = (template, values, fallback = '') => {
  const text = formatZaloMessage(template, values).trim();
  return text || fallback;
};
