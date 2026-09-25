// Docker Run → Compose Converter — turn one or more `docker run` commands into
// a docker-compose.yml, and say out loud about anything that did not map.
//
// The input is tokenised the way a POSIX shell would: quotes, backslash
// escapes and line continuations (`\`, PowerShell's backtick and cmd's `^`)
// all behave as they do when the command is run. That matters for `$`:
// Compose interpolates `$VAR` itself, so a `$` the shell would have expanded
// is left as-is, while one the shell would have kept literal (inside single
// quotes, or escaped) is written as `$$` so Compose keeps it literal too.
//
// YAML is emitted by js-yaml, which quotes values such as `22:22` that older
// YAML 1.1 parsers (including the one in docker-compose v1) would read as
// base-60 numbers.

const inputEditor = document.getElementById("input-editor");
const outputEditor = document.getElementById("output-editor");
const inputStatus = document.getElementById("input-status");
const outputStatus = document.getElementById("output-status");
const notesList = document.getElementById("notes-list");
const notesPanel = document.getElementById("notes-panel");
const notesCount = document.getElementById("notes-count");

const SAMPLE = `docker network create backend

docker run -d --name db \\
  --network backend \\
  -e POSTGRES_USER=app \\
  -e POSTGRES_PASSWORD='s3cr3t$' \\
  -v pgdata:/var/lib/postgresql/data \\
  --health-cmd "pg_isready -U app" --health-interval 10s --health-retries 5 \\
  --restart unless-stopped \\
  postgres:16-alpine

docker run -d --name web -p 8080:80 -p 127.0.0.1:9229:9229 \\
  --network backend --network-alias api \\
  --env-file .env -e NODE_ENV=production \\
  -v "$PWD/config:/app/config:ro" \\
  --memory 512m --cpus 1.5 --restart=always \\
  ghcr.io/acme/web:2.3 node server.js --port 80`;

class ConvertError extends Error {}

/* --- Shell tokenising ----------------------------------------------------- */

// `$` that the shell would not have expanded, doubled so Compose leaves it be.
const literalDollars = (text) => text.replace(/\$/g, () => "$$");

// Returns commands as arrays of words. Separators (newline, `;`, `&&`, `||`,
// `|`, `&`) end a command; comments run to the end of the line.
function splitCommands(text) {
  const commands = [];
  let words = [];
  let word = null;
  let index = 0;

  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  const isContinuation = (at) => text[at + 1] === "\n" || (text[at + 1] === "\r" && text[at + 2] === "\n");
  const skipContinuation = (at) => at + (text[at + 1] === "\r" ? 3 : 2);

  while (index < text.length) {
    const char = text[index];

    if ((char === "\\" || char === "`" || char === "^") && isContinuation(index)) {
      index = skipContinuation(index);
      continue;
    }
    if (char === "\\") {
      const next = text[index + 1] ?? "";
      word = (word ?? "") + (next === "$" ? "$$" : next);
      index += 2;
      continue;
    }
    if (char === "'") {
      const end = text.indexOf("'", index + 1);
      if (end < 0) throw new ConvertError("Unterminated single quote");
      word = (word ?? "") + literalDollars(text.slice(index + 1, end));
      index = end + 1;
      continue;
    }
    if (char === '"') {
      let value = "";
      index += 1;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === "\\" && isContinuation(index)) {
          index = skipContinuation(index);
          continue;
        }
        if (text[index] === "\\" && '$`"\\'.includes(text[index + 1])) {
          value += text[index + 1] === "$" ? "$$" : text[index + 1];
          index += 2;
          continue;
        }
        value += text[index];
        index += 1;
      }
      if (index >= text.length) throw new ConvertError("Unterminated double quote");
      word = (word ?? "") + value;
      index += 1;
      continue;
    }
    if (char === "#" && word === null) {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "\n" || char === ";") {
      endCommand();
      index += 1;
      continue;
    }
    if (char === "&" || char === "|") {
      endCommand();
      index += text[index + 1] === char ? 2 : 1;
      continue;
    }
    if (char === " " || char === "\t" || char === "\r") {
      endWord();
      index += 1;
      continue;
    }
    word = (word ?? "") + char;
    index += 1;
  }
  endCommand();
  return commands;
}

/* --- Option table --------------------------------------------------------- */

