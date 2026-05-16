import React, { useRef, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAppStore, AppView } from '@/store';
import { Capture } from '@/lib/types';

interface RecentCapturesProps {
  onNavigate: (view: AppView | string) => void;
  onCaptureClick: (capture: Capture) => void;
}

export function RecentCaptures({ onNavigate, onCaptureClick }: RecentCapturesProps) {
  const captures = useAppStore((s) => s.captures);
  const setSelectedCapture = useAppStore((s) => s.setSelectedCapture);
  const setView = useAppStore((s) => s.setView);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const recentCaptures = captures.slice(0, 10);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  };

  useEffect(() => {
    checkScroll();
  }, [recentCaptures.length, checkScroll]);

  const handleScroll = () => {
    checkScroll();
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 150;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleViewCapture = (capture: Capture) => {
    setSelectedCapture(capture);
    onCaptureClick(capture);
    setView('preview');
  };

  const handleViewAll = () => {
    setView('gallery');
  };

  return (
    <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
      {/* Section Label */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
            Recent
          </span>
          {captures.length > 0 && (
            <span
              className="text-[10px] font-semibold text-primary px-1.5 py-0.5 rounded-full leading-none"
              style={{ backgroundColor: 'rgba(14, 165, 233, 0.15)' }}
            >
              {captures.length}
            </span>
          )}
        </div>
        {captures.length > 0 && (
          <button
            onClick={handleViewAll}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary-dark transition-colors cursor-pointer font-medium"
          >
            View All
            <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Empty State */}
      {captures.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            border: '2px dashed rgba(100, 116, 139, 0.3)',
            backgroundColor: 'rgba(30, 41, 59, 0.3)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted mx-auto mb-2 opacity-50">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <p className="text-xs text-text-muted">No captures yet</p>
          <p className="text-[10px] text-text-muted mt-0.5" style={{ color: 'rgba(100, 116, 139, 0.6)' }}>
            Take your first screenshot to get started
          </p>
        </div>
      ) : (
        /* Horizontal Scrollable Thumbnails */
        <div className="relative">
          {/* Scroll Left Indicator */}
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-0 bottom-0 w-5 z-10 flex items-center justify-center
                bg-gradient-to-r from-surface-dark to-transparent cursor-pointer"
              aria-label="Scroll left"
            >
              <ChevronRight size={14} className="text-text-muted rotate-180" />
            </button>
          )}

          {/* Scrollable Row */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-2 overflow-x-auto scrollbar-horizontal pb-1"
            style={{ padding: '4px 0' }}
          >
            {recentCaptures.map((capture) => (
              <button
                key={capture.id}
                onClick={() => handleViewCapture(capture)}
                className="shrink-0 cursor-pointer group text-left"
              >
                {/* Thumbnail 64x48 */}
                <div
                  className="w-16 h-12 rounded-md overflow-hidden transition-smooth"
                  style={{
                    border: '2px solid rgba(255,255,255,0.08)',
                    backgroundColor: '#1E293B',
                  }}
                >
                  {capture.thumbnail ? (
                    <img
                      src={capture.thumbnail}
                      alt={capture.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : capture.imageData ? (
                    <img
                      src={capture.imageData}
                      alt={capture.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted opacity-50">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* Timestamp */}
                <span className="block text-[10px] text-text-muted mt-1 truncate w-16 text-center">
                  {formatTime(capture.timestamp)}
                </span>
              </button>
            ))}
          </div>

          {/* Scroll Right Indicator */}
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-0 bottom-0 w-5 z-10 flex items-center justify-center
                bg-gradient-to-l from-surface-dark to-transparent cursor-pointer"
              aria-label="Scroll right"
            >
              <ChevronRight size={14} className="text-text-muted" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
