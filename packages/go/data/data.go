package data

import _ "embed"

//go:embed chunker-mappings.json
var ChunkerMappings []byte

//go:embed overrides.json
var Overrides []byte

//go:embed aliases.json
var Aliases []byte

//go:embed fallbacks.json
var Fallbacks []byte
