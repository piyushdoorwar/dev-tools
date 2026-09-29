/* MIME type reference data.
 *
 * A curated list of the types web developers actually meet, not the whole
 * registry. The authority is the IANA Media Types registry:
 * https://www.iana.org/assignments/media-types/
 *
 * Fields:
 *   mime      the canonical type, lowercase.
 *   ext       extensions without the dot. A multi-part one ("tar.gz") is for
 *             filename matching only; server config lines skip it, because
 *             nginx and Apache map one extension at a time.
 *   note      one or two sentences. `backticks` render as inline code.
 *   pitfalls  the mistakes people actually make with this type.
 *   aliases   other spellings seen in the wild, so searching them still lands
 *             here. Each is explained in `pitfalls` or `note`.
 *   charset   true when a non-text/* type takes a charset parameter (XML).
 *             Every text/* type does.
 *   registered false for de facto types that IANA has never registered.
 *   html      an HTML snippet that references the type, when one is useful.
 *             Otherwise the tool offers an `accept=` hint from the extensions.
 */
globalThis.MIME_TYPES = Object.freeze([
  /* --- text --------------------------------------------------------------- */
  {
    mime: "text/html", ext: ["html", "htm"],
    note: "HTML documents. Declare the charset in the header, or with `<meta charset>` in the first 1024 bytes.",
    pitfalls: [
      "Without a charset the browser guesses the encoding, and a wrong guess shows mojibake.",
      "User uploads served as text/html can run script on your origin. Serve them as `application/octet-stream` with `Content-Disposition: attachment`, or from a separate domain.",
    ],
    html: '<meta charset="utf-8">',
  },
  {
    mime: "text/css", ext: ["css"],
    note: "Cascading Style Sheets.",
    pitfalls: [
      "Browsers ignore a stylesheet served with another type in standards mode, and always under `X-Content-Type-Options: nosniff`.",
    ],
    html: '<link rel="stylesheet" href="styles.css">',
  },
  {
    mime: "text/javascript", ext: ["js", "mjs", "cjs"],
    aliases: ["application/javascript", "application/x-javascript"],
    note: "JavaScript, for classic scripts and modules alike. RFC 9239 (2022) made text/javascript the one standard type.",
    pitfalls: [
      "`application/javascript` is obsolete but still accepted. `<script>` needs no `type` attribute for classic scripts.",
      "Module scripts are strict: served with a non-JavaScript type, a module fails to load.",
    ],
    html: '<script type="module" src="app.js"></script>',
  },
  {
    mime: "text/plain", ext: ["txt", "text", "log"],
    note: "Plain text, and the fallback for readable content with no better type.",
    pitfalls: [
      "Browsers display it instead of downloading it. Add `Content-Disposition: attachment` to force a download.",
    ],
  },
  {
    mime: "text/csv", ext: ["csv"],
    note: "Comma-separated values (RFC 4180). The optional `header=present` parameter says the first row names the columns.",
    pitfalls: [
      "Excel never sees HTTP headers when it opens a downloaded file. Start the file with a UTF-8 BOM so accented characters survive.",
      "Fields containing commas, quotes or newlines must be quoted, and quotes inside them doubled.",
    ],
  },
  {
    mime: "text/tab-separated-values", ext: ["tsv"],
    note: "Tab-separated values. Simpler than CSV: fields cannot contain tabs or newlines.",
  },
  {
    mime: "text/markdown", ext: ["md", "markdown"],
    note: "Markdown source (RFC 7763), not rendered HTML. An optional `variant` parameter names the flavour, such as `variant=GFM`.",
    pitfalls: ["RFC 7763 makes the charset parameter required, not optional."],
  },
  {
    mime: "text/calendar", ext: ["ics", "ifb"],
    note: "iCalendar data (RFC 5545) for events, invites and subscribable calendars.",
    pitfalls: [
      "An invitation sent by email needs a `method` parameter, such as `method=REQUEST`, that matches the METHOD inside the file.",
    ],
  },
  {
    mime: "text/vcard", ext: ["vcf", "vcard"],
    aliases: ["text/x-vcard"],
    note: "Contact cards (vCard 4.0, RFC 6350). `text/x-vcard` is the pre-registration spelling.",
  },
  {
    mime: "text/vtt", ext: ["vtt"],
    note: "WebVTT captions and subtitles for the `<track>` element.",
    pitfalls: [
      "Browsers may refuse a track served with another type. A cross-origin track also needs CORS and `crossorigin` on the media element.",
    ],
    html: '<track kind="subtitles" src="captions.vtt" srclang="en" label="English">',
  },
  {
    mime: "text/event-stream", ext: [],
    note: "Server-Sent Events: a long-lived response read by `EventSource`. The stream is always UTF-8.",
    pitfalls: [
      "Proxies that buffer responses deliver events in batches. On nginx, send `X-Accel-Buffering: no` or turn off `proxy_buffering`.",
    ],
  },

  /* --- image -------------------------------------------------------------- */
  {
    mime: "image/png", ext: ["png"],
    note: "PNG: lossless, with full alpha transparency. Best for screenshots, UI and line art.",
  },
  {
    mime: "image/apng", ext: ["apng"],
    note: "Animated PNG. A PNG decoder that does not know APNG shows the first frame.",
    pitfalls: [
      "Most APNGs use the `.png` extension and are served as image/png. That works in every current browser.",
    ],
  },
  {
    mime: "image/jpeg", ext: ["jpg", "jpeg", "jpe", "jfif"],
    aliases: ["image/jpg", "image/pjpeg"],
    note: "JPEG photos: lossy, with no transparency.",
    pitfalls: [
      "`image/jpg` is not a valid type. The subtype is always `jpeg`, whatever the extension.",
    ],
  },
  {
    mime: "image/webp", ext: ["webp"],
    note: "WebP (RFC 9649): lossy or lossless, with transparency and animation. Supported by every current browser.",
    html: '<source type="image/webp" srcset="photo.webp">',
  },
  {
    mime: "image/avif", ext: ["avif"],
    note: "AVIF, the AV1 image format. Usually smaller than WebP at the same quality.",
    pitfalls: ["Offer a JPEG or WebP fallback with `<picture>` for older browsers."],
    html: '<source type="image/avif" srcset="photo.avif">',
  },
  {
    mime: "image/jxl", ext: ["jxl"],
    note: "JPEG XL. Can losslessly recompress existing JPEGs.",
    pitfalls: ["Browser support is limited (Safari 17 and later). Always keep a fallback in `<picture>`."],
    html: '<source type="image/jxl" srcset="photo.jxl">',
  },
  {
    mime: "image/heic", ext: ["heic"],
    note: "HEIC: HEIF images coded with HEVC, the default photo format on iPhones.",
    pitfalls: ["Only Safari displays HEIC. Convert to JPEG, WebP or AVIF before publishing."],
  },
  {
    mime: "image/heif", ext: ["heif"],
    note: "HEIF, the container that HEIC is one variant of.",
  },
  {
    mime: "image/gif", ext: ["gif"],
    note: "GIF: 256 colours and animation.",
    pitfalls: ["An animated WebP, or a muted looping `<video>`, is usually many times smaller."],
  },
  {
    mime: "image/svg+xml", ext: ["svg", "svgz"],
    note: "SVG vector graphics.",
    pitfalls: [
      "SVG can carry script. An uploaded SVG opened as a document on your origin can run it, so sanitise uploads or serve them with `Content-Disposition: attachment`.",
      "`.svgz` is gzipped SVG and also needs `Content-Encoding: gzip`.",
    ],
    html: '<link rel="icon" href="/icon.svg" type="image/svg+xml">',
  },
  {
    mime: "image/vnd.microsoft.icon", ext: ["ico"],
    aliases: ["image/x-icon"],
    note: "ICO icons, mostly `favicon.ico`.",
    pitfalls: ["`image/x-icon` is far more common in server configs. Browsers accept both."],
    html: '<link rel="icon" href="/favicon.ico" sizes="32x32">',
  },
  {
    mime: "image/bmp", ext: ["bmp"],
    note: "Uncompressed Windows bitmap. Convert to PNG for the web.",
  },
  {
    mime: "image/tiff", ext: ["tif", "tiff"],
    note: "TIFF, for print and scanning. Safari is the only major browser that displays it.",
  },

  /* --- audio -------------------------------------------------------------- */
  {
    mime: "audio/mpeg", ext: ["mp3"],
    aliases: ["audio/mp3"],
    note: "MP3 audio.",
    pitfalls: ["`audio/mp3` is not a registered type. Use audio/mpeg."],
    html: '<source src="track.mp3" type="audio/mpeg">',
  },
  {
    mime: "audio/ogg", ext: ["oga", "ogg", "opus"],
    note: "Ogg audio, usually Vorbis or Opus. `.opus` files are Ogg Opus: add `codecs=opus` in a `<source type>` to be precise.",
    pitfalls: [
      "`.ogg` can also hold video. Use video/ogg for those.",
      "`audio/opus` is for RTP streams (RFC 7587), not for files.",
    ],
    html: '<source src="track.opus" type="audio/ogg; codecs=opus">',
  },
  {
    mime: "audio/flac", ext: ["flac"],
    aliases: ["audio/x-flac"],
    note: "FLAC lossless audio. Older servers send `audio/x-flac`.",
  },
  {
    mime: "audio/wav", ext: ["wav"],
    aliases: ["audio/x-wav", "audio/wave", "audio/vnd.wave"],
    registered: false,
    note: "WAV (RIFF) audio, usually uncompressed PCM.",
    pitfalls: [
      "Browsers expect audio/wav, but the name IANA registered is `audio/vnd.wave`. `audio/x-wav` is also common.",
    ],
  },
  {
    mime: "audio/mp4", ext: ["m4a"],
    aliases: ["audio/x-m4a"],
    note: "AAC or ALAC audio in an MP4 container.",
  },
  {
    mime: "audio/aac", ext: ["aac"],
    aliases: ["audio/x-aac"],
    note: "Raw AAC audio in ADTS framing. Prefer `.m4a` for files people keep.",
  },
  {
    mime: "audio/webm", ext: ["weba"],
    note: "Audio-only WebM, usually Opus. What `MediaRecorder` produces in Chrome and Firefox.",
  },

  /* --- video -------------------------------------------------------------- */
  {
    mime: "video/mp4", ext: ["mp4", "m4v"],
    note: "MP4 video, usually H.264 or H.265 with AAC audio.",
    pitfalls: [
      "Add a `codecs` parameter to `<source type>` so the browser can skip a file it cannot decode without downloading it.",
      "Serve with byte-range support (`Accept-Ranges: bytes`) or seeking breaks, and Safari may refuse to play.",
    ],
    html: '<source src="clip.mp4" type="video/mp4">',
  },
  {
    mime: "video/webm", ext: ["webm"],
    note: "WebM video: VP8, VP9 or AV1, with Opus or Vorbis audio.",
    html: '<source src="clip.webm" type="video/webm">',
  },
  {
    mime: "video/quicktime", ext: ["mov", "qt"],
    note: "QuickTime movies. Other browsers than Safari play a .mov only when its codecs are ones they support.",
  },
  {
    mime: "video/matroska", ext: ["mkv"],
    aliases: ["video/x-matroska"],
    note: "Matroska video (RFC 9559). Older servers send `video/x-matroska`.",
    pitfalls: ["Browser support is patchy. Remux to WebM or MP4 for the web."],
  },
  {
    mime: "video/mp2t", ext: ["ts", "m2ts", "mts"],
    note: "MPEG transport stream, the classic segment format of HLS.",
    pitfalls: [
      "`.ts` is also TypeScript. Many server type maps send it as video/mp2t, so a server exposing raw TypeScript sources needs an explicit override.",
    ],
  },
  {
    mime: "video/ogg", ext: ["ogv"],
    note: "Ogg video (Theora). Largely superseded by WebM.",
  },
  {
    mime: "video/x-msvideo", ext: ["avi"],
    registered: false,
    note: "AVI video. Browsers do not play it; transcode to MP4 or WebM.",
  },

  /* --- font --------------------------------------------------------------- */
  {
    mime: "font/woff2", ext: ["woff2"],
    note: "WOFF 2.0, the web font format to ship. Already Brotli-compressed, so do not gzip it again.",
    pitfalls: [
      "Cross-origin fonts need CORS (`Access-Control-Allow-Origin`), and a font preload needs `crossorigin` even on the same origin.",
    ],
    html: '<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>',
  },
  {
    mime: "font/woff", ext: ["woff"],
    aliases: ["application/font-woff"],
    note: "WOFF 1.0 web font. Only needed for very old browsers.",
    pitfalls: [
      "RFC 8081 (2017) created the `font/` top-level type. `application/font-woff` in old configs still works but is obsolete.",
    ],
  },
  {
    mime: "font/ttf", ext: ["ttf"],
    aliases: ["application/x-font-ttf", "application/font-sfnt"],
    note: "TrueType font. Convert to WOFF2 for the web.",
  },
  {
    mime: "font/otf", ext: ["otf"],
    aliases: ["application/x-font-opentype"],
    note: "OpenType font with CFF outlines. Convert to WOFF2 for the web.",
  },
  {
    mime: "font/collection", ext: ["ttc"],
    note: "A TrueType or OpenType collection: several fonts in one file.",
  },

  /* --- application: data and documents ------------------------------------ */
  {
    mime: "application/json", ext: ["json", "map"],
    aliases: ["text/json"],
    note: "JSON (RFC 8259). JSON exchanged between systems must be UTF-8. Source maps (`.map`) are JSON too.",
    pitfalls: [
      "The type defines no charset parameter. `charset=utf-8` is ignored, so leave it out.",
      "JSON has no comments and no trailing commas; a config file that has them is JSONC or JSON5.",
    ],
  },
  {
    mime: "application/ld+json", ext: ["jsonld"],
    note: "JSON-LD linked data, including schema.org structured data in pages.",
    html: '<script type="application/ld+json">{ "@context": "https://schema.org" }</script>',
  },
  {
    mime: "application/geo+json", ext: ["geojson"],
    note: "GeoJSON (RFC 7946).",
    pitfalls: ["Coordinates are longitude, latitude, in that order. Swapping them is the classic GeoJSON bug."],
  },
  {
    mime: "application/x-ndjson", ext: ["ndjson", "jsonl"],
    registered: false,
    note: "Newline-delimited JSON: one JSON value per line, for logs, bulk APIs and streaming.",
    pitfalls: [
      "Not IANA-registered. `application/x-ndjson` and `application/jsonl` are both seen; pick one and document it.",
    ],
  },
  {
    mime: "application/problem+json", ext: [],
    note: "Machine-readable HTTP API errors (RFC 9457, which replaced RFC 7807).",
  },
  {
    mime: "application/manifest+json", ext: ["webmanifest"],
    note: "Web app manifest for installable PWAs.",
    pitfalls: ["Older guides name it `manifest.json` and serve application/json. Browsers accept both."],
    html: '<link rel="manifest" href="/site.webmanifest">',
  },
  {
    mime: "application/xml", ext: ["xml"],
    aliases: ["text/xml"],
    charset: true,
    note: "Generic XML (RFC 7303). Prefer a specific `+xml` type when one exists.",
    pitfalls: [
      "`text/xml` still works, but RFC 7303 recommends application/xml.",
      "A charset parameter overrides the encoding in the XML declaration, so keep the two in agreement.",
    ],
  },
  {
    mime: "application/rss+xml", ext: ["rss"],
    charset: true,
    registered: false,
    note: "RSS feeds. Universally used but never IANA-registered.",
    html: '<link rel="alternate" type="application/rss+xml" title="Feed" href="/feed.xml">',
  },
  {
    mime: "application/atom+xml", ext: ["atom"],
    charset: true,
    note: "Atom feeds (RFC 4287).",
    html: '<link rel="alternate" type="application/atom+xml" title="Feed" href="/feed.atom">',
  },
  {
    mime: "application/xhtml+xml", ext: ["xhtml", "xht"],
    charset: true,
    note: "XHTML parsed as XML.",
    pitfalls: ["One well-formedness error and the browser shows an error page instead of the document."],
  },
  {
    mime: "application/pdf", ext: ["pdf"],
    note: "PDF documents. Browsers show them inline unless `Content-Disposition: attachment` is set.",
  },
  {
    mime: "application/rtf", ext: ["rtf"],
    aliases: ["text/rtf"],
    note: "Rich Text Format.",
  },
  {
    mime: "application/sql", ext: ["sql"],
    note: "SQL scripts (RFC 6922).",
  },
  {
    mime: "application/vnd.apache.parquet", ext: ["parquet"],
    note: "Apache Parquet columnar data files.",
    pitfalls: ["The registration is recent. Older tools send `application/octet-stream` or `application/x-parquet`."],
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"],
    note: "Word document (Office Open XML). A ZIP inside, but serve it with this type.",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ["xlsx"],
    note: "Excel workbook (Office Open XML).",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ["pptx"],
    note: "PowerPoint presentation (Office Open XML).",
  },
  {
    mime: "application/msword", ext: ["doc"],
    note: "Legacy binary Word document (Word 97–2003).",
  },
  {
    mime: "application/vnd.ms-excel", ext: ["xls"],
    note: "Legacy binary Excel workbook (Excel 97–2003).",
  },
  {
    mime: "application/vnd.oasis.opendocument.text", ext: ["odt"],
    note: "OpenDocument text, as written by LibreOffice Writer.",
  },
  {
    mime: "application/vnd.oasis.opendocument.spreadsheet", ext: ["ods"],
    note: "OpenDocument spreadsheet, as written by LibreOffice Calc.",
  },
  {
    mime: "application/epub+zip", ext: ["epub"],
    note: "EPUB e-book: a ZIP with a fixed internal layout.",
  },

  /* --- application: archives and compression ------------------------------ */
  {
    mime: "application/zip", ext: ["zip"],
    note: "ZIP archive.",
    pitfalls: ["Office documents, EPUB, JAR and APK files are ZIPs inside. Give them their own types."],
  },
  {
    mime: "application/gzip", ext: ["gz", "tgz", "tar.gz"],
    aliases: ["application/x-gzip"],
    note: "A gzip-compressed file (RFC 6713). `.tar.gz` and `.tgz` are gzip-compressed tar archives.",
    pitfalls: [
      "For a download, send application/gzip and no `Content-Encoding`. With `Content-Encoding: gzip` the browser unpacks it and saves the bare tar.",
      "To compress a response on the wire instead, keep its real type and add `Content-Encoding: gzip`.",
    ],
    html: '<input type="file" accept="application/gzip,.gz,.tgz">',
  },
  {
    mime: "application/x-tar", ext: ["tar"],
    registered: false,
    note: "Uncompressed tar archive. There is no registered type; application/x-tar is the de facto one.",
  },
  {
    mime: "application/zstd", ext: ["zst"],
    note: "A Zstandard-compressed file (RFC 8878).",
    pitfalls: ["As an HTTP content coding the token is `zstd`. Use that to compress responses on the fly."],
  },
  {
    mime: "application/x-brotli", ext: ["br"],
    registered: false,
    note: "A Brotli-compressed file. Brotli has no registered file type; `br` is an HTTP content coding (RFC 7932).",
    pitfalls: [
      "Precompressed assets such as `app.js.br` should go out with the original type (`text/javascript`) plus `Content-Encoding: br`, not as a Brotli file.",
    ],
  },
  {
    mime: "application/x-7z-compressed", ext: ["7z"],
    registered: false,
    note: "7-Zip archive.",
  },
  {
    mime: "application/vnd.rar", ext: ["rar"],
    aliases: ["application/x-rar-compressed"],
    note: "RAR archive. Older servers send `application/x-rar-compressed`.",
  },
  {
    mime: "application/java-archive", ext: ["jar"],
    note: "Java archive: a ZIP of class files and a manifest.",
  },
  {
    mime: "application/vnd.android.package-archive", ext: ["apk"],
    note: "Android application package.",
  },

  /* --- application: web platform and media -------------------------------- */
  {
    mime: "application/wasm", ext: ["wasm"],
    note: "WebAssembly modules.",
    pitfalls: ["`WebAssembly.instantiateStreaming()` rejects a response served with any other type."],
  },
  {
    mime: "application/vnd.apple.mpegurl", ext: ["m3u8"],
    aliases: ["application/x-mpegurl"],
    note: "HLS playlists (RFC 8216). `application/x-mpegURL` is the older spelling.",
  },
  {
    mime: "application/dash+xml", ext: ["mpd"],
    note: "MPEG-DASH manifests.",
  },
  {
    mime: "application/x-subrip", ext: ["srt"],
    registered: false,
    note: "SubRip subtitles. There is no registered type.",
    pitfalls: ["`<track>` does not play SRT. Convert it to WebVTT (text/vtt)."],
  },
  {
    mime: "application/octet-stream", ext: ["bin"],
    note: "Arbitrary binary data, and the right fallback when the real type is unknown.",
    pitfalls: [
      "Browsers download it instead of rendering it.",
      "A name with no extension gets no type from the name. Readable files of that kind, such as build scripts, are better served as `text/plain`.",
    ],
  },

  /* --- request bodies ------------------------------------------------------ */
  {
    mime: "application/x-www-form-urlencoded", ext: [],
    note: "The default HTML form body: `key=value` pairs joined by `&`, percent-encoded.",
    pitfalls: ["Spaces encode as `+` in this format, unlike in URL paths."],
  },
  {
    mime: "multipart/form-data", ext: [],
    note: "Form body for file uploads (RFC 7578).",
    pitfalls: [
      "The `boundary` parameter is required. When sending `FormData` with fetch, do not set Content-Type yourself: the browser adds the boundary.",
    ],
  },

  /* --- model --------------------------------------------------------------- */
  {
    mime: "model/gltf+json", ext: ["gltf"],
    note: "glTF 2.0 3D scene as JSON, usually with separate `.bin` buffers and textures.",
  },
  {
    mime: "model/gltf-binary", ext: ["glb"],
    note: "Binary glTF 2.0: scene, buffers and textures in one file.",
  },
]);
