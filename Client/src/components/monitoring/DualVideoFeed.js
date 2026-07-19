/**
 * DualVideoFeed Component
 * Displays two concurrent video streams (front and back cameras) in a responsive grid layout.
 * Handles frame updates, connection status, and stream health indicators.
 */

import React, { useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';

const DualVideoFeed = forwardRef((
  {
    onFrameReceived = () => {},
    isMonitoring = false,
    hasFrame = false,
    streamFps = 0,
    streamLatencyMs = null,
    lastFrameAt = null,
    showStats = true,
    darkMode = false,
  },
  ref
) => {
  // Refs for front and back video elements
  const videoFrontRef = useRef(null);
  const videoBackRef = useRef(null);

  // State for each stream
  const [streams, setStreams] = useState({
    front: {
      connected: false,
      frameCount: 0,
      fps: 0,
      latency: null,
      lastFrame: null,
      hasFrame: false,
    },
    back: {
      connected: false,
      frameCount: 0,
      fps: 0,
      latency: null,
      lastFrame: null,
      hasFrame: false,
    },
  });

  const latestFramesRef = useRef({ front: null, back: null });
  const latestFrameTsRef = useRef({ front: null, back: null });
  const receivedFramesRef = useRef({ front: 0, back: 0 });
  const lastStatsUpdateRef = useRef({ front: 0, back: 0 });
  const prevFramesRef = useRef({ front: 0, back: 0 });
  const renderScheduledRef = useRef({ front: false, back: false });

  /**
   * Handle incoming frame from WebSocket
   * Expects data: { frame: base64_string, stream_id: "front"|"back", ts: timestamp }
   */
  const handleFrame = useCallback((data) => {
    const frameData = typeof data === 'string' ? data : data?.frame;
    const streamId = data?.stream_id || 'front'; // Default to front if not specified
    const frameTs = typeof data === 'object' ? data?.ts : null;

    if (!frameData || typeof frameData !== 'string' || frameData.length < 100) {
      return;
    }

    // Validate stream_id
    if (!['front', 'back'].includes(streamId)) {
      console.warn(`Invalid stream_id: ${streamId}`);
      return;
    }

    const videoRef = streamId === 'front' ? videoFrontRef : videoBackRef;

    // Store latest frame
    latestFramesRef.current[streamId] = frameData;
    latestFrameTsRef.current[streamId] = Number.isFinite(frameTs) ? frameTs : null;
    receivedFramesRef.current[streamId] += 1;

    // Schedule render update (batch with RAF)
    if (!renderScheduledRef.current[streamId]) {
      renderScheduledRef.current[streamId] = true;

      requestAnimationFrame(() => {
        if (videoRef.current && latestFramesRef.current[streamId]) {
          videoRef.current.src = `data:image/jpeg;base64,${latestFramesRef.current[streamId]}`;
        }

        // Update stream state
        setStreams((prev) => ({
          ...prev,
          [streamId]: {
            ...prev[streamId],
            hasFrame: true,
            connected: true,
          },
        }));

        renderScheduledRef.current[streamId] = false;
      });
    }

    // Calculate stats every 1 second
    const now = Date.now();
    if (now - lastStatsUpdateRef.current[streamId] >= 1000) {
      const fps = receivedFramesRef.current[streamId] - prevFramesRef.current[streamId];
      const latency = latestFrameTsRef.current[streamId]
        ? Math.max(0, now - latestFrameTsRef.current[streamId])
        : null;

      setStreams((prev) => ({
        ...prev,
        [streamId]: {
          ...prev[streamId],
          frameCount: receivedFramesRef.current[streamId],
          fps,
          latency,
        },
      }));

      prevFramesRef.current[streamId] = receivedFramesRef.current[streamId];
      lastStatsUpdateRef.current[streamId] = now;
    }

    // Notify parent
    onFrameReceived(streamId, frameData, frameTs);
  }, [onFrameReceived]);

  // Expose handleFrame method to parent component
  useImperativeHandle(ref, () => ({
    handleFrame,
  }), [handleFrame]);

  /**
   * Stream Status Indicator Pill
   */
  const StreamStatus = ({ streamId, stream }) => {
    const isConnected = stream.connected && stream.hasFrame;
    const statusColor = isConnected
      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400';

    const dotColor = isConnected ? 'bg-emerald-500' : 'bg-amber-500';

    return (
      <div className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-semibold ring-1 ${statusColor} ring-opacity-50`}>
        <span className={`w-2 h-2 rounded-full ${dotColor} ${isConnected ? 'animate-pulse' : ''}`} />
        {streamId.charAt(0).toUpperCase() + streamId.slice(1)}
        {isConnected && ` • ${stream.fps} FPS`}
        {!isConnected && stream.connected && ' • No Frame'}
        {!stream.connected && ' • Waiting...'}
      </div>
    );
  };

  /**
   * Responsive Layout: Dual Feed
   * - Large screens: Side-by-side grid (2 columns)
   * - Medium screens: Stacked with slight offset (1 column on tablet)
   * - Mobile: Full-width stacked
   */
  return (
    <div className="space-y-4">
      {/* Header with stream indicators */}
      {showStats && (
        <div className="flex flex-wrap items-center gap-3 px-2">
          <StreamStatus streamId="front" stream={streams.front} />
          {streams.back.connected || streams.back.hasFrame ? (
            <StreamStatus streamId="back" stream={streams.back} />
          ) : (
            <div className="text-xs text-gray-400 dark:text-gray-500">Back Camera: Inactive</div>
          )}
        </div>
      )}

      {/* Dual Video Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Front Camera Feed */}
        <div className="relative rounded-xl overflow-hidden bg-gray-950 border border-gray-800 dark:border-gray-700 shadow-lg">
          <div className="relative w-full bg-black aspect-video flex items-center justify-center">
            {streams.front.hasFrame ? (
              <>
                <img
                  ref={videoFrontRef}
                  src=""
                  alt="Front Camera Feed"
                  className="w-full h-full object-contain"
                />
                {/* Stream overlay badge */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs font-semibold">
                  📷 Front
                </div>
                {/* FPS indicator */}
                {streams.front.fps > 0 && (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-emerald-500/80 text-white text-xs font-semibold">
                    {streams.front.fps} FPS
                  </div>
                )}
              </>
            ) : isMonitoring ? (
              <div className="flex flex-col items-center justify-center text-center p-4">
                <div className="w-12 h-12 rounded-full border-2 border-gray-700 border-t-white animate-spin mb-2" />
                <p className="text-gray-400 text-sm">Connecting Front Camera...</p>
                <p className="text-gray-500 text-xs mt-1">Please allow access to camera</p>
              </div>
            ) : (
              <div className="text-center p-4 text-gray-400">
                <p className="text-sm">Front Camera Feed Ready</p>
                <p className="text-xs text-gray-500 mt-1">Start monitoring to begin</p>
              </div>
            )}
          </div>

          {/* Stats bar for front camera */}
          {showStats && streams.front.hasFrame && (
            <div className="px-3 py-2 bg-gray-900/80 border-t border-gray-800 text-xs text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Frames: {streams.front.frameCount}</span>
                {streams.front.latency !== null && (
                  <span
                    className={
                      streams.front.latency < 200 ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    Latency: {streams.front.latency}ms
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Back Camera Feed */}
        <div className="relative rounded-xl overflow-hidden bg-gray-950 border border-gray-800 dark:border-gray-700 shadow-lg">
          <div className="relative w-full bg-black aspect-video flex items-center justify-center">
            {streams.back.hasFrame ? (
              <>
                <img
                  ref={videoBackRef}
                  src=""
                  alt="Back Camera Feed"
                  className="w-full h-full object-contain"
                />
                {/* Stream overlay badge */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs font-semibold">
                  📷 Back
                </div>
                {/* FPS indicator */}
                {streams.back.fps > 0 && (
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-emerald-500/80 text-white text-xs font-semibold">
                    {streams.back.fps} FPS
                  </div>
                )}
              </>
            ) : isMonitoring ? (
              <div className="flex flex-col items-center justify-center text-center p-4">
                <svg
                  className="w-12 h-12 text-gray-700 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M18.364 5.636l-3.536 3.536m0 5.172l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.172l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <p className="text-gray-400 text-sm">Back Camera Not Connected</p>
                <p className="text-gray-500 text-xs mt-1">Check IP address or RTSP stream</p>
              </div>
            ) : (
              <div className="text-center p-4 text-gray-400">
                <p className="text-sm">Back Camera Feed (Optional)</p>
                <p className="text-xs text-gray-500 mt-1">Not configured</p>
              </div>
            )}
          </div>

          {/* Stats bar for back camera */}
          {showStats && streams.back.hasFrame && (
            <div className="px-3 py-2 bg-gray-900/80 border-t border-gray-800 text-xs text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Frames: {streams.back.frameCount}</span>
                {streams.back.latency !== null && (
                  <span
                    className={
                      streams.back.latency < 200 ? 'text-emerald-400' : 'text-amber-400'
                    }
                  >
                    Latency: {streams.back.latency}ms
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Frame handler callback exposure */}
      {/* This is used by parent component to attach to socket listener */}
      <div style={{ display: 'none' }} data-frame-handler={handleFrame}>
        {/* Hidden element to expose frame handler */}
      </div>
    </div>
  );
});

DualVideoFeed.displayName = 'DualVideoFeed';

export default DualVideoFeed;
