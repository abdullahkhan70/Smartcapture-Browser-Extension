import React, { useState, useMemo, useCallback } from 'react';
import { Search, Trash2, Eye, Download, X, ChevronDown, ImageOff, Loader2 } from 'lucide-react';
import { useGallery, SortOption } from '@/hooks/useGallery';
import { useAppStore, AppView } from '@/store';
import { Capture } from '@/lib/types';

export function Gallery() {
  const {
    filteredCaptures,
    isLoading,
    searchQuery,
    sortOption,
    setSearchQuery,
    setSortOption,
    deleteCapture,
    loadFullCapture,
  } = useGallery();

  const setView = useAppStore((s) => s.setView);
  const setSelectedCapture = useAppStore((s) => s.setSelectedCapture);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const displayedCaptures = useMemo(() => {
    return filteredCaptures.slice(0, 40); // Limit for performance
  }, [filteredCaptures]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleViewCapture = useCallback(async (capture: Capture) => {
    // If the capture has no imageData, lazy-load it from background
    if (!capture.imageData) {
      setLoadingId(capture.id);
      try {
        const fullCapture = await loadFullCapture(capture.id);
        if (fullCapture) {
          setSelectedCapture(fullCapture);
        } else {
          // Still navigate to preview — CapturePreview handles missing imageData
          setSelectedCapture(capture);
        }
      } catch {
        setSelectedCapture(capture);
      } finally {
        setLoadingId(null);
      }
    } else {
      setSelectedCapture(capture);
    }
    setView('preview');
  }, [loadFullCapture, setSelectedCapture, setView]);

  const handleDeleteSingle = (id: string) => {
    if (confirmDeleteId === id) {
      deleteCapture(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const handleDeleteSelected = () => {
    selectedIds.forEach((id) => deleteCapture(id));
    setSelectedIds(new Set());
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (capture: Capture): string => {
    if (!capture.imageData) return '--';
    const base64Length = capture.imageData.split(',')[1]?.length ?? 0;
    const sizeBytes = Math.round((base64Length * 3) / 4);
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1048576) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / 1048576).toFixed(1)} MB`;
  };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'url', label: 'By URL' },
  ];

  return (
    <div className="p-4">
      {/* Search Bar */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          placeholder="Search by title, URL, or OCR text..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-8 py-2 bg-surface-card border rounded-lg text-sm text-text-primary placeholder:text-text-muted
            focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-smooth"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Sort & Bulk Actions */}
      <div className="flex items-center justify-between mb-3">
        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary
              hover:bg-surface-card transition-smooth cursor-pointer"
          >
            <ChevronDown size={12} />
            <span className="font-medium">
              {sortOptions.find((o) => o.value === sortOption)?.label}
            </span>
          </button>
          {showSortMenu && (
            <div
              className="absolute top-full left-0 mt-1 w-36 rounded-lg py-1 z-50 shadow-lg"
              style={{
                backgroundColor: '#1E293B',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSortOption(option.value);
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors
                    ${sortOption === option.value
                      ? 'text-primary bg-primary/10'
                      : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Count */}
        <span className="text-[11px] text-text-muted">
          {filteredCaptures.length} capture{filteredCaptures.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between mb-3 p-2.5 rounded-lg animate-fade-in"
          style={{
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
          }}
        >
          <span className="text-xs text-primary font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium
              text-error hover:bg-error/20 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl animate-shimmer"
              style={{ height: '120px', backgroundColor: '#1E293B' }}
            />
          ))}
        </div>
      ) : displayedCaptures.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center mx-auto mb-3">
            <ImageOff size={20} className="text-text-muted opacity-50" />
          </div>
          <p className="text-sm text-text-secondary font-medium">
            {searchQuery ? 'No captures found' : 'No captures yet'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {searchQuery ? 'Try a different search term' : 'Take your first screenshot'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-thin">
          {displayedCaptures.map((capture) => (
            <div
              key={capture.id}
              className="rounded-xl overflow-hidden transition-smooth cursor-pointer group relative"
              style={{
                backgroundColor: '#1E293B',
                border: selectedIds.has(capture.id)
                  ? '1.5px solid rgba(14, 165, 233, 0.5)'
                  : '1.5px solid rgba(255,255,255,0.05)',
              }}
              onClick={() => handleViewCapture(capture)}
            >
              {/* Loading overlay when lazy-loading imageData */}
              {loadingId === capture.id && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 rounded-xl">
                  <Loader2 size={20} className="text-primary animate-spin" />
                </div>
              )}

              {/* Checkbox Overlay */}
              <div className="absolute z-10 top-1.5 left-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(capture.id);
                  }}
                  className={`w-4 h-4 rounded flex items-center justify-center transition-smooth cursor-pointer
                    ${selectedIds.has(capture.id)
                      ? 'bg-primary border-primary'
                      : 'border-surface-elevated hover:border-primary bg-surface-dark/60'
                    }`}
                  style={{ border: selectedIds.has(capture.id) ? 'none' : '1.5px solid rgba(255,255,255,0.2)' }}
                >
                  {selectedIds.has(capture.id) && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Delete Button */}
              <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSingle(capture.id);
                  }}
                  className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer
                    ${confirmDeleteId === capture.id
                      ? 'bg-error text-white'
                      : 'bg-surface-dark/60 text-text-muted hover:text-error'
                    }`}
                  title={confirmDeleteId === capture.id ? 'Click to confirm' : 'Delete'}
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Thumbnail (16:10) */}
              <div className="relative" style={{ paddingBottom: '62.5%' }}>
                <div className="absolute inset-0 bg-surface-elevated overflow-hidden">
                  {capture.thumbnail ? (
                    <img
                      src={capture.thumbnail}
                      alt={capture.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : capture.imageData ? (
                    <img
                      src={capture.imageData}
                      alt={capture.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Eye size={16} className="text-text-muted opacity-40" />
                    </div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="p-2">
                <p className="text-[11px] font-medium text-text-primary truncate leading-tight">
                  {capture.title}
                </p>
                <p className="text-[10px] text-text-muted truncate mt-0.5">
                  {capture.url ? (() => { try { return new URL(capture.url).hostname; } catch { return capture.url; } })() : 'Unknown URL'}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-text-muted">
                    {formatTime(capture.timestamp)}
                  </span>
                  <span className="text-[9px] text-text-muted font-mono">
                    {formatFileSize(capture)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
