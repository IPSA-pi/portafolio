import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');

async function processImages() {
    console.log(`Converting images to standard RGB in ${ASSETS_DIR}...`);
    try {
        const files = await fs.readdir(ASSETS_DIR);

        for (const file of files) {
            if (!file.match(/\.(png|jpg|jpeg)$/i)) continue;

            const filePath = path.join(ASSETS_DIR, file);
            const tempPath = filePath + '.rgb.png';

            try {
                console.log(`Processing ${file}...`);
                // Force conversion to standard sRGB png, no palette
                await sharp(filePath)
                    .png({ palette: false, compressionLevel: 9 })
                    .toFile(tempPath);

                await fs.rename(tempPath, filePath);
                console.log(`✅ Converted ${file}`);
            } catch (err) {
                console.error(`❌ Error processing ${file}:`, err);
                try { await fs.unlink(tempPath); } catch (e) { }
            }
        }
        console.log('Done!');
    } catch (err) {
        console.error('Error:', err);
    }
}

processImages();
