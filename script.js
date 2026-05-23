import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, update, onDisconnect, push, increment } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

const firebaseConfig = { 
    apiKey: "AIzaSyBxf_k0ynudsok1hxlD94QiiUBon14tHK8", 
    authDomain: "gameliminals-design-team.firebaseapp.com", 
    databaseURL: "https://gameliminals-design-team-default-rtdb.asia-southeast1.firebasedatabase.app", 
    projectId: "gameliminals-design-team", 
    storageBucket: "gameliminals-design-team.firebasestorage.app", 
    messagingSenderId: "1060824856227", 
    appId: "1:1060824856227:web:9d686cde2d93ae7bc0f116", 
    measurementId: "G-G3GRJVJ8MT" 
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app, firebaseConfig.databaseURL);

// Voice Synthesis Logic
function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
        return "Good morning";
    } else if (hour >= 12 && hour < 17) {
        return "Good afternoon";
    } else {
        return "Good evening";
    }
}

function speak(text) {
    if (!siteSettings.voiceEnabled) return;
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1;
        utterance.pitch = siteSettings.botPitch;
        utterance.volume = 1;
        
        const voices = window.speechSynthesis.getVoices();
        // Fallback to more common voice names and languages
        const preferredVoice = voices.find(v => 
            (v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Natural')) && 
            (v.lang.includes('en-US') || v.lang.includes('en-GB'))
        ) || voices.find(v => v.lang.includes('en')) || voices[0];
        
        if (preferredVoice) utterance.voice = preferredVoice;

        window.speechSynthesis.speak(utterance);
        
        // Also show in bot bubble
        const bubble = document.getElementById('bot-bubble');
        if (bubble) {
            bubble.textContent = text;
            bubble.classList.add('active');
            // Remove previous timer if it exists
            if (bubble.timeout) clearTimeout(bubble.timeout);
            bubble.timeout = setTimeout(() => bubble.classList.remove('active'), 5000);
        }
    }
}

// Loading Screen Controller
function triggerLoading(duration = 1500, callback = null) {
    const loader = document.getElementById('loading-screen');
    if (!loader) return;

    // Reset state
    loader.style.display = 'flex';
    loader.classList.remove('fade-out');
    document.body.classList.remove('loaded');

    setTimeout(() => {
        loader.classList.add('fade-out');
        document.body.classList.add('loaded');
        if (callback) callback();
        setTimeout(() => {
            loader.style.display = 'none';
        }, 1000); // Wait for fade-out transition
    }, duration);
}

// Data Management
let members = [];
let tasks = [];
let talks = [];
let pendingRequests = [];
let calendarEvents = {};
let selectedEventDate = null;
let siteSettings = {
    theme: 'default',
    neonBlue: '#00f2ff',
    neonPurple: '#bc13fe',
    bg1: '#0f172a',
    bg2: '#1e1b4b',
    voiceEnabled: true,
    threeDBg: true,
    scanlines: true,
    botPitch: 1.1,
    welcomeEmail: true,
    emailTemplate: 'template_zy2jycg',
    siteName: 'Design Team',
    adminPassword: 'Admin123'
};

// Email Logic
function sendEmailNotification(toEmail, toName, subject, message, customTemplateID = null) {
    const serviceID = 'service_b0wji3g';
    const templateID = customTemplateID || 'template_zy2jycg';
    const publicKey = 'UITMy3mFjxJmtqjfr';

    const templateParams = {
        to_email: toEmail,
        to_name: toName,
        subject: subject,
        message: message
    };

    console.log('Attempting to send email with params:', templateParams);

    if (window.emailjs) {
        window.emailjs.send(serviceID, templateID, templateParams, publicKey)
            .then(() => {
                console.log('Email sent successfully!');
            }, (error) => {
                console.error('Full EmailJS Error Object:', error);
                const errorText = error.text || JSON.stringify(error);
                console.error('Failed to send email:', errorText);

                if (error.status === 422) {
                    alert('Email error (422): Unprocessable Entity.\n\nThis usually means:\n1. Your Service ID or Template ID is incorrect.\n2. Your Template Variables in EmailJS do not match the code.\n\nPLEASE CHECK:\n- Service ID: service_b0wji3g\n- Template ID: template_zy2jycg\n- Template Variables: {{to_email}}, {{to_name}}, {{subject}}, {{message}}');
                } else if (errorText.includes('reCAPTCHA')) {
                    alert('Email error: reCAPTCHA is enabled. Please DISABLE "reCAPTCHA verification" in EmailJS Dashboard > Account > Security.');
                } else {
                    alert('Failed to send email: ' + errorText);
                }
            });
    } else {
        console.warn('EmailJS not initialized yet.');
    }
}

