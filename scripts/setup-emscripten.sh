#!/bin/bash

# Setup Emscripten for compiling Fortran to WebAssembly
# This script checks if Emscripten is installed and sets it up if needed

set -e

EMSDK_DIR="$HOME/emsdk"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔧 Setting up Emscripten for Fortran → WebAssembly compilation..."

# Check if Emscripten is already installed
if [ -d "$EMSDK_DIR" ]; then
    echo "✅ Emscripten SDK found at $EMSDK_DIR"
    
    # Source the environment
    cd "$EMSDK_DIR"
    source ./emsdk_env.sh
    
    # Verify installation
    if command -v emcc &> /dev/null; then
        echo "✅ Emscripten compiler (emcc) is available"
        emcc --version | head -n 1
        
        # Check for Fortran support (flang)
        if command -v emfortran &> /dev/null || command -v flang &> /dev/null; then
            echo "✅ Fortran compiler available"
        else
            echo "⚠️  Fortran compiler (flang) not found in Emscripten"
            echo "   Will attempt to use emcc with gfortran preprocessing"
        fi
    else
        echo "❌ Emscripten not properly activated"
        exit 1
    fi
else
    echo "📦 Emscripten not found. Installing..."
    
    # Clone emsdk
    cd "$HOME"
    git clone https://github.com/emscripten-core/emsdk.git
    cd emsdk
    
    # Install and activate the latest version
    ./emsdk install latest
    ./emsdk activate latest
    
    # Source the environment
    source ./emsdk_env.sh
    
    echo "✅ Emscripten installed successfully!"
    emcc --version | head -n 1
fi

# Return to workspace
cd "$WORKSPACE_DIR"

echo ""
echo "✨ Emscripten setup complete!"
echo ""
echo "To use Emscripten in your current shell, run:"
echo "  source ~/emsdk/emsdk_env.sh"
echo ""
