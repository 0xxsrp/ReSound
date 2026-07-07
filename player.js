const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const ffmpeg = require('ffmpeg-static');

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) process.exit(1);

const tmpFile = path.join(os.tmpdir(), 'sb-' + Date.now() + '.wav');
const ff = cp.spawn(ffmpeg, [
  '-i', filePath,
  '-f', 'wav',
  '-ar', '48000',
  '-ac', '2',
  '-loglevel', 'quiet',
  '-y', tmpFile,
], { windowsHide: true });

ff.on('close', (code) => {
  if (code !== 0 || !fs.existsSync(tmpFile)) process.exit(1);
  const ps = cp.spawn('powershell', [
    '-NoProfile', '-NonInteractive',
    '-Command',
    "Add-Type -AssemblyName System.Windows.Forms; (New-Object System.Media.SoundPlayer('" + tmpFile.replace(/'/g, "''") + "')).PlaySync()"
  ], { windowsHide: true, stdio: 'ignore' });
  ps.on('close', () => {
    try { fs.unlinkSync(tmpFile); } catch {}
    process.exit(0);
  });
});
