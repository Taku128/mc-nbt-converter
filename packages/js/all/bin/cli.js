#!/usr/bin/env node

/**
 * bedrock-nbt-converter CLI
 * 
 * Usage:
 *   bedrock-nbt-converter <input> [options]
 * 
 * Options:
 *   -o, --output <path>       Output .nbt file path (default: <input>.nbt)
 *   -f, --format <type>       Input format: mcworld | mcstructure (auto-detected)
 *   --min-x, --max-x <n>      X coordinate range filter (mcworld only)
 *   --min-y, --max-y <n>      Y coordinate range filter (mcworld only)
 *   --min-z, --max-z <n>      Z coordinate range filter (mcworld only)
 *   --dimension <n>           Dimension: 0=overworld, 1=nether, 2=end (default: 0)
 *   -h, --help                Show this help
 */

import fs from 'fs';
import path from 'path';
import { convertMcworld, convertMcstructure } from '../dist/index.js';

function showHelp() {
  console.log(`
bedrock-nbt-converter - Convert Bedrock files to Java Structure NBT

Usage:
  bedrock-nbt-converter <input> [options]

Options:
  -o, --output <path>       Output .nbt file path
  -f, --format <type>       mcworld | mcstructure (auto-detected from extension)
  --min-x <n>               Min X world coordinate (mcworld only)
  --max-x <n>               Max X world coordinate (mcworld only)
  --min-y <n>               Min Y world coordinate (default: -64)
  --max-y <n>               Max Y world coordinate (default: 320)
  --min-z <n>               Min Z world coordinate (mcworld only)
  --max-z <n>               Max Z world coordinate (mcworld only)
  --dimension <n>           0=overworld, 1=nether, 2=end (default: 0)
  -h, --help                Show this help

Examples:
  bedrock-nbt-converter world.mcworld -o output.nbt --min-x -10 --max-x 10
  bedrock-nbt-converter build.mcstructure -o build.nbt
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: null, output: null, format: null,
    minX: -Infinity, maxX: Infinity,
    minY: -64, maxY: 320,
    minZ: -Infinity, maxZ: Infinity,
    dimension: 0
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h': case '--help': showHelp(); process.exit(0);
      case '-o': case '--output': opts.output = args[++i]; break;
      case '-f': case '--format': opts.format = args[++i]; break;
      case '--min-x': opts.minX = parseInt(args[++i]); break;
      case '--max-x': opts.maxX = parseInt(args[++i]); break;
      case '--min-y': opts.minY = parseInt(args[++i]); break;
      case '--max-y': opts.maxY = parseInt(args[++i]); break;
      case '--min-z': opts.minZ = parseInt(args[++i]); break;
      case '--max-z': opts.maxZ = parseInt(args[++i]); break;
      case '--dimension': opts.dimension = parseInt(args[++i]); break;
      default:
        if (!args[i].startsWith('-')) opts.input = args[i];
    }
  }

  if (!opts.input) { showHelp(); process.exit(1); }

  if (!opts.format) {
    const ext = path.extname(opts.input).toLowerCase();
    if (ext === '.mcworld') opts.format = 'mcworld';
    else if (ext === '.mcstructure') opts.format = 'mcstructure';
    else { console.error('Cannot auto-detect format. Use -f mcworld|mcstructure'); process.exit(1); }
  }

  if (!opts.output) {
    opts.output = opts.input.replace(/\.\w+$/, '') + '.nbt';
  }

  return opts;
}

async function main() {
  const opts = parseArgs();
  const inputPath = path.resolve(opts.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`📦 Converting ${path.basename(inputPath)} (${opts.format})...`);

  let result;
  if (opts.format === 'mcworld') {
    result = await convertMcworld(inputPath, {
      minX: opts.minX, maxX: opts.maxX,
      minY: opts.minY, maxY: opts.maxY,
      minZ: opts.minZ, maxZ: opts.maxZ,
      dimension: opts.dimension
    });
  } else {
    result = await convertMcstructure(inputPath);
  }

  const outputPath = path.resolve(opts.output);
  fs.writeFileSync(outputPath, result.nbt);

  const sizeMB = (result.nbt.length / (1024 * 1024)).toFixed(2);
  console.log(`✅ Size: ${result.size.join('×')}`);
  console.log(`   Blocks: ${result.blockCount}, Palette: ${result.paletteCount}`);
  console.log(`💾 Written to ${outputPath} (${sizeMB} MB)`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