// Firebase Real-time Sync
function setupFirebaseSync() {
    const membersRef = ref(db, 'members');
    const tasksRef = ref(db, 'tasks');
    const talksRef = ref(db, 'talks');
    const pendingRef = ref(db, 'pendingRequests');
    const settingsRef = ref(db, 'settings');
    const presenceRef = ref(db, 'presence');
    const trafficRef = ref(db, 'traffic/totalVisits');
    const eventsRef = ref(db, 'events');

    // Increment traffic on load
    update(ref(db, 'traffic'), { totalVisits: increment(1) });

    onValue(eventsRef, (snapshot) => {
        calendarEvents = snapshot.val() || {};
        renderCalendar();
    });

    onValue(trafficRef, (snapshot) => {
        const count = snapshot.val() || 0;
        const trafficEl = document.getElementById('total-traffic');
        if (trafficEl) trafficEl.textContent = count.toLocaleString();
    });

    onValue(presenceRef, (snapshot) => {
        const data = snapshot.val();
        const onlineUsers = data ? Object.values(data) : [];
        updatePresenceUI(onlineUsers);
    });

    onValue(settingsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            siteSettings = { ...siteSettings, ...data };
            applySettings();
        }
    });

    onValue(membersRef, (snapshot) => {
        const data = snapshot.val();
        members = data ? Object.values(data) : [];
        updateUI();
    });

    onValue(tasksRef, (snapshot) => {
        const data = snapshot.val();
        tasks = data ? Object.values(data) : [];
        updateUI();
    });

    onValue(talksRef, (snapshot) => {
        const data = snapshot.val();
        talks = data ? Object.values(data) : [];
        updateUI();
    });

    onValue(pendingRef, (snapshot) => {
        const data = snapshot.val();
        pendingRequests = data ? Object.values(data) : [];
        updateUI();
    });
}

// Auth Logic
let isAuthenticated = sessionStorage.getItem('isAdminAuthenticated') === 'true';

// DOM Elements
const lockScreen = document.getElementById('lock-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const sections = document.querySelectorAll('.content-section');
const navLinks = document.querySelectorAll('.nav-links li');
const sectionTitle = document.getElementById('section-title');

// Modal Elements
const memberModal = document.getElementById('member-modal');
const taskModal = document.getElementById('task-modal');
const eventModal = document.getElementById('event-modal');
const memberForm = document.getElementById('member-form');
const taskForm = document.getElementById('task-form');
const closeBtns = document.querySelectorAll('.close');

function updatePresenceUI(onlineUsers) {
    const countEl = document.getElementById('online-count');
    const namesEl = document.getElementById('online-names');
    if (!countEl || !namesEl) return;

    countEl.textContent = onlineUsers.length;
    if (onlineUsers.length === 0) {
        namesEl.textContent = "No members online";
    } else {
        const names = onlineUsers.map(u => u.name).join(', ');
        namesEl.textContent = names;
    }
}

function reportAdminPresence() {
    const adminPresenceRef = ref(db, 'presence/admin');
    set(adminPresenceRef, { name: 'Admin', role: 'Administrator', lastSeen: Date.now() });
    onDisconnect(adminPresenceRef).remove();
}

async function updateSystemTemperature() {
    const tempEl = document.getElementById('system-temp');
    const tempStatusEl = document.getElementById('temp-status');
    const thermalStatusEl = document.getElementById('thermal-status');
    const thermalLastCheckEl = document.getElementById('thermal-last-check');

    if (!tempEl) return;

    // Simulate temperature fluctuating between 35°C and 48°C
    const baseTemp = 40;
    const fluctuation = Math.random() * 8 - 4; // -4 to +4
    const currentTemp = (baseTemp + fluctuation).toFixed(1);

    tempEl.textContent = `${currentTemp}°C`;

    if (currentTemp > 45) {
        tempStatusEl.textContent = "High Load";
        tempStatusEl.style.color = "var(--danger)";
        if (thermalStatusEl) thermalStatusEl.innerHTML = '<span class="status-badge status-pending">Throttling</span>';
    } else {
        tempStatusEl.textContent = "Stable";
        tempStatusEl.style.color = "var(--success)";
        if (thermalStatusEl) thermalStatusEl.innerHTML = '<span class="status-badge status-approved">Optimal</span>';
    }

    if (thermalLastCheckEl) thermalLastCheckEl.textContent = new Date().toLocaleTimeString();
}

// Network Metrics Logic
async function updateNetworkMetrics() {
    const connStatusEl = document.getElementById('connectivity-status');
    const latencyEl = document.getElementById('latency-value');
    const speedEl = document.getElementById('network-speed');
    const typeEl = document.getElementById('network-type');
    const apiLatencyEl = document.getElementById('api-latency');
    const latencyLastCheckEl = document.getElementById('latency-last-check');
    const healthScoreEl = document.getElementById('site-health-score');
    const healthStatusEl = document.getElementById('site-health-status');
    const globalPerfEl = document.getElementById('global-performance');

    if (!connStatusEl) return;

    let healthPoints = 100;
    let currentLatency = 0;
    let currentSpeed = 0;

    // 1. Basic Connectivity
    if (navigator.onLine) {
        connStatusEl.textContent = "Online";
        connStatusEl.style.color = "var(--success)";
    } else {
        connStatusEl.textContent = "Offline";
        connStatusEl.style.color = "var(--danger)";
        healthPoints -= 50;
    }

    // 2. Network Information API (Initial Check)
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && connection.downlink) {
        currentSpeed = connection.downlink;
        speedEl.textContent = `${currentSpeed} Mbps`;
        typeEl.textContent = `Type: ${connection.effectiveType.toUpperCase()}`;
    }

    // 3. Fallback Speed Test & Latency Check
    const startTime = Date.now();
    try {
        // We use a small image or resource to test actual download speed
        const response = await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache' });
        currentLatency = Date.now() - startTime;
        
        latencyEl.textContent = `Latency: ${currentLatency} ms`;
        if (apiLatencyEl) {
            apiLatencyEl.textContent = `${currentLatency} ms`;
            apiLatencyEl.className = currentLatency < 200 ? 'status-badge status-approved' : 'status-badge status-pending';
        }
        if (latencyLastCheckEl) latencyLastCheckEl.textContent = new Date().toLocaleTimeString();

        // If connection API is missing or reporting 0, estimate speed based on latency
        if (currentSpeed === 0) {
            // Very rough estimation: lower latency usually means higher speed
            if (currentLatency < 100) currentSpeed = 25.5;
            else if (currentLatency < 300) currentSpeed = 10.2;
            else if (currentLatency < 1000) currentSpeed = 2.5;
            else currentSpeed = 0.5;
            
            speedEl.textContent = `${currentSpeed} Mbps (Est.)`;
            typeEl.textContent = "Type: Calculated";
        }

    } catch (error) {
        latencyEl.textContent = "Latency: Timeout";
        healthPoints -= 30;
    }

    // 4. Calculate Health Score
    if (currentLatency > 500) healthPoints -= 15;
    if (currentLatency > 1000) healthPoints -= 20;
    if (currentSpeed < 1) healthPoints -= 20;
    if (!navigator.onLine) healthPoints = 0;

    const finalHealth = Math.max(0, healthPoints);
    if (healthScoreEl) {
        healthScoreEl.textContent = `${finalHealth}%`;
        healthScoreEl.style.color = finalHealth > 80 ? 'var(--success)' : finalHealth > 50 ? 'var(--warning)' : 'var(--danger)';
    }

    if (healthStatusEl) {
        if (finalHealth > 80) healthStatusEl.textContent = "System Optimized";
        else if (finalHealth > 50) healthStatusEl.textContent = "Stable Performance";
        else healthStatusEl.textContent = "Network Instability";
    }

    if (globalPerfEl) {
        const perfClass = finalHealth > 80 ? 'status-approved' : 'status-pending';
        const perfLabel = finalHealth > 80 ? 'Excellent' : 'Average';
        globalPerfEl.innerHTML = `<span class="status-badge ${perfClass}">${perfLabel}</span>`;
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW error', err));
    }

    // Initialize loading screen
    triggerLoading(2000);

    checkAuth();
    setupFirebaseSync();
    reportAdminPresence();
    setupNavigation();
    setupModals();
    setup3DParallax();
    createParticles();
    initSidebarWidgets();
    initAestheticBot();
    
    // System Metrics & Portal Auto-Refresh Interval
    updateNetworkMetrics();
    updateSystemTemperature();
    setInterval(() => {
        updateNetworkMetrics();
        updateSystemTemperature();
        updateUI(); // Refresh all dashboard components and metrics
        const refreshBadge = document.createElement('div');
        refreshBadge.className = 'refresh-indicator';
        refreshBadge.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Live Updated';
        document.body.appendChild(refreshBadge);
        setTimeout(() => refreshBadge.classList.add('fade-out'), 2000);
        setTimeout(() => refreshBadge.remove(), 3000);
    }, 10000);
});

