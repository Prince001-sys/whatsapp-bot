let editor;
let qrCodeInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Nav Elements
    const navFlow = document.getElementById('nav-flow');
    const navStatus = document.getElementById('nav-status');
    const flowView = document.getElementById('flow-view');
    const statusView = document.getElementById('status-view');
    const landingPage = document.getElementById('landing-page');
    const dashboardPage = document.getElementById('dashboard-page');
    
    // --- Authentication Logic ---
    const authOverlay = document.getElementById('auth-overlay');
    const stepIntro = document.getElementById('step-intro');
    const stepAuth = document.getElementById('step-auth');
    const stepSuccess = document.getElementById('step-success');
    
    const btnGetStarted = document.getElementById('btn-get-started');
    const btnBackToIntro = document.getElementById('btn-back-to-intro');
    const btnLoginSubmit = document.getElementById('btn-login-submit');
    const btnEnterDashboard = document.getElementById('btn-enter-dashboard');
    const btnLogout = document.getElementById('btn-logout');
    
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');
    
    const togglePasswordBtn = document.querySelector('.btn-toggle-password');
    const passwordInput = document.getElementById('login-password');


    // Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }
    
    function showStep(stepId) {
        [stepIntro, stepAuth, stepSuccess].forEach(step => {
            step.classList.remove('active');
        });
        document.getElementById(stepId).classList.add('active');
    }

    function checkAuth() {
        const token = localStorage.getItem('bot_token');
        if (token) {
            authOverlay.style.display = 'none';
            // Show landing page (website) first after login
            if (dashboardPage.style.display !== 'block') {
                landingPage.style.display = 'block';
            }
        } else {
            authOverlay.style.display = 'flex';
            showStep('step-intro');
            landingPage.style.display = 'none';
            dashboardPage.style.display = 'none';
        }
    }

    // --- Auth Transitions ---
    if (btnGetStarted) {
        btnGetStarted.addEventListener('click', () => showStep('step-auth'));
    }

    if (btnBackToIntro) {
        btnBackToIntro.addEventListener('click', () => showStep('step-intro'));
    }

    if (tabLogin) {
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            formLogin.classList.add('active');
            formSignup.classList.remove('active');
        });
    }

    if (tabSignup) {
        tabSignup.addEventListener('click', () => {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            formSignup.classList.add('active');
            formLogin.classList.remove('active');
        });
    }

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            const icon = togglePasswordBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
                lucide.createIcons();
            }
        });
    }

    if (btnLoginSubmit) {
        btnLoginSubmit.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value;
            const password = passwordInput.value;
            
            if (!email || !password) {
                showToast("Please enter both email and access key.");
                return;
            }

            const originalText = btnLoginSubmit.innerHTML;
            btnLoginSubmit.innerHTML = '<span class="loading-spinner"></span> Unlocking...';
            btnLoginSubmit.disabled = true;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    localStorage.setItem('bot_token', data.token);
                    
                    // Show Success Step
                    showStep('step-success');
                    
                    // Trigger Confetti
                    if (window.confetti) {
                        confetti({
                            particleCount: 150,
                            spread: 70,
                            origin: { y: 0.6 },
                            colors: ['#ffffff', '#888888', '#000000']
                        });
                    }
                } else {
                    showToast(data.error || "Access denied. Invalid credentials.");
                }
            } catch (e) {
                showToast("Network error. Please try again.");
            } finally {
                btnLoginSubmit.innerHTML = originalText;
                btnLoginSubmit.disabled = false;
            }
        });
    }

    if (btnEnterDashboard) {
        btnEnterDashboard.addEventListener('click', () => {
            authOverlay.style.display = 'none';
            landingPage.style.display = 'block';
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('bot_token');
            window.location.href = '/'; // Using href instead of reload to be more explicit
        });
    }

    // Initial check
    checkAuth();

    // Landing Page transition
    const btnJoinLab = document.getElementById('btn-join-lab');
    if (btnJoinLab) {
        btnJoinLab.addEventListener('click', () => {
            const token = localStorage.getItem('bot_token');
            if (token) {
                landingPage.style.display = 'none';
                dashboardPage.style.display = 'block';
                // Trigger resize for Drawflow
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
            } else {
                authOverlay.style.display = 'flex';
                showStep('step-auth'); // Go directly to login if they try to join lab
            }
        });
    }

    // Navigation
    navFlow.addEventListener('click', (e) => {
        e.preventDefault();
        navFlow.classList.add('active');
        navStatus.classList.remove('active');
        flowView.classList.add('active');
        flowView.style.display = 'flex';
        statusView.style.display = 'none';
        // Trigger resize for Drawflow
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    });

    navStatus.addEventListener('click', (e) => {
        e.preventDefault();
        navStatus.classList.add('active');
        navFlow.classList.remove('active');
        statusView.style.display = 'block';
        flowView.classList.remove('active');
        flowView.style.display = 'none';
    });

    // --- Initialize Drawflow ---
    const canvasId = document.getElementById('drawflow');
    editor = new Drawflow(canvasId);
    editor.reroute = true;
    editor.curvature = 0.5;
    editor.reroute_curvature = 0.5;
    editor.start();

    // Load existing flow from backend
    loadFlow();

    // --- Button Actions ---
    document.getElementById('btn-clear').addEventListener('click', () => {
        if(confirm("Clear the entire canvas?")) {
            editor.clearModuleSelected();
        }
    });

    document.getElementById('btn-save').addEventListener('click', async () => {
        const exported = editor.export();
        try {
            const res = await fetch('/api/flows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exported)
            });
            if (res.ok) {
                showToast("Flow saved successfully!");
            }
        } catch (error) {
            console.error("Save error:", error);
            alert("Failed to save flow.");
        }
    });

    // Pairing button logic
    const btnPairPhone = document.getElementById('btn-pair-phone');
    if (btnPairPhone) {
        btnPairPhone.addEventListener('click', async () => {
            const input = document.getElementById('input-phone');
            const phone = input.value.trim();
            
            if (!phone) {
                showToast("Please enter a phone number.");
                return;
            }

            // Simple regex for phone validation: digits only, 10-15 chars
            const phoneRegex = /^[0-9]{10,15}$/;
            if (!phoneRegex.test(phone)) {
                showToast("Invalid format. Use 10-15 digits (e.g. 919876543210)");
                return;
            }

            const originalText = btnPairPhone.innerHTML;
            btnPairPhone.innerHTML = '<span class="loading-spinner"></span> Linking...';
            btnPairPhone.disabled = true;

            try {
                const res = await fetch('/api/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber: phone })
                });
                
                if (res.ok) {
                    showToast("Pairing initiated! Check code below.");
                    input.value = '';
                    // Force immediate poll
                    pollStatus();
                } else {
                    const data = await res.json();
                    showToast(data.error || "Failed to initiate pairing.");
                }
            } catch (e) {
                showToast("Network error. Please try again.");
            } finally {
                btnPairPhone.innerHTML = originalText;
                btnPairPhone.disabled = false;
            }
        });
    }

    const btnRefreshCode = document.getElementById('btn-refresh-code');
    if (btnRefreshCode) {
        btnRefreshCode.addEventListener('click', async () => {
            const originalText = btnRefreshCode.innerHTML;
            btnRefreshCode.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Refreshing...';
            if (window.lucide) lucide.createIcons();
            btnRefreshCode.disabled = true;
            
            try {
                const res = await fetch('/api/refresh-pairing', { method: 'POST' });
                if (res.ok) {
                    showToast("Requesting new pairing code...");
                    pollStatus();
                } else {
                    const data = await res.json();
                    showToast(data.error || "Failed to refresh code.");
                }
            } catch (e) {
                showToast("Network error.");
            } finally {
                setTimeout(() => {
                    btnRefreshCode.innerHTML = originalText;
                    if (window.lucide) lucide.createIcons();
                    btnRefreshCode.disabled = false;
                }, 5000);
            }
        });
    }

    // Polling Status
    pollStatus();
    setInterval(pollStatus, 3000);
});

