# 🎵 MZ2SYNTH - Offline Audio Synthesis in Your Browser

An Nx monorepo featuring a **fully offline**, browser-based audio synthesizer powered by WebAssembly.

## ✨ What Makes This Special

- **🌐 100% Offline** - No internet or backend server required
- **🎨 Visual Sound Design** - Draw patterns, hear them as music
- **⚡ WebAssembly Powered** - Fortran synthesis compiled to WASM
- **📱 Works Everywhere** - Desktop and mobile browsers
- **🚀 One Command Setup** - `npm run setup` and you're done!

## 🚀 Quick Start

### First Time Setup

```bash
# Clone and navigate to workspace
cd mz2synth-workspace

# Install everything (Emscripten + WASM build)
npm run setup

# Start the app
npm start

# Open http://localhost:4200 and create sounds!
```

### Daily Usage

```bash
npm start  # That's it!
```

## 🎨 How It Works

1. **Draw on Canvas** - 720 pixels wide (one per oscillator)
   - **Red** pixels = Sine waves
   - **Green** pixels = Square waves
   - **Blue** pixels = Sawtooth waves

2. **Click "Generate & Play"** - Audio synthesizes instantly in browser

3. **Listen!** - Web Audio API plays your creation

## 📦 Features

- 🎵 **720 Oscillators** spanning 10 octaves (like the original ANS synthesizer)
- 🌊 **4 Waveform Types**: Sine, Square, Sawtooth, Triangle
- 🎚️ **Full Control**: Speed, volume, sample rate, channel mapping
- 💾 **Fully Offline**: Works without internet connection
- 🔧 **No Backend**: Pure static site deployment
- 📱 **Mobile Support**: Works on phones and tablets

## 🛠️ NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | **First time**: Install Emscripten + build WASM |
| `npm start` | Start dev server (http://localhost:4200) |
| `npm run update` | Update Fortran code from git + rebuild WASM |
| `npm run build` | Build production bundle |
| `npm run wasm:build` | Rebuild WASM module only |

## 📁 Project Structure

```
mz2synth-workspace/
├── public/
│   ├── mz2synth.js           # WASM glue code
│   └── mz2synth.wasm         # Compiled synthesizer (18KB!)
│
├── src/
│   └── components/
│       ├── DrawingCanvas.tsx        # 720px drawing interface
│       └── AudioSynthesizer.tsx     # Main UI (WASM-based)
│
├── libs/mz2synth-wasm/              # WebAssembly module
│   ├── src/
│   │   ├── mz2_wasm.c               # C implementation
│   │   └── index.ts                 # TypeScript wrapper
│   └── build/
│
├── scripts/
│   ├── setup-emscripten.sh          # Emscripten setup
│   └── build-wasm.sh                # WASM compilation
│
└── fortran-source/                  # Original Fortran code
```

## 🌐 Deployment

Since there's no backend, deploy anywhere that hosts static files:

```bash
npm run build

# Deploy dist/mz2synth-app/ to:
# - GitHub Pages
# - Netlify
# - Vercel
# - Any static host
```

## 📚 Documentation

- **[WASM_SETUP.md](WASM_SETUP.md)** - Technical details about WebAssembly compilation
- **[INTERACTIVE_STUDIO_README.md](INTERACTIVE_STUDIO_README.md)** - User guide for the drawing interface

## 🔧 Advanced Usage

### Update from Git

When the MZ2SYNTH Fortran repository updates:

```bash
npm run update  # Pulls latest + rebuilds WASM
```

### Customize Synthesis

Edit the C implementation at `libs/mz2synth-wasm/src/mz2_wasm.c`:

- Add new waveform types
- Modify oscillator frequencies
- Apply audio effects

Then rebuild:

```bash
npm run wasm:build
```

## 🎯 Technical Details

### Architecture

```
Browser (Fully Offline)
├── React UI (Drawing Canvas)
├── WebAssembly Module
│   ├── 720 oscillators
│   ├── 4 waveform types
│   └── Real-time synthesis
└── Web Audio API (Playback)
```

### Performance

- **WASM Load**: ~50-100ms
- **Synthesis (720×200)**: ~100-500ms
- **Memory**: ~10-20MB
- **Audio Quality**: Same as native Fortran

### Browser Support

✅ Chrome/Edge 57+  
✅ Firefox 52+  
✅ Safari 11+  
✅ Mobile Safari (iOS 11+)  
✅ Mobile Chrome (Android 5+)

## ⚠️ Safety Warning

This synthesizer can generate **very loud sounds**:

- Start with **low volume** (default: 5%)
- Test with **headphones at low volume first**
- Be careful with volume multipliers > 0.1
- **Protect your hearing** and equipment

## 🐛 Troubleshooting

### WASM module not loaded

Reload the page. If persists:

```bash
npm run wasm:build
npm start
```

### Dev server won't start

Port 4200 in use:

```bash
lsof -i :4200
kill -9 <PID>
npm start
```

### Audio generation fails

Check browser console. Image must be exactly 720 pixels wide.

## 🎓 Learn More

- [WebAssembly](https://webassembly.org/)
- [Emscripten](https://emscripten.org/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [ANS Synthesizer](https://en.wikipedia.org/wiki/ANS_synthesizer)
- [MZ2SYNTH GitHub](https://github.com/frankenbeans/MZ2SYNTH)

## 💡 Credits

- **MZ2SYNTH Fortran Code**: E. Lamprecht
- **Original ANS Synthesizer**: Yevgeny Murzin (1958)
- **WebAssembly Port**: This project

## 📄 License

GPL-3.0 (same as MZ2SYNTH)

---

**Happy sound painting! 🎨🎵**
