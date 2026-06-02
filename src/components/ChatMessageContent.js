import React from 'react';

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<]+/gi;

const normalizeUrl = (rawUrl) => {
  if (!rawUrl) return '';
  return rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `https://${rawUrl}`;
};

const trimTrailingPunctuation = (rawUrl) => {
  if (!rawUrl) return '';
  return rawUrl.replace(/[),.!?]+$/g, '');
};

const parseUrl = (rawUrl) => {
  try {
    return new URL(normalizeUrl(rawUrl));
  } catch (error) {
    return null;
  }
};

const getYouTubeVideoId = (rawUrl) => {
  const parsedUrl = parseUrl(rawUrl);
  if (!parsedUrl) return null;

  const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    return parsedUrl.pathname.split('/').filter(Boolean)[0] || null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (parsedUrl.pathname === '/watch') {
      return parsedUrl.searchParams.get('v');
    }

    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed') {
      return parts[1] || null;
    }
  }

  return null;
};

const extractUrls = (content) => {
  const text = String(content || '');
  const matches = text.match(URL_REGEX) || [];
  return [...new Set(matches.map(trimTrailingPunctuation).filter(Boolean).map(normalizeUrl))];
};

const getTextSegments = (content) => {
  const text = String(content || '');
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const rawUrl = trimTrailingPunctuation(match[0]);
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + rawUrl.length;

    if (startIndex > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, startIndex) });
    }

    segments.push({ type: 'link', value: rawUrl, href: normalizeUrl(rawUrl) });
    lastIndex = endIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
};

const getPreviewMeta = (url) => {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl) return null;

  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  const path = `${parsedUrl.pathname}${parsedUrl.search}` || '/';

  return {
    hostname,
    title: hostname.charAt(0).toUpperCase() + hostname.slice(1),
    path,
    favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`
  };
};

const LinkPreviewCard = ({ url, isOwnMessage }) => {
  const videoId = getYouTubeVideoId(url);
  const meta = getPreviewMeta(url);

  if (!meta) return null;

  if (videoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'block',
          textDecoration: 'none',
          color: isOwnMessage ? 'white' : '#0f172a',
          background: isOwnMessage ? 'rgba(255,255,255,0.14)' : '#f8fafc',
          border: isOwnMessage ? '1px solid rgba(255,255,255,0.25)' : '1px solid #e2e8f0',
          borderRadius: '14px',
          overflow: 'hidden',
          width: '100%',
          maxWidth: '320px'
        }}
      >
        <div style={{ position: 'relative', background: '#0f172a' }}>
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="YouTube preview"
            style={{ display: 'block', width: '100%', height: 'auto' }}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.18)'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '38px',
                borderRadius: '12px',
                background: 'rgba(220, 38, 38, 0.92)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              PLAY
            </div>
          </div>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>YouTube</div>
          <div
            style={{
              fontSize: '0.75rem',
              opacity: 0.85,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {url}
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        textDecoration: 'none',
        color: isOwnMessage ? 'white' : '#0f172a',
        background: isOwnMessage ? 'rgba(255,255,255,0.14)' : '#f8fafc',
        border: isOwnMessage ? '1px solid rgba(255,255,255,0.25)' : '1px solid #e2e8f0',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '320px'
      }}
    >
      {meta.favicon ? (
        <img
          src={meta.favicon}
          alt=""
          width="40"
          height="40"
          style={{ borderRadius: '10px', flexShrink: 0, background: '#fff' }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '3px' }}>{meta.title}</div>
        <div
          style={{
            fontSize: '0.74rem',
            opacity: 0.9,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {meta.hostname}
        </div>
        <div
          style={{
            fontSize: '0.72rem',
            opacity: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {meta.path}
        </div>
      </div>
    </a>
  );
};

function ChatMessageContent({ content, isOwnMessage = false }) {
  const urls = extractUrls(content);
  const segments = getTextSegments(content);

  const linkStyle = {
    color: isOwnMessage ? 'rgba(255,255,255,0.98)' : '#2563eb',
    textDecoration: 'underline',
    wordBreak: 'break-word'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: 0 }}>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 0 }}>
        {segments.map((segment, index) => {
          if (segment.type === 'link') {
            return (
              <a
                key={`segment-${index}`}
                href={segment.href}
                target="_blank"
                rel="noreferrer"
                style={linkStyle}
              >
                {segment.value}
              </a>
            );
          }

          return <React.Fragment key={`segment-${index}`}>{segment.value}</React.Fragment>;
        })}
      </div>

      {urls.map((url) => (
        <LinkPreviewCard key={url} url={url} isOwnMessage={isOwnMessage} />
      ))}
    </div>
  );
}

export default ChatMessageContent;
