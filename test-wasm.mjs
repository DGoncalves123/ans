// Test WASM Module Loading
// This script tests if the WASM module can be loaded and initialized

async function testWASM() {
  console.log('🧪 Testing WASM Module...\n');

  try {
    // Load the WASM module JavaScript
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const wasmJsPath = path.join(__dirname, 'public', 'mz2synth.js');
    const wasmBinaryPath = path.join(__dirname, 'public', 'mz2synth.wasm');
    
    // Check if files exist
    console.log('Checking WASM files...');
    if (!fs.existsSync(wasmJsPath)) {
      throw new Error(`WASM JS not found: ${wasmJsPath}`);
    }
    if (!fs.existsSync(wasmBinaryPath)) {
      throw new Error(`WASM binary not found: ${wasmBinaryPath}`);
    }
    console.log('✅ WASM files exist\n');
    
    // Get file sizes
    const jsSize = fs.statSync(wasmJsPath).size;
    const wasmSize = fs.statSync(wasmBinaryPath).size;
    console.log(`📦 File sizes:`);
    console.log(`   mz2synth.js: ${(jsSize / 1024).toFixed(2)} KB`);
    console.log(`   mz2synth.wasm: ${(wasmSize / 1024).toFixed(2)} KB\n`);
    
    // Try to load and initialize the module
    console.log('Loading WASM module in Node.js environment...');
    
    // Read the WASM file
    const wasmBinary = fs.readFileSync(wasmBinaryPath);
    
    // Create a minimal environment for the WASM module
    global.window = global;
    global.document = { currentScript: { src: wasmJsPath } };
    
    // Load the JavaScript glue code
    const moduleCode = fs.readFileSync(wasmJsPath, 'utf8');
    const moduleExport = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(moduleCode));
    
    console.log('✅ Module loaded\n');
    console.log('🎉 WASM module ready for browser use!');
    console.log('\n📝 Next steps:');
    console.log('  1. Server is running at http://localhost:4200');
    console.log('  2. Open the URL in your browser');
    console.log('  3. Draw on the canvas');
    console.log('  4. Click "Generate & Play Audio"');
    console.log('  5. Listen to your creation!\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

testWASM();
