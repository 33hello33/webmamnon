import React, { useState } from 'react';
import { getFileSignature, toFileArray } from '../utils/managedUploads';

function FileDropZone({
  files = [],
  onFilesChange,
  accept,
  multiple = true,
  disabled = false,
  filterFiles,
  icon: Icon,
  accentColor = '#64748b',
  borderColor = '#e2e8f0',
  activeBorderColor,
  background = '#f8fafc',
  activeBackground,
  textColor = '#334155',
  subTextColor = '#64748b',
  emptyTitle = '',
  emptySubtitle = '',
  selectedHint = '',
  style = {},
  listStyle = {}
}) {
  const [isDragging, setIsDragging] = useState(false);
  const resolvedFiles = Array.isArray(files) ? files : [];
  const resolvedBorderColor = isDragging ? activeBorderColor || accentColor : borderColor;
  const resolvedBackground = isDragging ? activeBackground || background : background;

  const forwardFiles = (rawFiles) => {
    const pickedFiles = toFileArray(rawFiles);
    const nextFiles =
      typeof filterFiles === 'function'
        ? pickedFiles.filter((file) => filterFiles(file))
        : pickedFiles;

    if (!nextFiles.length || typeof onFilesChange !== 'function') return;
    onFilesChange(nextFiles);
  };

  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '20px',
        borderRadius: '16px',
        border: `2px dashed ${resolvedBorderColor}`,
        background: resolvedBackground,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        opacity: disabled ? 0.65 : 1,
        ...style
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (disabled) return;
        forwardFiles(event.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(event) => {
          forwardFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={disabled}
      />

      {Icon ? <Icon size={40} style={{ color: accentColor }} /> : null}

      {resolvedFiles.length > 0 ? (
        <>
          <div style={{ width: '100%', display: 'grid', gap: '8px', maxHeight: '130px', overflowY: 'auto', ...listStyle }}>
            {resolvedFiles.map((file) => (
              <div
                key={getFileSignature(file)}
                style={{
                  width: '100%',
                  textAlign: 'center',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.75)',
                  color: textColor,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {file.name}
              </div>
            ))}
          </div>
          {selectedHint ? (
            <span style={{ fontSize: '0.8rem', color: subTextColor, textAlign: 'center' }}>{selectedHint}</span>
          ) : null}
        </>
      ) : (
        <>
          {emptyTitle ? (
            <span style={{ fontWeight: 700, color: textColor, textAlign: 'center' }}>{emptyTitle}</span>
          ) : null}
          {emptySubtitle ? (
            <span style={{ fontSize: '0.8rem', color: subTextColor, textAlign: 'center' }}>{emptySubtitle}</span>
          ) : null}
        </>
      )}
    </label>
  );
}

export default FileDropZone;
