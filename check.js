const util = require('minecraft-server-util');
const fs = require('fs');

const HOST = process.env.MC_HOST;
const PORT = parseInt(process.env.MC_PORT, 10);
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

const INTERVAL_MS = 5000;            // check every 5 seconds
const RUN_MS = 4.5 * 60 * 1000;      // each run lasts ~4.5 min, then the next scheduled run takes over
const MAX_FAILURES = 2;              // consecutive failed pings before "offline" alert

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ping() {
    try {
        await util.status(HOST, PORT, { timeout: 3000 });
        return true;
    } catch (e) {
        console.log('Ping failed:', e.message);
        return false;
    }
}

async function sendEmbed(online) {
    try {
        const res = await fetch(WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: online ? '🟢 Server is Online' : '🚨 Server is Offline',
                    color: online ? 0x00ff00 : 0xff0000,
                    timestamp: new Date().toISOString()
                }]
            })
        });
        console.log('Webhook response:', res.status);
        if (!res.ok) {
            console.error('Webhook error body:', (await res.text()).slice(0, 200));
            return false;
        }
        return true;
    } catch (e) {
        console.error('Webhook request failed:', e.message);
        return false;
    }
}

async function main() {
    if (!WEBHOOK) throw new Error('DISCORD_WEBHOOK_URL secret is missing');
    if (!HOST || !PORT) throw new Error('MC_HOST / MC_PORT secrets are missing');

    const state = JSON.parse(fs.readFileSync('status.json', 'utf8'));
    let failed = 0;
    const deadline = Date.now() + RUN_MS;

    console.log(`Starting loop. Last known state: ${state.online}`);

    while (Date.now() < deadline) {
        const tickStart = Date.now();
        const online = await ping();

        if (online) {
            failed = 0;
            if (state.online !== true && (await sendEmbed(true))) {
                state.online = true;
                fs.writeFileSync('status.json', JSON.stringify(state) + '\n');
            }
        } else {
            failed++;
            if (failed >= MAX_FAILURES && state.online !== false && (await sendEmbed(false))) {
                state.online = false;
                fs.writeFileSync('status.json', JSON.stringify(state) + '\n');
            }
        }

        await sleep(Math.max(0, INTERVAL_MS - (Date.now() - tickStart)));
    }

    console.log('Run finished.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