function initAestheticBot() {
    const bot = document.getElementById('aesthetic-bot');
    const bubble = document.getElementById('bot-bubble');
    const hands = document.querySelectorAll('.hand');
    const eyes = document.querySelectorAll('.bot-eye');
    
    let typingTimer;
    let messageTimer;

    // Follow Mouse
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX - window.innerWidth / 2) / 20;
        const y = (e.clientY - 100) / 20;
        bot.style.transform = `translateX(calc(50% + ${x}px)) translateY(${y}px)`;
        
        // Eyes follow mouse
        const eyeX = (e.clientX - window.innerWidth / 2) / 100;
        const eyeY = (e.clientY - 100) / 100;
        eyes.forEach(eye => {
            eye.style.transform = `translate(${eyeX}px, ${eyeY}px)`;
        });
    });

    // Keyboard Reaction
    document.addEventListener('keydown', (e) => {
        // Show hands
        hands.forEach(h => h.classList.add('typing'));
        
        // Show bubble
        bubble.classList.add('active');
        bubble.textContent = `You're typing: ${e.key}`;
        
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            hands.forEach(h => h.classList.remove('typing'));
        }, 500);

        clearTimeout(messageTimer);
        messageTimer = setTimeout(() => {
            bubble.classList.remove('active');
        }, 2000);
    });

    // Random Blinking
    setInterval(() => {
        eyes.forEach(eye => eye.classList.add('blink'));
        setTimeout(() => {
            eyes.forEach(eye => eye.classList.remove('blink'));
        }, 150);
    }, 4000);

    // Initial Message
    setTimeout(() => {
        bubble.textContent = "Click anywhere to enable my voice!";
        bubble.classList.add('active');
        
        const enableVoice = () => {
            speak(`Voice system activated. ${getTimeGreeting()}!`);
            document.removeEventListener('click', enableVoice);
        };
        document.addEventListener('click', enableVoice);
    }, 2000);
}

function initSidebarWidgets() {
    updateClock();
    setInterval(updateClock, 1000);
    renderCalendar();
}

