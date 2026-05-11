const { Client, RemoteAuth } = require('whatsapp-web.js');
const { WwebjsCloudStorage } = require('wwebjs-google-cloud-storage');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

console.log('--- Starting WhatsApp Bot (Robust v2) ---');

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || '/data'; // Default to /data for GCS mount
const BUCKET_NAME = process.env.BUCKET_NAME || 'whatsapp-bot-session-aerophysics-482f3';
const TARGET_PHONE = process.env.TARGET_PHONE || '919369552324';

// --- Express Server Setup ---
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        console.error(`[WARN] Could not create DATA_DIR: ${e.message}. Using fallback.`);
    }
}

// --- User Management ---
const usersFile = path.join(DATA_DIR, 'users.json');
let users = [];

function loadUsers() {
    try {
        if (fs.existsSync(usersFile)) {
            users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        }
    } catch (e) {
        console.error('[ERROR] Failed to load users:', e);
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('[ERROR] Failed to save users:', e);
    }
}

loadUsers();

// --- Flow Data Management ---
const flowFile = path.join(DATA_DIR, 'flows.json');
let flowGraph = { "drawflow": { "Home": { "data": {} } } };

function loadFlows() {
    try {
        if (fs.existsSync(flowFile)) {
            const data = fs.readFileSync(flowFile, 'utf8');
            flowGraph = JSON.parse(data);
            console.log('[SYSTEM] Flows loaded successfully.');
        }
    } catch (err) {
        console.error('[ERROR] Error loading flows.json:', err);
    }
}

function saveFlows(data) {
    try {
        flowGraph = data;
        fs.writeFileSync(flowFile, JSON.stringify(flowGraph, null, 2));
    } catch (err) {
        console.error('[ERROR] Error saving to flows.json:', err);
    }
}

loadFlows();

// --- Bot State ---
let botStatus = 'INITIALIZING'; 
let currentPairingCode = '';
let currentQRCode = '';
let dynamicTargetPhone = '';
const userStates = {}; 

// --- API Endpoints ---
app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/signup', (req, res) => {
    // Signup is disabled as per user request to restrict access to a single account
    res.status(403).json({ error: 'Signup is disabled.' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Explicitly check for the requested credentials
    const MASTER_EMAIL = 'email-test123@gmail.com';
    const MASTER_PASS = 'zxcv123@';

    if (email === MASTER_EMAIL && password === MASTER_PASS) {
        res.json({ 
            success: true, 
            token: 'valid-session-' + Date.now(),
            user: { email: MASTER_EMAIL }
        });
    } else {
        res.status(401).json({ error: 'Invalid email or password.' });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ 
        status: botStatus, 
        pairingCode: currentPairingCode,
        qr: currentQRCode,
        targetPhone: dynamicTargetPhone 
    });
});

app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required.' });
    
    // Sanitize phone number (remove non-digits)
    const sanitized = phoneNumber.replace(/\D/g, '');
    if (sanitized.length < 10) return res.status(400).json({ error: 'Invalid phone number format.' });

    logDebug(`[API] Pairing requested for: ${sanitized}`);
    dynamicTargetPhone = sanitized;
    
    // If bot is already connected, we might need to logout or just ignore.
    // For now, let's assume the user knows what they're doing.
    // If bot is in INITIALIZING or ERROR or PAIRING, we can trigger.
    
    botStatus = 'PAIRING';
    currentPairingCode = '';
    
    triggerPairingRequest(0);
    res.json({ success: true, message: `Pairing initiated for ${sanitized}. Please wait for the code.` });
});

app.post('/api/refresh-pairing', async (req, res) => {
    if (botStatus === 'READY') return res.status(400).json({ error: 'Bot is already connected.' });
    logDebug('[API] Manual pairing code refresh requested');
    triggerPairingRequest(0);
    res.json({ success: true, message: 'Refresh triggered' });
});

app.get('/api/flows', (req, res) => res.json(flowGraph));
app.post('/api/flows', (req, res) => {
    saveFlows(req.body);
    res.json({ success: true });
});

// --- WhatsApp Bot Setup ---
let client;
let pairingRetryTimeout = null;

function initializeBot() {
    console.log('[BOT] Initializing WhatsApp Client...');
    
    const store = new WwebjsCloudStorage({
        bucketName: BUCKET_NAME
    });

    client = new Client({
        authStrategy: new RemoteAuth({
            clientId: 'whatsapp-bot-session',
            store: store,
            backupSyncIntervalMs: 300000 
        }),
        puppeteer: {
            headless: true,
            executablePath: process.env.CHROME_PATH || 'C:\\Users\\Prince\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--no-first-run',
                '--no-zygote',
                '--disable-features=IsolateOrigins,site-per-process',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            ]
        }
    });

    setupClientEvents();
    client.initialize().catch(err => {
        logDebug(`[FATAL] Client initialization failed: ${err.message}`);
        botStatus = 'ERROR';
    });
}

function setupClientEvents() {
    client.on('qr', (qr) => {
        logDebug('[BOT] QR received. WAITING FOR USER INPUT...');
        currentQRCode = qr;
        botStatus = 'WAITING_FOR_INPUT';
    });

    client.on('ready', () => {
        botStatus = 'READY';
        currentPairingCode = '';
        currentQRCode = '';
        logDebug('[BOT] WhatsApp Client is READY');
    });

    client.on('remote_session_saved', () => {
        logDebug('[BOT] Session saved to GCS.');
    });

    client.on('auth_failure', msg => {
        logDebug(`[BOT] Auth failure: ${msg}`);
        botStatus = 'INITIALIZING';
    });

    client.on('disconnected', (reason) => {
        logDebug(`[BOT] Disconnected: ${reason}. Re-initializing...`);
        botStatus = 'INITIALIZING';
        setTimeout(() => client.initialize(), 5000);
    });

    client.on('message_create', handleMessage);
}

