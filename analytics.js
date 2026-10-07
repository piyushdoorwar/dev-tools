(function () {
  'use strict';

  const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';
  const SITE_TOKEN = '7bf02e12b7eb4bcfb147fbf33e347cd9';

  function load() {
    if (window.__DEV_TOOLS_DISABLE_ANALYTICS__) return false;
    if (window.top !== window) return false;
    if (document.querySelector(`script[src="${BEACON_URL}"]`)) return true;

    const beacon = document.createElement('script');
    beacon.type = 'module';
    beacon.src = BEACON_URL;
    beacon.dataset.cfBeacon = JSON.stringify({ token: SITE_TOKEN });
    document.head.appendChild(beacon);
    return true;
  }

  window.DevToolsAnalytics = Object.freeze({
    beaconUrl: BEACON_URL,
    load,
  });

  load();
})();