// Settings Functions
function applySettings() {
    const root = document.documentElement;
    const body = document.body;
    
    // Apply Theme
    body.classList.remove('theme-white', 'theme-black');
    if (siteSettings.theme === 'white') body.classList.add('theme-white');
    else if (siteSettings.theme === 'black') body.classList.add('theme-black');

    root.style.setProperty('--neon-blue', siteSettings.neonBlue);
    root.style.setProperty('--neon-purple', siteSettings.neonPurple);
    root.style.setProperty('--bg-color', siteSettings.bg1);
    
    // Update logo and title
    const logoTitle = document.querySelector('.logo span');
    if (logoTitle) logoTitle.textContent = siteSettings.siteName;
    document.title = `${siteSettings.siteName} | Admin Panel`;

    // Apply Background 3D/Scanlines
    const cubes = document.querySelector('.cube-container');
    if (cubes) cubes.style.display = siteSettings.threeDBg ? 'block' : 'none';
    const scanline = document.querySelector('.scanline');
    if (scanline) scanline.style.display = siteSettings.scanlines ? 'block' : 'none';

    // Update body gradient
    const style = document.createElement('style');
    style.innerHTML = `
        body::before {
            background: linear-gradient(-45deg, ${siteSettings.bg1}, ${siteSettings.bg2}, #2e1065, ${siteSettings.bg1}) !important;
            background-size: 400% 400% !important;
        }
    `;
    document.head.appendChild(style);

    // Sync UI Inputs
    if (document.getElementById('set-neon-blue')) {
        document.getElementById('set-theme').value = siteSettings.theme || 'default';
        document.getElementById('set-neon-blue').value = siteSettings.neonBlue;
        document.getElementById('set-neon-purple').value = siteSettings.neonPurple;
        document.getElementById('set-bg-1').value = siteSettings.bg1;
        document.getElementById('set-bg-2').value = siteSettings.bg2;
        document.getElementById('set-voice-enabled').checked = siteSettings.voiceEnabled;
        document.getElementById('set-3d-bg').checked = siteSettings.threeDBg;
        document.getElementById('set-scanlines').checked = siteSettings.scanlines;
        document.getElementById('set-bot-pitch').value = siteSettings.botPitch;
        document.getElementById('set-welcome-email').checked = siteSettings.welcomeEmail;
        document.getElementById('set-email-template').value = siteSettings.emailTemplate;
        document.getElementById('set-site-name').value = siteSettings.siteName;
        document.getElementById('set-admin-password').value = siteSettings.adminPassword;
        
        // Update Password Quick View
        const quickPass = document.getElementById('quick-admin-pass');
        if (quickPass) quickPass.value = siteSettings.adminPassword;
        const credStatus = document.getElementById('member-cred-status');
        if (credStatus) credStatus.textContent = `${members.length} members are currently registered with active passwords.`;
    }
}

function handleSettingsSave() {
    const newSettings = {
        theme: document.getElementById('set-theme').value,
        neonBlue: document.getElementById('set-neon-blue').value,
        neonPurple: document.getElementById('set-neon-purple').value,
        bg1: document.getElementById('set-bg-1').value,
        bg2: document.getElementById('set-bg-2').value,
        voiceEnabled: document.getElementById('set-voice-enabled').checked,
        threeDBg: document.getElementById('set-3d-bg').checked,
        scanlines: document.getElementById('set-scanlines').checked,
        botPitch: parseFloat(document.getElementById('set-bot-pitch').value),
        welcomeEmail: document.getElementById('set-welcome-email').checked,
        emailTemplate: document.getElementById('set-email-template').value,
        siteName: document.getElementById('set-site-name').value,
        adminPassword: document.getElementById('set-admin-password').value
    };

    set(ref(db, 'settings'), newSettings)
        .then(() => {
            speak('Settings saved successfully. All changes applied.');
            alert('Settings updated across the entire website!');
        })
        .catch(err => alert('Error saving settings: ' + err.message));
}

function handleSettingsReset() {
    if (confirm('Reset all settings to default?')) {
        const defaults = {
            theme: 'default',
            neonBlue: '#00f2ff',
            neonPurple: '#bc13fe',
            bg1: '#0f172a',
            bg2: '#1e1b4b',
            voiceEnabled: true,
            threeDBg: true,
            scanlines: true,
            botPitch: 1.1,
            welcomeEmail: true,
            emailTemplate: 'template_zy2jycg',
            siteName: 'Design Team',
            adminPassword: 'Admin123'
        };
        set(ref(db, 'settings'), defaults);
    }
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false });
    const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');
    
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
}

function renderCalendar() {
    const daysContainer = document.getElementById('calendar-days');
    const monthEl = document.getElementById('cal-month');
    const yearEl = document.getElementById('cal-year');
    if (!daysContainer) return;

    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const today = now.getDate();

    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    monthEl.textContent = monthNames[month];
    yearEl.textContent = year;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    daysContainer.innerHTML = '';

    // Add empty slots for days of the week before the 1st
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'cal-day other-month';
        daysContainer.appendChild(div);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
        const div = document.createElement('div');
        div.className = 'cal-day';
        if (i === today) div.classList.add('today');
        
        // Check for events
        const eventKey = `${year}-${month}-${i}`;
        const eventData = calendarEvents[year] && calendarEvents[year][month] && calendarEvents[year][month][i];
        
        if (eventData) {
            div.classList.add('has-event');
            div.title = eventData;
        }

        div.textContent = i;
        
        // Admin: Click to mark/unmark events
        div.addEventListener('click', () => {
            selectedEventDate = { year, month, day: i };
            const currentEvent = eventData || "";
            document.getElementById('event-modal-title').textContent = `Event for ${monthNames[month]} ${i}, ${year}`;
            document.getElementById('event-text').value = currentEvent;
            eventModal.style.display = 'block';
        });

        daysContainer.appendChild(div);
    }
}

function createParticles() {
    const container = document.createElement('div');
    container.className = 'particles-container';
    document.body.appendChild(container);

    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 3 + 1;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.left = `${Math.random() * 100}%`;
        p.style.top = `${Math.random() * 100}%`;
        p.style.setProperty('--duration', `${Math.random() * 10 + 5}s`);
        p.style.opacity = Math.random() * 0.5 + 0.1;
        container.appendChild(p);
    }
}

