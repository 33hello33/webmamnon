const fs = require('fs');
const path = require('path');

const srcDir = 'd:\\lap trinh\\website\\src';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (file.endsWith('.js') && !file.endsWith('.test.js') && file !== 'reportWebVitals.js' && file !== 'setupTests.js') {
            results.push(fullPath);
        }
    });
    return results;
}

// Common Mojibake patterns or weird encodings in Vietnamese
// Often, UTF-8 files read as ISO-8859-1 or Windows-1252 have character sequences like:
// à -> Ã , á -> Ã¡, ạ -> áº¡, ả -> áº£, ã -> Ã£
// â -> Ã¢, ầ -> áº§, ấ -> áº¥, ậ -> áº­, ẩ -> áº©, ẫ -> áº«
// ă -> Äƒ, ằ -> áº±, ắ -> áº¯, ặ -> áº·, ẳ -> áº³, ẵ -> áºµ
// o -> o, ò -> Ã², ó -> Ã³, ọ -> á» , ỏ -> á», õ -> Ãµ
// ô -> Ã´, ồ -> á»“, ố -> á»‘, ộ -> á»™, ổ -> á»•, ỗ -> á»—
// ơ -> Æ¡, ờ -> á», ớ -> á»›, ợ -> á»£, ở -> á»Ÿ, ỡ -> á»¡
// e -> e, è -> Ã¨, é -> Ã©, ẹ -> áº¹, ẻ -> áº½...
// u, ư, i, y...
// Also check for "" (REPLACEMENT CHARACTER, U+FFFD) indicating something went wrong during previous conversions.
const files = walk(srcDir);

console.log(`Scanning ${files.length} files...`);

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check if file contains U+FFFD
    const hasReplacementChar = content.includes('\uFFFD');
    
    // Check for mojibake combinations like Ã followed by spacing/special punctuation or specific letters,
    // or áº, á» followed by another byte, etc.
    // Let's use a regex to look for common double-byte patterns that got decoded as individual characters.
    // For example: Ã followed by a capital letter or symbol, or áº or á» followed by standard latin chars.
    const mojibakeRegex = /Ã[ ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]|áº[¡-¿]|á»[-¿]|Æ[¡-¿]|Ä[¡-¿]/;
    
    const hasMojibake = mojibakeRegex.test(content);
    
    if (hasReplacementChar || hasMojibake) {
        console.log(`Found possible issue in: ${path.relative(srcDir, file)}`);
        if (hasReplacementChar) console.log('  - Contains U+FFFD ()');
        if (hasMojibake) console.log('  - Contains Mojibake patterns');
        
        // Print some lines
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            if (line.includes('\uFFFD') || mojibakeRegex.test(line)) {
                console.log(`    Line ${index + 1}: ${line.trim().substring(0, 100)}`);
            }
        });
    }
});
