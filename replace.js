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

    content = content.replace(/bg-white\/5/g, 'bg-glass-bg');
    content = content.replace(/border-white\/10/g, 'border-glass-border');
    content = content.replace(/border-white\/5/g, 'border-glass-border');
    // For hover states: hover:bg-white/10 -> hover:bg-glass-bg
    content = content.replace(/hover:bg-white\/10/g, 'hover:bg-glass-bg');
    content = content.replace(/hover:bg-white\/5/g, 'hover:bg-glass-bg');
    content = content.replace(/hover:bg-white\/8/g, 'hover:bg-glass-bg');
    content = content.replace(/bg-white\/\[0\.02\]/g, 'bg-glass-bg');
    content = content.replace(/hover:bg-white\/\[0\.02\]/g, 'hover:bg-glass-bg');
    
    // Text colors
    content = content.replace(/text-slate-400/g, 'text-muted-foreground');
    content = content.replace(/text-slate-500/g, 'text-muted-foreground');
    content = content.replace(/text-slate-300/g, 'text-foreground');
    content = content.replace(/text-slate-200/g, 'text-foreground');
    content = content.replace(/text-gray-500/g, 'text-muted-foreground');
    content = content.replace(/text-gray-400/g, 'text-muted-foreground');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});