const list = (key) => (svc, value) => {
  (svc[key] ||= []).push(value);
};
const scalar = (key, transform = (v) => v) => (svc, value) => {
  svc[key] = transform(value);
};
const flag = (key) => (svc) => {
  svc[key] = true;
};
const int = (value) => (/^-?\d+$/.test(value) ? Number(value) : value);
const num = (value) => (/^\d+(\.\d+)?$/.test(value) ? Number(value) : value);

function splitPair(text, separator = "=") {
  const at = text.indexOf(separator);
  return at < 0 ? [text, null] : [text.slice(0, at), text.slice(at + separator.length)];
}

const mapEntry = (key) => (svc, value) => {
  const [name, entry] = splitPair(value);
  (svc[key] ||= {})[name] = entry ?? "";
};

function addEnvironment(svc, value) {
  (svc.environment ||= []).push(value);
}

// A volume source without a slash, dot or tilde is a named volume, which
// Compose needs declared at the top level. `C:\data` and `$PWD/x` are paths.
function isNamedVolume(source) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source) && !/^[A-Za-z]$/.test(source);
}

// Compose resolves relative bind paths against the compose file's directory,
// which is what `$PWD` meant on the command line.
const CWD_PREFIX = /^(?:\$PWD|\$\{PWD\}|\$\(pwd\)|`pwd`)(?=\/|:|$)/;

function addVolume(svc, rawValue, ctx) {
  let value = rawValue;
  const cwd = CWD_PREFIX.exec(value);
  if (cwd) {
    value = value.replace(CWD_PREFIX, ".");
    ctx.note("info", `${cwd[0]} became . — Compose resolves relative paths from the compose file's folder`);
  }
  const drive = /^[A-Za-z]:[\\/]/.test(value) ? 2 : 0;
  const colon = value.indexOf(":", drive);
  const source = colon < 0 ? null : value.slice(0, colon);
  if (source && isNamedVolume(source)) ctx.volumes.add(source);
  (svc.volumes ||= []).push(value);
}

function addMount(svc, value, ctx) {
  const mount = {};
  const extra = {};
  for (const part of value.split(",")) {
    const [key, entry] = splitPair(part.trim());
    const name = key.toLowerCase();
    if (name === "type") mount.type = entry;
    else if (name === "source" || name === "src") mount.source = entry;
    else if (name === "target" || name === "dst" || name === "destination") mount.target = entry;
    else if (name === "readonly" || name === "ro") mount.read_only = entry === null || entry === "true" || entry === "1";
    else if (name === "bind-propagation") (extra.bind ||= {}).propagation = entry;
    else if (name === "tmpfs-size") (extra.tmpfs ||= {}).size = num(entry);
    else if (name === "tmpfs-mode") (extra.tmpfs ||= {}).mode = int(entry);
    else if (name === "volume-nocopy") (extra.volume ||= {}).nocopy = entry === null || entry === "true";
    else if (name === "volume-subpath") (extra.volume ||= {}).subpath = entry;
    else ctx.note("warning", `--mount option "${key}" has no Compose equivalent and was dropped`);
  }
  mount.type ||= "volume";
  if (mount.type === "volume" && mount.source) ctx.volumes.add(mount.source);
  const ordered = { type: mount.type };
  if (mount.source) ordered.source = mount.source;
  if (mount.target) ordered.target = mount.target;
  if (mount.read_only) ordered.read_only = true;
  Object.assign(ordered, extra);
  (svc.volumes ||= []).push(ordered);
}

function addNetwork(svc, value, ctx) {
  const [name, options] = splitPair(value, ",");
  if (options) ctx.note("warning", `Options on --network ${value} were dropped; set them under networks: in the output`);
  if (name === "host" || name === "none" || name.startsWith("container:")) {
    svc.network_mode = name;
    if (name.startsWith("container:")) ctx.links.push(name.slice("container:".length));
    return;
  }
  if (name === "bridge" || name === "default") {
    ctx.note("info", "--network bridge: Compose attaches services to a project network by default, so it was left out");
    return;
  }
  ctx.networks.add(name);
  (svc.networks ||= {})[name] ||= null;
}

// --network-alias, --ip and --ip6 may come before or after --network, so they
// are collected here and attached to the network once parsing is done.
function networkOption(key, option) {
  return (svc, value) => {
    (svc.__networkOptions ||= []).push({ key, option, value });
  };
}

function addHealth(key, transform = (v) => v) {
  return (svc, value) => {
    (svc.healthcheck ||= {})[key] = transform(value);
  };
}

