const fs = require('fs');
const path = require('path');

const srcDir = 'd:\\lap trinh\\website\\src';

// Characters that are NOT in the Vietnamese alphabet (including standard accents)
// but commonly appear in Mojibake from Windows-1252/ISO-8859-1 decoding.
// We exclude standard ASCII (0-127) and valid Vietnamese diacritics.
// Valid Vietnamese Unicode ranges:
// - Latin-1 Supplement: À, Á, Â, Ã, È, É, Ê, Ì, Í, Ò, Ó, Ô, Õ, Ù, Ú, Ý, à, á, â, ã, è, é, ê, ì, í, ò, ó, ô, õ, ù, ú, ý (some of these are also in Vietnamese, e.g. á, à, í, ò, etc.)
// - Latin Extended-A: Ă, ă, Đ, đ, Ĩ, ĩ, Ũ, ũ, Ơ, ơ, Ư, ư
// - Latin Extended Additional (0x1EA0 to 0x1EF9): Ạ, ạ, Ả, ả, Ấ, ấ, Ầ, ầ, Ẩ, ẩ, Ẫ, ẫ, Ậ, ậ, Ắ, ắ, Ằ, ằ, Ẳ, ẳ, Ẵ, ẵ, Ặ, ặ, Ẹ, ẹ, Ẻ, ẻ, Ẽ, ẽ, Ế, ế, Ề, ề, Ể, ể, Ễ, ễ, Ệ, ệ, Ỉ, ỉ, Ị, ị, Ọ, ọ, Ỏ, ỏ, Ố, ố, Ồ, ồ, Ổ, ổ, Ỗ, ỗ, Ộ, ộ, Ớ, ớ, Ờ, ờ, Ở, ở, Ỡ, ỡ, Ợ, ợ, Ụ, ụ, Ủ, ủ, Ứ, ứ, Ừ, ừ, Ử, ử, Ữ, ữ, Ự, ự, Ỳ, ỳ, Ỵ, ỵ, Ỷ, ỷ, Ỹ, ỹ
//
// Let's explicitly define a regex of characters that are NEVER in Vietnamese,
// but frequently appear in Mojibake.
// Examples of Mojibake:
// "Ã¡" (á), "Ã " (à), "áº£" (ả), "Ã£" (ã), "áº¡" (ạ)
// "Ã¢" (â), "áº§" (ầ), "áº¥" (ấ), "áº©" (ẩ), "áº«" (ẫ), "áº­" (ậ)
// "Äƒ" (ă), "áº±" (ằ), "áº¯" (ắ), "áº³" (ẳ), "áºµ" (ẵ), "áº·" (ặ)
// "Ã©" (é), "Ã¨" (è), "áº½" (ẻ), "áº½" (ẽ), "áº¹" (ẹ)
// "Ãª" (ê), "á» " (ề), "áº¿" (ế), "á»ƒ" (ể), "á»…" (ễ), "á»‡" (ệ)
// "Ã­" (í), "Ã¬" (ì), "á»‰" (ỉ), "Ä©" (ĩ), "á»‹" (ị)
// "Ã²" (ò), "Ã³" (ó), "á» " (ỏ), "Ãµ" (õ), "á» " (ọ)
// "Ã´" (ô), "á»“" (ồ), "á»‘" (ố), "á»•" (ổ), "á»—" (ỗ), "á»™" (ộ)
// "Æ¡" (ơ), "á» " (ờ), "á»›" (ớ), "á»Ÿ" (ở), "á»¡" (ỡ), "á»£" (ợ)
// "Ã¹" (ù), "Ãº" (ú), "á»§" (ủ), "Å©" (ũ), "á»¥" (ụ)
// "Æ°" (ư), "á»«" (ừ), "á»©" (ứ), "á»­" (ử), "á»¯" (ữ), "á»±" (ự)
// "Ã½" (ý), "á»³" (ỳ), "á»·" (ỷ), "á»¹" (ỹ), "á»µ" (ỵ)
// "Ä‘" (đ), "Ä" (Đ)
// "Ã " (À), "Ã " (Á), "Ã‚" (Â), "Ãƒ" (Ã), "Ãˆ" (È), "Ã‰" (É), "ÃŠ" (Ê), "ÃŒ" (Ì), "Ã " (Í), "Ã’" (Ò), "Ã“" (Ó), "Ã”" (Ô), "Ã•" (Õ), "Ã™" (Ù), "Ãš" (Ú), "Ã " (Ý)
// Notice how Mojibake contains characters like: Ã, á, º, ª, », ¼, ½, ¾, ¿, ¤, ¶, Å, Æ, Ä, œ, etc.
//
// Let's create a list of characters that are suspicious:
// We look for patterns:
// - "Ã" followed by any character in range [\x80-\xBF] (in UTF-8 bytes, but since we decode as UTF-8, it's actually U+00C3 followed by a character).
// Wait, if it is decoded as UTF-8, "Ã¡" is two characters: 'Ã' (U+00C3) and '¡' (U+00A1).
// So we look for:
// - 'Ã' followed by characters like ' ', '¡', '¢', '£', '¤', '¥', '¦', '§', '¨', '©', 'ª', '«', '¬', '®', '¯', '°', '±', '²', '³', '´', 'µ', '¶', '·', '¸', '¹', 'º', '»', '¼', '½', '¾', '¿', or capital/lowercase letters.
// - 'á' followed by 'º' or '»' or '»' etc.
// - 'Ä' followed by 'ƒ' or '‘' or '’' etc.
// - 'Æ' followed by '¡' or '°' or '°' etc.

const mojibakePatterns = [
    /Ã[ ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/,
    /áº[ -¿]/,
    /á»[ -¿]/,
    /Ä[ƒ‘’’]/,
    /Æ[¡°]/,
    /Â[ -¿]/,
    /Å[©ũ]/,
    /œ/ // French character, not in Vietnamese
];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (file.endsWith('.js') && !file.endsWith('.test.js') && file !== 'reportWebVitals.js' && file !== 'setupTests.js' && file !== 'detect_mojibake.js') {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walk(srcDir);
console.log(`Scanning ${files.length} files...`);

let foundIssues = false;

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let fileHasIssue = false;
    
    lines.forEach((line, index) => {
        let hasMatch = false;
        let matchedPattern = '';
        
        for (const pattern of mojibakePatterns) {
            if (pattern.test(line)) {
                hasMatch = true;
                matchedPattern = pattern.toString();
                break;
            }
        }
        
        if (hasMatch) {
            if (!fileHasIssue) {
                console.log(`\nPossible Mojibake in: ${path.relative(srcDir, file)}`);
                fileHasIssue = true;
                foundIssues = true;
            }
            console.log(`  Line ${index + 1} (matched ${matchedPattern}): ${line.trim().substring(0, 120)}`);
        }
    });
});

if (!foundIssues) {
    console.log("\nNo mojibake found in any JS files!");
}
