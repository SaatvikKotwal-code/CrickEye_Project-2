const localtunnel = require('localtunnel');

(async () => {
  try {
    const subdomain = 'crickeye-pro';
    console.log(`Connecting localtunnel with custom subdomain: ${subdomain}...`);
    const tunnel = await localtunnel({
      port: 8000,
      subdomain: subdomain,
      local_host: '127.0.0.1'
    });

    console.log('==============================================');
    console.log('CUSTOM CRICKEYE DEMO LINK: ' + tunnel.url);
    console.log('==============================================');

    tunnel.on('close', () => {
      console.log('[Tunnel] Closed');
    });
    tunnel.on('error', (err) => {
      console.error('[Tunnel Error]', err);
    });
  } catch (err) {
    console.error('Failed to create localtunnel:', err);
  }
})();
