/* eslint-disable indent */
'use strict';

const { execSync } = require('child_process');
const { debugLogs } = require(__dirname + '/../../configs/secrets.js');

let fontList = [];

try {
	fontList = execSync('fc-list -f "%{file}:%{family[0]} %{style[0]}\n"')
		.toString()
		.split('\n') // split by newlines, like here ^
		.filter(line => line) // filter empty lines
		.map(line => {
      // map to an object with path and name
			const [path, name] = line.split(':');
			return { path, name };
		})
		.sort((a, b) => {
      // alphabetical name sort
			return a.name.localeCompare(b.name);
		});
	debugLogs && console.log(`${fontList.length} system fonts available`);
} catch (error) {
	console.error('Error executing fc-list, using static font list', error);
	fontList = [
    // Fallback: statically define known fonts
		{ path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', name: 'DejaVu Sans Book' },
		{ path: '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', name: 'DejaVu Serif' },
    // Add more known fonts if necessary
	];
}

module.exports = {
	fontList,
	fontPaths: new Set(['default', ...fontList.map(f => f.path)]), // memoize paths
	// eslint-disable-next-line indent
	DejaVuSans: fontList.find(f => f.name === 'DejaVu Sans Book') || { path: 'default', name: 'default' }, // default for grid captchas
};
