/**
 * Dump piston and redstone_wire blocks from a generated NBT file
 * to diagnose direction/connection issues.
 */
import { readFileSync } from 'fs';
import { parse } from 'prismarine-nbt';

const nbtPath = process.argv[2] || '../elevator_chunker.nbt';
const buf = readFileSync(nbtPath);
const { parsed } = await parse(buf);
const root = parsed.value;

const palette = root.palette?.value?.value || [];
const blocks = root.blocks?.value?.value || [];

console.log('=== PALETTE ENTRIES (piston/redstone) ===');
palette.forEach((entry, idx) => {
  const name = entry.Name?.value || '';
  if (name.includes('piston') || name.includes('redstone') || name.includes('repeater') || name.includes('observer') || name.includes('comparator')) {
    const props = entry.Properties?.value || {};
    const propStr = Object.entries(props).map(([k, v]) => `${k}=${v.value}`).join(', ');
    console.log(`  [${idx}] ${name} { ${propStr} }`);
  }
});

console.log('\n=== PISTON BLOCKS (with positions) ===');
blocks.forEach(block => {
  const stateIdx = block.state?.value;
  const pos = block.pos?.value?.value || [];
  const entry = palette[stateIdx];
  const name = entry?.Name?.value || '';
  if (name.includes('piston')) {
    const props = entry.Properties?.value || {};
    const propStr = Object.entries(props).map(([k, v]) => `${k}=${v.value}`).join(', ');
    console.log(`  pos=[${pos.join(',')}] ${name} { ${propStr} }`);
  }
});

console.log('\n=== REDSTONE_WIRE BLOCKS (first 10) ===');
let count = 0;
blocks.forEach(block => {
  if (count >= 10) return;
  const stateIdx = block.state?.value;
  const pos = block.pos?.value?.value || [];
  const entry = palette[stateIdx];
  const name = entry?.Name?.value || '';
  if (name.includes('redstone_wire')) {
    const props = entry.Properties?.value || {};
    const propStr = Object.entries(props).map(([k, v]) => `${k}=${v.value}`).join(', ');
    console.log(`  pos=[${pos.join(',')}] ${name} { ${propStr} }`);
    count++;
  }
});
