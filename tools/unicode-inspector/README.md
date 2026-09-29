# Unicode Character Inspector data

`data.js` bundles names and General_Category values from Unicode 17.0.0:

- https://www.unicode.org/Public/17.0.0/ucd/UnicodeData.txt
- https://www.unicode.org/Public/17.0.0/ucd/NameAliases.txt

The Unicode license is embedded in the file. Control and correction aliases replace placeholder names. First/Last records are stored as ranges; Hangul syllables and CJK/Tangut ideograph names are expanded at runtime. Unassigned code points are labelled Cn. Private-use and surrogate ranges retain descriptive range labels.

The page operates on code points, not grapheme clusters. UTF-16 bytes are big-endian without a BOM. UTF-8 is omitted for lone surrogates. Input is limited to 5,000 code points to keep the table responsive. No runtime data request is made.