// `--device-read-bps /dev/sda:1mb` → blkio_config.device_read_bps: [{ path, rate }].
// The value's last colon splits path from rate, so `C:` style paths survive.
function blkioDevice(option, key, field) {
  return (svc, value, ctx) => {
    const at = value.lastIndexOf(":");
    if (at <= 0) {
      ctx.note("warning", `--${option} ${value} is not PATH:${field.toUpperCase()} and was dropped`);
      return;
    }
    const entry = { path: value.slice(0, at), [field]: int(value.slice(at + 1)) };
    ((svc.blkio_config ||= {})[key] ||= []).push(entry);
  };
}

function addLogOption(svc, value) {
  const [name, entry] = splitPair(value);
  ((svc.logging ||= {}).options ||= {})[name] = entry ?? "";
}

function addUlimit(svc, value) {
  const [name, limits] = splitPair(value);
  const [soft, hard] = String(limits ?? "").split(":");
  (svc.ulimits ||= {})[name] = hard === undefined ? int(soft) : { soft: int(soft), hard: int(hard) };
}

function addGpus(svc, value) {
  const device = { driver: "nvidia" };
  const text = value.replace(/^"|"$/g, "");
  if (text === "all") device.count = "all";
  else if (/^\d+$/.test(text)) device.count = Number(text);
  else {
    for (const part of text.split(",")) {
      const [key, entry] = splitPair(part);
      if (key === "device") device.device_ids = entry.split(/[,\s]+/).filter(Boolean);
      else if (key === "driver") device.driver = entry;
      else if (key === "capabilities") device.capabilities = entry.split(/[,\s]+/).filter(Boolean);
      else if (key === "count") device.count = entry === "all" ? "all" : int(entry);
      else if (/^\d+$/.test(key) && device.device_ids) device.device_ids.push(key);
    }
  }
  device.capabilities ||= ["gpu"];
  svc.__gpus = device;
}

const ignore = (reason) => (svc, value, ctx) => ctx.note("info", reason);
const unsupported = (option, why) => (svc, value, ctx) => ctx.note("warning", `${option}${value === true ? "" : ` ${value}`} ${why}`);

