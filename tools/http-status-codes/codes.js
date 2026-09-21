/* HTTP status code reference data.
 *
 * `spec` is the document that currently defines the code — RFC 9110 absorbed
 * most of RFC 7231's definitions in 2022, so a page still citing RFC 2616 is
 * out of date. `use` and `avoid` are the part you cannot get from a table:
 * which code to reach for, and the mistake people actually make with it.
 *
 * `standard: false` marks codes that no RFC defines. They are here because
 * they turn up in real logs, not because you should return them.
 */
globalThis.HTTP_STATUS_CODES = Object.freeze([
  /* --- 1xx informational ------------------------------------------------ */
  {
    code: 100, name: "Continue", group: "1xx",
    summary: "The request headers are acceptable; the client should send the body.",
    use: [
      "Sent automatically by the server when a client sends `Expect: 100-continue` before a large upload.",
      "Lets a client discover a rejected upload (too large, wrong content type) before spending bandwidth on the body.",
    ],
    avoid: ["Do not generate it by hand — it is a transport-level handshake, not an application response."],
    spec: "RFC 9110 §15.2.1", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.2.1",
  },
  {
    code: 101, name: "Switching Protocols", group: "1xx",
    summary: "The server is switching to the protocol the client asked for in `Upgrade`.",
    use: ["The WebSocket handshake: the response to `Upgrade: websocket` is a 101."],
    avoid: ["HTTP/2 does not use it — h2 negotiates over ALPN during the TLS handshake."],
    spec: "RFC 9110 §15.2.2", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.2.2",
  },
  {
    code: 102, name: "Processing", group: "1xx",
    summary: "WebDAV: the server accepted the request but has not finished it.",
    use: ["Keeps a client from timing out during a long WebDAV operation."],
    avoid: ["Deprecated in practice — most clients ignore it. Prefer 103 Early Hints or a job-status resource with 202."],
    spec: "RFC 2518 §10.1", url: "https://www.rfc-editor.org/rfc/rfc2518#section-10.1",
  },
  {
    code: 103, name: "Early Hints", group: "1xx",
    summary: "Preliminary `Link` headers so the client can preload while the real response is prepared.",
    use: [
      "Send `Link: </app.css>; rel=preload` before a slow server-rendered page so the browser fetches assets in parallel.",
      "Measurably improves Largest Contentful Paint on pages with slow origin work.",
    ],
    avoid: ["Only useful over HTTPS with HTTP/2 or later; some intermediaries still drop it."],
    spec: "RFC 8297", url: "https://www.rfc-editor.org/rfc/rfc8297",
  },

  /* --- 2xx success ------------------------------------------------------- */
  {
    code: 200, name: "OK", group: "2xx",
    summary: "The request succeeded and the body carries the result.",
    use: [
      "The default success for GET, HEAD, PUT, PATCH, POST that does not create a resource, and DELETE that returns a body.",
    ],
    avoid: [
      "Do not return 200 with an error object inside. Clients, caches, retries, and monitoring all key on the status line — an error hidden in a 200 body is invisible to every one of them.",
      "Do not use it for a newly created resource; 201 with a `Location` header says more.",
    ],
    spec: "RFC 9110 §15.3.1", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.1",
  },
  {
    code: 201, name: "Created", group: "2xx",
    summary: "The request created one or more new resources.",
    use: [
      "POST that creates a record, or PUT to a URL that did not exist before.",
      "Include a `Location` header pointing at the new resource, and usually its representation in the body.",
    ],
    avoid: ["Do not use it when nothing was created — an update that only modified an existing row is a 200."],
    spec: "RFC 9110 §15.3.2", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.2",
  },
  {
    code: 202, name: "Accepted", group: "2xx",
    summary: "The request was accepted for processing that has not finished.",
    use: [
      "Queued or asynchronous work: import jobs, video encoding, bulk email.",
      "Return a status URL so the client can poll for the outcome — 202 promises nothing about success.",
    ],
    avoid: ["Do not use it as a vague success. If the work is done, say 200 or 204."],
    spec: "RFC 9110 §15.3.3", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.3",
  },
  {
    code: 203, name: "Non-Authoritative Information", group: "2xx",
    summary: "A proxy modified the origin server's 200 response.",
    use: ["Transforming proxies that strip or rewrite content announce it this way."],
    avoid: ["Origin servers should not send it."],
    spec: "RFC 9110 §15.3.4", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.4",
  },
  {
    code: 204, name: "No Content", group: "2xx",
    summary: "Success, and deliberately no body.",
    use: [
      "DELETE that succeeded, PUT/PATCH where the client already knows the new state, and save actions that do not navigate.",
      "Useful for beacons and `fetch` calls whose response you would throw away anyway.",
    ],
    avoid: [
      "A 204 must not carry a body — some servers silently truncate one, and `response.json()` throws on the client.",
      "Do not use it for a GET that found nothing; that is either 200 with an empty list or 404.",
    ],
    spec: "RFC 9110 §15.3.5", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.5",
  },
  {
    code: 205, name: "Reset Content", group: "2xx",
    summary: "Success; the client should clear the form that produced the request.",
    use: ["Data-entry screens where the next action is another blank entry."],
    avoid: ["Rare outside intranet form apps; most SPAs handle this in the client instead."],
    spec: "RFC 9110 §15.3.6", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.6",
  },
  {
    code: 206, name: "Partial Content", group: "2xx",
    summary: "The response carries the byte range the client asked for.",
    use: [
      "Range requests: video scrubbing, resumable downloads, `Range: bytes=0-1023`.",
      "Must include `Content-Range`, and the client must have sent `Range`.",
    ],
    avoid: ["Never send 206 unsolicited — a client that did not ask for a range will treat the partial body as the whole thing."],
    spec: "RFC 9110 §15.3.7", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.3.7",
  },
  {
    code: 207, name: "Multi-Status", group: "2xx",
    summary: "WebDAV: an XML body carrying a separate status for each sub-operation.",
    use: ["Batch operations where parts can succeed and parts can fail independently."],
    avoid: ["The overall 207 is always 'success' — clients must parse the body to learn what actually failed."],
    spec: "RFC 4918 §11.1", url: "https://www.rfc-editor.org/rfc/rfc4918#section-11.1",
  },
  {
    code: 208, name: "Already Reported", group: "2xx",
    summary: "WebDAV: this member was already enumerated earlier in the same multi-status response.",
    use: ["Avoids repeating bindings in a deep PROPFIND."],
    avoid: ["WebDAV-specific; irrelevant to ordinary APIs."],
    spec: "RFC 5842 §7.1", url: "https://www.rfc-editor.org/rfc/rfc5842#section-7.1",
  },
  {
    code: 226, name: "IM Used", group: "2xx",
    summary: "The response is the result of applying delta encodings to the resource.",
    use: ["Delta compression via `A-IM`; essentially unused on the public web."],
    avoid: ["Do not reach for it — ordinary caching headers solve the same problem."],
    spec: "RFC 3229 §10.4.1", url: "https://www.rfc-editor.org/rfc/rfc3229#section-10.4.1",
  },

  /* --- 3xx redirection --------------------------------------------------- */
  {
    code: 300, name: "Multiple Choices", group: "3xx",
    summary: "Several representations exist; the client or user picks one.",
    use: ["Rare. Content negotiation that cannot be resolved server-side."],
    avoid: ["There is no standard format for the choice list, so clients cannot act on it automatically."],
    spec: "RFC 9110 §15.4.1", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.1",
  },
  {
    code: 301, name: "Moved Permanently", group: "3xx",
    summary: "The resource has a new URL; use it from now on.",
    use: [
      "Domain moves, HTTP→HTTPS, trailing-slash canonicalisation, and any URL change you want search engines to follow and consolidate.",
    ],
    avoid: [
      "Browsers cache 301 aggressively and often indefinitely — a wrong one is painful to undo. Test with 302 first, then promote.",
      "301 and 302 historically let clients rewrite POST to GET. If the method must survive, use 308 or 307.",
    ],
    related: [302, 307, 308],
    spec: "RFC 9110 §15.4.2", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.2",
  },
  {
    code: 302, name: "Found", group: "3xx",
    summary: "The resource is temporarily at another URL; keep using this one.",
    use: ["Temporary moves, A/B splits, maintenance pages, post-login bounces where permanence would be wrong."],
    avoid: [
      "Do not use it for a permanent move — search engines will keep the old URL indexed.",
      "Most clients turn the follow-up request into a GET even after a POST. When that matters, use 307.",
    ],
    related: [301, 303, 307],
    spec: "RFC 9110 §15.4.3", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.3",
  },
  {
    code: 303, name: "See Other", group: "3xx",
    summary: "Fetch the result from a different URL, with GET.",
    use: [
      "The POST/redirect/GET pattern: after a form submission, send 303 to the confirmation page so a refresh does not resubmit.",
      "Pointing at the status resource for an asynchronous job.",
    ],
    avoid: ["The follow-up is always GET by design — do not use 303 when the method must be preserved."],
    related: [302, 307],
    spec: "RFC 9110 §15.4.4", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.4",
  },
  {
    code: 304, name: "Not Modified", group: "3xx",
    summary: "The cached copy is still fresh; no body is sent.",
    use: [
      "Answer to a conditional GET carrying `If-None-Match` or `If-Modified-Since`.",
      "The cheapest response you can serve — a matching `ETag` turns a page load into a few hundred bytes of headers.",
    ],
    avoid: [
      "A 304 must not include a body, and must repeat the validators (`ETag`, `Cache-Control`) the client needs next time.",
      "Not an error: seeing them in logs is a sign caching is working.",
    ],
    spec: "RFC 9110 §15.4.5", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.5",
  },
  {
    code: 305, name: "Use Proxy", group: "3xx",
    summary: "Deprecated: the resource must be accessed through a proxy.",
    use: [],
    avoid: ["Deprecated for security reasons — browsers ignore it. Never send it."],
    spec: "RFC 9110 §15.4.6", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.6",
  },
  {
    code: 306, name: "(Unused)", group: "3xx",
    summary: "Reserved. Defined in an earlier draft and never used.",
    use: [],
    avoid: ["The code is permanently reserved — it will never mean anything."],
    spec: "RFC 9110 §15.4.7", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.7",
  },
  {
    code: 307, name: "Temporary Redirect", group: "3xx",
    summary: "Temporary move, and the method and body must be preserved.",
    use: [
      "A temporary redirect after POST, PUT or DELETE where rewriting to GET would lose the request.",
      "The strict version of 302 — same meaning, no method rewriting.",
    ],
    avoid: ["Do not use it for permanent moves; use 308."],
    related: [302, 308],
    spec: "RFC 9110 §15.4.8", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.8",
  },
  {
    code: 308, name: "Permanent Redirect", group: "3xx",
    summary: "Permanent move, and the method and body must be preserved.",
    use: [
      "Permanent API endpoint moves where clients POST or PUT.",
      "The strict version of 301 — search engines treat it the same for ranking purposes.",
    ],
    avoid: ["Like 301, it is cached hard. Be sure before you ship it."],
    related: [301, 307],
    spec: "RFC 9110 §15.4.9", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.4.9",
  },

  /* --- 4xx client errors -------------------------------------------------- */
  {
    code: 400, name: "Bad Request", group: "4xx",
    summary: "The server cannot process the request because of a client-side problem.",
    use: [
      "Malformed JSON, missing required fields, a parameter that cannot be parsed.",
      "The right default when no more specific 4xx fits.",
    ],
    avoid: [
      "Do not use it as a catch-all for every failure. 401, 403, 404, 409 and 422 tell the client what to do differently; 400 does not.",
      "Always say what was wrong in the body — a bare 400 costs the caller an afternoon.",
    ],
    related: [422],
    spec: "RFC 9110 §15.5.1", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.1",
  },
  {
    code: 401, name: "Unauthorized", group: "4xx",
    summary: "Authentication is missing or invalid. Despite the name, it means unauthenticated.",
    use: [
      "No credentials were sent, or the token is expired, malformed, or revoked.",
      "Must include a `WWW-Authenticate` header naming the scheme — that requirement is routinely ignored.",
    ],
    avoid: [
      "Do not use it when the caller is authenticated but lacks permission — that is 403.",
      "Retrying with the same credentials will not help, so clients should re-authenticate rather than back off.",
    ],
    related: [403],
    spec: "RFC 9110 §15.5.2", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2",
  },
  {
    code: 402, name: "Payment Required", group: "4xx",
    summary: "Reserved for future use; in practice, a billing problem.",
    use: ["Some APIs use it for exhausted quota or an unpaid subscription — Stripe and a few others have made this a de-facto convention."],
    avoid: ["No standard semantics exist, so document precisely what you mean by it."],
    spec: "RFC 9110 §15.5.3", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.3",
  },
  {
    code: 403, name: "Forbidden", group: "4xx",
    summary: "The server understood the request and refuses to authorise it.",
    use: [
      "An authenticated user without the required role, a blocked IP, a disabled feature.",
      "Re-authenticating will not help, and the server usually should not say why.",
    ],
    avoid: [
      "Do not use it for missing credentials — that is 401.",
      "Returning 403 for a record the user may not even know exists leaks its existence. Use 404 to hide it.",
    ],
    related: [401, 404],
    spec: "RFC 9110 §15.5.4", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4",
  },
  {
    code: 404, name: "Not Found", group: "4xx",
    summary: "The server has no representation for this URL and will not say whether it ever did.",
    use: [
      "An unknown route, a deleted record, or a resource the caller must not learn exists.",
      "Deliberately ambiguous: it does not distinguish 'never existed' from 'you cannot see it'.",
    ],
    avoid: [
      "Do not use it for a valid collection that happens to be empty — return 200 with an empty array.",
      "If the route itself exists but the method does not, 405 is more helpful.",
    ],
    related: [403, 410, 405],
    spec: "RFC 9110 §15.5.5", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.5",
  },
  {
    code: 405, name: "Method Not Allowed", group: "4xx",
    summary: "The URL exists, but not for this method.",
    use: [
      "A POST to a read-only endpoint, a DELETE on a collection.",
      "Must include an `Allow` header listing the methods that do work.",
    ],
    avoid: ["Omitting `Allow` makes the response strictly less useful than a 404."],
    spec: "RFC 9110 §15.5.6", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6",
  },
  {
    code: 406, name: "Not Acceptable", group: "4xx",
    summary: "No representation matches the client's `Accept` headers.",
    use: ["A client demanding `Accept: application/xml` from a JSON-only endpoint."],
    avoid: ["Serving your default representation anyway is usually kinder than refusing outright — the spec permits it."],
    spec: "RFC 9110 §15.5.7", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.7",
  },
  {
    code: 407, name: "Proxy Authentication Required", group: "4xx",
    summary: "Like 401, but the proxy — not the origin — wants credentials.",
    use: ["Corporate proxies challenging with `Proxy-Authenticate`."],
    avoid: ["Origin servers should never send it."],
    spec: "RFC 9110 §15.5.8", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.8",
  },
  {
    code: 408, name: "Request Timeout", group: "4xx",
    summary: "The client took too long to send the request.",
    use: ["Idle connection reaped by the server; the client may retry on a fresh connection."],
    avoid: ["Do not use it when your own processing was slow — that is 504 (or 503 with `Retry-After`)."],
    related: [504],
    spec: "RFC 9110 §15.5.9", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.9",
  },
  {
    code: 409, name: "Conflict", group: "4xx",
    summary: "The request clashes with the current state of the resource.",
    use: [
      "Duplicate unique key, editing a record that changed underneath you, a state machine refusing the transition.",
      "The body should explain the conflict well enough for the caller to resolve and retry.",
    ],
    avoid: ["Do not use it for plain validation failures — that is 400 or 422."],
    related: [412, 422],
    spec: "RFC 9110 §15.5.10", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.10",
  },
  {
    code: 410, name: "Gone", group: "4xx",
    summary: "The resource existed and is permanently gone.",
    use: [
      "Deliberately retired endpoints and deleted content you want de-indexed quickly.",
      "Stronger than 404: search engines drop a 410 faster, and clients are told not to retry.",
    ],
    avoid: ["Only use it when you are certain the resource will not come back; otherwise 404."],
    related: [404],
    spec: "RFC 9110 §15.5.11", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.11",
  },
  {
    code: 411, name: "Length Required", group: "4xx",
    summary: "The request needs a `Content-Length` header and did not have one.",
    use: ["Servers that refuse chunked uploads."],
    avoid: ["Rare in modern stacks, which accept chunked transfer encoding."],
    spec: "RFC 9110 §15.5.12", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.12",
  },
  {
    code: 412, name: "Precondition Failed", group: "4xx",
    summary: "A conditional header such as `If-Match` did not hold.",
    use: [
      "Optimistic concurrency: the client sends `If-Match: \"etag\"` and you reject the write if the resource has changed.",
      "The standard way to prevent lost updates without locking.",
    ],
    avoid: ["The client needs the current `ETag` to recover — make sure a follow-up GET provides one."],
    related: [409, 428],
    spec: "RFC 9110 §15.5.13", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.13",
  },
  {
    code: 413, name: "Content Too Large", group: "4xx",
    summary: "The request body exceeds what the server will accept.",
    use: ["Upload limits. Include `Retry-After` if the limit is temporary."],
    avoid: [
      "Named 'Payload Too Large' in RFC 7231 — the same code, renamed in RFC 9110.",
      "A reverse proxy often enforces its own smaller limit; check nginx `client_max_body_size` before blaming the app.",
    ],
    spec: "RFC 9110 §15.5.14", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.14",
  },
  {
    code: 414, name: "URI Too Long", group: "4xx",
    summary: "The request target is longer than the server will process.",
    use: ["A GET whose query string outgrew the server limit, commonly around 8 KB."],
    avoid: ["The fix is usually to move the parameters into a POST body, not to raise the limit."],
    spec: "RFC 9110 §15.5.15", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.15",
  },
  {
    code: 415, name: "Unsupported Media Type", group: "4xx",
    summary: "The body's `Content-Type` is not one the endpoint accepts.",
    use: [
      "A form-encoded body sent to a JSON-only endpoint, or an upload of the wrong file type.",
      "Include `Accept-Post` or `Accept-Patch` so the client learns what would work.",
    ],
    avoid: ["Do not confuse it with 406, which is about the response type the client wants."],
    related: [406],
    spec: "RFC 9110 §15.5.16", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.16",
  },
  {
    code: 416, name: "Range Not Satisfiable", group: "4xx",
    summary: "The requested byte range lies outside the resource.",
    use: ["A resumed download whose offset is past the end of a file that shrank."],
    avoid: ["Include `Content-Range: bytes */<length>` so the client can correct itself."],
    related: [206],
    spec: "RFC 9110 §15.5.17", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.17",
  },
  {
    code: 417, name: "Expectation Failed", group: "4xx",
    summary: "The `Expect` header cannot be met.",
    use: ["A proxy that does not support `Expect: 100-continue`."],
    avoid: ["Almost never produced by application code."],
    spec: "RFC 9110 §15.5.18", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.18",
  },
  {
    code: 418, name: "I'm a Teapot", group: "4xx",
    summary: "An April Fools' joke from 1998 that outlived every attempt to remove it.",
    use: ["Nothing serious. Some services use it to bait scrapers."],
    avoid: ["RFC 9110 explicitly reserves it so nobody assigns it a real meaning. Do not build on it."],
    spec: "RFC 2324 §2.3.2", url: "https://www.rfc-editor.org/rfc/rfc2324#section-2.3.2",
  },
  {
    code: 421, name: "Misdirected Request", group: "4xx",
    summary: "This server cannot produce a response for the requested authority.",
    use: ["HTTP/2 connection coalescing sent a request for a host this connection does not serve; the client should open a new connection."],
    avoid: ["Not an application-level error — do not return it from a handler."],
    spec: "RFC 9110 §15.5.20", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.20",
  },
  {
    code: 422, name: "Unprocessable Content", group: "4xx",
    summary: "The syntax is fine, but the content is semantically wrong.",
    use: [
      "Validation failures on a well-formed body: an email that is not an email, an end date before the start date.",
      "The convention in Rails, Laravel and most JSON APIs for field-level validation errors.",
    ],
    avoid: [
      "Was a WebDAV code and is now part of core HTTP in RFC 9110 — it is fine for ordinary APIs.",
      "If the body could not even be parsed, that is 400, not 422.",
    ],
    related: [400, 409],
    spec: "RFC 9110 §15.5.21", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.21",
  },
  {
    code: 423, name: "Locked", group: "4xx",
    summary: "WebDAV: the resource is locked.",
    use: ["Document systems with check-out semantics."],
    avoid: ["For ordinary APIs, 409 communicates the same thing to more clients."],
    spec: "RFC 4918 §11.3", url: "https://www.rfc-editor.org/rfc/rfc4918#section-11.3",
  },
  {
    code: 424, name: "Failed Dependency", group: "4xx",
    summary: "WebDAV: the request failed because an earlier one in the same operation failed.",
    use: ["Dependent steps of a multi-part WebDAV request."],
    avoid: ["Rarely meaningful outside WebDAV."],
    spec: "RFC 4918 §11.4", url: "https://www.rfc-editor.org/rfc/rfc4918#section-11.4",
  },
  {
    code: 425, name: "Too Early", group: "4xx",
    summary: "The server will not risk processing a replayable early-data request.",
    use: ["TLS 1.3 0-RTT: a non-idempotent request arrived in early data and could be a replay."],
    avoid: ["Handled by the TLS layer, not application code."],
    spec: "RFC 8470 §5.2", url: "https://www.rfc-editor.org/rfc/rfc8470#section-5.2",
  },
  {
    code: 426, name: "Upgrade Required", group: "4xx",
    summary: "The client must switch protocols to continue.",
    use: ["Forcing TLS or a newer protocol version; must include an `Upgrade` header."],
    avoid: ["For plain HTTP→HTTPS on the web, a 301 to the https:// URL works with every browser; 426 does not."],
    spec: "RFC 9110 §15.5.22", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.5.22",
  },
  {
    code: 428, name: "Precondition Required", group: "4xx",
    summary: "The server requires the request to be conditional.",
    use: [
      "Refusing a blind PUT so clients must send `If-Match` and cannot silently overwrite someone else's edit.",
    ],
    avoid: ["Only useful if clients know how to recover — document the required header."],
    related: [412],
    spec: "RFC 6585 §3", url: "https://www.rfc-editor.org/rfc/rfc6585#section-3",
  },
  {
    code: 429, name: "Too Many Requests", group: "4xx",
    summary: "The client has been rate limited.",
    use: [
      "Any throttled API. Send `Retry-After` — in seconds or as a date — so clients back off correctly instead of guessing.",
      "Pair it with `RateLimit` headers if you want clients to self-regulate before hitting the wall.",
    ],
    avoid: [
      "Without `Retry-After`, well-behaved clients retry immediately and make the overload worse.",
      "Do not use 503 for rate limiting; 429 says the caller is the problem, not the server.",
    ],
    related: [503],
    spec: "RFC 6585 §4", url: "https://www.rfc-editor.org/rfc/rfc6585#section-4",
  },
  {
    code: 431, name: "Request Header Fields Too Large", group: "4xx",
    summary: "The headers are too big — often one oversized cookie.",
    use: ["Servers protecting themselves from unbounded header growth."],
    avoid: ["Usually fixed by shrinking or clearing cookies, not by raising the server limit."],
    spec: "RFC 6585 §5", url: "https://www.rfc-editor.org/rfc/rfc6585#section-5",
  },
  {
    code: 451, name: "Unavailable For Legal Reasons", group: "4xx",
    summary: "Access is denied because of a legal demand.",
    use: [
      "Court-ordered takedowns, geo-blocking under local law, DMCA removals.",
      "Should include a `Link` header with `rel=\"blocked-by\"` identifying who imposed the block.",
    ],
    avoid: ["Not for ordinary geo-fencing of licensed content — 403 is the honest answer there."],
    spec: "RFC 7725", url: "https://www.rfc-editor.org/rfc/rfc7725",
  },
  {
    code: 499, name: "Client Closed Request", group: "4xx", standard: false,
    summary: "nginx's code for a client that disconnected before the response was sent.",
    use: ["Appears in nginx access logs; nothing is sent on the wire — the connection is already gone."],
    avoid: ["Non-standard. A spike usually means slow upstreams and impatient clients, not a client bug."],
    spec: "nginx (non-standard)", url: "https://www.nginx.com/resources/wiki/",
  },

  /* --- 5xx server errors -------------------------------------------------- */
  {
    code: 500, name: "Internal Server Error", group: "5xx",
    summary: "The server hit an unexpected condition. The default for an unhandled exception.",
    use: [
      "Genuine bugs and crashes — anything you did not anticipate.",
      "Log the detail server-side and return an opaque message with a correlation id.",
    ],
    avoid: [
      "Do not use it for predictable failures. A validation error returned as 500 will page an on-call engineer at 3am.",
      "Never leak stack traces to clients.",
    ],
    spec: "RFC 9110 §15.6.1", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.1",
  },
  {
    code: 501, name: "Not Implemented", group: "5xx",
    summary: "The server does not support the functionality the request needs.",
    use: ["An unrecognised method, or a planned endpoint that is not built yet."],
    avoid: ["If the URL simply does not accept this method, 405 is more precise."],
    related: [405],
    spec: "RFC 9110 §15.6.2", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.2",
  },
  {
    code: 502, name: "Bad Gateway", group: "5xx",
    summary: "A proxy got an invalid response from the upstream server.",
    use: ["The load balancer's answer when the app tier returns garbage, dies mid-response, or is not listening."],
    avoid: [
      "Applications should not return it themselves — it is a statement about the hop in front of them.",
      "Debug it from the proxy's logs; the client-visible 502 almost never says what actually broke.",
    ],
    related: [503, 504],
    spec: "RFC 9110 §15.6.3", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.3",
  },
  {
    code: 503, name: "Service Unavailable", group: "5xx",
    summary: "The server is temporarily unable to handle the request.",
    use: [
      "Planned maintenance, overload shedding, a dependency that is down. Send `Retry-After`.",
      "The only 5xx that tells a client the failure is expected to be temporary — search engines will hold a ranking through a short 503.",
    ],
    avoid: ["Do not use it for rate limiting a specific client; that is 429."],
    related: [429, 502],
    spec: "RFC 9110 §15.6.4", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.4",
  },
  {
    code: 504, name: "Gateway Timeout", group: "5xx",
    summary: "A proxy timed out waiting for the upstream server.",
    use: ["The upstream is alive but too slow — a long query, a stuck lock, an exhausted pool."],
    avoid: [
      "The proxy's timeout is often shorter than the app's; raising only the app's changes nothing.",
      "Retrying a non-idempotent request after a 504 can duplicate work that actually completed.",
    ],
    related: [502, 408],
    spec: "RFC 9110 §15.6.5", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.5",
  },
  {
    code: 505, name: "HTTP Version Not Supported", group: "5xx",
    summary: "The server refuses the HTTP version in the request.",
    use: ["Servers rejecting HTTP/0.9 or a malformed version string."],
    avoid: ["Usually a sign of a malformed request or a port speaking the wrong protocol."],
    spec: "RFC 9110 §15.6.6", url: "https://www.rfc-editor.org/rfc/rfc9110#section-15.6.6",
  },
  {
    code: 506, name: "Variant Also Negotiates", group: "5xx",
    summary: "Transparent content negotiation is misconfigured and loops.",
    use: ["Effectively unused."],
    avoid: ["Indicates a server configuration error, not a client problem."],
    spec: "RFC 2295 §8.1", url: "https://www.rfc-editor.org/rfc/rfc2295#section-8.1",
  },
  {
    code: 507, name: "Insufficient Storage", group: "5xx",
    summary: "WebDAV: not enough room to complete the request.",
    use: ["Storage backends out of quota or disk."],
    avoid: ["For quota limits you expect and bill for, 413 or 402 communicates intent better."],
    spec: "RFC 4918 §11.5", url: "https://www.rfc-editor.org/rfc/rfc4918#section-11.5",
  },
  {
    code: 508, name: "Loop Detected", group: "5xx",
    summary: "WebDAV: the server detected an infinite loop while processing.",
    use: ["Cyclic bindings in a deep PROPFIND."],
    avoid: ["WebDAV-specific."],
    spec: "RFC 5842 §7.2", url: "https://www.rfc-editor.org/rfc/rfc5842#section-7.2",
  },
  {
    code: 510, name: "Not Extended", group: "5xx",
    summary: "The request needs further extensions to be processed.",
    use: ["Obsolete extension framework; no practical use."],
    avoid: ["The defining RFC has been reclassified as historic."],
    spec: "RFC 2774 §7", url: "https://www.rfc-editor.org/rfc/rfc2774#section-7",
  },
  {
    code: 511, name: "Network Authentication Required", group: "5xx",
    summary: "A captive portal wants the client to log in to the network.",
    use: ["Hotel and airport Wi-Fi gateways, so clients can detect the portal rather than seeing corrupted pages."],
    avoid: ["Origin servers must not send it — only the intercepting network device should."],
    spec: "RFC 6585 §6", url: "https://www.rfc-editor.org/rfc/rfc6585#section-6",
  },
  {
    code: 520, name: "Web Server Returned an Unknown Error", group: "5xx", standard: false,
    summary: "Cloudflare: the origin returned something Cloudflare could not interpret.",
    use: ["Seen when the origin sends an empty, malformed, or oversized response."],
    avoid: ["Non-standard. Check the origin's own logs — Cloudflare is only reporting what it received."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
  {
    code: 521, name: "Web Server Is Down", group: "5xx", standard: false,
    summary: "Cloudflare: the origin refused the connection.",
    use: ["The origin is offline or is blocking Cloudflare's IP ranges."],
    avoid: ["Non-standard. Usually a firewall rule rather than a crashed server."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
  {
    code: 522, name: "Connection Timed Out", group: "5xx", standard: false,
    summary: "Cloudflare: the TCP handshake with the origin never completed.",
    use: ["Network path problems, an overloaded origin, or dropped SYN packets."],
    avoid: ["Non-standard. Distinct from 524 — here the connection was never established."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
  {
    code: 523, name: "Origin Is Unreachable", group: "5xx", standard: false,
    summary: "Cloudflare: the origin could not be routed to at all.",
    use: ["Broken DNS records or a decommissioned origin IP."],
    avoid: ["Non-standard. Check that the DNS record points somewhere that still exists."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
  {
    code: 524, name: "A Timeout Occurred", group: "5xx", standard: false,
    summary: "Cloudflare: the origin connected but did not answer within the timeout.",
    use: ["Long-running requests that exceed Cloudflare's 100-second proxy limit."],
    avoid: ["Non-standard. Move slow work to a background job — raising the limit is rarely possible."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
  {
    code: 525, name: "SSL Handshake Failed", group: "5xx", standard: false,
    summary: "Cloudflare: the TLS handshake with the origin failed.",
    use: ["Cipher or protocol mismatch between Cloudflare and the origin."],
    avoid: ["Non-standard. Usually an origin certificate or TLS-version problem."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
  {
    code: 526, name: "Invalid SSL Certificate", group: "5xx", standard: false,
    summary: "Cloudflare: the origin's certificate could not be validated.",
    use: ["Expired, self-signed, or hostname-mismatched origin certificates in Full (strict) mode."],
    avoid: ["Non-standard. Fix the origin certificate rather than lowering the SSL mode."],
    spec: "Cloudflare (non-standard)", url: "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/",
  },
]);
