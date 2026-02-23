/*
 * MZ2SYNTH WebAssembly Wrapper
 * 
 * This is a minimal C implementation that will be compiled to WASM.
 * We'll implement the core synthesis algorithm in C based on the Fortran code.
 */

#include <emscripten.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <string.h>

#define MAX_WIDTH 720
#define MAX_HEIGHT 2000
#define NUM_OSCILLATORS 720
#define PI 3.14159265358979323846

// Global state
static unsigned char image_buffer[MAX_WIDTH * MAX_HEIGHT * 3];
static int image_width = 0;
static int image_height = 0;
static float* audio_buffer = NULL;
static int audio_samples = 0;

// Oscillator frequencies (10 octaves, 72 steps per octave)
static double oscillator_freqs[NUM_OSCILLATORS];

EMSCRIPTEN_KEEPALIVE
void init_oscillators() {
    // Initialize 720 oscillator frequencies spanning 10 octaves
    // Based on equal temperament tuning
    double base_freq = 16.0; // ~C0
    for (int i = 0; i < NUM_OSCILLATORS; i++) {
        oscillator_freqs[i] = base_freq * pow(2.0, (double)i / 72.0);
    }
}

EMSCRIPTEN_KEEPALIVE
int load_ppm_data(const unsigned char* data, int width, int height) {
    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        return -1; // Error: dimensions too large
    }
    
    image_width = width;
    image_height = height;
    
    // Copy image data
    memcpy(image_buffer, data, width * height * 3);
    
    return 0; // Success
}

EMSCRIPTEN_KEEPALIVE
float* synthesize_audio(int advance_rate, int sampling_rate, float volume_mult, 
                        const char* channel_map, int use_compression) {
    if (image_width == 0 || image_height == 0) {
        return NULL;
    }
    
    // Calculate output duration
    double duration = (double)image_height / (double)advance_rate;
    audio_samples = (int)(duration * sampling_rate);
    
    // Allocate audio buffer
    if (audio_buffer != NULL) {
        free(audio_buffer);
    }
    audio_buffer = (float*)malloc(audio_samples * sizeof(float));
    
    if (audio_buffer == NULL) {
        return NULL;
    }
    
    // Initialize audio buffer
    memset(audio_buffer, 0, audio_samples * sizeof(float));
    
    // Parse channel map (RGBL format)
    int sine_channel = -1, square_channel = -1, saw_channel = -1, tri_channel = -1;
    
    for (int i = 0; i < 4 && channel_map[i] != '\0'; i++) {
        int ch = -1;
        switch(channel_map[i]) {
            case 'R': ch = 0; break; // Red
            case 'G': ch = 1; break; // Green
            case 'B': ch = 2; break; // Blue
            case 'L': ch = 3; break; // Luminance
            case 'M': ch = -1; break; // Mute
        }
        
        switch(i) {
            case 0: sine_channel = ch; break;
            case 1: square_channel = ch; break;
            case 2: saw_channel = ch; break;
            case 3: tri_channel = ch; break;
        }
    }
    
    // Synthesize audio
    double time_step = 1.0 / (double)sampling_rate;
    double image_advance_rate = (double)advance_rate;
    
    for (int sample = 0; sample < audio_samples; sample++) {
        double time = sample * time_step;
        double y_pos = time * image_advance_rate;
        int y = (int)y_pos;
        
        if (y >= image_height) {
            break;
        }
        
        float sample_value = 0.0f;
        
        // Sum all oscillators
        for (int x = 0; x < image_width && x < NUM_OSCILLATORS; x++) {
            int pixel_idx = (y * image_width + x) * 3;
            float r = image_buffer[pixel_idx + 0] / 255.0f;
            float g = image_buffer[pixel_idx + 1] / 255.0f;
            float b = image_buffer[pixel_idx + 2] / 255.0f;
            float l = (r + g + b) / 3.0f; // Luminance
            
            double phase = 2.0 * PI * oscillator_freqs[x] * time;
            
            // Sine wave
            if (sine_channel >= 0) {
                float amp = (sine_channel == 0) ? r : (sine_channel == 1) ? g : (sine_channel == 2) ? b : l;
                sample_value += amp * sin(phase);
            }
            
            // Square wave
            if (square_channel >= 0) {
                float amp = (square_channel == 0) ? r : (square_channel == 1) ? g : (square_channel == 2) ? b : l;
                sample_value += amp * (sin(phase) > 0 ? 1.0 : -1.0);
            }
            
            // Sawtooth wave
            if (saw_channel >= 0) {
                float amp = (saw_channel == 0) ? r : (saw_channel == 1) ? g : (saw_channel == 2) ? b : l;
                double saw = fmod(phase / (2.0 * PI), 1.0);
                sample_value += amp * (2.0 * saw - 1.0);
            }
            
            // Triangle wave
            if (tri_channel >= 0) {
                float amp = (tri_channel == 0) ? r : (tri_channel == 1) ? g : (tri_channel == 2) ? b : l;
                double tri = fmod(phase / (2.0 * PI), 1.0);
                sample_value += amp * (4.0 * fabs(tri - 0.5) - 1.0);
            }
        }
        
        // Apply volume and normalization
        sample_value *= volume_mult / NUM_OSCILLATORS;
        
        // Dynamic compression (simple limiter)
        if (use_compression) {
            if (sample_value > 1.0f) sample_value = 1.0f;
            if (sample_value < -1.0f) sample_value = -1.0f;
        }
        
        audio_buffer[sample] = sample_value;
    }
    
    return audio_buffer;
}

EMSCRIPTEN_KEEPALIVE
int get_audio_sample_count() {
    return audio_samples;
}

EMSCRIPTEN_KEEPALIVE
void cleanup() {
    if (audio_buffer != NULL) {
        free(audio_buffer);
        audio_buffer = NULL;
    }
    audio_samples = 0;
}
