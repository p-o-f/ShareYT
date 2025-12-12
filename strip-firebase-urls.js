import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Files to process
const files = [
    '.output/chrome-mv3/background.js',
    '.output/chrome-mv3/dashboard-script.js',
];

console.log('[MV3 Compliance] Stripping Firebase App Check URLs...');

files.forEach(file => {
    const filePath = path.join(__dirname, file);

    if (!fs.existsSync(filePath)) {
        console.log(`[MV3 Compliance] Skipping ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalSize = content.length;

    // Replace the problematic URL strings
    content = content
        .replace(/"https:\/\/apis\.google\.com\/js\/api\.js"/g, '""')
        .replace(/"https:\/\/www\.google\.com\/recaptcha\/api\.js"/g, '""')
        .replace(/"https:\/\/www\.google\.com\/recaptcha\/enterprise\.js\?render="/g, '""');

    if (content.length !== originalSize) {
        fs.writeFileSync(filePath, content);
        console.log(`[MV3 Compliance] ✓ Stripped URLs from ${file}`);
    } else {
        console.log(`[MV3 Compliance] No URLs found in ${file}`);
    }
});

console.log('[MV3 Compliance] Complete!');
