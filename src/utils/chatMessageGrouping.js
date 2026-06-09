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
    const previousTime = previous?.created_at ? new Date(previous.created_at).getTime() : 0;
    const messageTime = message?.created_at ? new Date(message.created_at).getTime() : 0;
    const withinLegacyMergeWindow = Boolean(
      !groupId &&
      previous &&
      !previous._groupId &&
      previous.manv === message.manv &&
      previous.mahv === message.mahv &&
      !previous.content &&
      !message.content &&
      attachment &&
      Math.abs(messageTime - previousTime) <= 15000
    );
    const canMergeIntoPrevious = Boolean(
      groupId &&
      previous &&
      previous._groupId === groupId &&
      previous.manv === message.manv &&
      previous.mahv === message.mahv
    );

    if (canMergeIntoPrevious || withinLegacyMergeWindow) {
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

export const groupAnnouncementsForDisplay = (announcements = []) => {
  const grouped = [];

  announcements.forEach((announcement) => {
    const attachment = (announcement?.image_url || announcement?.file_url)
      ? {
          id: announcement.id || `announcement-${grouped.length}`,
          image_url: announcement.image_url || null,
          file_url: announcement.file_url || null,
          file_name: announcement.file_name || '',
          file_mime_type: announcement.file_mime_type || ''
        }
      : null;

    const previous = grouped[grouped.length - 1];
    const previousTime = previous?.date ? new Date(previous.date).getTime() : 0;
    const announcementTime = announcement?.date ? new Date(announcement.date).getTime() : 0;
    const canMergeIntoPrevious = Boolean(
      previous &&
      previous.type === announcement.type &&
      previous.title === announcement.title &&
      previous.content === announcement.content &&
      previous.malop === announcement.malop &&
      previous.manv === announcement.manv &&
      previous.approved === announcement.approved &&
      Math.abs(announcementTime - previousTime) <= 15000
    );

    if (canMergeIntoPrevious) {
      if (attachment) previous._attachments.push(attachment);
      previous._announcements.push(announcement);
      return;
    }

    grouped.push({
      ...announcement,
      _attachments: attachment ? [attachment] : [],
      _announcements: [announcement]
    });
  });

  return grouped;
};
