/**
 * Generates the favicon set from the Chatterbox brand mark (a white diamond on
 * a teal tile) with no image dependencies — the shapes are rasterised directly
 * and encoded as PNG using Node's zlib.
 *
 *   node scripts/generate-favicons.mjs
 *
 * Outputs into views/ (served at the site root by express.static).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "views");

// Brand accent (matches --cb-accent in the light theme).
const TEAL = [13, 148, 136];
const WHITE = [255, 255, 255];

/* ---------------- PNG encoding ---------------- */

const CRC_TABLE = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

const crc32 = (buf) => {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
};

const encodePNG = (size, rgba) => {
	// Each scanline is prefixed with a filter byte (0 = none).
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
};

/* ---------------- rasterising the mark ---------------- */

/** Signed coverage test for a rounded square, in normalised -1..1 space. */
const insideRoundedSquare = (x, y, half, radius) => {
	const dx = Math.max(Math.abs(x) - (half - radius), 0);
	const dy = Math.max(Math.abs(y) - (half - radius), 0);
	return Math.abs(x) <= half && Math.abs(y) <= half && dx * dx + dy * dy <= radius * radius;
};

/** Diamond (rotated square): |x| + |y| <= r */
const insideDiamond = (x, y, r) => Math.abs(x) + Math.abs(y) <= r;

/**
 * Renders the mark at `size` px.
 * `tile` false gives a transparent background with a teal diamond (used for the
 * small favicon, which reads better without a filled tile at 16px).
 */
const render = (size, { tile = true } = {}) => {
	const buf = Buffer.alloc(size * size * 4);
	const SS = 4; // supersampling factor for anti-aliasing
	const diamondR = tile ? 0.52 : 0.86;

	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let tileHits = 0;
			let diamondHits = 0;

			for (let sy = 0; sy < SS; sy++) {
				for (let sx = 0; sx < SS; sx++) {
					// map to -1..1
					const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
					const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
					if (tile && insideRoundedSquare(x, y, 1, 0.44)) tileHits++;
					if (insideDiamond(x, y, diamondR)) diamondHits++;
				}
			}

			const total = SS * SS;
			const tileA = tile ? tileHits / total : 0;
			const diamondA = diamondHits / total;

			// Composite: white diamond over teal tile (or bare teal diamond).
			let r, g, b, a;
			if (tile) {
				a = tileA;
				const m = Math.min(diamondA, tileA);
				r = TEAL[0] * (1 - m) + WHITE[0] * m;
				g = TEAL[1] * (1 - m) + WHITE[1] * m;
				b = TEAL[2] * (1 - m) + WHITE[2] * m;
			} else {
				a = diamondA;
				[r, g, b] = TEAL;
			}

			const i = (py * size + px) * 4;
			buf[i] = Math.round(r);
			buf[i + 1] = Math.round(g);
			buf[i + 2] = Math.round(b);
			buf[i + 3] = Math.round(a * 255);
		}
	}
	return buf;
};

/* ---------------- ICO container ---------------- */

/** Builds a .ico embedding PNG images (supported since Vista). */
const encodeICO = (images) => {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);

	let offset = 6 + images.length * 16;
	const entries = [];
	for (const { size, data } of images) {
		const e = Buffer.alloc(16);
		e[0] = size >= 256 ? 0 : size;
		e[1] = size >= 256 ? 0 : size;
		e[2] = 0; // palette
		e[3] = 0; // reserved
		e.writeUInt16LE(1, 4); // colour planes
		e.writeUInt16LE(32, 6); // bits per pixel
		e.writeUInt32BE(0, 8);
		e.writeUInt32LE(data.length, 8);
		e.writeUInt32LE(offset, 12);
		entries.push(e);
		offset += data.length;
	}

	return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
};

/* ---------------- outputs ---------------- */

const write = (name, buf) => {
	fs.writeFileSync(path.join(OUT, name), buf);
	console.log(`  ${name} (${buf.length} bytes)`);
};

console.log("Generating favicons into views/");

// Scalable master. Uses currentColor-free explicit fills so it renders the same
// everywhere, and keeps the same geometry as the rasterised versions.
write(
	"favicon.svg",
	Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Chatterbox">
  <rect width="64" height="64" rx="14" fill="#0d9488"/>
  <path d="M32 15 L49 32 L32 49 L15 32 Z" fill="#ffffff"/>
</svg>
`,
		"utf8"
	)
);

// .ico for legacy requests (browsers hit /favicon.ico even when a link tag exists).
write(
	"favicon.ico",
	encodeICO(
		[16, 32, 48].map((size) => ({
			size,
			data: encodePNG(size, render(size, { tile: size >= 32 })),
		}))
	)
);

write("apple-touch-icon.png", encodePNG(180, render(180)));
write("icon-192.png", encodePNG(192, render(192)));
write("icon-512.png", encodePNG(512, render(512)));

write(
	"site.webmanifest",
	Buffer.from(
		JSON.stringify(
			{
				name: "Chatterbox",
				short_name: "Chatterbox",
				icons: [
					{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
				],
				theme_color: "#0d9488",
				background_color: "#f5f8f8",
				display: "standalone",
				start_url: "/",
			},
			null,
			2
		) + "\n",
		"utf8"
	)
);

console.log("Done.");
