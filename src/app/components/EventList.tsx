'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Button, Tooltip, Empty, App } from 'antd';
import {
  ClearOutlined,
  VerticalAlignBottomOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ExpandOutlined,
  DownOutlined,
  RightOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useSocketStore, useFilteredEvents, useCurrentConnection } from '@/app/stores/socketStore';
import { analyzeJsonPayload } from '@/app/lib/jsonPayload';
import { clearEventHistory } from '@/app/hooks/useTauri';
import JsonViewerModal from './JsonViewerModal';

const COLLAPSE_THRESHOLD = 200; // Characters threshold for auto-collapse
const MAX_PREVIEW_LINES = 6;
const MAX_LINE_LENGTH = 80; // Max chars per line in preview

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function truncateLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) return line;
  return line.slice(0, maxLength) + '...';
}

function getPreviewPayload(formattedPayload: string, maxLines: number): string {
  const lines = formattedPayload.split('\n');

  // Truncate each line and limit total lines
  const previewLines = lines.slice(0, maxLines).map((line) => truncateLine(line, MAX_LINE_LENGTH));

  const hasMoreLines = lines.length > maxLines;
  const hasLongLines = lines.some((line) => line.length > MAX_LINE_LENGTH);

  if (hasMoreLines || hasLongLines) {
    return previewLines.join('\n') + '\n  ...';
  }
  return previewLines.join('\n');
}

interface EventData {
  id: string;
  eventName: string;
  payload: string;
  timestamp: Date;
  direction: 'in' | 'out';
}

interface EventItemProps {
  event: EventData;
  onOpenViewer: (event: EventData) => void;
}

function EventItem({ event, onOpenViewer }: EventItemProps) {
  const { message } = App.useApp();
  const payloadAnalysis = analyzeJsonPayload(event.payload);
  const formattedPayload = payloadAnalysis.display;
  const lines = formattedPayload.split('\n');
  const lineCount = lines.length;
  const hasLongLines = lines.some((line) => line.length > MAX_LINE_LENGTH);
  const isLarge =
    formattedPayload.length > COLLAPSE_THRESHOLD || lineCount > MAX_PREVIEW_LINES || hasLongLines;
  const [expanded, setExpanded] = useState(false);
  const isJson = payloadAnalysis.isJson;

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(event.payload);
      message.success('Copied to clipboard');
    },
    [event.payload, message]
  );

  const handleOpenViewer = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpenViewer(event);
    },
    [event, onOpenViewer]
  );

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  // Content to display
  const displayContent =
    isLarge && !expanded
      ? getPreviewPayload(formattedPayload, MAX_PREVIEW_LINES)
      : formattedPayload;

  return (
    <div className="event-item animate-slide-in">
      <div className="event-item-header">
        {event.direction === 'in' ? (
          <ArrowDownOutlined style={{ color: '#10b981', fontSize: 12 }} />
        ) : (
          <ArrowUpOutlined style={{ color: '#f59e0b', fontSize: 12 }} />
        )}
        <span
          className="event-item-name"
          style={{ color: event.direction === 'out' ? '#f59e0b' : '#10b981' }}
        >
          {event.eventName}
        </span>
        {isJson && <span className="event-item-badge json-badge">JSON</span>}
        {isLarge && <span className="event-item-badge size-badge">{lineCount} lines</span>}
        <span className="event-item-time">{formatTime(event.timestamp)}</span>
      </div>

      <div className="event-item-payload-wrapper">
        <pre
          className="event-item-payload"
          onClick={isLarge ? toggleExpand : undefined}
          style={{ cursor: isLarge ? 'pointer' : 'default' }}
        >
          {displayContent}
        </pre>

        {isLarge && !expanded && (
          <div className="event-item-fade-overlay" onClick={toggleExpand}>
            <span className="event-item-expand-text">Click to expand ({lineCount} lines)</span>
          </div>
        )}
      </div>

      <div className="event-item-actions">
        {isLarge && (
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <Button
              type="text"
              size="small"
              icon={expanded ? <DownOutlined /> : <RightOutlined />}
              onClick={toggleExpand}
              className="event-action-btn"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Copy payload">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={handleCopy}
            className="event-action-btn"
          />
        </Tooltip>
        <Tooltip title="Open in viewer">
          <Button
            type="text"
            size="small"
            icon={<ExpandOutlined />}
            onClick={handleOpenViewer}
            className="event-action-btn"
          />
        </Tooltip>
      </div>
    </div>
  );
}

export default function EventList() {
  const { message } = App.useApp();
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewerEvent, setViewerEvent] = useState<EventData | null>(null);

  const filteredEvents = useFilteredEvents();
  const clearReceivedEvents = useSocketStore((state) => state.clearReceivedEvents);
  const currentConnection = useCurrentConnection();

  const handleClearHistory = useCallback(async () => {
    // Clear in-memory events
    clearReceivedEvents();
    // Clear from database if connected to a connection
    if (currentConnection) {
      try {
        await clearEventHistory(currentConnection.id);
        message.success('History cleared');
      } catch {
        message.error('Failed to clear history from database');
      }
    }
  }, [clearReceivedEvents, currentConnection, message]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0; // Events are reversed, so scroll to top
    }
  }, [filteredEvents, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (listRef.current) {
      // If scrolled away from top, disable auto-scroll
      setAutoScroll(listRef.current.scrollTop < 50);
    }
  };

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
      setAutoScroll(true);
    }
  };

  const handleOpenViewer = useCallback((event: EventData) => {
    setViewerEvent(event);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewerEvent(null);
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}>
            <Button
              type={autoScroll ? 'primary' : 'default'}
              ghost={autoScroll}
              icon={<VerticalAlignBottomOutlined />}
              onClick={() => setAutoScroll(!autoScroll)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Scroll to latest">
            <Button icon={<ArrowUpOutlined />} onClick={scrollToTop} size="small" />
          </Tooltip>
          <Tooltip title="Clear all events">
            <Button danger icon={<ClearOutlined />} onClick={handleClearHistory} size="small">
              Clear
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="event-list" ref={listRef} onScroll={handleScroll}>
        {filteredEvents.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No events yet"
            style={{ padding: '60px 0' }}
          />
        ) : (
          filteredEvents.map((event) => (
            <EventItem key={event.id} event={event} onOpenViewer={handleOpenViewer} />
          ))
        )}
      </div>

      {/* JSON Viewer Modal */}
      <JsonViewerModal
        open={!!viewerEvent}
        onClose={handleCloseViewer}
        title="Event Payload"
        eventName={viewerEvent?.eventName}
        payload={viewerEvent?.payload || ''}
        direction={viewerEvent?.direction}
        timestamp={viewerEvent?.timestamp}
      />
    </div>
  );
}