// name → [takesValue, handler]. Short aliases are listed in SHORT below.
const OPTIONS = {
  "add-host": [true, list("extra_hosts")],
  "annotation": [true, mapEntry("annotations")],
  "attach": [true, ignore("--attach only affects the terminal and was left out")],
  "blkio-weight": [true, (svc, v) => { (svc.blkio_config ||= {}).weight = int(v); }],
  // Without these entries the flag was "unknown", so its value was then read
  // as the image name and the real image became part of the command.
  "blkio-weight-device": [true, blkioDevice("blkio-weight-device", "weight_device", "weight")],
  "device-read-bps": [true, blkioDevice("device-read-bps", "device_read_bps", "rate")],
  "device-read-iops": [true, blkioDevice("device-read-iops", "device_read_iops", "rate")],
  "device-write-bps": [true, blkioDevice("device-write-bps", "device_write_bps", "rate")],
  "device-write-iops": [true, blkioDevice("device-write-iops", "device_write_iops", "rate")],
  "cap-add": [true, list("cap_add")],
  "cap-drop": [true, list("cap_drop")],
  "cgroup-parent": [true, scalar("cgroup_parent")],
  "cgroupns": [true, scalar("cgroup")],
  "cidfile": [true, unsupported("--cidfile", "has no Compose equivalent and was dropped")],
  "cpu-count": [true, scalar("cpu_count", int)],
  "cpu-percent": [true, scalar("cpu_percent", int)],
  "cpu-period": [true, scalar("cpu_period", int)],
  "cpu-quota": [true, scalar("cpu_quota", int)],
  "cpu-rt-period": [true, scalar("cpu_rt_period", int)],
  "cpu-rt-runtime": [true, scalar("cpu_rt_runtime", int)],
  "cpu-shares": [true, scalar("cpu_shares", int)],
  "cpus": [true, scalar("cpus", num)],
  "cpuset-cpus": [true, scalar("cpuset")],
  "cpuset-mems": [true, unsupported("--cpuset-mems", "has no Compose equivalent and was dropped")],
  "detach": [false, () => {}],
  "detach-keys": [true, ignore("--detach-keys only affects the terminal and was left out")],
  "device": [true, list("devices")],
  "device-cgroup-rule": [true, list("device_cgroup_rules")],
  "disable-content-trust": [false, () => {}],
  "dns": [true, list("dns")],
  "dns-option": [true, list("dns_opt")],
  "dns-opt": [true, list("dns_opt")],
  "dns-search": [true, list("dns_search")],
  "domainname": [true, scalar("domainname")],
  "entrypoint": [true, (svc, v) => { svc.entrypoint = [v]; }],
  "env": [true, addEnvironment],
  "env-file": [true, list("env_file")],
  "expose": [true, list("expose")],
  "gpus": [true, addGpus],
  "group-add": [true, list("group_add")],
  "health-cmd": [true, addHealth("test", (v) => ["CMD-SHELL", v])],
  "health-interval": [true, addHealth("interval")],
  "health-retries": [true, addHealth("retries", int)],
  "health-start-interval": [true, addHealth("start_interval")],
  "health-start-period": [true, addHealth("start_period")],
  "health-timeout": [true, addHealth("timeout")],
  "hostname": [true, scalar("hostname")],
  "init": [false, flag("init")],
  "interactive": [false, flag("stdin_open")],
  "ip": [true, networkOption("ipv4_address", "--ip")],
  "ip6": [true, networkOption("ipv6_address", "--ip6")],
  "ipc": [true, scalar("ipc")],
  "isolation": [true, scalar("isolation")],
  "kernel-memory": [true, unsupported("--kernel-memory", "is deprecated and has no Compose equivalent; dropped")],
  "label": [true, mapEntry("labels")],
  "label-file": [true, unsupported("--label-file", "has no Compose equivalent; copy the labels into labels: by hand")],
  "link": [true, (svc, v, ctx) => { list("links")(svc, v); ctx.links.push(splitPair(v, ":")[0]); }],
  "link-local-ip": [true, unsupported("--link-local-ip", "must be set under the service's networks: entry by hand")],
  "log-driver": [true, (svc, v) => { (svc.logging ||= {}).driver = v; }],
  "log-opt": [true, addLogOption],
  "mac-address": [true, scalar("mac_address")],
  "memory": [true, scalar("mem_limit")],
  "memory-reservation": [true, scalar("mem_reservation")],
  "memory-swap": [true, scalar("memswap_limit", (v) => (v === "-1" ? -1 : v))],
  "memory-swappiness": [true, scalar("mem_swappiness", int)],
  "mount": [true, addMount],
  "name": [true, (svc, v) => { svc.container_name = v; }],
  "net": [true, addNetwork],
  "network": [true, addNetwork],
  "network-alias": [true, networkOption("aliases", "--network-alias")],
  "alias": [true, networkOption("aliases", "--alias")],
  "no-healthcheck": [false, (svc) => { svc.healthcheck = { disable: true }; }],
  "oom-kill-disable": [false, flag("oom_kill_disable")],
  "oom-score-adj": [true, scalar("oom_score_adj", int)],
  "pid": [true, scalar("pid")],
  "pids-limit": [true, scalar("pids_limit", int)],
  "platform": [true, scalar("platform")],
  "privileged": [false, flag("privileged")],
  "publish": [true, list("ports")],
  "publish-all": [false, unsupported("--publish-all (-P)", "maps every EXPOSEd port to a random host port; Compose has no equivalent, so list the ports under ports:")],
  "pull": [true, scalar("pull_policy")],
  "quiet": [false, () => {}],
  "read-only": [false, flag("read_only")],
  "restart": [true, scalar("restart")],
  "rm": [false, ignore("--rm has no Compose equivalent; `docker compose down` removes the containers")],
  "runtime": [true, scalar("runtime")],
  "security-opt": [true, list("security_opt")],
  "shm-size": [true, scalar("shm_size")],
  "sig-proxy": [true, () => {}],
  "stop-signal": [true, scalar("stop_signal")],
  "stop-timeout": [true, scalar("stop_grace_period", (v) => (/^\d+$/.test(v) ? `${v}s` : v))],
  "storage-opt": [true, mapEntry("storage_opt")],
  "sysctl": [true, mapEntry("sysctls")],
  "tmpfs": [true, list("tmpfs")],
  "tty": [false, flag("tty")],
  "ulimit": [true, addUlimit],
  "user": [true, scalar("user")],
  "userns": [true, scalar("userns_mode")],
  "uts": [true, scalar("uts")],
  "volume": [true, addVolume],
  "volume-driver": [true, unsupported("--volume-driver", "must be set per volume under the top-level volumes: key")],
  "volumes-from": [true, (svc, v, ctx) => { list("volumes_from")(svc, v); ctx.links.push(splitPair(v, ":")[0]); }],
  "workdir": [true, scalar("working_dir")],
};