// --- Drag and Drop Logic ---
function drag(ev) {
    ev.dataTransfer.setData("node", ev.target.getAttribute('data-node'));
}

function drop(ev) {
    ev.preventDefault();
    let nodeType = ev.dataTransfer.getData("node");
    
    // Calculate drop position relative to canvas
    const rect = document.getElementById('drawflow').getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    
    // Adjust for pan and zoom
    const pos_x = x * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)) - (editor.precanvas.getBoundingClientRect().x * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)));
    const pos_y = y * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)) - (editor.precanvas.getBoundingClientRect().y * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)));

    addNodeToDrawFlow(nodeType, pos_x, pos_y);
}

function allowDrop(ev) {
    ev.preventDefault();
}

function addNodeToDrawFlow(name, pos_x, pos_y) {
    if(editor.editor_mode === 'fixed') return false;
    
    let html = '';
    let inputs = 0;
    let outputs = 0;
    let data = {};

    let colorClasses = '';
    let focusClass = '';
    let iconSvg = '';
    let nodeTitle = '';
    let nodeDesc = '';
    let nodeBadge = '';
    let inputsHtml = '';

    switch (name) {
        case 'trigger':
            inputs = 0;
            outputs = 1;
            data = { keyword: '' };
            colorClasses = 'border-emerald-400/40';
            focusClass = 'focus:border-emerald-400';
            nodeBadge = 'TRIGGER';
            nodeTitle = 'Keyword Listener';
            nodeDesc = 'Triggers when user sends keyword';
            iconSvg = `<svg class="h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
            inputsHtml = `
                <div class="mt-2 space-y-1">
                    <p class="text-[10px] text-zinc-800 font-medium">Keyword</p>
                    <input type="text" df-keyword placeholder="e.g. hi, support" class="w-full bg-white border border-zinc-300 rounded text-xs px-2 py-1.5 text-zinc-900 ${focusClass} focus:outline-none transition-colors shadow-sm">
                </div>
            `;
            break;
            
        case 'message':
            inputs = 1;
            outputs = 1;
            data = { text: '' };
            colorClasses = 'border-purple-400/40';
            focusClass = 'focus:border-purple-400';
            nodeBadge = 'ACTION';
            nodeTitle = 'Send Message';
            nodeDesc = 'Sends a text message';
            iconSvg = `<svg class="h-4 w-4 text-purple-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
            inputsHtml = `
                <div class="mt-2 space-y-1">
                    <p class="text-[10px] text-zinc-800 font-medium">Message Text</p>
                    <textarea df-text rows="3" placeholder="Enter message..." class="w-full bg-white border border-zinc-300 rounded text-xs px-2 py-1.5 text-zinc-900 ${focusClass} focus:outline-none transition-colors shadow-sm"></textarea>
                </div>
            `;
            break;
            
        case 'menu':
            // 1 input, 5 outputs (options)
            inputs = 1;
            outputs = 5;
            data = { text: '', opt1: '1', opt2: '2', opt3: '3', opt4: '4', opt5: '5' };
            colorClasses = 'border-amber-400/40';
            focusClass = 'focus:border-amber-400';
            nodeBadge = 'INTERACTIVE';
            nodeTitle = 'Options Menu';
            nodeDesc = 'Displays a numbered menu';
            iconSvg = `<svg class="h-4 w-4 text-amber-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`;
            inputsHtml = `
                <div class="mt-2 space-y-1">
                    <p class="text-[10px] text-zinc-800 font-medium">Menu Text</p>
                    <textarea df-text rows="2" placeholder="Please select an option:" class="w-full bg-white border border-zinc-300 rounded text-xs px-2 py-1.5 text-zinc-900 ${focusClass} focus:outline-none transition-colors shadow-sm"></textarea>
                    
                    <div class="grid grid-cols-2 gap-1.5 mt-2">
                        <div>
                            <p class="text-[9px] text-zinc-600 mb-0.5">Opt 1</p>
                            <input type="text" df-opt1 value="1" class="w-full bg-white border border-zinc-300 rounded text-[10px] px-1.5 py-1 text-zinc-900 ${focusClass} focus:outline-none transition-colors">
                        </div>
                        <div>
                            <p class="text-[9px] text-zinc-600 mb-0.5">Opt 2</p>
                            <input type="text" df-opt2 value="2" class="w-full bg-white border border-zinc-300 rounded text-[10px] px-1.5 py-1 text-zinc-900 ${focusClass} focus:outline-none transition-colors">
                        </div>
                        <div>
                            <p class="text-[9px] text-zinc-600 mb-0.5">Opt 3</p>
                            <input type="text" df-opt3 value="3" class="w-full bg-white border border-zinc-300 rounded text-[10px] px-1.5 py-1 text-zinc-900 ${focusClass} focus:outline-none transition-colors">
                        </div>
                        <div>
                            <p class="text-[9px] text-zinc-600 mb-0.5">Opt 4</p>
                            <input type="text" df-opt4 value="4" class="w-full bg-white border border-zinc-300 rounded text-[10px] px-1.5 py-1 text-zinc-900 ${focusClass} focus:outline-none transition-colors">
                        </div>
                        <div class="col-span-2">
                            <p class="text-[9px] text-zinc-600 mb-0.5">Opt 5</p>
                            <input type="text" df-opt5 value="5" class="w-full bg-white border border-zinc-300 rounded text-[10px] px-1.5 py-1 text-zinc-900 ${focusClass} focus:outline-none transition-colors">
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    html = `
    <div class="relative w-full overflow-hidden rounded-xl border ${colorClasses} bg-white p-3 shadow-md transition-all hover:shadow-lg group">
      <div class="absolute inset-0 bg-gradient-to-br from-black/[0.02] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"></div>
      <div class="relative space-y-2">
        <div class="flex items-center gap-2">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${colorClasses} bg-zinc-50 shadow-sm">
            ${iconSvg}
          </div>
          <div class="min-w-0 flex-1">
            <span class="mb-0.5 rounded-full border border-black/10 bg-zinc-100 px-1.5 py-0 text-[9px] uppercase tracking-[0.15em] text-zinc-600 inline-flex items-center justify-center font-semibold transition-colors">
              ${nodeBadge}
            </span>
            <h3 class="truncate text-xs font-bold tracking-tight text-zinc-900">${nodeTitle}</h3>
          </div>
        </div>
        <p class="line-clamp-2 text-[10px] leading-relaxed text-zinc-600">
          ${nodeDesc}
        </p>
        ${inputsHtml}
      </div>
    </div>
    `;

    editor.addNode(name, inputs, outputs, pos_x, pos_y, name, data, html);
}

async function loadFlow() {
    try {
        const res = await fetch('/api/flows');
        const data = await res.json();
        if (data && data.drawflow) {
            editor.import(data);
        }
    } catch (e) {
        console.error("Failed to load flows:", e);
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

async function pollStatus() {
    const headerStatusBadge = document.getElementById('header-status-badge');
    const statusText = headerStatusBadge.querySelector('.status-text');
    const heroStatusIcon = document.getElementById('hero-status-icon');
    const heroStatusTitle = document.getElementById('hero-status-title');
    const heroStatusDesc = document.getElementById('hero-status-desc');
    const pairingSection = document.getElementById('pairing-section');
    const pairingCodeDisplay = document.getElementById('pairing-code');

    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        
        headerStatusBadge.className = 'status-badge';
        
        if (data.status === 'READY') {
            headerStatusBadge.classList.add('connected');
            statusText.innerText = 'Connected';
            heroStatusIcon.innerText = '✅';
            heroStatusTitle.innerText = 'Bot is Active and Ready';
            heroStatusDesc.innerText = `Connected to ${data.targetPhone || 'WhatsApp'}. Listening for messages.`;
            pairingSection.classList.add('hidden');
            document.querySelector('.setup-section').classList.add('hidden');
        } else if (data.status === 'WAITING_FOR_INPUT' || data.status === 'PAIRING' || data.qr || data.status === 'INITIALIZING') {
            const isLinking = data.status === 'PAIRING' || data.status === 'INITIALIZING' || data.qr || data.pairingCode;
            
            if (isLinking) {
                headerStatusBadge.classList.add('linking');
                statusText.innerText = 'Linking...';
            } else {
                headerStatusBadge.classList.add('disconnected');
                statusText.innerText = 'Awaiting Input';
            }
            
            heroStatusIcon.innerText = '📱';
            heroStatusTitle.innerText = 'Device Linking Required';
            heroStatusDesc.innerText = 'Follow the instructions below to link your WhatsApp account.';
            
            document.querySelector('.setup-section').classList.remove('hidden');
            pairingSection.classList.remove('hidden');
            
            // Handle QR
            const qrWrapper = document.getElementById('qr-container');
            if (data.qr) {
                qrWrapper.classList.remove('hidden');
                if (typeof QRCode !== 'undefined') {
                    if (!qrCodeInstance) {
                        const qrElem = document.getElementById("qrcode");
                        if (qrElem) {
                            qrElem.innerHTML = '';
                            qrCodeInstance = new QRCode(qrElem, {
                                text: data.qr,
                                width: 200,
                                height: 200,
                                colorDark : "#000000",
                                colorLight : "#ffffff",
                                correctLevel : QRCode.CorrectLevel.H
                            });
                        }
                    } else {
                        qrCodeInstance.clear();
                        qrCodeInstance.makeCode(data.qr);
                    }
                }
            } else {
                qrWrapper.classList.add('hidden');
            }

            // Handle Pairing Code
            const codeWrapper = document.querySelector('.pairing-code-wrapper');
            if (codeWrapper) {
                // Show code wrapper if we have a code OR if we are explicitly in PAIRING mode
                if (data.pairingCode || data.status === 'PAIRING') {
                    codeWrapper.classList.remove('hidden');
                    if (data.pairingCode) {
                        pairingCodeDisplay.innerText = data.pairingCode;
                        pairingCodeDisplay.classList.remove('loading-text');
                    } else {
                        pairingCodeDisplay.innerText = 'GENERATING...';
                        pairingCodeDisplay.classList.add('loading-text');
                    }
                } else {
                    codeWrapper.classList.add('hidden');
                }
            }
        } else {
            headerStatusBadge.classList.add('disconnected');
            statusText.innerText = 'Initializing...';
            heroStatusIcon.innerText = '🔄';
            heroStatusTitle.innerText = 'Starting up...';
            heroStatusDesc.innerText = 'Please wait while the WhatsApp client initializes.';
            pairingSection.classList.add('hidden');
        }
    } catch (error) {
        console.error("Poll error:", error);
        if (headerStatusBadge && !headerStatusBadge.classList.contains('connected')) {
            statusText.innerText = 'Connecting...';
        }
    }
}
