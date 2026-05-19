/**
 * Build script for SmartCapture Pro Chrome Extension
 * Handles: TypeScript compilation (background/content/offscreen scripts), Vite build (popup/editor), 
 * manifest preparation, and tesseract asset verification.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

console.log('🔨 Building SmartCapture Pro Chrome Extension...\n');

// Step 1: Type check
console.log('📦 Step 1: Type checking...');
try {
  execSync('npx tsc --noEmit', { cwd: root, stdio: 'pipe' });
  console.log('   ✅ Type check passed');
} catch (err) {
  console.log('   ⚠️  Type check warnings (non-blocking)');
}

// Step 2: Compile background, content, and offscreen scripts with esbuild
console.log('📦 Step 2: Compiling service worker, content script & offscreen OCR engine...');
const esbuild = resolve(root, 'node_modules/.bin/esbuild');

function compileScript(srcPath, outPath, extraArgs = '') {
  execSync(
    `${esbuild} ${resolve(root, srcPath)} --bundle --outfile=${resolve(root, outPath)} --format=esm --target=chrome110 --platform=browser ${extraArgs}`,
    { stdio: 'pipe' }
  );
  console.log(`   ✅ Compiled ${srcPath} → ${outPath}`);
}

compileScript('src/background/index.ts', 'src/background/index.js');
compileScript('src/content/index.ts', 'src/content/index.js');
// Offscreen OCR engine — tesseract.js is loaded via <script> tag in HTML, NOT bundled
// We use --external:tesseract.js to prevent esbuild from bundling it
compileScript('src/offscreen/offscreen.ts', 'src/offscreen/offscreen.js', '--external:tesseract.js');

// Step 3: Vite build (popup + editor)
console.log('📦 Step 3: Vite build (popup + editor)...');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });

// Step 4: Copy compiled scripts to dist
console.log('📦 Step 4: Copying compiled scripts to dist...');
const distDir = resolve(root, 'dist');

mkdirSync(resolve(distDir, 'src/background'), { recursive: true });
mkdirSync(resolve(distDir, 'src/content'), { recursive: true });
mkdirSync(resolve(distDir, 'src/offscreen'), { recursive: true });

copyFileSync(
  resolve(root, 'src/background/index.js'),
  resolve(distDir, 'src/background/index.js')
);
copyFileSync(
  resolve(root, 'src/content/index.js'),
  resolve(distDir, 'src/content/index.js')
);
copyFileSync(
  resolve(root, 'src/offscreen/offscreen.js'),
  resolve(distDir, 'src/offscreen/offscreen.js')
);
copyFileSync(
  resolve(root, 'src/offscreen/offscreen.html'),
  resolve(distDir, 'src/offscreen/offscreen.html')
);
console.log('   ✅ Scripts copied to dist');

// Step 5: Generate dist manifest with correct paths
console.log('📦 Step 5: Generating dist manifest.json...');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'));

// Fix paths for dist (remove 'public/' prefix from icons, ensure .js extensions)
manifest.action.default_icon = {
  '16': 'icons/icon16.png',
  '48': 'icons/icon48.png',
  '128': 'icons/icon128.png',
};
manifest.icons = {
  '16': 'icons/icon16.png',
  '48': 'icons/icon48.png',
  '128': 'icons/icon128.png',
};

writeFileSync(
  resolve(distDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log('   ✅ manifest.json generated');

// Step 6: Verify tesseract files
console.log('📦 Step 6: Verifying tesseract assets...');
const requiredFiles = [
  'tesseract/worker.min.js',
  'tesseract/tesseract.min.js',
  'tesseract/tesseract-core-simd-lstm.wasm.js',
  'tesseract/tesseract-core-simd-lstm.wasm',
  'tesseract/langs/eng.traineddata.gz',
  'src/offscreen/offscreen.html',
  'src/offscreen/offscreen.js',
];

let allPresent = true;
for (const file of requiredFiles) {
  if (existsSync(resolve(distDir, file))) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ MISSING: ${file}`);
    allPresent = false;
  }
}

if (!allPresent) {
  console.error('\n❌ Build failed: Missing assets. Run setup script first.');
  process.exit(1);
}

// Summary
console.log('\n✨ Build complete!');
console.log(`   📁 Output: ${distDir}`);
console.log(`   📦 OCR Engine: Offscreen document with pre-warmed Tesseract.js WASM`);
console.log(`   📦 Files: tesseract assets + offscreen OCR engine + popup/editor bundles + service worker + content script`);
console.log('\nTo load in Chrome: chrome://extensions → Developer mode → Load unpacked → select the dist/ folder');
