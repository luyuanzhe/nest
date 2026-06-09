'use strict';
/**
 * Load the TypeScript compiler, then load the TypeScript gulpfile which simply loads all
 * the tasks. The tasks are really inside tools/gulp/tasks.
 */

const path = require('path');

const projectDir = __dirname;
const tsconfigPath = path.join(projectDir, 'tools/gulp/tsconfig.json');
const defaultConcurrency = process.env.LERNA_CONCURRENCY || '5';

process.env.LERNA_CONCURRENCY = defaultConcurrency;
process.env.NX_PARALLEL = process.env.NX_PARALLEL || defaultConcurrency;
process.env.NX_CACHE_DIRECTORY =
  process.env.NX_CACHE_DIRECTORY || path.join(projectDir, 'node_modules/.cache/nx');

require('ts-node').register({
  project: tsconfigPath,
  transpileOnly: true
});

require('./tools/gulp/gulpfile');