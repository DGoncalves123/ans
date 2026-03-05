/**
 * MZ2SYNTH Web Worker
 * Handles audio synthesis in a separate thread to prevent UI blocking
 */

// Import the WASM module loader
const workerBasePath = self.location.pathname.replace(/[^/]*$/, '');
self.importScripts(`${workerBasePath}mz2synth.js`);

let wasmModule = null;
let isInitialized = false;

/**
 * Initialize the WASM module in the worker
 */
async function initWasm() {
  if (isInitialized) {
    return { success: true };
  }

  try {
    // @ts-ignore - createMZ2SynthModule is loaded from mz2synth.js
    wasmModule = await createMZ2SynthModule();
    
    if (!wasmModule) {
      throw new Error('Failed to create WASM module');
    }

    // Initialize oscillator frequencies
    wasmModule._init_oscillators();
    
    isInitialized = true;
    
    return { success: true };
  } catch (error) {
    console.error('[Worker] Failed to initialize WASM:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Synthesize audio from image data
 */
async function synthesizeAudio(params) {
  if (!isInitialized) {
    const initResult = await initWasm();
    if (!initResult.success) {
      return { success: false, error: 'Failed to initialize WASM' };
    }
  }

  try {
    const {
      imageData,
      width,
      height,
      advanceRate,
      samplingRate,
      volumeMultiplier,
      channels,
      dynamicCompression,
    } = params;

    // Allocate memory for image data
    const imageSize = width * height * 3;
    const imagePtr = wasmModule._malloc(imageSize);
    
    // Copy RGB data to WASM memory
    const rgbData = new Uint8Array(imageData);
    
    if (wasmModule.HEAPU8) {
      wasmModule.HEAPU8.set(rgbData, imagePtr);
    } else if (wasmModule.setValue) {
      for (let i = 0; i < imageSize; i++) {
        wasmModule.setValue(imagePtr + i, rgbData[i], 'i8');
      }
    }
    
    // Load image into WASM
    const loadResult = wasmModule._load_ppm_data(imagePtr, width, height);
    
    if (loadResult !== 0) {
      wasmModule._free(imagePtr);
      throw new Error(`Canvas too large (${width}x${height}). Maximum width: 2000 pixels`);
    }
    
    // Allocate memory for channel map string
    const channelMapPtr = wasmModule._malloc(5);
    
    if (wasmModule.stringToUTF8) {
      wasmModule.stringToUTF8(channels, channelMapPtr, 5);
    } else if (wasmModule.setValue) {
      for (let i = 0; i < channels.length; i++) {
        wasmModule.setValue(channelMapPtr + i, channels.charCodeAt(i), 'i8');
      }
      wasmModule.setValue(channelMapPtr + channels.length, 0, 'i8');
    }
    
    // Synthesize audio
    const audioPtr = wasmModule._synthesize_audio(
      advanceRate,
      samplingRate,
      volumeMultiplier,
      channelMapPtr,
      dynamicCompression ? 1 : 0
    );
    
    if (audioPtr === 0) {
      wasmModule._free(imagePtr);
      wasmModule._free(channelMapPtr);
      throw new Error('Audio synthesis failed');
    }
    
    // Get audio sample count
    const sampleCount = wasmModule._get_audio_sample_count();
    
    // Copy audio data from WASM memory
    const audioData = new Float32Array(sampleCount);
    
    if (wasmModule.HEAPF32) {
      const audioHeap = new Float32Array(
        wasmModule.HEAPF32.buffer,
        audioPtr,
        sampleCount
      );
      audioData.set(audioHeap);
    } else if (wasmModule.getValue) {
      for (let i = 0; i < sampleCount; i++) {
        audioData[i] = wasmModule.getValue(audioPtr + i * 4, 'float');
      }
    }
    
    // Calculate duration
    const duration = sampleCount / samplingRate;
    
    // Cleanup
    wasmModule._free(imagePtr);
    wasmModule._free(channelMapPtr);
    
    return {
      success: true,
      audioData: audioData.buffer, // Transfer the ArrayBuffer
      sampleRate: samplingRate,
      duration,
      samples: sampleCount,
    };
  } catch (error) {
    console.error('[Worker] Synthesis error:', error);
    return { success: false, error: error.message };
  }
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type } = event.data;

  switch (type) {
    case 'init':
      const initResult = await initWasm();
      if (initResult.success) {
        self.postMessage({ type: 'initialized' });
      } else {
        self.postMessage({ type: 'error', error: initResult.error });
      }
      break;

    case 'synthesize':
      const { imageData, width, height, config } = event.data;
      const result = await synthesizeAudio({
        imageData,
        width,
        height,
        ...config
      });
      
      // Send result back to main thread
      if (result.success) {
        self.postMessage(
          { 
            type: 'synthesisComplete', 
            data: {
              audioData: result.audioData,
              duration: result.duration,
              sampleRate: result.sampleRate
            }
          },
          [result.audioData] // Transfer the audio buffer to avoid copying
        );
      } else {
        self.postMessage({ type: 'error', error: result.error });
      }
      break;

    default:
      console.warn('[Worker] Unknown message type:', type);
  }
};

console.log('[Worker] MZ2SYNTH worker ready');