// 3D Mouse Parallax
function setup3DParallax() {
    const blobs = document.querySelectorAll('.blob');
    const cubes = document.querySelectorAll('.cube');
    
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        blobs.forEach((blob, index) => {
            const speed = (index + 1) * 20;
            const xOffset = (x - 0.5) * speed;
            const yOffset = (y - 0.5) * speed;
            blob.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        });

        cubes.forEach((cube, index) => {
            const speed = (index + 1) * 40;
            const xOffset = (x - 0.5) * speed;
            const yOffset = (y - 0.5) * speed;
            // Preserving existing animation by wrapping or using CSS variables
            cube.style.left = `calc(${cube.classList.contains('cube-1') ? '10%' : '80%'} + ${xOffset}px)`;
            cube.style.top = `calc(${cube.classList.contains('cube-1') ? '20%' : '60%'} + ${yOffset}px)`;
        });
    });
}

function checkAuth() {
    if (isAuthenticated) {
        lockScreen.classList.add('hidden');
        setTimeout(() => {
            lockScreen.style.display = 'none';
            speak(`${getTimeGreeting()} Admin! Welcome back.`);
        }, 1000);
    } else {
        lockScreen.style.display = 'flex';
        lockScreen.classList.remove('hidden');
    }
}

// Navigation Logic
function setupNavigation() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('active');
            } else {
                sidebar.classList.toggle('hidden');
                mainContent.classList.toggle('full-width');
            }
            
            const icon = mobileMenuBtn.querySelector('i');
            const isActive = sidebar.classList.contains('active') || !sidebar.classList.contains('hidden');
            
            if (window.innerWidth <= 768) {
                icon.className = sidebar.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
            } else {
                icon.className = sidebar.classList.contains('hidden') ? 'fas fa-bars' : 'fas fa-times';
            }
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('active') && 
            !sidebar.contains(e.target) && 
            e.target !== mobileMenuBtn) {
            sidebar.classList.remove('active');
            if (mobileMenuBtn) {
                mobileMenuBtn.querySelector('i').className = 'fas fa-bars';
            }
        }
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const sectionId = link.getAttribute('data-section');
            if (!sectionId) return;

            // Trigger loading screen for section switch
            triggerLoading(800, () => {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                sections.forEach(section => {
                    section.classList.remove('active');
                    if (section.id === sectionId) section.classList.add('active');
                });
                sectionTitle.textContent = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
            });

            // Close sidebar on mobile after clicking
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                if (mobileMenuBtn) {
                    mobileMenuBtn.querySelector('i').className = 'fas fa-bars';
                }
            }
        });
    });
}

// Modal Logic
function setupModals() {
    document.getElementById('add-member-btn').addEventListener('click', () => {
        document.getElementById('member-modal-title').textContent = 'Add Member';
        memberForm.reset();
        document.getElementById('member-id').value = '';
        memberModal.style.display = 'block';
    });

    document.getElementById('add-task-btn').addEventListener('click', () => {
        if (members.length === 0) {
            alert('Please add at least one member first!');
            return;
        }
        document.getElementById('task-modal-title').textContent = 'Assign New Task';
        taskForm.reset();
        document.getElementById('task-id').value = '';
        populateAssigneeSelect();
        taskModal.style.display = 'block';
    });

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            memberModal.style.display = 'none';
            taskModal.style.display = 'none';
            eventModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === memberModal) memberModal.style.display = 'none';
        if (e.target === taskModal) taskModal.style.display = 'none';
        if (e.target === eventModal) eventModal.style.display = 'none';
        
        const profileMenu = document.getElementById('admin-profile-menu');
        if (profileMenu && !profileMenu.contains(e.target)) {
            profileMenu.classList.remove('active');
        }
    });

    document.getElementById('save-event-btn').addEventListener('click', () => {
        if (!selectedEventDate) return;
        const text = document.getElementById('event-text').value.trim();
        const { year, month, day } = selectedEventDate;
        const eventPath = `events/${year}/${month}/${day}`;
        
        if (text === "") {
            remove(ref(db, eventPath)).then(() => {
                speak("Event cleared.");
                eventModal.style.display = 'none';
            });
        } else {
            set(ref(db, eventPath), text).then(() => {
                speak("Event marked on calendar.");
                eventModal.style.display = 'none';
            });
        }
    });

    document.getElementById('clear-event-btn').addEventListener('click', () => {
        if (!selectedEventDate) return;
        const { year, month, day } = selectedEventDate;
        const eventPath = `events/${year}/${month}/${day}`;
        remove(ref(db, eventPath)).then(() => {
            speak("Event cleared.");
            eventModal.style.display = 'none';
        });
    });

    memberForm.addEventListener('submit', handleMemberSubmit);
    taskForm.addEventListener('submit', handleTaskSubmit);

    document.getElementById('send-talk-btn').addEventListener('click', postTalk);
    document.getElementById('clear-all-talks').addEventListener('click', clearAllTalks);
    document.getElementById('export-db').addEventListener('click', exportDatabase);
    document.getElementById('clear-db').addEventListener('click', clearDatabase);
    document.getElementById('save-settings').addEventListener('click', handleSettingsSave);
    document.getElementById('reset-settings').addEventListener('click', handleSettingsReset);

    // Password Visibility Toggles
    const toggleAdminPass = document.getElementById('toggle-admin-pass');
    if (toggleAdminPass) {
        toggleAdminPass.addEventListener('click', () => {
            const passInput = document.getElementById('set-admin-password');
            const icon = toggleAdminPass.querySelector('i');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                passInput.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    }

    // Profile Menu Toggle
    const profileMenu = document.getElementById('admin-profile-menu');
    if (profileMenu) {
        profileMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('active');
        });
    }

    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
}

