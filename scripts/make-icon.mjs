// Draws the plugin icon: four status-coloured keys on a dark ground. The
// Stream Deck store requires a PNG here, and there is no rasteriser in the
// build, so the pixels are written directly.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const colours = [[0xff, 0x2d, 0x2d], [0xff, 0xa0, 0x00], [0x00, 0xb0, 0xff], [0x00, 0xc8, 0x53]];

function crc32(buf) {
	let c, crc = 0xffffffff;
	for (const b of buf) {
		c = (crc ^ b) & 0xff;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		crc = (crc >>> 8) ^ c;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function icon(size) {
	const raw = Buffer.alloc(size * (size * 4 + 1));
	const pad = size * 0.14, gap = size * 0.08, cell = (size - 2 * pad - gap) / 2;
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			let rgb = [0x1b, 0x1d, 0x22];
			const cx = Math.floor((x - pad) / (cell + gap)), cy = Math.floor((y - pad) / (cell + gap));
			const inX = x >= pad && (x - pad) % (cell + gap) < cell && cx < 2;
			const inY = y >= pad && (y - pad) % (cell + gap) < cell && cy < 2;
			if (inX && inY) rgb = colours[cy * 2 + cx];
			const o = y * (size * 4 + 1) + 1 + x * 4;
			raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; raw[o + 3] = 255;
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
	header[8] = 8; header[9] = 6;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
	]);
}

const dir = "com.mtbhuskies.herdr-deck.sdPlugin/imgs/plugin";
writeFileSync(`${dir}/icon.png`, icon(256));
writeFileSync(`${dir}/icon@2x.png`, icon(512));
