#!/usr/bin/env node
/* Build the single-file version of Outbreak Lab.
 *
 *   node tools/build.js            ->  dist/outbreak-lab.html
 *
 * It takes index.html and puts the stylesheet, the eight scripts and the two
 * papers back inside it, so the result is one self-contained HTML file that
 * can be emailed, sent on WhatsApp or opened offline. No dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

/* 1. stylesheet */
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/, (_, href) => '<style>\n' + read(href) + '</style>');

/* 2. scripts, in the order they are listed in index.html */
const tag = /<script src="(js\/[^"]+)"><\/script>\n?/g;
const files = [];
let m;
while ((m = tag.exec(html))) files.push(m[1]);
if (!files.length) throw new Error('No <script src="js/..."> tags found in index.html');
const first = html.search(tag);
html = html.replace(tag, '');
const bundle = '<script>\n' + files.map(read).join('') + '</script>\n';
html = html.slice(0, first) + bundle + html.slice(first);

/* 3. papers: turn the relative links back into embedded downloads */
const DOCX = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,';
html = html.replace(/href="(papers\/[^"]+\.docx)"/g, (_, href) => 'href="' + DOCX + fs.readFileSync(path.join(root, href)).toString('base64') + '"');

const out = path.join(root, 'dist', 'outbreak-lab.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Built ' + path.relative(root, out) + ' (' + (html.length / 1048576).toFixed(2) + ' MB) from ' + files.length + ' scripts: ' + files.join(', '));
