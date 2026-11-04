import { defineConfig } from "vitest/config";

// One worker, one file at a time, never watch mode. The suite runs in under a
// second either way, and this machine has plenty of other work on it.
export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		watch: false,
		fileParallelism: false,
		maxWorkers: 1,
		testTimeout: 5000,
	},
});
