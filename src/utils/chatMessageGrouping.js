const GROUP_TOKEN_PREFIX = 'group:';

export const createMessageGroupId = (prefix = 'msg') => (
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

export const getBaseMessageDescription = (description) => {
  const parts = String(description || '')
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

  return parts.find(part => !part.startsWith(GROUP_TOKEN_PREFIX)) || '';
};

export const getMessageGroupId = (description) => {
  const parts = String(description || '')
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

  const groupToken = parts.find(part => part.startsWith(GROUP_TOKEN_PREFIX));
  return groupToken ? groupToken.slice(GROUP_TOKEN_PREFIX.length) : '';
};

export const buildGroupedMessageDescription = (description, groupId = '') => {
  const baseDescription = String(description || '').trim();
  if (!groupId) return baseDescription;
  return `${baseDescription}|${GROUP_TOKEN_PREFIX}${groupId}`;
};

export const groupMessagesForDisplay = (messages = []) => {
  const grouped = [];

  messages.forEach((message) => {
    const groupId = getMessageGroupId(message?.description);
    const baseDescription = getBaseMessageDescription(message?.description) || message?.description || '';
    const attachment = (message?.image_url || message?.file_url)
      ? {
          id: message.id || `${groupId || 'attachment'}-${grouped.length}`,
          image_url: message.image_url || null,
          file_url: message.file_url || null,
          file_name: message.file_name || '',
          file_mime_type: message.file_mime_type || ''
        }
      : null;

    const previous = grouped[grouped.length - 1];
    const canMergeIntoPrevious = Boolean(
      groupId &&
      previous &&
      previous._groupId === groupId &&
      previous.manv === message.manv &&
      previous.mahv === message.mahv
    );

    if (canMergeIntoPrevious) {
      if (!previous.content && message.content) previous.content = message.content;
      if (attachment) previous._attachments.push(attachment);
      previous._messages.push(message);
      return;
    }

    grouped.push({
      ...message,
      description: baseDescription,
      _groupId: groupId,
      _attachments: attachment ? [attachment] : [],
      _messages: [message]
    });
  });

  return grouped;
};