async function triggerPairingRequest(retryCount = 0) {
    if (botStatus === 'READY') return;

    try {
        logDebug(`[BOT] Pairing request for ${dynamicTargetPhone} (Attempt ${retryCount + 1})`);
        
        if (!client.pupPage || client.pupPage.isClosed()) {
            logDebug('[BOT] Page not ready yet, waiting...');
            throw new Error('Browser page not available');
        }

        const title = await client.pupPage.title();
        logDebug(`[BOT] Page title: ${title}`);

        try {
            await client.pupPage.screenshot({ path: path.join(__dirname, 'public', 'debug.png') });
            logDebug('[BOT] Screenshot saved to public/debug.png');
        } catch (e) {
            logDebug(`[BOT] Screenshot failed: ${e.message}`);
        }

        // --- CRITICAL FIX FOR "t" ERROR ---
        const readiness = await client.pupPage.evaluate(async () => {
            const wait = (ms) => new Promise(res => setTimeout(res, ms));
            let attempts = 0;
            while (attempts < 20) {
                if (window.Store && window.Store.PairingCodeManager) return { store: true, manager: true };
                await wait(1000);
                attempts++;
            }
            return {
                store: !!(window.Store),
                manager: !!(window.Store && window.Store.PairingCodeManager)
            };
        }).catch(() => ({ store: false, manager: false }));

        if (!readiness.manager) {
            logDebug(`[BOT] WhatsApp modules still not ready (Store: ${readiness.store}, Manager: ${readiness.manager}). Retrying in 5s...`);
            if (retryCount < 20) {
                if (pairingRetryTimeout) clearTimeout(pairingRetryTimeout);
                pairingRetryTimeout = setTimeout(() => triggerPairingRequest(retryCount + 1), 5000);
                return;
            }
            throw new Error('WhatsApp modules failed to load in time.');
        }

        logDebug(`[BOT] Attempting requestPairingCode for ${dynamicTargetPhone}...`);
        const pairingCode = await client.requestPairingCode(dynamicTargetPhone);
        if (pairingCode) {
            botStatus = 'PAIRING';
            currentPairingCode = pairingCode;
            logDebug(`[BOT] SUCCESS: Pairing Code is ${pairingCode}`);
        } else {
            throw new Error('Empty pairing code returned');
        }

    } catch (error) {
        logDebug(`[BOT] Pairing error: ${error.message}`);
        if (retryCount < 10 && !error.message.includes('rate-overlimit')) {
            const delay = 15000;
            if (pairingRetryTimeout) clearTimeout(pairingRetryTimeout);
            pairingRetryTimeout = setTimeout(() => triggerPairingRequest(retryCount + 1), delay);
        } else {
            botStatus = 'ERROR';
            currentPairingCode = 'Error: ' + error.message;
        }
    }
}

async function handleMessage(msg) {
    const userId = msg.from;
    const body = msg.body.toLowerCase().trim();
    logDebug(`[MSG] ${userId}: ${body}`);
    
    const nodes = flowGraph?.drawflow?.Home?.data || {};

    // Logic for flow engine
    if (userStates[userId]) {
        const state = userStates[userId];
        const currentNode = nodes[state.currentNodeId];
        if (currentNode && currentNode.name === 'menu') {
            let matched = null;
            if (body === (currentNode.data.opt1 || '').toLowerCase().trim()) matched = 'output_1';
            else if (body === (currentNode.data.opt2 || '').toLowerCase().trim()) matched = 'output_2';
            else if (body === (currentNode.data.opt3 || '').toLowerCase().trim()) matched = 'output_3';
            
            if (matched) {
                delete userStates[userId];
                await moveNext(userId, currentNode, matched, msg);
            } else {
                await msg.reply('Please choose a valid option.');
            }
            return;
        }
    }

    for (const id in nodes) {
        const node = nodes[id];
        if (node.name === 'trigger' && body === (node.data.keyword || '').toLowerCase().trim()) {
            await runNode(userId, node.id, msg);
            return;
        }
    }
}

async function runNode(userId, nodeId, msg) {
    const node = flowGraph?.drawflow?.Home?.data[nodeId];
    if (!node) return;

    switch (node.name) {
        case 'trigger':
            await moveNext(userId, node, 'output_1', msg);
            break;
        case 'message':
            if (node.data.text) await msg.reply(node.data.text);
            await moveNext(userId, node, 'output_1', msg);
            break;
        case 'menu':
            if (node.data.text) await msg.reply(node.data.text);
            userStates[userId] = { currentNodeId: nodeId };
            break;
    }
}

async function moveNext(userId, node, outputName, msg) {
    const next = node.outputs[outputName]?.connections[0]?.node;
    if (next) await runNode(userId, next, msg);
    else delete userStates[userId];
}

function logDebug(message) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${message}`;
    console.log(line);
    try {
        fs.appendFileSync(path.join(DATA_DIR, 'bot.log'), line + '\n');
    } catch (e) {}
}

process.on('unhandledRejection', (reason) => logDebug(`[FATAL] Unhandled: ${reason}`));
process.on('uncaughtException', (err) => logDebug(`[FATAL] Uncaught: ${err.message}`));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SYSTEM] HTTP Server active on 0.0.0.0:${PORT}`);
    initializeBot();
});
