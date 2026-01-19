import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const REQUIRED_DIRS = ['src/assets/raw', 'static/images'];

// Ensure directories exist
REQUIRED_DIRS.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
        console.log(`Creating directory: ${dir}`);
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

const INPUT_DIR = path.join(process.cwd(), 'src/assets/raw');
const OUTPUT_DIR = path.join(process.cwd(), 'static/images');

async function convertImages() {
    try {
        const files = fs.readdirSync(INPUT_DIR);

        for (const file of files) {
            if (file.match(/\.(png|jpe?g|jpg|tiff)$/i)) {
                const inputPath = path.join(INPUT_DIR, file);
                const outputFilename = parseName(file) + '.webp';
                const outputPath = path.join(OUTPUT_DIR, outputFilename);

                console.log(`Converting ${file} to WebP...`);

                await sharp(inputPath)
                    .webp({ quality: 80 })
                    .toFile(outputPath);

                console.log(`Saved to ${outputFilename}`);
            }
        }
        console.log('Conversion complete!');
    } catch (error) {
        console.error('Error converting images:', error);
    }
}

function parseName(file) {
    return path.parse(file).name;
}

convertImages();
