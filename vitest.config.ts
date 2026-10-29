import { defineConfig } from 'vitest/config'
export default defineConfig({test:{environment:'jsdom',include:['tests/**/*.test.{ts,tsx}'],testTimeout:15000},esbuild:{jsx:'automatic'}})