const SHORT = {
  a: "attach", c: "cpu-shares", d: "detach", e: "env", h: "hostname", i: "interactive",
  l: "label", m: "memory", p: "publish", P: "publish-all", q: "quiet", t: "tty",
  u: "user", v: "volume", w: "workdir",
};

// Boolean flags docker accepts as `--flag=false`.
function truthy(value) {
  return value === null || !/^(false|0)$/i.test(value);
}

/* --- Command parsing ------------------------------------------------------ */

const ENGINES = new Set(["docker", "podman", "nerdctl"]);

// Finds where the `run` arguments begin, or null if this is not a run.
function runArgsStart(words) {
  let index = 0;
  while (words[index] === "sudo" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) index += 1;
  const engine = (words[index] ?? "").split("/").pop();
  if (!ENGINES.has(engine)) return null;
  index += 1;
  if (words[index] === "container") index += 1;
  if (words[index] === "run" || words[index] === "create") return index + 1;
  return null;
}

function describeSkipped(words) {
  const text = words.join(" ");
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function parseRun(words, start, ctx) {
  const svc = {};
  let index = start;

  const apply = (name, value, display) => {
    const spec = OPTIONS[name];
    if (!spec) {
      ctx.note("warning", `Unknown option ${display} was not converted`);
      return;
    }
    const [takesValue, handler] = spec;
    if (takesValue) handler(svc, value, ctx);
    else if (truthy(value)) handler(svc, true, ctx);
  };

  while (index < words.length) {
    const word = words[index];
    if (word === "--") {
      index += 1;
      break;
    }
    if (word.startsWith("--") && word.length > 2) {
      const [name, inline] = splitPair(word.slice(2));
      const spec = OPTIONS[name];
      index += 1;
      if (spec?.[0] && inline === null) {
        if (index >= words.length) throw new ConvertError(`--${name} needs a value`);
        apply(name, words[index], word);
        index += 1;
      } else {
        apply(name, inline, word);
      }
      continue;
    }
    if (word.startsWith("-") && word.length > 1) {
      index += 1;
      for (let at = 1; at < word.length; at += 1) {
        const name = SHORT[word[at]];
        if (!name) {
          ctx.note("warning", `Unknown option -${word[at]} was not converted`);
          continue;
        }
        if (OPTIONS[name][0]) {
          let value = word.slice(at + 1).replace(/^=/, "");
          if (!value) {
            if (index >= words.length) throw new ConvertError(`-${word[at]} needs a value`);
            value = words[index];
            index += 1;
          }
          apply(name, value, `-${word[at]}`);
          break;
        }
        apply(name, null, `-${word[at]}`);
      }
      continue;
    }
    break;
  }

  if (index >= words.length) throw new ConvertError("No image given");
  svc.image = words[index];
  const command = words.slice(index + 1);
  if (command.length) svc.command = command;
  return svc;
}

/* --- Assembly ------------------------------------------------------------- */

// Compose's own ordering conventions: identity first, then how it runs, then
// what it is wired to, then limits.
const KEY_ORDER = [
  "image", "container_name", "platform", "pull_policy", "command", "entrypoint", "working_dir", "user",
  "hostname", "domainname", "restart", "init", "stdin_open", "tty", "privileged", "read_only",
  "environment", "env_file", "ports", "expose", "volumes", "volumes_from", "tmpfs", "networks",
  "network_mode", "links", "depends_on", "extra_hosts", "dns", "dns_search", "dns_opt", "mac_address",
  "labels", "annotations", "healthcheck", "logging", "cap_add", "cap_drop", "security_opt", "devices",
  "device_cgroup_rules", "group_add", "sysctls", "ulimits", "mem_limit", "mem_reservation",
  "memswap_limit", "mem_swappiness", "oom_kill_disable", "oom_score_adj", "cpus", "cpu_shares",
  "cpuset", "cpu_count", "cpu_percent", "cpu_period", "cpu_quota", "cpu_rt_period", "cpu_rt_runtime",
  "pids_limit", "shm_size", "blkio_config", "pid", "ipc", "uts", "userns_mode", "cgroup",
  "cgroup_parent", "isolation", "runtime", "storage_opt", "stop_signal", "stop_grace_period", "deploy",
];

function orderKeys(svc) {
  const ordered = {};
  for (const key of KEY_ORDER) if (svc[key] !== undefined) ordered[key] = svc[key];
  for (const key of Object.keys(svc)) if (!(key in ordered) && !key.startsWith("__")) ordered[key] = svc[key];
  return ordered;
}

// `ghcr.io/acme/web:2.3` → `web`. Compose service names allow [A-Za-z0-9._-].
function serviceNameFrom(svc) {
  const base = svc.container_name || svc.image.split("@")[0].split("/").pop().split(":")[0];
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-._]+|[-._]+$/g, "") || "app";
}

