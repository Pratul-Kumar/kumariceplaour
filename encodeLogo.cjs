const fs = require('fs');
const base64 = fs.readFileSync('public/logo.png', {encoding: 'base64'});
fs.writeFileSync('src/lib/logoBase64.ts', 'export const LOGO_BASE64 = "data:image/png;base64,' + base64 + '";\n');
console.log('done');
