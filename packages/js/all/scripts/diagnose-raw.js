import { readFileSync } from 'fs';
import { parse } from 'prismarine-nbt';

const buf = readFileSync('../elevator.mcstructure');
const { parsed } = await parse(buf);

const palette = parsed.value.structure.value.palette.value.default.value.block_palette.value.value;

console.log('=== RAW REPEATER, OBSERVER ===');
palette.forEach((entry, idx) => {
  if (entry.name.value.includes('repeater') || entry.name.value.includes('observer') || entry.name.value.includes('piston')) {
    const states = entry.states?.value || {};
    const stateStr = Object.entries(states).map(([k,v]) => `${k}=${JSON.stringify(v.value)}`).join(', ');
    console.log(`[${idx}] ${entry.name.value} { ${stateStr} }`);
  }
});
