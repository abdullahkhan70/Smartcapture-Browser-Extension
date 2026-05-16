/**
 * Generate minimal PNG icons for the Chrome extension.
 * Uses a pure JavaScript PNG encoder (no native dependencies).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, 'public', 'icons');

function createPNG(width, height, pixels) {
  // Build raw image data (RGBA)
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
      const idx = (y * (width * 4 + 1)) + 1 + x * 4;
      const px = pixels[y * width + x];
      rawData[idx] = px[0];     // R
      rawData[idx + 1] = px[1]; // G
      rawData[idx + 2] = px[2]; // B
      rawData[idx + 3] = px[3]; // A
    }
  }

  // Compress
  const compressed = zlib.deflateSync(rawData);

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

function drawIcon(size) {
  const pixels = new Array(size * size);
  const bgColor = [14, 165, 233, 255]; // #0EA5E9 cyan

  // Fill background with rounded corners
  const radius = Math.round(size * 0.18);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      // Check corners
      if (x < radius && y < radius) {
        if (Math.sqrt((x - radius) ** 2 + (y - radius) ** 2) > radius) inside = false;
      } else if (x >= size - radius && y < radius) {
        if (Math.sqrt((x - (size - radius - 1)) ** 2 + (y - radius) ** 2) > radius) inside = false;
      } else if (x < radius && y >= size - radius) {
        if (Math.sqrt((x - radius) ** 2 + (y - (size - radius - 1)) ** 2) > radius) inside = false;
      } else if (x >= size - radius && y >= size - radius) {
        if (Math.sqrt((x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2) > radius) inside = false;
      }

      pixels[y * size + x] = inside ? [...bgColor] : [0, 0, 0, 0];
    }
  }

  // Draw camera body (white rectangle)
  const padding = Math.round(size * 0.15);
  const camX = Math.round(padding + size * 0.12);
  const camY = Math.round(padding + size * 0.2);
  const camW = Math.round(size * 0.65);
  const camH = Math.round(size * 0.48);
  const camR = Math.round(size * 0.06);

  for (let y = camY; y < camY + camH; y++) {
    for (let x = camX; x < camX + camW; x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        let inside = true;
        // Simple rounded rect
        const lx = x - camX, ly = y - camY;
        if (lx < camR && ly < camR) {
          if (Math.sqrt((lx - camR) ** 2 + (ly - camR) ** 2) > camR) inside = false;
        } else if (lx >= camW - camR && ly < camR) {
          if (Math.sqrt((lx - (camW - camR - 1)) ** 2 + (ly - camR) ** 2) > camR) inside = false;
        } else if (lx < camR && ly >= camH - camR) {
          if (Math.sqrt((lx - camR) ** 2 + (ly - (camH - camR - 1)) ** 2) > camR) inside = false;
        } else if (lx >= camW - camR && ly >= camH - camR) {
          if (Math.sqrt((lx - (camW - camR - 1)) ** 2 + (ly - (camH - camR - 1)) ** 2) > camR) inside = false;
        }
        if (inside) {
          pixels[y * size + x] = [255, 255, 255, 242];
        }
      }
    }
  }

  // Draw camera lens (cyan circle with dark center)
  const lensCX = Math.round(size / 2);
  const lensCY = Math.round(padding + size * 0.44);
  const outerR = Math.round(size * 0.16);
  const innerR = Math.round(size * 0.09);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - lensCX) ** 2 + (y - lensCY) ** 2);
      if (dist <= outerR && dist > outerR - 1.5) {
        pixels[y * size + x] = [255, 255, 255, 242]; // White ring
      } else if (dist <= outerR - 1.5 && dist > innerR) {
        pixels[y * size + x] = [2, 132, 199, 255]; // Dark cyan
      } else if (dist <= innerR) {
        pixels[y * size + x] = [8, 47, 73, 255]; // Very dark blue
      }
    }
  }

  // Draw flash (small white rect at top right)
  const flashX = Math.round(padding + size * 0.55);
  const flashY = Math.round(padding + size * 0.08);
  const flashW = Math.round(size * 0.14);
  const flashH = Math.round(size * 0.1);
  for (let y = flashY; y < flashY + flashH; y++) {
    for (let x = flashX; x < flashX + flashW; x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        pixels[y * size + x] = [255, 255, 255, 217];
      }
    }
  }

  return pixels;
}

// Generate icons
[16, 48, 128].forEach(size => {
  const pixels = drawIcon(size);
  const png = createPNG(size, size, pixels);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated PNG icon: icon${size}.png (${png.length} bytes)`);
});

console.log('\nAll icons generated successfully!');
