import React, { useState, useRef, useEffect } from 'react';
import { DrawingCanvas } from './DrawingCanvas';
import './AudioSynthesizer.css';

interface SynthConfig {
  advanceRate: number;
  samplingRate: number;
  volumeMultiplier: number;
  channels: string;
  dynamicCompression: boolean;
}

type WorkerState = 'initializing' | 'ready' | 'processing' | 'error';

interface GeneratedTrack {
  id: string;
  audioBuffer: AudioBuffer | null;
  duration: number;
  timestamp: Date;
  sampleRate: number;
  isPlaying: boolean;
  isGenerating: boolean;
}

type WaveChannel = 'R' | 'G' | 'B' | 'L' | 'M';
type XResizeMode = 'average' | 'stretch';

interface WaveChannelMap {
  sine: WaveChannel;
  square: WaveChannel;
  sawtooth: WaveChannel;
  triangle: WaveChannel;
}

const DRAWING_CANVAS_WIDTH = 1100;
const DRAWING_CANVAS_HEIGHT = 720;

const CHANNEL_OPTIONS: Array<{ value: WaveChannel; label: string; swatch: string }> = [
  { value: 'R', label: 'Red', swatch: '#ff3b30' },
  { value: 'G', label: 'Green', swatch: '#34c759' },
  { value: 'B', label: 'Blue', swatch: '#007aff' },
  { value: 'L', label: 'Luma', swatch: '#c7c7cc' },
  { value: 'M', label: 'Mute', swatch: '#1f2937' },
];

function buildChannelString(map: WaveChannelMap): string {
  return `${map.sine}${map.square}${map.sawtooth}${map.triangle}`;
}

function resizeImageDataX(source: ImageData, targetWidth: number, mode: XResizeMode): ImageData {
  if (source.width === targetWidth) {
    return source;
  }

  const out = new Uint8ClampedArray(targetWidth * source.height * 4);
  const src = source.data;
  const srcW = source.width;
  const srcH = source.height;

  for (let y = 0; y < srcH; y += 1) {
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const outBase = (y * targetWidth + tx) * 4;

      if (mode === 'stretch') {
        const sx = Math.min(srcW - 1, Math.floor((tx + 0.5) * srcW / targetWidth));
        const srcBase = (y * srcW + sx) * 4;
        out[outBase] = src[srcBase];
        out[outBase + 1] = src[srcBase + 1];
        out[outBase + 2] = src[srcBase + 2];
        out[outBase + 3] = 255;
        continue;
      }

      const start = tx * srcW / targetWidth;
      const end = (tx + 1) * srcW / targetWidth;
      const first = Math.floor(start);
      const last = Math.min(srcW - 1, Math.ceil(end) - 1);

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let total = 0;

      for (let sx = first; sx <= last; sx += 1) {
        const left = Math.max(sx, start);
        const right = Math.min(sx + 1, end);
        const weight = Math.max(0, right - left);
        if (weight === 0) continue;

        const srcBase = (y * srcW + sx) * 4;
        sumR += src[srcBase] * weight;
        sumG += src[srcBase + 1] * weight;
        sumB += src[srcBase + 2] * weight;
        total += weight;
      }

      if (total <= 0) {
        const sx = Math.min(srcW - 1, Math.floor((tx + 0.5) * srcW / targetWidth));
        const srcBase = (y * srcW + sx) * 4;
        out[outBase] = src[srcBase];
        out[outBase + 1] = src[srcBase + 1];
        out[outBase + 2] = src[srcBase + 2];
      } else {
        out[outBase] = Math.round(sumR / total);
        out[outBase + 1] = Math.round(sumG / total);
        out[outBase + 2] = Math.round(sumB / total);
      }
      out[outBase + 3] = 255;
    }
  }

  return new ImageData(out, targetWidth, srcH);
}

