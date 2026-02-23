/**
 * MZ2SYNTH WebAssembly Module
 * 
 * TypeScript wrapper for the WASM-compiled MZ2SYNTH synthesizer.
 * Provides a browser-compatible API for audio synthesis from images.
 */

export interface MZ2SynthConfig {
  /** PPM image data (RGB, width must be 720) */
  imageData: ImageData;
  
  /** Playback speed (columns per second, default: 12) */
  advanceRate?: number;
  
  /** Audio sample rate in Hz (default: 44100) */
  samplingRate?: number;
  
  /** Volume multiplier (default: 0.05) */
  volumeMultiplier?: number;
  
  /** Channel mapping string (default: 'RGBL')
   * Position 0: Sine wave
   * Position 1: Square wave
   * Position 2: Sawtooth wave
   * Position 3: Triangle wave
   * Values: R=Red, G=Green, B=Blue, L=Luminance, M=Mute
   */
  channels?: string;
  
  /** Enable dynamic compression (default: false) */
  dynamicCompression?: boolean;
}

export interface SynthesisResult {
  /** Audio samples as Float32Array */
  audioData: Float32Array;
  
  /** Sample rate of the audio */
  sampleRate: number;
  
  /** Duration in seconds */
  duration: number;
  
  /** Number of samples */
  samples: number;
}

interface MZ2SynthModule {
  _init_oscillators: () => void;
  _load_ppm_data: (dataPtr: number, width: number, height: number) => number;
  _synthesize_audio: (
    advanceRate: number,
    samplingRate: number,
    volumeMult: number,
    channelMapPtr: number,
    useCompression: number
  ) => number;
  _get_audio_sample_count: () => number;
  _cleanup: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8?: Uint8Array;
  HEAPF32?: Float32Array;
  stringToUTF8?: (str: string, ptr: number, maxLength: number) => void;
  UTF8ToString?: (ptr: number) => string;
  setValue?: (ptr: number, value: number, type: string) => void;
  getValue?: (ptr: number, type: string) => number;
  writeArrayToMemory?: (array: Uint8Array, buffer: number) => void;
}

let wasmModule: MZ2SynthModule | null = null;
let isInitialized = false;

/**
 * Initialize the WASM module
 * Must be called before using any synthesis functions
 */