function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    if (password === siteSettings.adminPassword) {
        isAuthenticated = true;
        sessionStorage.setItem('isAdminAuthenticated', 'true');
        lockScreen.classList.add('hidden');
        setTimeout(() => { 
            lockScreen.style.display = 'none'; 
            speak(`${getTimeGreeting()} Admin! Welcome back.`);
        }, 1000);
        loginError.style.display = 'none';
    } else {
        loginError.style.display = 'block';
        document.getElementById('admin-password').value = '';
    }
}

function handleLogout() {
    isAuthenticated = false;
    sessionStorage.removeItem('isAdminAuthenticated');
    lockScreen.style.display = 'flex';
    setTimeout(() => { lockScreen.classList.remove('hidden'); }, 10);
}

// Shared Data Logic
const ADMIN_PASSWORD = 'Admin123'; // Default fallback

function handleMemberSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('member-id').value || Date.now().toString();
    const name = document.getElementById('member-name').value;
    const email = document.getElementById('member-email').value;
    const role = document.getElementById('member-role').value;
    const password = document.getElementById('member-password').value;

    const memberData = {
        id: id,
        name: name,
        email: email,
        role: role,
        password: password,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    };

    set(ref(db, 'members/' + id), memberData)
        .then(() => {
            if (!document.getElementById('member-id').value && email && siteSettings.welcomeEmail) {
                sendEmailNotification(email, name, 'Welcome to the Design Team!', `Hello ${name}, you have been added to the Design Team. You can log in with password: ${password}`, siteSettings.emailTemplate);
            }
            memberModal.style.display = 'none';
        })
        .catch(err => {
            if (err.message.includes('permission_denied')) {
                alert('Firebase Permission Error: Please update your Realtime Database Rules to allow writes.');
            } else {
                alert('Error saving member: ' + err.message);
            }
        });
}

function deleteMember(id) {
    if (confirm('Are you sure you want to remove this member?')) {
        remove(ref(db, 'members/' + id));
        tasks.filter(t => t.assigneeId === id).forEach(t => remove(ref(db, 'tasks/' + t.id)));
    }
}

function editMember(id) {
    const member = members.find(m => m.id === id);
    if (!member) return;
    document.getElementById('member-id').value = member.id;
    document.getElementById('member-name').value = member.name;
    document.getElementById('member-email').value = member.email || '';
    document.getElementById('member-role').value = member.role;
    document.getElementById('member-password').value = member.password || '';
    document.getElementById('member-modal-title').textContent = 'Edit Member';
    memberModal.style.display = 'block';
}

// Task Management
function handleTaskSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value || Date.now().toString();
    const assigneeId = document.getElementById('task-assignee').value;
    const assignee = members.find(m => m.id === assigneeId);

    const taskData = {
        id: id,
        title: document.getElementById('task-title').value,
        assigneeId: assigneeId,
        assigneeName: assignee.name,
        priority: document.getElementById('task-priority').value,
        date: document.getElementById('task-date').value,
        status: document.getElementById('task-id').value ? tasks.find(t => t.id === id).status : 'Pending'
    };

    set(ref(db, 'tasks/' + id), taskData)
        .then(() => {
            if (!document.getElementById('task-id').value) {
                speak(`Task ${taskData.title} has been assigned to ${taskData.assigneeName}`);
            }
            taskModal.style.display = 'none';
        })
        .catch(err => alert('Error saving task: ' + err.message));
}

function deleteTask(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        remove(ref(db, 'tasks/' + id));
    }
}

// UI Updates
function updateUI() {
    renderDashboard();
    renderMembers();
    renderTasks();
    renderStatus();
    renderTalks();
    renderApprovals();
    renderDatabase();
    updateNotifications();
}

function updateNotifications() {
    // 1. Approvals Dot (Pending registration requests)
    const approvalsDot = document.getElementById('dot-approvals');
    if (approvalsDot) {
        if (pendingRequests.length > 0) approvalsDot.classList.add('active');
        else approvalsDot.classList.remove('active');
    }

    // 2. Status Dot (Tasks pending admin review)
    const statusDot = document.getElementById('dot-status');
    if (statusDot) {
        const pendingReview = tasks.filter(t => t.submission && t.status === 'Completed').length;
        if (pendingReview > 0) statusDot.classList.add('active');
        else statusDot.classList.remove('active');
    }

    // 3. Team Talks Dot (New messages in the last 10 minutes)
    const talksDot = document.getElementById('dot-talks');
    if (talksDot) {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const newMessages = talks.filter(m => m.timestamp > tenMinutesAgo).length;
        if (newMessages > 0) talksDot.classList.add('active');
        else talksDot.classList.remove('active');
    }
}

let lastPendingCount = 0;

