#!/usr/bin/env node
// Update code in place: Chrome stores settings under the existing extension ID.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const [destination, expectedId] = process.argv.slice(2);
if (!destination || !/^[a-p]{32}$/.test(expectedId || '')) {
    throw new Error('Usage: node scripts/update-unpacked.cjs EXISTING_DIRECTORY EXTENSION_ID');
}
const target = fs.realpathSync(destination);
const source = path.resolve(__dirname, '../dist');
const readManifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const previous = readManifest(target);
const next = readManifest(source);
if (previous.name !== next.name || target === source) {
    throw new Error('Choose the existing installed directory, separate from the build directory');
}
// A newly added key would change an existing path-derived ID. Keep its identity.
if (previous.key) next.key = previous.key;
else delete next.key;
const identity = previous.key ? Buffer.from(previous.key, 'base64') : Buffer.from(target);
const id = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (n) => String.fromCharCode(97 + parseInt(n, 16)));
if (id !== expectedId) throw new Error(`Wrong installation: this directory identifies as ${id}`);
const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'google-meet-extension-backup-'));
fs.cpSync(target, path.join(backup, 'extension'), { recursive: true });
function install(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const name = path.join(relative, entry.name);
        if (name === 'manifest.json') continue;
        if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${name}`);
        if (entry.isDirectory()) install(path.join(dir, entry.name), name);
        else {
            const out = path.join(target, name);
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.copyFileSync(path.join(source, name), out + '.update');
            fs.renameSync(out + '.update', out);
        }
    }
}
install(source);
fs.writeFileSync(path.join(target, 'manifest.json.update'), JSON.stringify(next, null, 4) + '\n');
fs.renameSync(path.join(target, 'manifest.json.update'), path.join(target, 'manifest.json'));
console.log(JSON.stringify({ directory: target, extensionId: id, backup,
    nextStep: 'Click Reload on the existing extension in chrome://extensions. Do not remove it.' }));
