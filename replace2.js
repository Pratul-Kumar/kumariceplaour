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
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Inline rgba glass
    content = content.replace(/background: "rgba\(255,255,255,0\.06\)"/g, 'background: "var(--glass-bg)"');
    content = content.replace(/color: "rgba\(255,255,255,0\.6\)"/g, 'color: "hsl(var(--muted-foreground))"');
    content = content.replace(/rgba\(255,255,255,0\.05\)/g, 'var(--glass-bg)');
    
    // Remaining text-slate
    content = content.replace(/text-slate-100/g, 'text-foreground');
    content = content.replace(/text-slate-200/g, 'text-foreground');
    content = content.replace(/text-slate-300/g, 'text-foreground');
    content = content.replace(/text-slate-400/g, 'text-muted-foreground');
    content = content.replace(/text-slate-500/g, 'text-muted-foreground');
    content = content.replace(/text-slate-600/g, 'text-muted-foreground');
    content = content.replace(/text-gray-100/g, 'text-foreground');
    content = content.replace(/text-gray-200/g, 'text-foreground');
    content = content.replace(/text-gray-300/g, 'text-foreground');
    content = content.replace(/text-gray-400/g, 'text-muted-foreground');
    content = content.replace(/text-gray-500/g, 'text-muted-foreground');
    
    // Some text-white might be bad (unless it's inside a primary button, but typically buttons have text-primary-foreground)
    // Actually, text-white inside Dashboard StatCard is bad if the text needs to adapt to light mode
    // Wait, the icon is text-white inside a colored gradient bg: `<div className="... bg-gradient-to-br ..."><Icon className="text-white"/>` That's correct, white on colored bg!
    // What about text-white elsewhere? Let's not blindly replace text-white.
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});