export async function initWasm(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Wait for the global function to be available (with retry logic)
  const maxRetries = 10;
  const retryDelay = 100; // ms
  
  for (let i = 0; i < maxRetries; i++) {
    // @ts-ignore - Module is loaded from the generated WASM file
    const createModule = (window as any).createMZ2SynthModule;
    
    if (createModule) {
      try {
        console.log('🔄 Initializing MZ2SYNTH WASM module...');
        wasmModule = await createModule();
        
        if (!wasmModule) {
          throw new Error('Failed to create WASM module');
        }
        
        // Log available properties for debugging
        console.log('📦 WASM module properties:', Object.keys(wasmModule).filter(k => k.startsWith('_') || k.startsWith('HEAP')).join(', '));
        
        // Initialize oscillator frequencies
        wasmModule._init_oscillators();
        
        isInitialized = true;
        console.log('✅ MZ2SYNTH WASM module initialized successfully');
        return;
      } catch (error) {
        console.error('❌ Failed to initialize WASM module:', error);
        throw error;
      }
    }
    
    // Wait and retry
    if (i < maxRetries - 1) {
      console.log(`⏳ Waiting for WASM module to load... (attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error('WASM module not loaded after retries. Make sure mz2synth.js is included in your HTML.');
}

/**
 * Check if WASM module is initialized
 */
export function isWasmReady(): boolean {
  return isInitialized && wasmModule !== null;
}

/**
 * Synthesize audio from image data
 * 
 * @param config Synthesis configuration
 * @returns Promise resolving to synthesized audio data
 */
export async function synthesizeAudio(config: MZ2SynthConfig): Promise<SynthesisResult> {
  if (!isWasmReady()) {
    throw new Error('WASM module not initialized. Call initWasm() first.');
  }

  const {
    imageData,
    advanceRate = 12,
    samplingRate = 44100,
    volumeMultiplier = 0.05,
    channels = 'RGBL',
    dynamicCompression = false,
  } = config;

  // Validate image dimensions
  if (imageData.width !== 720) {
    throw new Error(`Image width must be 720 pixels (got ${imageData.width})`);
  }

  try {
    // Allocate memory for image data
    const imageSize = imageData.width * imageData.height * 3;
    const imagePtr = wasmModule!._malloc(imageSize);
    
    // Copy image data to WASM memory (convert RGBA to RGB)
    const rgbData = new Uint8Array(imageSize);
    for (let i = 0; i < imageData.width * imageData.height; i++) {
      rgbData[i * 3 + 0] = imageData.data[i * 4 + 0]; // R
      rgbData[i * 3 + 1] = imageData.data[i * 4 + 1]; // G
      rgbData[i * 3 + 2] = imageData.data[i * 4 + 2]; // B
    }
    
    // Write RGB data to WASM memory
    if (wasmModule!.HEAPU8) {
      wasmModule!.HEAPU8.set(rgbData, imagePtr);
    } else if (wasmModule!.writeArrayToMemory) {
      wasmModule!.writeArrayToMemory(rgbData, imagePtr);
    } else {
      // Fallback: write byte by byte
      for (let i = 0; i < imageSize; i++) {
        wasmModule!.setValue!(imagePtr + i, rgbData[i], 'i8');
      }
    }
    
    // Load image into WASM
    const loadResult = wasmModule!._load_ppm_data(
      imagePtr,
      imageData.width,
      imageData.height
    );
    
    if (loadResult !== 0) {
      wasmModule!._free(imagePtr);
      throw new Error('Failed to load image data into WASM');
    }
    
    // Allocate memory for channel map string
    const channelMapPtr = wasmModule!._malloc(5); // 4 chars + null terminator
    
    // Write channel map string to memory
    if (wasmModule!.stringToUTF8) {
      wasmModule!.stringToUTF8(channels, channelMapPtr, 5);
    } else {
      // Fallback: write manually
      for (let i = 0; i < channels.length; i++) {
        wasmModule!.setValue!(channelMapPtr + i, channels.charCodeAt(i), 'i8');
      }
      wasmModule!.setValue!(channelMapPtr + channels.length, 0, 'i8'); // null terminator
    }
    
    // Synthesize audio
    const audioPtr = wasmModule!._synthesize_audio(
      advanceRate,
      samplingRate,
      volumeMultiplier,
      channelMapPtr,
      dynamicCompression ? 1 : 0
    );
    
    if (audioPtr === 0) {
      wasmModule!._free(imagePtr);
      wasmModule!._free(channelMapPtr);
      throw new Error('Audio synthesis failed');
    }
    
    // Get audio sample count
    const sampleCount = wasmModule!._get_audio_sample_count();
    
    // Copy audio data from WASM memory
    const audioData = new Float32Array(sampleCount);
    
    if (wasmModule!.HEAPF32) {
      // Direct heap access
      const audioHeap = new Float32Array(
        wasmModule!.HEAPF32.buffer,
        audioPtr,
        sampleCount
      );
      audioData.set(audioHeap);
    } else if (wasmModule!.getValue) {
      // Fallback: read value by value
      for (let i = 0; i < sampleCount; i++) {
        audioData[i] = wasmModule!.getValue(audioPtr + i * 4, 'float');
      }
    } else {
      throw new Error('Cannot read audio data from WASM memory');
    }
    
    // Calculate duration
    const duration = sampleCount / samplingRate;
    
    // Cleanup
    wasmModule!._free(imagePtr);
    wasmModule!._free(channelMapPtr);
    // Note: Don't free audioPtr, it's managed internally
    
    return {
      audioData,
      sampleRate: samplingRate,
      duration,
      samples: sampleCount,
    };
  } catch (error) {
    console.error('Synthesis error:', error);
    throw error;
  }
}

/**
 * Create an AudioBuffer from synthesis result
 * 
 * @param result Synthesis result from synthesizeAudio
 * @param audioContext Web Audio API context
 * @returns AudioBuffer ready for playback
 */
export function createAudioBuffer(
  result: SynthesisResult,
  audioContext: AudioContext
): AudioBuffer {
  const buffer = audioContext.createBuffer(
    1, // mono
    result.samples,
    result.sampleRate
  );
  
  // Create a new Float32Array backed by a regular ArrayBuffer
  const audioData = new Float32Array(result.audioData);
  buffer.copyToChannel(audioData, 0);
  
  return buffer;
}

/**
 * Cleanup WASM resources
 */
export function cleanup(): void {
  if (wasmModule) {
    wasmModule._cleanup();
  }
}

// Export types
export type { MZ2SynthModule };