function finishService(svc, ctx) {
  // Docker attaches these to the network named by --network; with several,
  // the first is the one `docker run` itself connects at start.
  const target = svc.networks && Object.keys(svc.networks)[0];
  for (const { key, option, value } of svc.__networkOptions || []) {
    if (!target) {
      ctx.note("warning", `${option} ${value} needs a user-defined --network to attach to and was dropped`);
      continue;
    }
    const entry = (svc.networks[target] ||= {});
    if (key === "aliases") (entry.aliases ||= []).push(value);
    else entry[key] = value;
  }

  // A list with only KEY=VALUE entries reads better as a map. KEY alone means
  // "pass through from the host", which only the list form can express.
  if (svc.environment && svc.environment.every((entry) => entry.includes("="))) {
    svc.environment = Object.fromEntries(svc.environment.map((entry) => splitPair(entry)));
  }
  if (svc.networks && Object.values(svc.networks).every((entry) => entry === null)) {
    svc.networks = Object.keys(svc.networks);
  }
  if (svc.__gpus) {
    svc.deploy = { resources: { reservations: { devices: [svc.__gpus] } } };
  }
  if (svc.logging) svc.logging = { driver: svc.logging.driver, options: svc.logging.options };
  if (svc.logging && !svc.logging.driver) delete svc.logging.driver;
  if (svc.logging && !svc.logging.options) delete svc.logging.options;
  return svc;
}

function convert(text) {
  const notes = [];
  const services = {};
  const volumes = new Set();
  const networks = new Set();
  const links = new Map();
  let runs = 0;

  for (const words of splitCommands(text)) {
    const start = runArgsStart(words);
    if (start === null) {
      const engine = words[0] === "sudo" ? words[1] : words[0];
      const isNetworkCreate = ENGINES.has(engine) && words.includes("network") && words.includes("create");
      if (isNetworkCreate) continue;
      notes.push({ level: "info", service: null, message: `Skipped a command that is not docker run: ${describeSkipped(words)}` });
      continue;
    }

    const serviceNotes = [];
    const ctx = {
      volumes,
      networks,
      links: [],
      note: (level, message) => serviceNotes.push({ level, message }),
    };
    const svc = finishService(parseRun(words, start, ctx), ctx);
    runs += 1;

    let name = serviceNameFrom(svc);
    if (services[name]) {
      let suffix = 2;
      while (services[`${name}-${suffix}`]) suffix += 1;
      serviceNotes.push({ level: "info", message: `Renamed to ${name}-${suffix}: another service is already called ${name}` });
      name = `${name}-${suffix}`;
    }
    services[name] = svc;
    links.set(name, ctx.links);
    for (const note of serviceNotes) notes.push({ ...note, service: name });
  }

  if (!runs) throw new ConvertError("No docker run command found");

  // Containers referenced by --link, --volumes-from or --network container:
  // must start first; Compose expresses that with depends_on.
  const byContainer = new Map(Object.entries(services).map(([name, svc]) => [svc.container_name || name, name]));
  for (const [name, targets] of links) {
    const needs = [...new Set(targets.map((target) => byContainer.get(target)).filter((target) => target && target !== name))];
    if (!needs.length) continue;
    services[name].depends_on = needs;
    if (services[name].network_mode?.startsWith("container:")) {
      const target = services[name].network_mode.slice("container:".length);
      if (byContainer.has(target)) services[name].network_mode = `service:${byContainer.get(target)}`;
    }
  }

  const doc = { services: {} };
  for (const [name, svc] of Object.entries(services)) doc.services[name] = orderKeys(svc);
  if (networks.size) {
    doc.networks = Object.fromEntries([...networks].map((network) => [network, {}]));
    const names = [...networks].join(", ");
    const message = networks.size === 1
      ? `Network ${names} is now created by Compose. If it already exists outside this file, add external: true to it.`
      : `Networks ${names} are now created by Compose. If one already exists outside this file, add external: true to it.`;
    notes.push({ level: "info", service: null, message });
  }
  if (volumes.size) doc.volumes = Object.fromEntries([...volumes].map((volume) => [volume, {}]));

  return { doc, notes, count: runs };
}