function renderApprovals() {
    const list = document.getElementById('approvals-list');
    if (!list) return;

    if (pendingRequests.length > lastPendingCount) {
        speak(`${pendingRequests.length} member approval requests are pending.`);
    }
    lastPendingCount = pendingRequests.length;

    list.innerHTML = '';
    pendingRequests.forEach(req => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${req.name}</td>
            <td>${req.email || 'N/A'}</td>
            <td>${req.phone}</td>
            <td>
                <button class="btn-primary" onclick="approveMember('${req.id}')" style="background: var(--success); margin-right: 5px;">Approve</button>
                <button class="btn-primary" onclick="rejectMember('${req.id}')" style="background: var(--danger);">Reject</button>
            </td>
        `;
        list.appendChild(tr);
    });
}

function approveMember(id) {
    const req = pendingRequests.find(p => p.id === id);
    if (req) {
        const newMember = {
            id: req.id,
            name: req.name,
            email: req.email,
            phone: req.phone,
            password: req.password,
            role: 'New Member',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(req.name)}&background=random`
        };
        set(ref(db, 'members/' + id), newMember).then(() => {
            remove(ref(db, 'pendingRequests/' + id));
            
            // Auto Email Notification
            if (newMember.email && siteSettings.welcomeEmail) {
                const subject = 'Welcome to the Design Team! - Account Approved';
                const message = `Hello ${newMember.name},\n\nYour request to join the Design Team has been approved by the admin!\n\nYou can now log in to the member portal using your password: ${newMember.password}\n\nWelcome aboard!`;
                
                sendEmailNotification(newMember.email, newMember.name, subject, message, siteSettings.emailTemplate);
                alert(`Member approved and notification email sent to ${newMember.email}`);
            } else if (newMember.email) {
                alert('Member approved! (Email notification skipped per settings)');
            } else {
                alert('Member approved, but no email address was found to send notification.');
            }
        }).catch(err => {
            console.error('Approval failed:', err);
            alert('Error during approval: ' + err.message);
        });
    }
}

function rejectMember(id) {
    if (confirm('Reject this request?')) {
        remove(ref(db, 'pendingRequests/' + id));
    }
}

function renderStatus() {
    const list = document.getElementById('member-progress-list');
    const detailedList = document.getElementById('member-detailed-status');
    if (!list || !detailedList) return;
    
    list.innerHTML = '';
    detailedList.innerHTML = '';

    members.forEach(member => {
        const memberTasks = tasks.filter(t => t.assigneeId === member.id);
        const submittedTasks = memberTasks.filter(t => t.submission);
        const approvedTasksCount = memberTasks.filter(t => t.status === 'Approved').length;
        const totalTasksCount = memberTasks.length;
        const percentage = totalTasksCount === 0 ? 0 : Math.round((approvedTasksCount / totalTasksCount) * 100);
        
        // Render Progress Bar
        const item = document.createElement('div');
        item.className = 'progress-item';
        item.innerHTML = `
            <div class="progress-info">
                <span>${member.name} (${member.role})</span>
                <span>${percentage}% Approved (${approvedTasksCount}/${totalTasksCount})</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${percentage}%"></div></div>
        `;
        list.appendChild(item);

        // Render Detailed Status Card
        const detailCard = document.createElement('div');
        detailCard.className = 'member-detail-card';
        
        let projectsHtml = '';
        if (submittedTasks.length === 0) {
            projectsHtml = '<p class="no-projects">No submissions yet.</p>';
        } else {
            // Sort by latest submission
            const sortedSubmissions = [...submittedTasks].sort((a, b) => 
                new Date(b.submission.timestamp) - new Date(a.submission.timestamp)
            );

            sortedSubmissions.forEach(task => {
                const statusClass = task.status.toLowerCase();
                const statusLabel = task.status === 'Completed' ? 'Pending Review' : task.status;
                
                projectsHtml += `
                    <div class="project-entry">
                        <div class="project-header">
                            <span class="project-title">${task.title}</span>
                            <span class="status-badge status-${statusClass}" style="font-size: 0.7rem; padding: 2px 8px; border-radius: 10px;">${statusLabel}</span>
                        </div>
                        <div class="project-date" style="margin-bottom: 5px;">Submitted: ${task.submission.timestamp}</div>
                        <div class="project-submission">
                            <a href="${task.submission.link}" target="_blank" class="project-link"><i class="fas fa-external-link-alt"></i> View Project</a>
                            <p class="project-notes">"${task.submission.notes || 'No notes provided'}"</p>
                        </div>
                    </div>
                `;
            });
        }

        detailCard.innerHTML = `
            <div class="member-header">
                <img src="${member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`}" alt="${member.name}">
                <div class="member-info">
                    <h4>${member.name}</h4>
                    <p>${member.role}</p>
                </div>
            </div>
            <div class="member-projects">
                <h5>All Submissions (${submittedTasks.length})</h5>
                <div class="projects-list">
                    ${projectsHtml}
                </div>
            </div>
        `;
        detailedList.appendChild(detailCard);
    });
}

function renderTalks() {
    const list = document.getElementById('messages-list');
    if (!list) return;
    list.innerHTML = '';
    talks.forEach(talk => {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = `
            <div class="message-header"><strong>${talk.sender}</strong><span>${talk.time}</span></div>
            <div class="message-text">${talk.text}</div>
        `;
        list.appendChild(bubble);
    });
    list.scrollTop = list.scrollHeight;
}

function postTalk() {
    const input = document.getElementById('talk-message');
    const text = input.value.trim();
    if (!text) return;
    const id = Date.now().toString();
    const newTalk = {
        id: id,
        sender: 'Admin',
        text: text,
        time: new Date().toLocaleString(),
        timestamp: Date.now()
    };
    set(ref(db, 'talks/' + id), newTalk);
    input.value = '';
}

function clearAllTalks() {
    if (confirm('Are you sure you want to delete ALL messages in Team Talks? This cannot be undone.')) {
        remove(ref(db, 'talks')).then(() => {
            alert('All messages cleared.');
        }).catch(err => {
            alert('Error clearing messages: ' + err.message);
        });
    }
}

function renderDatabase() {
    const list = document.getElementById('db-members-list');
    if (!list) return;
    list.innerHTML = '';
    members.forEach(member => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${member.name}</strong></td>
            <td>
                <div class="password-cell">
                    <code id="pass-${member.id}" class="hidden-pass">••••••••</code>
                    <button class="btn-icon-small" onclick="toggleMemberPass('${member.id}', '${member.password}')">
                        <i class="fas fa-eye" id="eye-${member.id}"></i>
                    </button>
                </div>
            </td>
            <td>${member.email || 'N/A'}</td>
            <td>${member.phone || 'N/A'}</td>
            <td>${member.totalProjects || 0}</td>
            <td>${member.role}</td>
        `;
        list.appendChild(tr);
    });
}

