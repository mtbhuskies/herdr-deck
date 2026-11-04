import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const sdPlugin = "com.mtbhuskies.herdr-deck.sdPlugin";

export default {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		format: "es",
		sourcemap: true,
	},
	plugins: [
		typescript({ include: ["src/**/*.ts"], compilerOptions: { outDir: `${sdPlugin}/bin` } }),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
		{
			// The Stream Deck app runs bin/plugin.js with its own Node, which
			// reads the nearest package.json to decide this is an ES module.
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
	],
};
