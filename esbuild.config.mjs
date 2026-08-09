import { buildFrontend } from './scripts/build-frontend.mjs';

await buildFrontend(process.env.MDVIEWER_EDITION || 'full');