// Global function for member password toggle
window.toggleMemberPass = (id, actualPass) => {
    const code = document.getElementById(`pass-${id}`);
    const eye = document.getElementById(`eye-${id}`);
    if (code.classList.contains('hidden-pass')) {
        code.textContent = actualPass;
        code.classList.remove('hidden-pass');
        eye.className = 'fas fa-eye-slash';
    } else {
        code.textContent = '••••••••';
        code.classList.add('hidden-pass');
        eye.className = 'fas fa-eye';
    }
};

function exportDatabase() {
    const data = { members, tasks, talks, pendingRequests };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-team-db-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function clearDatabase() {
    if (confirm('CRITICAL: Clear ALL data from Firebase?')) {
        set(ref(db, '/'), null);
    }
}

function renderDashboard() {
    const mCount = document.getElementById('total-members');
    const tCount = document.getElementById('total-tasks');
    const pCount = document.getElementById('pending-tasks');
    if (mCount) mCount.textContent = members.length;
    if (tCount) tCount.textContent = tasks.length;
    if (pCount) pCount.textContent = tasks.filter(t => t.status === 'Pending').length;

    const body = document.querySelector('#recent-tasks-table tbody');
    if (!body) return;
    body.innerHTML = '';
    
    const recentSubmissions = [...tasks]
        .filter(t => t.submission)
        .sort((a, b) => new Date(b.submission.timestamp) - new Date(a.submission.timestamp))
        .slice(0, 5);

    recentSubmissions.forEach(task => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${task.title}</td>
            <td>${task.assigneeName}</td>
            <td><a href="${task.submission.link}" target="_blank" style="color: var(--neon-blue)">View Work</a></td>
            <td>${task.submission.timestamp.split(',')[0]}</td>
        `;
        body.appendChild(tr);
    });
}

function renderMembers() {
    const list = document.getElementById('members-list');
    if (!list) return;
    list.innerHTML = '';
    members.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `
            <img src="${member.avatar}" alt="${member.name}">
            <h3>${member.name}</h3>
            <p>${member.role}</p>
            <div class="member-actions">
                <button class="btn-icon edit" onclick="editMember('${member.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" onclick="deleteMember('${member.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(card);
    });
}

function renderTasks() {
    const list = document.getElementById('tasks-list');
    if (!list) return;
    list.innerHTML = '';
    tasks.forEach(task => {
        const tr = document.createElement('tr');
        let submissionContent = 'No Submission';
        let reviewActions = '';

        if (task.submission) {
            submissionContent = `<a href="${task.submission.link}" target="_blank" style="color: var(--neon-blue)">View Project</a>`;
            
            // Show review buttons only if it's "Completed" (Pending Review)
            if (task.status === 'Completed') {
                reviewActions = `
                    <button class="btn-primary" onclick="reviewProject('${task.id}', 'Approved')" style="background: var(--success); padding: 5px 10px; font-size: 0.75rem; margin-right: 5px;">Approve</button>
                    <button class="btn-primary" onclick="reviewProject('${task.id}', 'Rejected')" style="background: var(--danger); padding: 5px 10px; font-size: 0.75rem;">Reject</button>
                `;
            }
        }
        
        let statusClass = task.status.toLowerCase();
        if (task.status === 'Pending') statusClass = 'pending hollow';

        tr.innerHTML = `
            <td>${task.title}</td><td>${task.assigneeName}</td>
            <td><span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span></td>
            <td><span class="status-${statusClass}">${task.status}</span></td>
            <td>${task.date}</td><td>${submissionContent}</td>
            <td>
                <div style="display: flex; align-items: center;">
                    ${reviewActions}
                    <button class="btn-icon delete" onclick="deleteTask('${task.id}')" style="margin-left: 10px;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        list.appendChild(tr);
    });
}

function reviewProject(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (newStatus === 'Rejected') {
        const reason = prompt('Please provide a reason for rejection (optional):') || 'No specific reason provided.';
        update(ref(db, 'tasks/' + taskId), { status: 'Rejected', rejectionReason: reason })
            .then(() => {
                speak(`Task ${task.title} submission has been rejected.`);
                alert('Project rejected.');
            });
    } else {
        update(ref(db, 'tasks/' + taskId), { status: 'Approved' })
            .then(() => {
                // Increment member's project count
                if (task.assigneeId) {
                    const memberRef = ref(db, 'members/' + task.assigneeId);
                    const member = members.find(m => m.id === task.assigneeId);
                    if (member) {
                        update(memberRef, { totalProjects: (member.totalProjects || 0) + 1 });
                    }
                }
                speak(`Task ${task.title} has been approved. Great job!`);
                alert('Project approved!');
            });
    }
}

function populateAssigneeSelect() {
    const select = document.getElementById('task-assignee');
    if (!select) return;
    select.innerHTML = '<option value="">Select Member</option>';
    members.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.id;
        opt.textContent = member.name;
        select.appendChild(opt);
    });
}

// Expose to window
window.editMember = editMember;
window.deleteMember = deleteMember;
window.deleteTask = deleteTask;
window.reviewProject = reviewProject;
window.approveMember = approveMember;
window.rejectMember = rejectMember;
