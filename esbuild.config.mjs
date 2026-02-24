import { build } from 'esbuild';

await build({
  entryPoints: ['src/js/main.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  target: 'es2020',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
});

console.log('Frontend build complete.');
