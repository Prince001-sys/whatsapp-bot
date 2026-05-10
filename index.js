const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// --- Express Server Setup ---
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;


app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Flow Data Management ---
const flowFile = path.join(DATA_DIR, 'flows.json');
let flowGraph = {};

function loadFlows() {
    try {
        if (fs.existsSync(flowFile)) {
            const data = fs.readFileSync(flowFile, 'utf8');
            flowGraph = JSON.parse(data);
        } else {
            flowGraph = { "drawflow": { "Home": { "data": {} } } };
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            fs.writeFileSync(flowFile, JSON.stringify(flowGraph));
        }
    } catch (err) {
        console.error('Error loading flows.json:', err);
        flowGraph = { "drawflow": { "Home": { "data": {} } } };
    }
}

function saveFlows(data) {
    try {
        flowGraph = data;
        fs.writeFileSync(flowFile, JSON.stringify(flowGraph, null, 2));
    } catch (err) {
        console.error('Error saving to flows.json:', err);
    }
}

loadFlows();

// --- Bot State ---
let botStatus = 'INITIALIZING'; 
let currentPairingCode = '';

// Tracks where each user is in the flow
// Format: { '919876543210@c.us': { currentNodeId: '2' } }
const userStates = {}; 

// --- API Endpoints ---
app.get('/api/status', (req, res) => {
    res.json({ status: botStatus, pairingCode: currentPairingCode });
});

app.get('/api/flows', (req, res) => {
    res.json(flowGraph);
});

app.post('/api/flows', (req, res) => {
    saveFlows(req.body);
    res.json({ success: true });
});

// --- WhatsApp Bot Setup ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: DATA_DIR }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

let isPrompting = false;

client.on('qr', async () => {
    if (isPrompting) return;
    isPrompting = true;
    
    console.log('\n--- Authentication Required ---');
    const phoneNumber = '919369552324'; // Using predefined phone number
    
    try {
        console.log('Requesting pairing code for:', phoneNumber);
        const pairingCode = await client.requestPairingCode(phoneNumber);
        
        botStatus = 'PAIRING';
        currentPairingCode = pairingCode;
        
        console.log('\n=======================================');
        console.log('        --- PAIRING CODE ---        ');
        console.log(`        ${pairingCode}        `);
        console.log('=======================================');
        console.log('View this code on your local dashboard at http://localhost:3000');
    } catch (error) {
        console.error('Failed to get pairing code:', error);
        botStatus = 'ERROR';
        currentPairingCode = 'Failed: ' + (error.message || error);
    }
});

client.on('ready', () => {
    botStatus = 'READY';
    currentPairingCode = '';
    console.log('\n✅ Client is ready! The visual flow engine is active.');
});

client.on('auth_failure', msg => {
    console.error('\n❌ Authentication failed:', msg);
    botStatus = 'INITIALIZING';
});

function logDebug(message) {
    console.log(message);
    try { fs.appendFileSync('bot.log', new Date().toISOString() + ' ' + message + '\n'); } catch (e) {}
}

// --- Visual Flow Engine ---
async function runNode(userId, nodeId, msgObject) {
    const nodes = flowGraph?.drawflow?.Home?.data || {};
    const node = nodes[nodeId];
    
    if (!node) {
        // Node not found, clear state
        delete userStates[userId];
        return;
    }

    logDebug(`[ENGINE] User ${userId} executing Node ${nodeId} (${node.name})`);

    switch (node.name) {
        case 'trigger':
            // Move immediately to the next node
            await moveNext(userId, node, 'output_1', msgObject);
            break;
            
        case 'message':
            // Send the message
            if (node.data.text) {
                await msgObject.reply(node.data.text);
            }
            // Move immediately to next node
            await moveNext(userId, node, 'output_1', msgObject);
            break;

        case 'menu':
            // Send the menu options
            if (node.data.text) {
                await msgObject.reply(node.data.text);
            }
            // WAIT for user input. Save state.
            userStates[userId] = { currentNodeId: nodeId };
            logDebug(`[ENGINE] User ${userId} waiting at Menu Node ${nodeId}`);
            break;
            
        default:
            delete userStates[userId];
            break;
    }
}

async function moveNext(userId, node, outputName, msgObject) {
    const connections = node.outputs[outputName]?.connections || [];
    if (connections.length > 0) {
        const nextNodeId = connections[0].node;
        await runNode(userId, nextNodeId, msgObject);
    } else {
        // End of flow
        logDebug(`[ENGINE] Flow ended for user ${userId}`);
        delete userStates[userId];
    }
}

client.on('message_create', async msg => {
    logDebug(`\n[DEBUG] Message from ${msg.from}: "${msg.body}"`);
    const text = msg.body.toLowerCase().trim();
    const userId = msg.from;
    const nodes = flowGraph?.drawflow?.Home?.data || {};

    // 1. Check if user is already in a flow (waiting for input)
    if (userStates[userId]) {
        const state = userStates[userId];
        const currentNode = nodes[state.currentNodeId];
        
        if (currentNode && currentNode.name === 'menu') {
            logDebug(`[ENGINE] Evaluating menu input for Node ${currentNode.id}`);
            // Check which option matches
            let matchedOutput = null;
            if (text === currentNode.data.opt1.toLowerCase().trim()) matchedOutput = 'output_1';
            else if (text === currentNode.data.opt2.toLowerCase().trim()) matchedOutput = 'output_2';
            else if (text === currentNode.data.opt3.toLowerCase().trim()) matchedOutput = 'output_3';
            
            if (matchedOutput) {
                // Clear state, move to chosen path
                delete userStates[userId];
                await moveNext(userId, currentNode, matchedOutput, msg);
            } else {
                // Invalid option
                await msg.reply('Invalid option. Please try again.');
            }
            return;
        } else {
            // Something went wrong, clear state
            delete userStates[userId];
        }
    }

    // 2. If not in a flow, scan for Trigger nodes
    for (const key in nodes) {
        const node = nodes[key];
        if (node.name === 'trigger') {
            const keyword = (node.data.keyword || '').toLowerCase().trim();
            if (keyword && text === keyword) {
                logDebug(`[ENGINE] Trigger matched: ${keyword}`);
                await runNode(userId, node.id, msg);
                return; // Stop scanning once triggered
            }
        }
    }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Visual Flow Builder running at http://0.0.0.0:${PORT}`);
    client.initialize().catch(err => {
        console.error('\n❌ FATAL: Failed to initialize WhatsApp client:', err);
        botStatus = 'ERROR';
        currentPairingCode = 'Error: ' + err.message;
    });
});
