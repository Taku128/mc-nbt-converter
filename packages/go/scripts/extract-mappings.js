/**
 * scripts/extract-mappings.js
 * 
 * Parse Chunker's BedrockBlockIdentifierResolver.java to extract
 * Bedrock → Java block name mappings. Also parse BedrockStateGroups.java
 * for state/property conversion rules.
 * 
 * Usage: node scripts/extract-mappings.js <chunker-dir>
 */
import fs from 'fs';
import path from 'path';

const chunkerDir = process.argv[2] || path.resolve('../other_project/Chunker');

// ── 1. Extract block name mappings from BedrockBlockIdentifierResolver.java ──

const resolverPath = path.join(chunkerDir, 'cli/src/main/java/com/hivemc/chunker/conversion/encoding/bedrock/base/resolver/identifier/BedrockBlockIdentifierResolver.java');
const resolverSrc = fs.readFileSync(resolverPath, 'utf8');

// ChunkerVanillaBlockType enum values → java block names
// e.g. POWERED_RAIL → minecraft:powered_rail
function enumToJavaName(enumVal) {
  return 'minecraft:' + enumVal.toLowerCase();
}

const nameMappings = {};

// Pattern 1: BlockMapping.of("minecraft:xxx", ChunkerVanillaBlockType.YYY ...)
// This gives us direct 1:1 name mappings
const ofPattern = /BlockMapping\.of\("(minecraft:[a-z_0-9]+)",\s*ChunkerVanillaBlockType\.([A-Z_]+)/g;
let match;
while ((match = ofPattern.exec(resolverSrc)) !== null) {
  const bedrockName = match[1];
  const javaName = enumToJavaName(match[2]);
  if (!nameMappings[bedrockName]) {
    nameMappings[bedrockName] = javaName;
  }
}

// Pattern 2: BlockMapping.of("minecraft:xxx", "state_key", value, ChunkerVanillaBlockType.YYY ...)
// This gives us conditional mappings (bedrock name + state → java name)
const ofWithStatePattern = /BlockMapping\.of\("(minecraft:[a-z_0-9]+)",\s*"([a-z_]+)",\s*(?:"([^"]+)"|(\d+)|(\w+)),\s*ChunkerVanillaBlockType\.([A-Z_]+)/g;
while ((match = ofWithStatePattern.exec(resolverSrc)) !== null) {
  const bedrockName = match[1];
  const stateKey = match[2];
  const stateVal = match[3] || match[4] || match[5];
  const javaName = enumToJavaName(match[6]);
  
  const key = `${bedrockName}|${stateKey}=${stateVal}`;
  if (!nameMappings[key]) {
    nameMappings[key] = javaName;
  }
  // Also set the base mapping if not set
  if (!nameMappings[bedrockName] && stateVal === undefined) {
    nameMappings[bedrockName] = javaName;
  }
}

// Pattern 3: .put("minecraft:xxx", ChunkerVanillaBlockType.YYY) in ImmutableMultimap builders
const putPattern = /\.put\("(minecraft:[a-z_0-9]+)",\s*ChunkerVanillaBlockType\.([A-Z_]+)\)/g;
while ((match = putPattern.exec(resolverSrc)) !== null) {
  const bedrockName = match[1];
  const javaName = enumToJavaName(match[2]);
  if (!nameMappings[bedrockName]) {
    nameMappings[bedrockName] = javaName;
  }
}

// Pattern 4: BlockMapping.flatten("minecraft:xxx", "state_key", ... .put("state_val", ChunkerVanillaBlockType.YYY)
// These produce bedrock_name + state → java_name mappings
const flattenPattern = /BlockMapping\.flatten\("(minecraft:[a-z_0-9]+)",\s*"([a-z_]+)"/g;
const flattenBlocks = [];
while ((match = flattenPattern.exec(resolverSrc)) !== null) {
  flattenBlocks.push({ bedrockName: match[1], stateKey: match[2], pos: match.index });
}
// For each flatten block, find subsequent .put("value", ChunkerVanillaBlockType.XXX) entries
for (const fb of flattenBlocks) {
  // Search from the position after the flatten call
  const searchStart = fb.pos;
  const searchEnd = resolverSrc.indexOf('.build()', searchStart);
  if (searchEnd < 0) continue;
  const chunk = resolverSrc.substring(searchStart, searchEnd);
  
  const putInFlatten = /\.put\("([^"]+)",\s*ChunkerVanillaBlockType\.([A-Z_]+)\)/g;
  let m2;
  while ((m2 = putInFlatten.exec(chunk)) !== null) {
    const stateVal = m2[1];
    const javaName = enumToJavaName(m2[2]);
    const key = `${fb.bedrockName}|${fb.stateKey}=${stateVal}`;
    nameMappings[key] = javaName;
  }
}

// ── 1.5 Extract REDSTONE_CONNECTABLE from ChunkerVanillaBlockGroups.java ──
const groupsPath = path.join(chunkerDir, 'cli/src/main/java/com/hivemc/chunker/conversion/intermediate/column/chunk/identifier/type/block/ChunkerVanillaBlockGroups.java');
const groupsSrc = fs.readFileSync(groupsPath, 'utf8');

const redstoneConnectables = [];
const redstoneGroupRegex = /public static final Set<ChunkerBlockType> REDSTONE_CONNECTABLE = Set\.of\(([\s\S]*?)\);/;
const groupMatch = redstoneGroupRegex.exec(groupsSrc);
if (groupMatch) {
  const innerContent = groupMatch[1];
  const typeRegex = /ChunkerVanillaBlockType\.([A-Z_]+)/g;
  let tMatch;
  while ((tMatch = typeRegex.exec(innerContent)) !== null) {
    redstoneConnectables.push(enumToJavaName(tMatch[1]));
  }
}

// ── 2. Build compact output format ──

// Separate simple name mappings from conditional ones
const simpleMappings = {};
const conditionalMappings = {};

for (const [key, javaName] of Object.entries(nameMappings)) {
  if (key.includes('|')) {
    const [bedrockName, cond] = key.split('|');
    const [stateKey, stateVal] = cond.split('=');
    if (!conditionalMappings[bedrockName]) conditionalMappings[bedrockName] = {};
    if (!conditionalMappings[bedrockName][stateKey]) conditionalMappings[bedrockName][stateKey] = {};
    conditionalMappings[bedrockName][stateKey][stateVal] = javaName;
  } else {
    if (key !== javaName) { // Only include if names differ
      simpleMappings[key] = javaName;
    }
  }
}

const output = {
  _meta: {
    source: 'HiveGamesOSS/Chunker',
    file: 'BedrockBlockIdentifierResolver.java',
    generated: new Date().toISOString(),
    description: 'Bedrock → Java block name mappings extracted from Chunker source'
  },
  // Simple 1:1 name mappings (only where names differ)
  names: simpleMappings,
  // Conditional mappings: bedrock_name → { state_key → { state_val → java_name } }
  flatten: conditionalMappings,
  // List of java names that redstone wire visually connects to
  redstoneConnectables: redstoneConnectables
};

const outputPath = path.resolve('data/chunker-mappings.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

const simpleCount = Object.keys(simpleMappings).length;
const condCount = Object.keys(conditionalMappings).length;
const totalCond = Object.values(conditionalMappings).reduce((sum, v) => 
  sum + Object.values(v).reduce((s, vv) => s + Object.keys(vv).length, 0), 0);

console.log(`✅ Extracted mappings from Chunker:`);
console.log(`   Simple name changes: ${simpleCount}`);
console.log(`   Conditional blocks: ${condCount} (${totalCond} total variants)`);
console.log(`   Output: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
