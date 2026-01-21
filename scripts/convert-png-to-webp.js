
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.resolve(__dirname, '../src/lib/assets/drawings');

async function getFiles(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return files.flat();
}

async function convertImages() {
    console.log(`Searching for PNGs in ${ASSETS_DIR}...`);
    try {
        const allFiles = await getFiles(ASSETS_DIR);
        const pngFiles = allFiles.filter(file => file.toLowerCase().endsWith('.png'));

        console.log(`Found ${pngFiles.length} PNG files. Starting conversion to WebP...`);

        for (const filePath of pngFiles) {
            const webpPath = filePath.replace(/\.png$/i, '.webp');

            try {
                // Resize to max 1920 width to be safe for web, convert to webp (lossless-ish or high quality)
                // Using quality 85 which is usually visually indistinguishable but much smaller
                await sharp(filePath)
                    .webp({ quality: 80 })
                    .toFile(webpPath);

                // Verify the new file exists before deleting the old one
                const stats = await fs.stat(webpPath);
                if (stats.size > 0) {
                    await fs.unlink(filePath);
                    console.log(`✅ Converted: ${path.basename(filePath)} -> ${path.basename(webpPath)}`);
                }
            } catch (err) {
                console.error(`❌ Error converting ${path.basename(filePath)}:`, err);
            }
        }
        console.log('🎉 All done! PNGs replaced with WebP.');
    } catch (err) {
        console.error('Fatal Error:', err);
    }
}

convertImages();
