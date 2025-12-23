'use client';

import { Tag, Badge } from 'antd';
import { useSocketStore, useEventCounts } from '@/app/stores/socketStore';

export default function EventTags() {
  const filteredEventName = useSocketStore((state) => state.filteredEventName);
  const setFilteredEventName = useSocketStore((state) => state.setFilteredEventName);
  const eventCounts = useEventCounts();

  const eventNames = Object.keys(eventCounts).sort();
  const totalCount = Object.values(eventCounts).reduce((a, b) => a + b, 0);

  if (eventNames.length === 0) {
    return null;
  }

  return (
    <div className="event-tags">
      <Tag
        className={`event-tag ${filteredEventName === null ? 'active' : ''}`}
        color={filteredEventName === null ? 'green' : 'default'}
        onClick={() => setFilteredEventName(null)}
        style={{ cursor: 'pointer' }}
      >
        All <Badge count={totalCount} size="small" style={{ marginLeft: 4 }} />
      </Tag>

      {eventNames.map((name) => {
        const isActive = filteredEventName === name;
        const isSystemEvent = ['connect', 'disconnect', 'connect_error'].includes(name);

        return (
          <Tag
            key={name}
            className={`event-tag ${isActive ? 'active' : ''}`}
            color={isActive ? 'green' : isSystemEvent ? 'blue' : 'default'}
            onClick={() => setFilteredEventName(isActive ? null : name)}
            style={{ cursor: 'pointer' }}
          >
            {name}{' '}
            <Badge
              count={eventCounts[name]}
              size="small"
              style={{ marginLeft: 4 }}
              color={isActive ? '#10b981' : undefined}
            />
          </Tag>
        );
      })}
    </div>
  );
}
