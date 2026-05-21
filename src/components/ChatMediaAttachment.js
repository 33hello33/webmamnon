import React from 'react';
import { Download, FileText } from 'lucide-react';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];

const isVideoAttachment = (fileUrl, mimeType) => {
  if (mimeType?.toLowerCase().startsWith('video/')) return true;
  if (!fileUrl) return false;

  const normalizedUrl = fileUrl.toLowerCase().split('?')[0];
  return VIDEO_EXTENSIONS.some((extension) => normalizedUrl.endsWith(extension));
};

function ChatMediaAttachment({ fileUrl, fileName, mimeType, isOwnMessage = false }) {
  if (!fileUrl) return null;

  if (isVideoAttachment(fileUrl, mimeType)) {
    return (
      <div
        style={{
          marginTop: '5px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: '#0f172a',
          maxWidth: '100%'
        }}
      >
        <video
          src={fileUrl}
          controls
          playsInline
          preload="metadata"
          style={{ display: 'block', width: '100%', maxWidth: '320px', maxHeight: '360px', background: '#000' }}
        />
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            color: 'white',
            textDecoration: 'none',
            background: 'rgba(15, 23, 42, 0.92)',
            fontSize: '0.82rem',
            fontWeight: 600
          }}
        >
          <Download size={16} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName || 'Mở video ở tab mới'}
          </span>
        </a>
      </div>
    );
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noreferrer"
      style={{
        marginTop: '5px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        background: isOwnMessage ? '#be185d' : '#f1f5f9',
        color: isOwnMessage ? 'white' : '#1e293b',
        borderRadius: '12px',
        textDecoration: 'none',
        fontSize: '0.85rem'
      }}
    >
      <FileText size={18} />
      <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {fileName || 'Tài liệu'}
      </span>
      <Download size={16} />
    </a>
  );
}

export default ChatMediaAttachment;
