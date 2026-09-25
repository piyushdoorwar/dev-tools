import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

const output = '#output-editor';

async function convert(page, text) {
  await typeInto(page, '#input-editor', text);
  return page.inputValue(output);
}

// Parsed back with the page's own js-yaml, so assertions check structure
// rather than whitespace.
function parsed(page) {
  return page.evaluate(() => window.jsyaml.load(document.getElementById('output-editor').value));
}

const notes = (page) => page.locator('#notes-list .note');

test('opens with a converted two-service sample and no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'docker-compose-converter');

  const doc = await parsed(page);
  expect(Object.keys(doc.services)).toEqual(['db', 'web']);
  expect(doc.networks).toEqual({ backend: null });
  expect(doc.volumes).toEqual({ pgdata: null });
  await expect(page.locator('#input-status .status-text')).toHaveText('2 commands parsed');
  expect(await page.inputValue(output)).not.toMatch(/^version:/m);
  expect(errors).toEqual([]);
});

test('maps the everyday flags to their Compose keys', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, [
    'docker run -d --name api -p 8080:80 -p 127.0.0.1:53:53/udp -e NODE_ENV=production -e DEBUG=0',
    '  -v data:/data -v /etc/app:/etc/app:ro --restart unless-stopped -w /srv -u 1000:1000',
    '  --hostname api.local --add-host db:10.0.0.5 -l team=core --memory 512m --cpus 1.5',
    '  --entrypoint /bin/sh node:20 -c "npm start"',
  ].join(' \\\n'));

  const { services, volumes } = await parsed(page);
  expect(services.api).toEqual({
    image: 'node:20',
    container_name: 'api',
    command: ['-c', 'npm start'],
    entrypoint: ['/bin/sh'],
    working_dir: '/srv',
    user: '1000:1000',
    hostname: 'api.local',
    restart: 'unless-stopped',
    environment: { NODE_ENV: 'production', DEBUG: '0' },
    ports: ['8080:80', '127.0.0.1:53:53/udp'],
    volumes: ['data:/data', '/etc/app:/etc/app:ro'],
    extra_hosts: ['db:10.0.0.5'],
    labels: { team: 'core' },
    mem_limit: '512m',
    cpus: 1.5,
  });
  expect(volumes).toEqual({ data: null });
});

test('quotes port mappings so YAML 1.1 parsers cannot read them as base-60 numbers', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  const yaml = await convert(page, 'docker run -p 22:22 -p 2222:22 alpine');
  expect(yaml).toContain('- "22:22"');
  expect(yaml).toContain('- "2222:22"');
});

test('reads quotes, escapes and every style of line continuation', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');

  for (const continuation of [' \\\n', ' `\n', ' ^\r\n']) {
    await convert(page, ['docker run --name app', '-e "GREETING=hello world"', "-e 'Q=it''s'", 'alpine'].join(continuation));
    const { services } = await parsed(page);
    expect(services.app.environment).toEqual({ GREETING: 'hello world', Q: 'its' });
  }
});

test('keeps $VAR for Compose to interpolate but escapes a literal $ as $$', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, `docker run -e HOME_DIR=$HOME -e PASS='pa$$word' -e PRICE=\\$5 -e "MIX=\\$A-$B" alpine`);
  const { services } = await parsed(page);
  expect(services.alpine.environment).toEqual({
    HOME_DIR: '$HOME',
    PASS: 'pa$$$$word',
    PRICE: '$$5',
    MIX: '$$A-$B',
  });
});

test('turns $PWD bind mounts into paths relative to the compose file', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, 'docker run -v "$PWD/config:/app/config" -v $(pwd):/src -v ${PWD}/x:/x alpine');
  const { services } = await parsed(page);
  expect(services.alpine.volumes).toEqual(['./config:/app/config', '.:/src', './x:/x']);
  await expect(notes(page).first()).toContainText('became .');
});

test('converts --mount, --tmpfs, healthchecks, ulimits and GPUs', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, [
    'docker run --name worker',
    '--mount type=bind,source=/data,target=/data,readonly',
    '--mount type=volume,src=cache,dst=/cache',
    '--tmpfs /run:rw,size=64m',
    '--health-cmd "curl -f http://localhost/ || exit 1" --health-interval=30s --health-retries 3',
    '--ulimit nofile=1024:2048 --ulimit nproc=512',
    '--gpus all --stop-timeout 20 --init --read-only',
    'worker:latest',
  ].join(' '));

  const { services, volumes } = await parsed(page);
  const worker = services.worker;
  expect(worker.volumes).toEqual([
    { type: 'bind', source: '/data', target: '/data', read_only: true },
    { type: 'volume', source: 'cache', target: '/cache' },
  ]);
  expect(volumes).toEqual({ cache: null });
  expect(worker.tmpfs).toEqual(['/run:rw,size=64m']);
  expect(worker.healthcheck).toEqual({ test: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'], interval: '30s', retries: 3 });
  expect(worker.ulimits).toEqual({ nofile: { soft: 1024, hard: 2048 }, nproc: 512 });
  expect(worker.deploy).toEqual({ resources: { reservations: { devices: [{ driver: 'nvidia', count: 'all', capabilities: ['gpu'] }] } } });
  expect(worker.stop_grace_period).toBe('20s');
  expect(worker.init).toBe(true);
  expect(worker.read_only).toBe(true);
});