function toYaml(doc) {
  return window.jsyaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' })
    // An empty mapping is clearer as `name:` than as `name: {}` for the
    // top-level networks and volumes lists, and it is what `docker compose
    // config` prints.
    .replace(/^( {2}[^\s:][^:]*): \{\}$/gm, "$1:")
    .replace(/: null$/gm, ":");
}

/* --- UI ------------------------------------------------------------------- */

function setStatus(element, message, kind) {
  const text = element.querySelector(".status-text");
  text.textContent = message;
  text.className = `status-text${kind ? ` ${kind}` : ""}`;
}

function renderNotes(notes) {
  notesList.replaceChildren();
  notesPanel.hidden = notes.length === 0;
  const warnings = notes.filter((note) => note.level === "warning").length;
  notesCount.textContent = warnings ? `${warnings} not converted` : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  notesCount.className = `notes-count${warnings ? " is-warning" : ""}`;
  for (const note of notes) {
    const item = document.createElement("li");
    item.className = `note is-${note.level}`;
    if (note.service) {
      const tag = document.createElement("span");
      tag.className = "note-service";
      tag.textContent = note.service;
      item.append(tag);
    }
    item.append(document.createTextNode(note.message));
    notesList.append(item);
  }
}

function run() {
  const text = inputEditor.value;
  if (!text.trim()) {
    outputEditor.value = "";
    inputEditor.classList.remove("is-invalid");
    renderNotes([]);
    setStatus(inputStatus, "Paste one or more docker run commands");
    setStatus(outputStatus, "Ready");
    return;
  }
  if (!window.jsyaml) {
    setStatus(outputStatus, "The YAML library failed to load", "error");
    return;
  }

  let result;
  try {
    result = convert(text);
  } catch (error) {
    if (!(error instanceof ConvertError)) throw error;
    outputEditor.value = "";
    inputEditor.classList.add("is-invalid");
    renderNotes([]);
    setStatus(inputStatus, error.message, "error");
    setStatus(outputStatus, "No output", "error");
    return;
  }

  inputEditor.classList.remove("is-invalid");
  outputEditor.value = toYaml(result.doc);
  renderNotes(result.notes);
  const warnings = result.notes.filter((note) => note.level === "warning").length;
  setStatus(inputStatus, `${result.count} ${result.count === 1 ? "command" : "commands"} parsed`, "success");
  setStatus(outputStatus, warnings ? `${warnings} ${warnings === 1 ? "option" : "options"} need attention` : `${Object.keys(result.doc.services).length} ${Object.keys(result.doc.services).length === 1 ? "service" : "services"}`, warnings ? "warning" : "success");
}

function toast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

const ACTIONS = {
  sample() {
    inputEditor.value = SAMPLE;
    run();
    toast("Sample loaded", "info");
  },
  paste() {
    navigator.clipboard.readText()
      .then((text) => {
        if (!text) {
          toast("Clipboard is empty", "error");
          return;
        }
        inputEditor.value = text;
        run();
        toast("Pasted from clipboard", "success");
      })
      .catch(() => toast("Clipboard is not available", "error"));
  },
  clear() {
    inputEditor.value = "";
    run();
    inputEditor.focus();
  },
  copy() {
    if (!outputEditor.value) {
      toast("Nothing to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(outputEditor.value)
      .then(() => toast("Compose file copied", "success"))
      .catch(() => toast("Copy failed", "error"));
  },
  download() {
    if (!outputEditor.value) {
      toast("Nothing to download", "error");
      return;
    }
    window.DevToolsMain.downloadText("compose.yaml", outputEditor.value, "application/yaml");
    toast("compose.yaml downloaded", "success");
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) ACTIONS[button.dataset.action]?.();
});

inputEditor.addEventListener("input", run);
document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

// Seed the input so the tool explains itself on arrival.
inputEditor.value = SAMPLE;
run();
