import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Tooltip wrappers
    content = content.replace(/style=\{\{ border: "1px solid rgba\(255,255,255,0\.12\)" \}\}/g, 'style={{ border: "1px solid var(--glass-border)", backgroundColor: "var(--popover)" }}');
    content = content.replace(/style=\{\{ border: "1px solid rgba\(255,255,255,0\.1\)" \}\}/g, 'style={{ border: "1px solid var(--glass-border)", backgroundColor: "var(--popover)" }}');
    
    // Tooltip text
    content = content.replace(/text-white text-gradient/g, 'text-foreground text-gradient');
    
    // Cursors
    content = content.replace(/cursor=\{\{ stroke: 'rgba\(255,255,255,0\.1\)'/g, "cursor={{ stroke: 'var(--glass-border)'");
    content = content.replace(/cursor=\{\{ fill: 'rgba\(255,255,255,0\.02\)'/g, "cursor={{ fill: 'var(--glass-bg)'");

    // Any stray bg-white/5 left? (Wait, the previous script changed them to bg-glass-bg, let's check)
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});