test('combined short flags and attached values parse like docker does', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, 'docker run -dit -p8080:80 -eA=1 --privileged=false --name=x nginx');
  const { services } = await parsed(page);
  expect(services.x).toEqual({ image: 'nginx', container_name: 'x', stdin_open: true, tty: true, environment: { A: '1' }, ports: ['8080:80'] });
});

test('networks: special modes, user networks with aliases, and pass-through env', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, [
    'docker run --name a --network-alias api --network front --ip 172.20.0.10 -e TOKEN nginx',
    'docker run --name b --network host alpine',
  ].join('\n'));

  const { services, networks } = await parsed(page);
  // --network-alias came before --network; it still attaches to it.
  expect(services.a.networks).toEqual({ front: { aliases: ['api'], ipv4_address: '172.20.0.10' } });
  // A bare KEY passes the host value through, which only the list form can say.
  expect(services.a.environment).toEqual(['TOKEN']);
  expect(services.b.network_mode).toBe('host');
  expect(networks).toEqual({ front: null });
});

test('links and shared network namespaces between converted services become depends_on', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, [
    'docker run -d --name cache redis:7',
    'docker run -d --name app --link cache:redis myapp',
    'docker run -d --name sidecar --network container:app envoy',
  ].join('\n'));
  const { services } = await parsed(page);
  expect(services.app.depends_on).toEqual(['cache']);
  expect(services.app.links).toEqual(['cache:redis']);
  expect(services.sidecar.network_mode).toBe('service:app');
  expect(services.sidecar.depends_on).toEqual(['app']);
});

test('names services from the image when --name is missing, and de-duplicates', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, 'docker run ghcr.io/acme/web-app:2.3\npodman run ghcr.io/acme/web-app@sha256:abc\nsudo docker container run nginx');
  const { services } = await parsed(page);
  expect(Object.keys(services)).toEqual(['web-app', 'web-app-2', 'nginx']);
  await expect(notes(page).filter({ hasText: 'Renamed to web-app-2' })).toHaveCount(1);
});

test('reports every flag that has no Compose equivalent instead of dropping it silently', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, 'docker run -P --cidfile /tmp/id --made-up-flag --rm alpine\nls -la');
  await expect(page.locator('#notes-panel')).toBeVisible();
  await expect(page.locator('#notes-count')).toHaveText('3 not converted');
  await expect(notes(page).filter({ hasText: '--publish-all' })).toHaveClass(/is-warning/);
  await expect(notes(page).filter({ hasText: '--cidfile' })).toHaveClass(/is-warning/);
  await expect(notes(page).filter({ hasText: 'Unknown option --made-up-flag' })).toHaveClass(/is-warning/);
  await expect(notes(page).filter({ hasText: '--rm has no Compose equivalent' })).toHaveClass(/is-info/);
  await expect(notes(page).filter({ hasText: 'Skipped a command that is not docker run: ls -la' })).toHaveCount(1);
  await expect(page.locator('#output-status .status-text')).toHaveClass(/warning/);
});

test('explains input it cannot convert', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  const inputStatus = page.locator('#input-status .status-text');

  await convert(page, 'echo hello');
  await expect(inputStatus).toHaveText('No docker run command found');
  await expect(page.locator('#input-editor')).toHaveClass(/is-invalid/);

  await convert(page, 'docker run -d --name x');
  await expect(inputStatus).toHaveText('No image given');

  await convert(page, 'docker run -e "UNCLOSED alpine');
  await expect(inputStatus).toHaveText('Unterminated double quote');
  await expect(page.locator(output)).toHaveValue('');
});

test('copies and downloads the compose file, and pastes and clears the input', async ({ page }) => {
  await openTool(page, 'docker-compose-converter');
  await convert(page, 'docker run --name one alpine');
  const yaml = await page.inputValue(output);

  await page.locator('[data-action="copy"]').click();
  expect(await lastCopied(page)).toBe(yaml);

  const download = await captureDownload(page, () => page.locator('[data-action="download"]').click());
  expect(download.suggestedFilename()).toBe('compose.yaml');
  expect(await downloadText(download)).toBe(yaml);

  await page.locator('[data-action="clear"]').click();
  await expect(page.locator(output)).toHaveValue('');

  await setClipboardText(page, 'docker run --name pasted busybox');
  await page.locator('[data-action="paste"]').click();
  expect((await parsed(page)).services.pasted.image).toBe('busybox');

  await page.locator('[data-action="sample"]').click();
  expect(Object.keys((await parsed(page)).services)).toEqual(['db', 'web']);
});