export function AudioSynthesizer() {
  const [config, setConfig] = useState<SynthConfig>({
    advanceRate: 12,
    samplingRate: 44100,
    volumeMultiplier: 0.5, // Increased from 0.05 to 0.5 (50%)
    channels: 'RGBL',
    dynamicCompression: false,
  });

  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [workerState, setWorkerState] = useState<WorkerState>('initializing');
  const [status, setStatus] = useState<string>('🧵 Initializing worker thread...');
  const [generatedTracks, setGeneratedTracks] = useState<GeneratedTrack[]>([]);
  const [targetTimeWidth, setTargetTimeWidth] = useState<number>(720);
  const [xResizeMode, setXResizeMode] = useState<XResizeMode>('average');
  const [waveChannelMap, setWaveChannelMap] = useState<WaveChannelMap>({
    sine: 'R',
    square: 'G',
    sawtooth: 'B',
    triangle: 'L',
  });
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const playingSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());

  const canvasHeight = DRAWING_CANVAS_HEIGHT;

  useEffect(() => {
    setConfig((prev) => ({ ...prev, channels: buildChannelString(waveChannelMap) }));
  }, [waveChannelMap]);

  // Calculate estimated duration based on canvas width and playback speed
  // Width represents time (horizontal left to right)
  // Note: This is an estimate - actual duration may vary based on WASM processing
  const estimatedDuration = targetTimeWidth / config.advanceRate;

  // Initialize Web Worker for threaded synthesis
  useEffect(() => {
    const init = async () => {
      try {
        // Create Web Worker for audio synthesis
        const workerUrl = `${import.meta.env.BASE_URL}synth-worker.js`;
        const worker = new Worker(workerUrl);
        workerRef.current = worker;

        // Set up worker message handler
        worker.onmessage = (e) => {
          const { type, data, error } = e.data;

          if (type === 'initialized') {
            setWorkerState('ready');
            setStatus('✅ Worker thread ready! Draw on canvas and click generate.');
          } else if (type === 'synthesisComplete') {
            handleSynthesisComplete(data.audioData, data.duration, data.sampleRate);
          } else if (type === 'error') {
            console.error('Worker error:', error);
            setWorkerState('error');
            setStatus(`❌ Worker error: ${error}`);
          }
        };

        worker.onerror = (error) => {
          console.error('Worker initialization error:', error);
          setWorkerState('error');
          setStatus(`❌ Failed to initialize worker: ${error.message}`);
        };

        // Initialize WASM in the worker thread
        worker.postMessage({
          type: 'init',
          wasmPath: '/mz2synth.js'
        });

      } catch (error) {
        console.error('Failed to create worker:', error);
        setWorkerState('error');
        setStatus(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    init();

    // Cleanup worker on unmount
    return () => {
      // Stop all playing tracks (capture ref value for cleanup)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const playingSources = playingSourcesRef.current;
      playingSources.forEach(source => source.stop());
      playingSources.clear();
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleSynthesisComplete = (audioData: ArrayBuffer, duration: number, sampleRate: number) => {
    try {
      if (!audioContextRef.current) {
        throw new Error('AudioContext not initialized');
      }

      const float32Data = new Float32Array(audioData);
      const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      // Update the generating track with the actual audio data
      setGeneratedTracks(prev => {
        const generatingTrack = prev.find(t => t.isGenerating);
        if (generatingTrack) {
          return prev.map(t => 
            t.id === generatingTrack.id 
              ? { ...t, audioBuffer, duration, sampleRate, isGenerating: false }
              : t
          );
        }
        // Fallback: create new track if no generating track found
        const newTrack: GeneratedTrack = {
          id: `track_${Date.now()}`,
          audioBuffer,
          duration,
          timestamp: new Date(),
          sampleRate,
          isPlaying: false,
          isGenerating: false,
        };
        return [newTrack, ...prev];
      });
      
      setWorkerState('ready');
      setStatus(`✅ Audio generated (${duration.toFixed(2)}s)! Ready for new synthesis.`);
    } catch (error) {
      console.error('Failed to process audio:', error);
      setWorkerState('ready');
      setStatus(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      // Mark generating track as failed
      setGeneratedTracks(prev => 
        prev.filter(t => !t.isGenerating)
      );
    }
  };

  const handlePlayTrack = (trackId: string) => {
    const track = generatedTracks.find(t => t.id === trackId);
    
    if (!track || !track.audioBuffer || track.isGenerating) {
      return;
    }

    // Create AudioContext on first user gesture if needed
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AudioContext();
      } catch (error) {
        console.error('Failed to create AudioContext:', error);
        setStatus('❌ Failed to create audio context');
        return;
      }
    }

    // Stop if already playing
    if (playingSourcesRef.current.has(trackId)) {
      const source = playingSourcesRef.current.get(trackId);
      source?.stop();
      playingSourcesRef.current.delete(trackId);
      setGeneratedTracks(prev => prev.map(t => 
        t.id === trackId ? { ...t, isPlaying: false } : t
      ));
      return;
    }

    // Stop all other playing tracks
    playingSourcesRef.current.forEach((source, id) => {
      source.stop();
      playingSourcesRef.current.delete(id);
    });
    setGeneratedTracks(prev => prev.map(t => ({ ...t, isPlaying: false })));

    try {
      // Play the selected track
      const source = audioContextRef.current.createBufferSource();
      source.buffer = track.audioBuffer;
      
      // Create a gain node for volume control
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 1.0;
      
      // Connect: source -> gain -> destination
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        playingSourcesRef.current.delete(trackId);
        setGeneratedTracks(prev => prev.map(t => 
          t.id === trackId ? { ...t, isPlaying: false } : t
        ));
      };
      
      source.start(0);
      playingSourcesRef.current.set(trackId, source);
      setGeneratedTracks(prev => prev.map(t => 
        t.id === trackId ? { ...t, isPlaying: true } : t
      ));
    } catch (error) {
      console.error('Playback error:', error);
      setStatus(`❌ Playback error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDeleteTrack = (trackId: string) => {
    // Stop if playing
    const source = playingSourcesRef.current.get(trackId);
    if (source) {
      source.stop();
      playingSourcesRef.current.delete(trackId);
    }
    // Remove from list
    setGeneratedTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const handleSynthesize = async () => {
    if (!imageData) {
      setStatus('Please draw something first!');
      return;
    }

    if (workerState !== 'ready') {
      setStatus('Worker thread not ready yet...');
      return;
    }

    // Create AudioContext on first user gesture (avoids browser autoplay policy warning)
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new AudioContext();
      } catch (error) {
        setStatus('❌ Failed to create audio context');
        console.error('AudioContext creation error:', error);
        return;
      }
    }

    // Create placeholder track immediately
    const synthConfig: SynthConfig = {
      ...config,
      channels: buildChannelString(waveChannelMap),
    };

    const placeholderTrack: GeneratedTrack = {
      id: `track_${Date.now()}`,
      audioBuffer: null,
      duration: 0,
      timestamp: new Date(),
      sampleRate: synthConfig.samplingRate,
      isPlaying: false,
      isGenerating: true,
    };
    setGeneratedTracks(prev => [placeholderTrack, ...prev]);

    setWorkerState('processing');
    setStatus('🔊 Synthesizing in background thread (UI stays responsive)...');

    try {
      // Stop any currently playing audio
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }

      // Extract RGB data from canvas (drop alpha channel)
      // NOTE: Canvas is [width(time) x height(720 oscillators)]
      // But WASM expects [width(720 oscillators) x height(time)]
      // So we need to TRANSPOSE the image data
      const resizedImageData = resizeImageDataX(imageData, targetTimeWidth, xResizeMode);
      const canvasW = resizedImageData.width;
      const canvasH = resizedImageData.height;
      
      // Transposed dimensions for WASM
      const wasmWidth = canvasH;   // 720 oscillators
      const wasmHeight = canvasW;  // time points
      
      const rgbData = new Uint8Array(wasmWidth * wasmHeight * 3);

      // Transpose: for each pixel at canvas[x,y], place it at wasm[y,x]
      for (let canvasY = 0; canvasY < canvasH; canvasY++) {
        for (let canvasX = 0; canvasX < canvasW; canvasX++) {
          const canvasIdx = canvasY * canvasW + canvasX;
          const wasmX = canvasY;  // canvas Y becomes WASM X (oscillator)
          const wasmY = canvasX;  // canvas X becomes WASM Y (time)
          const wasmIdx = wasmY * wasmWidth + wasmX;
          
          rgbData[wasmIdx * 3] = resizedImageData.data[canvasIdx * 4];
          rgbData[wasmIdx * 3 + 1] = resizedImageData.data[canvasIdx * 4 + 1];
          rgbData[wasmIdx * 3 + 2] = resizedImageData.data[canvasIdx * 4 + 2];
        }
      }

      // Send synthesis request to worker (transfer ownership to avoid copying)
      workerRef.current?.postMessage({
        type: 'synthesize',
        imageData: rgbData.buffer,
        width: wasmWidth,   // 720 oscillators
        height: wasmHeight, // time points
        config: synthConfig
      }, [rgbData.buffer]);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${errorMessage}`);
      console.error('Synthesis error:', error);
      setWorkerState('ready');
    }
  };

  return (
    <div className="audio-synthesizer">

      <div className="synthesizer-layout">
        <div className="layout-box canvas-box">
          <DrawingCanvas
            width={DRAWING_CANVAS_WIDTH}
            height={canvasHeight}
            onImageChange={setImageData}
          />
          <p className="canvas-size-note">
            Canvas always fits your screen. Actual drawing size: {DRAWING_CANVAS_WIDTH} x {canvasHeight}px.
            Synthesis uses width {targetTimeWidth}px via {xResizeMode} conversion on the X axis.
          </p>
          <div className="drawing-hints">
            <h3><span role="img" aria-label="Light bulb">💡</span> Tips:</h3>
            <ul>
              <li><strong>Red</strong> = Sine wave amplitude</li>
              <li><strong>Green</strong> = Square wave amplitude</li>
              <li><strong>Blue</strong> = Sawtooth wave amplitude</li>
              <li><strong>Horizontal lines</strong> = Sustained tones over time</li>
              <li><strong>Vertical patterns</strong> = Chords (multiple frequencies at once)</li>
              <li><strong>Diagonal sweeps</strong> = Pitch glides over time</li>
            </ul>
          </div>
        </div>

        <div className="layout-box controls-box">
          <h2>Synthesis Settings</h2>

          <div className="control-group">
            <label>
              <strong>Playback Speed (columns/sec):</strong>
              <input
                type="number"
                min="1"
                max="120"
                value={config.advanceRate}
                onChange={(e) => setConfig({ ...config, advanceRate: Number(e.target.value) })}
              />
            </label>
            <small>Estimated duration: ~{estimatedDuration.toFixed(2)}s</small>
          </div>

          <div className="control-group">
            <label>
              <strong>Synthesis Width (time axis):</strong>
              <input
                type="range"
                min="70"
                max="2000"
                step="1"
                value={targetTimeWidth}
                onChange={(e) => setTargetTimeWidth(Number(e.target.value))}
              />
            </label>
            <small>{targetTimeWidth}px (range: 70 to 2000)</small>
          </div>

          <div className="control-group">
            <label>
              X Resize Method:
              <select
                value={xResizeMode}
                onChange={(e) => setXResizeMode(e.target.value as XResizeMode)}
              >
                <option value="average">Average (smoother downscale)</option>
                <option value="stretch">Stretch (nearest mapping)</option>
              </select>
            </label>
            <small>Converts responsive drawing width into synthesis width.</small>
          </div>

          <div className="control-group">
            <label>
              Sample Rate (Hz):
              <select
                value={config.samplingRate}
                onChange={(e) => setConfig({ ...config, samplingRate: Number(e.target.value) })}
              >
                <option value={22050}>22050 Hz</option>
                <option value={44100}>44100 Hz</option>
                <option value={48000}>48000 Hz</option>
              </select>
            </label>
          </div>

          <div className="control-group">
            <label><strong>Wave Channel Mapper:</strong></label>
            <div className="wave-mapper-grid">
              <div className="wave-mapper-row">
                <span className="wave-name">Sine</span>
                <select
                  value={waveChannelMap.sine}
                  onChange={(e) => setWaveChannelMap((prev) => ({ ...prev, sine: e.target.value as WaveChannel }))}
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={`sine_${option.value}`} value={option.value}>
                      {option.value} - {option.label}
                    </option>
                  ))}
                </select>
                <span className="wave-swatch" style={{ background: CHANNEL_OPTIONS.find((c) => c.value === waveChannelMap.sine)?.swatch }} />
              </div>

              <div className="wave-mapper-row">
                <span className="wave-name">Square</span>
                <select
                  value={waveChannelMap.square}
                  onChange={(e) => setWaveChannelMap((prev) => ({ ...prev, square: e.target.value as WaveChannel }))}
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={`square_${option.value}`} value={option.value}>
                      {option.value} - {option.label}
                    </option>
                  ))}
                </select>
                <span className="wave-swatch" style={{ background: CHANNEL_OPTIONS.find((c) => c.value === waveChannelMap.square)?.swatch }} />
              </div>

              <div className="wave-mapper-row">
                <span className="wave-name">Sawtooth</span>
                <select
                  value={waveChannelMap.sawtooth}
                  onChange={(e) => setWaveChannelMap((prev) => ({ ...prev, sawtooth: e.target.value as WaveChannel }))}
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={`saw_${option.value}`} value={option.value}>
                      {option.value} - {option.label}
                    </option>
                  ))}
                </select>
                <span className="wave-swatch" style={{ background: CHANNEL_OPTIONS.find((c) => c.value === waveChannelMap.sawtooth)?.swatch }} />
              </div>

              <div className="wave-mapper-row">
                <span className="wave-name">Triangle</span>
                <select
                  value={waveChannelMap.triangle}
                  onChange={(e) => setWaveChannelMap((prev) => ({ ...prev, triangle: e.target.value as WaveChannel }))}
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={`tri_${option.value}`} value={option.value}>
                      {option.value} - {option.label}
                    </option>
                  ))}
                </select>
                <span className="wave-swatch" style={{ background: CHANNEL_OPTIONS.find((c) => c.value === waveChannelMap.triangle)?.swatch }} />
              </div>
            </div>
            <small>Allowed values only: R, G, B, L, M (shown with live color swatch).</small>
          </div>

          <div className="control-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={config.dynamicCompression}
                onChange={(e) => setConfig({ ...config, dynamicCompression: e.target.checked })}
              />
              Dynamic Compression
            </label>
          </div>

          <div className="control-group volume-group">
            <label>
              <strong>Volume:</strong>
              <input
                type="range"
                min="0.01"
                max="1.0"
                step="0.01"
                value={config.volumeMultiplier}
                onChange={(e) => setConfig({ ...config, volumeMultiplier: Number(e.target.value) })}
              />
              <span>{(config.volumeMultiplier * 100).toFixed(0)}%</span>
            </label>
          </div>

          <button
            className="synthesize-button"
            onClick={handleSynthesize}
            disabled={workerState === 'initializing' || workerState === 'error' || !imageData}
            title={
              workerState === 'initializing' ? 'Worker thread initializing...' :
              workerState === 'error' ? 'Worker error occurred' :
              !imageData ? 'Draw something on the canvas first!' : 
              `Generate ~${estimatedDuration.toFixed(1)}s audio in background thread`
            }
          >
            {workerState === 'initializing' ? 'Initializing worker...' : 
             workerState === 'error' ? 'Worker error' : 
             !imageData ? 'Draw on canvas to enable' :
             `Generate Audio (~${estimatedDuration.toFixed(1)}s)`}
          </button>

          {status && (
            <div className={`status ${workerState === 'processing' ? 'processing' : ''}`}>
              {status}
            </div>
          )}
        </div>
      </div>

      <div className="secondary-layout">
        <div className="layout-box tracks-box">
          <h3>
            <span role="img" aria-label="Music">🎵</span> Generated Tracks ({generatedTracks.length})
          </h3>
          {generatedTracks.length === 0 ? (
            <p className="empty-tracks">No generated tracks yet. Draw something and press Generate Audio.</p>
          ) : (
            <div className="tracks-list">
              {generatedTracks.map((track) => (
                <div key={track.id} className={`track-item ${track.isPlaying ? 'playing' : ''} ${track.isGenerating ? 'generating' : ''}`}>
                  <div className="track-info">
                    <div className="track-time">
                      {track.timestamp.toLocaleTimeString()}
                      {track.isGenerating && (
                        <span className="generating-badge">
                          <span role="img" aria-label="Generating">⏳</span> Generating...
                        </span>
                      )}
                    </div>
                    <div className="track-details">
                      {track.isGenerating ? (
                        <span>Synthesizing audio in background thread...</span>
                      ) : (
                        <>
                          Actual Duration: {track.duration.toFixed(2)}s | 
                          Sample Rate: {track.sampleRate}Hz | 
                          Samples: {track.audioBuffer ? track.audioBuffer.length.toLocaleString() : 0}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="track-controls">
                    <button
                      className="track-button play-button"
                      onClick={() => handlePlayTrack(track.id)}
                      title={track.isGenerating ? 'Generating...' : track.isPlaying ? 'Pause' : 'Play'}
                      aria-label={track.isGenerating ? 'Generating' : track.isPlaying ? 'Pause' : 'Play'}
                      disabled={track.isGenerating}
                    >
                      <span role="img" aria-label={track.isGenerating ? 'Generating' : track.isPlaying ? 'Pause' : 'Play'}>
                        {track.isGenerating ? '⏳' : track.isPlaying ? '⏸️' : '▶️'}
                      </span>
                    </button>
                    <button
                      className="track-button delete-button"
                      onClick={() => handleDeleteTrack(track.id)}
                      title="Delete"
                      aria-label="Delete track"
                    >
                      <span role="img" aria-label="Delete">
                        🗑️
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="layout-box info-box">
          <h3>About MZ2SYNTH</h3>
          <p>
            Based on the ANS synthesizer by Yevgeny Murzin (1958), featuring 720 oscillators 
            spanning 10 octaves with multiple waveform types.
          </p>
          <p>
            Source repository used in this app:{' '}
            <a href="https://github.com/frankenbeans/MZ2SYNTH" target="_blank" rel="noreferrer">
              github.com/frankenbeans/MZ2SYNTH
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
