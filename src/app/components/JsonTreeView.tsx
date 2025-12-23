'use client';

import { useMemo, useState } from 'react';
import { Tree, Image, message } from 'antd';
import type { TreeDataNode } from 'antd';
import { FileImageOutlined, CopyOutlined, DownloadOutlined, LinkOutlined } from '@ant-design/icons';
import { showDownloadDialog } from '../lib/download';
import { openUrl } from '@tauri-apps/plugin-opener';

interface JsonTreeViewProps {
  content: string;
  isValidJson: boolean;
}

export default function JsonTreeView({ content, isValidJson }: JsonTreeViewProps) {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Get depth level from path
  const getDepth = (path: string): number => {
    if (path === '$') return 0;
    const dots = (path.match(/\./g) || []).length;
    const brackets = (path.match(/\[/g) || []).length;
    return dots + brackets;
  };

  // Get color based on depth level
  const getColorByDepth = (depth: number): string => {
    const colors = [
      '#ef4444', // red-500
      '#f59e0b', // amber-500
      '#10b981', // emerald-500
      '#06b6d4', // cyan-500
      '#3b82f6', // blue-500
      '#8b5cf6', // violet-500
      '#ec4899', // pink-500
      '#14b8a6', // teal-500
    ];
    return colors[depth % colors.length];
  };

  // Copy path to clipboard
  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      message.success(`Copied: ${path}`);
    } catch {
      message.error('Failed to copy path');
    }
  };

  // Check if a string is a URL
  const isUrl = (value: string): boolean => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Copy value to clipboard
  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success('Value copied to clipboard');
    } catch {
      message.error('Failed to copy value');
    }
  };

  // Download image
  const downloadImage = async (dataUri: string, key: string) => {
    try {
      const timestamp = new Date().getTime();
      const fileName = `${key}_${timestamp}`;
      await showDownloadDialog(fileName, dataUri);
      message.success('Image downloaded');
    } catch {
      message.error('Failed to download image');
    }
  };

  // Open URL
  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url);
      message.success('Opening URL...');
    } catch {
      message.error('Failed to open URL');
    }
  };

  // Render path tag component
  const PathTag = ({ path }: { path: string }) => {
    const depth = getDepth(path);
    const color = getColorByDepth(depth);
    
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          copyPath(path);
        }}
        style={{
          display: 'inline-block',
          color: color,
          fontSize: 10,
          fontWeight: 600,
          background: `${color}15`,
          padding: '0px 8px',
          borderRadius: 4,
          marginRight: 8,
          cursor: 'pointer',
          border: `1px solid ${color}30`,
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${color}25`;
          e.currentTarget.style.borderColor = `${color}50`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = `${color}15`;
          e.currentTarget.style.borderColor = `${color}30`;
        }}
        title={`Click to copy: ${path}`}
      >
        {path}
      </span>
    );
  };

  // Render action icon based on value type
  const ActionIcon = ({ value, keyName }: { value: unknown; keyName: string }) => {
    const [isHovered, setIsHovered] = useState(false);

    if (typeof value !== 'string') {
      // For non-string values, show copy icon
      return (
        <span
          onClick={(e) => {
            e.stopPropagation();
            copyValue(String(value));
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            marginLeft: 8,
            cursor: 'pointer',
            opacity: isHovered ? 1 : 0.5,
            transition: 'opacity 0.2s',
            color: '#6b7280',
          }}
          title="Copy value"
        >
          <CopyOutlined />
        </span>
      );
    }

    // For image data URIs
    if (isImageDataUri(value)) {
      return (
        <span
          onClick={(e) => {
            e.stopPropagation();
            downloadImage(value, keyName);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            marginLeft: 8,
            cursor: 'pointer',
            opacity: isHovered ? 1 : 0.5,
            transition: 'opacity 0.2s',
            color: '#10b981',
          }}
          title="Download image"
        >
          <DownloadOutlined />
        </span>
      );
    }

    // For URLs
    if (isUrl(value)) {
      return (
        <span
          onClick={(e) => {
            e.stopPropagation();
            handleOpenUrl(value);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            marginLeft: 8,
            cursor: 'pointer',
            opacity: isHovered ? 1 : 0.5,
            transition: 'opacity 0.2s',
            color: '#3b82f6',
          }}
          title="Open URL"
        >
          <LinkOutlined />
        </span>
      );
    }

    // For normal strings
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          copyValue(value);
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          marginLeft: 8,
          cursor: 'pointer',
          opacity: isHovered ? 1 : 0.5,
          transition: 'opacity 0.2s',
          color: '#6b7280',
        }}
        title="Copy value"
      >
        <CopyOutlined />
      </span>
    );
  };

  // Check if a string is a base64 image data URI
  const isImageDataUri = (value: unknown): boolean => {
    return typeof value === 'string' && value.startsWith('data:image');
  };

  // Check if a string is valid JSON
  const tryParseJson = (str: string): { isJson: boolean; parsed?: unknown } => {
    if (!str || str.length < 2) return { isJson: false };
    const trimmed = str.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return { isJson: false };
    
    try {
      const parsed = JSON.parse(trimmed);
      return { isJson: true, parsed };
    } catch {
      return { isJson: false };
    }
  };

  // Build tree data from JSON
  const buildTreeData = (obj: unknown, path = '$', key = 'root'): TreeDataNode[] => {
    if (obj === null) {
      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#6b7280', fontStyle: 'italic' }}>null</span>
            <ActionIcon value={null} keyName={key} />
          </span>
        ),
      }];
    }

    if (obj === undefined) {
      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#6b7280', fontStyle: 'italic' }}>undefined</span>
            <ActionIcon value={undefined} keyName={key} />
          </span>
        ),
      }];
    }

    if (typeof obj === 'string') {
      // Check if it's an image data URI
      if (isImageDataUri(obj)) {
        return [{
          key: path,
          title: (
            <div>
              <div>
                <PathTag path={path} />
                <span style={{ fontWeight: 500 }}>{key}: </span>
                <span style={{ color: '#10b981' }}>
                  <FileImageOutlined style={{ marginRight: 4 }} />
                  Image Data URI
                </span>
                <ActionIcon value={obj} keyName={key} />
              </div>
              <div style={{ marginTop: 8, marginLeft: 16 }}>
                <Image 
                  src={obj} 
                  alt="preview"
                  style={{ maxWidth: 200, maxHeight: 200, border: '1px solid #e5e7eb', borderRadius: 4 }}
                  preview={{
                    mask: 'Click to preview'
                  }}
                />
              </div>
            </div>
          ),
        }];
      }
      
      // Check if it's a JSON string
      const jsonCheck = tryParseJson(obj);
      if (jsonCheck.isJson && jsonCheck.parsed !== undefined) {
        // It's a JSON string - parse and show as nested structure
        const parsed = jsonCheck.parsed;
        let children: TreeDataNode[] = [];
        let typeLabel = '';

        if (Array.isArray(parsed)) {
          children = parsed.flatMap((item, index) => 
            buildTreeData(item, `${path}[${index}]`, `[${index}]`)
          );
          typeLabel = `Array(${parsed.length})`;
        } else if (typeof parsed === 'object' && parsed !== null) {
          children = Object.entries(parsed).flatMap(([k, v]) => 
            buildTreeData(v, `${path}.${k}`, k)
          );
          typeLabel = `Object(${Object.keys(parsed).length})`;
        }

        return [{
          key: path,
          title: (
            <span>
              <PathTag path={path} />
              <span style={{ fontWeight: 500 }}>{key}: </span>
              <span style={{ color: '#8b5cf6', fontSize: 11, background: 'rgba(139, 92, 246, 0.1)', padding: '1px 6px', borderRadius: 3 }}>
                JSON String
              </span>
              {' '}
              <span style={{ color: '#6b7280', fontSize: 11 }}>
                {typeLabel}
              </span>
            </span>
          ),
          children: children.length > 0 ? children : undefined,
        }];
      }
      
      // Regular string
      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#10b981' }}>&quot;{obj}&quot;</span>
            <ActionIcon value={obj} keyName={key} />
          </span>
        ),
      }];
    }

    if (typeof obj === 'number') {
      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#3b82f6' }}>{obj}</span>
            <ActionIcon value={obj} keyName={key} />
          </span>
        ),
      }];
    }

    if (typeof obj === 'boolean') {
      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#f59e0b' }}>{obj.toString()}</span>
            <ActionIcon value={obj} keyName={key} />
          </span>
        ),
      }];
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return [{
          key: path,
          title: (
            <span>
              <PathTag path={path} />
              <span style={{ fontWeight: 500 }}>{key}: </span>
              <span style={{ color: '#6b7280' }}>[]</span>
            </span>
          ),
        }];
      }

      const children = obj.flatMap((item, index) => 
        buildTreeData(item, `${path}[${index}]`, `[${index}]`)
      );

      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#6b7280' }}>Array({obj.length})</span>
          </span>
        ),
        children,
      }];
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      if (entries.length === 0) {
        return [{
          key: path,
          title: (
            <span>
              <PathTag path={path} />
              <span style={{ fontWeight: 500 }}>{key}: </span>
              <span style={{ color: '#6b7280' }}>{'{}'}</span>
            </span>
          ),
        }];
      }

      const children = entries.flatMap(([k, v]) => 
        buildTreeData(v, `${path}.${k}`, k)
      );

      return [{
        key: path,
        title: (
          <span>
            <PathTag path={path} />
            <span style={{ fontWeight: 500 }}>{key}: </span>
            <span style={{ color: '#6b7280' }}>Object({entries.length})</span>
          </span>
        ),
        children,
      }];
    }

    return [];
  };

  // Parse JSON and build tree data
  const treeData = useMemo(() => {
    if (!isValidJson) return [];
    try {
      const parsed = JSON.parse(content);
      return buildTreeData(parsed);
    } catch {
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isValidJson]);

  return (
    <div style={{ 
      height: '100%', 
      overflow: 'auto',
      padding: '16px',
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13
    }}
    className='select-none user-select-none cursor-pointer scroll-smooth'
    >
      {treeData.length > 0 ? (
        <Tree
          treeData={treeData}
          defaultExpandAll
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as string[])}
          showLine
          showIcon={false}
        />
      ) : (
        <div style={{ 
          textAlign: 'center', 
          color: '#9ca3af',
          paddingTop: 40 
        }}>
          Invalid JSON - cannot display tree view
        </div>
      )}
    </div>
  );
}
