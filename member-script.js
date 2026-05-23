import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, increment } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

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
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1;
        utterance.pitch = siteSettings.botPitch;
        utterance.volume = 1;
        
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => 
            (v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Natural')) && 
            (v.lang.includes('en-US') || v.lang.includes('en-GB'))
        ) || voices.find(v => v.lang.includes('en')) || voices[0];
        
        if (preferredVoice) utterance.voice = preferredVoice;
        window.speechSynthesis.speak(utterance);

        const bubble = document.getElementById('bot-bubble');
        if (bubble) {
            bubble.textContent = text;
            bubble.classList.add('active');
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

// Shared Data Logic
let members = [];
let pendingRequests = [];
let tasks = [];
let talks = [];
let calendarEvents = {};
let siteSettings = {
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
let currentMember = JSON.parse(sessionStorage.getItem('currentMember')) || null;
let previousTasksState = null;

// Firebase Real-time Sync
function setupFirebaseSync() {
    const membersRef = ref(db, 'members');
    const tasksRef = ref(db, 'tasks');
    const talksRef = ref(db, 'talks');
    const pendingRef = ref(db, 'pendingRequests');
    const settingsRef = ref(db, 'settings');
    const eventsRef = ref(db, 'events');

    // Increment traffic on load
    update(ref(db, 'traffic'), { totalVisits: increment(1) });

    onValue(eventsRef, (snapshot) => {
        calendarEvents = snapshot.val() || {};
        renderCalendar();
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
        if (!currentMember) populateNameDropdown();
        else {
            const updated = members.find(m => m.id === currentMember.id);
            if (updated) {
                currentMember = updated;
                sessionStorage.setItem('currentMember', JSON.stringify(currentMember));
                updateUI();
            }
        }
    });

    onValue(tasksRef, (snapshot) => {
        const data = snapshot.val();
        const newTasks = data ? Object.values(data) : [];
        
        // Detect newly approved tasks for the current member
        if (currentMember && previousTasksState !== null) {
            newTasks.forEach(task => {
                if (task.assigneeId === currentMember.id && task.status === 'Approved') {
                    const prevTask = previousTasksState.find(t => t.id === task.id);
                    // Trigger if the task was previously NOT approved (or didn't exist)
                    if (!prevTask || prevTask.status !== 'Approved') {
                        triggerCelebration(task.title);
                    }
                }
            });
        }

        tasks = newTasks;
        previousTasksState = JSON.parse(JSON.stringify(tasks)); // Deep copy for next comparison
        if (currentMember) updateUI();
    });

    onValue(talksRef, (snapshot) => {
        const data = snapshot.val();
        talks = data ? Object.values(data) : [];
        if (currentMember) updateUI();
    });

    onValue(pendingRef, (snapshot) => {
        const data = snapshot.val();
        pendingRequests = data ? Object.values(data) : [];
    });
}

function triggerCelebration(taskTitle) {
    if (!currentMember) return;

    // 1. Party Popper Animation (Confetti)
    if (window.confetti) {
        const duration = 5 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            // since particles fall down, start a bit higher than random
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    }

    // 2. Bot Voice Message
    speak(`Congrats ${currentMember.name}! Your task "${taskTitle}" has been approved... great job!!`);
}

// DOM Elements
const authScreen = document.getElementById('member-auth-screen');
const dashboard = document.getElementById('member-dashboard');
const loginForm = document.getElementById('member-login-form');
const registerForm = document.getElementById('member-register-form');
const authTitle = document.getElementById('auth-title');

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

    setupFirebaseSync();
    if (currentMember) {
        showDashboard();
        setTimeout(() => {
            speak(`${getTimeGreeting()} ${currentMember.name}! Welcome back.`);
        }, 1500);
    } else {
        populateNameDropdown();
    }
    setupNavigation();
    setup3DParallax();
    createParticles();
    initSidebarWidgets();
    initAestheticBot();
    setupProfileMenu();

    // Portal Auto-Refresh Interval
    setInterval(() => {
        if (currentMember) {
            updateUI();
            const refreshBadge = document.createElement('div');
            refreshBadge.className = 'refresh-indicator';
            refreshBadge.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Live Updated';
            document.body.appendChild(refreshBadge);
            setTimeout(() => refreshBadge.classList.add('fade-out'), 2000);
            setTimeout(() => refreshBadge.remove(), 3000);
        }
    }, 10000);
});

function setupProfileMenu() {
    const profileMenu = document.querySelector('.user-profile');
    const logoutBtn = document.getElementById('member-logout-btn');
    const themeSelect = document.getElementById('member-theme-select');

    if (profileMenu) {
        profileMenu.addEventListener('click', (e) => {
            // Prevent closing when clicking the select
            if (e.target.closest('.theme-selector')) return;
            e.stopPropagation();
            profileMenu.classList.toggle('active');
        });
    }

    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            const theme = e.target.value;
            siteSettings.theme = theme;
            applySettings();
            // Optional: Save to Firebase if you want it persistent for the user
            // update(ref(db, 'settings'), { theme: theme });
        });
    }

    window.addEventListener('click', (e) => {
        if (profileMenu && !profileMenu.contains(e.target)) {
            profileMenu.classList.remove('active');
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('currentMember');
            location.reload();
        });
    }
}

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
            const name = currentMember ? currentMember.name : "Member";
            speak(`Voice system activated. ${getTimeGreeting()} ${name}!`);
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

function applySettings() {
    const root = document.documentElement;
    const body = document.body;

    // Apply Theme
    body.classList.remove('theme-white', 'theme-black');
    if (siteSettings.theme === 'white') body.classList.add('theme-white');
    else if (siteSettings.theme === 'black') body.classList.add('theme-black');

    // Sync theme select
    const themeSelect = document.getElementById('member-theme-select');
    if (themeSelect) themeSelect.value = siteSettings.theme || 'default';

    root.style.setProperty('--neon-blue', siteSettings.neonBlue);
    root.style.setProperty('--neon-purple', siteSettings.neonPurple);
    root.style.setProperty('--bg-color', siteSettings.bg1);
    
    const logoTitle = document.querySelector('.logo span');
    if (logoTitle) logoTitle.textContent = siteSettings.siteName;
    document.title = `${siteSettings.siteName} | Member Portal`;

    const cubes = document.querySelector('.cube-container');
    if (cubes) cubes.style.display = siteSettings.threeDBg ? 'block' : 'none';
    const scanline = document.querySelector('.scanline');
    if (scanline) scanline.style.display = siteSettings.scanlines ? 'block' : 'none';

    const style = document.createElement('style');
    style.innerHTML = `
        body::before {
            background: linear-gradient(-45deg, ${siteSettings.bg1}, ${siteSettings.bg2}, #2e1065, ${siteSettings.bg1}) !important;
            background-size: 400% 400% !important;
        }
    `;
    document.head.appendChild(style);
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
        const eventData = calendarEvents[year] && calendarEvents[year][month] && calendarEvents[year][month][i];
        
        if (eventData) {
            div.classList.add('has-event');
            div.title = eventData;
        }

        div.textContent = i;
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
            cube.style.left = `calc(${cube.classList.contains('cube-1') ? '10%' : '80%'} + ${xOffset}px)`;
            cube.style.top = `calc(${cube.classList.contains('cube-1') ? '20%' : '60%'} + ${yOffset}px)`;
        });
    });
}

function populateNameDropdown() {
    const select = document.getElementById('login-name');
    if (!select) return;
    select.innerHTML = '<option value="">Select Your Name</option>';
    members.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.name;
        opt.textContent = member.name;
        select.appendChild(opt);
    });
}

function toggleAuth(type) {
    if (type === 'register') {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        authTitle.textContent = 'Register';
    } else {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        authTitle.textContent = 'Member Login';
        populateNameDropdown();
    }
}

// Registration Logic
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;

    if (members.find(m => m.name.toLowerCase() === name.toLowerCase()) || 
        pendingRequests.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        alert('This name is already registered or pending approval.');
        return;
    }

    const id = Date.now().toString();
    const newRequest = { id, name, email, phone, password, status: 'pending', timestamp: new Date().toLocaleString() };
    set(ref(db, 'pendingRequests/' + id), newRequest)
        .then(() => {
            const statusEl = document.getElementById('reg-status');
            statusEl.textContent = 'Registration sent! Please wait for admin approval.';
            statusEl.style.display = 'block';
            registerForm.reset();
        })
        .catch(err => {
            if (err.message.includes('permission_denied')) {
                alert('Firebase Permission Error: Please update your Realtime Database Rules to allow writes. Check the instructions I provided.');
            } else {
                alert('Registration failed: ' + err.message);
            }
        });
});

// Login Logic
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('login-name').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('member-login-error');

    const user = members.find(m => m.name.toLowerCase() === name.toLowerCase() && m.password === password);
    if (user) {
        currentMember = user;
        sessionStorage.setItem('currentMember', JSON.stringify(user));
        showDashboard();
        speak(`${getTimeGreeting()} ${user.name}! Welcome to your portal.`);
    } else {
        errorEl.textContent = 'Invalid credentials or account not approved.';
        errorEl.style.display = 'block';
    }
});

function showDashboard() {
    if (!currentMember) return;
    
    // Report Presence
    const memberPresenceRef = ref(db, `presence/${currentMember.id}`);
    set(memberPresenceRef, { name: currentMember.name, role: currentMember.role, lastSeen: Date.now() });
    onDisconnect(memberPresenceRef).remove();

    if (authScreen) {
        authScreen.classList.add('hidden');
        setTimeout(() => {
            authScreen.style.display = 'none';
            authScreen.classList.remove('auth-active');
        }, 1000);
    }
    if (dashboard) {
        dashboard.style.display = 'flex';
        dashboard.setAttribute('style', 'display: flex !important');
    }
    const nameDisplay = document.getElementById('member-display-name');
    const avatarDisplay = document.getElementById('member-display-avatar');
    if (nameDisplay) nameDisplay.textContent = currentMember.name;
    if (avatarDisplay) avatarDisplay.src = currentMember.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentMember.name)}&background=random`;
    updateUI();

    // Announce pending tasks after a short delay to ensure tasks are synced
    setTimeout(() => {
        const pendingTasks = tasks.filter(t => t.assigneeId === currentMember.id && (t.status === 'Pending' || t.status === 'Rejected'));
        if (pendingTasks.length > 0) {
            speak(`${currentMember.name}, you have ${pendingTasks.length} tasks pending. Please complete them by time.`);
        }
    }, 4500);
}

function updateUI() {
    renderMyTasks();
    renderTalks();
    populateTaskSelect();
    updateNotifications();
}

function updateNotifications() {
    if (!currentMember) return;

    // 1. My Tasks Dot (Pending or Ongoing tasks)
    const tasksDot = document.getElementById('dot-my-tasks');
    if (tasksDot) {
        const myActiveTasks = tasks.filter(t => t.assigneeId === currentMember.id && (t.status === 'Pending' || t.status === 'Ongoing')).length;
        if (myActiveTasks > 0) tasksDot.classList.add('active');
        else tasksDot.classList.remove('active');
    }

    // 2. Team Talks Dot (New messages in last 10 mins)
    const talksDot = document.getElementById('dot-team-talks');
    if (talksDot) {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const newMessages = talks.filter(m => m.timestamp > tenMinutesAgo).length;
        if (newMessages > 0) talksDot.classList.add('active');
        else talksDot.classList.remove('active');
    }
}

function populateTaskSelect() {
    const select = document.getElementById('submit-task-id');
    if (!select) return;
    // Allow submitting if status is 'Pending' or 'Rejected'
    const memberTasks = tasks.filter(t => t.assigneeId === currentMember.id && (t.status === 'Pending' || t.status === 'Rejected'));
    
    select.innerHTML = '<option value="">Choose a task to submit</option>';
    memberTasks.forEach(task => {
        const opt = document.createElement('option');
        opt.value = task.id;
        opt.textContent = task.title;
        select.appendChild(opt);
    });
}

document.getElementById('project-submission-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = document.getElementById('submit-task-id').value;
    const projectLink = document.getElementById('submit-project-link').value;
    const notes = document.getElementById('submit-project-notes').value;

    if (!projectLink) {
        alert('Please provide a project link.');
        return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (task) {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const submission = { 
                link: projectLink, 
                notes: notes, 
                timestamp: new Date().toLocaleString() 
            };

            await update(ref(db, 'tasks/' + taskId), { status: 'Completed', submission: submission });
            speak(`Task ${task.title} has been completed and submitted for review.`);
            
            const newTotal = (currentMember.totalProjects || 0) + 1;
            await update(ref(db, 'members/' + currentMember.id), { totalProjects: newTotal });
            
            alert('Project submitted successfully!');
            document.getElementById('project-submission-form').reset();
        } catch (error) {
            console.error('Submission failed:', error);
            alert('Error submitting project: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Project';
        }
    }
});

function renderMyTasks() {
    const list = document.getElementById('my-tasks-list');
    if (!list) return;
    const memberTasks = tasks.filter(t => t.assigneeId === currentMember.id);
    list.innerHTML = '';
    memberTasks.forEach(task => {
        const tr = document.createElement('tr');
        
        let statusBadgeClass = task.status.toLowerCase();
        if (task.status === 'Completed') statusBadgeClass = 'pending'; // Submitted but pending review
        if (task.status === 'Pending') statusBadgeClass = 'pending hollow';

        const rejectionNote = task.status === 'Rejected' ? 
            `<div style="color: var(--danger); font-size: 0.75rem; margin-top: 5px;">Reason: ${task.rejectionReason || 'N/A'}</div>` : '';

        tr.innerHTML = `
            <td data-label="Task Title">
                ${task.title}
                ${rejectionNote}
            </td>
            <td data-label="Priority"><span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span></td>
            <td data-label="Status"><span class="status-${statusBadgeClass}">${task.status === 'Completed' ? 'Reviewing' : task.status}</span></td>
            <td data-label="Due Date">${task.date}</td>
            <td data-label="Action">
                ${task.status === 'Pending' || task.status === 'Rejected' ? 
                    `<button class="btn-hollow" onclick="window.location.hash='#submit-project'">Resubmit</button>` : 
                    `<span style="color: var(--text-light); font-size: 0.875rem;">Locked</span>`}
            </td>
        `;
        list.appendChild(tr);
    });
}

function renderTalks() {
    const list = document.getElementById('member-messages-list');
    if (!list) return;
    list.innerHTML = '';
    talks.forEach(talk => {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        if (talk.sender === currentMember.name) bubble.style.alignSelf = 'flex-end';
        bubble.innerHTML = `<div class="message-header"><strong>${talk.sender}</strong><span>${talk.time}</span></div><div class="message-text">${talk.text}</div>`;
        list.appendChild(bubble);
    });
    list.scrollTop = list.scrollHeight;
}

document.getElementById('member-send-talk-btn').addEventListener('click', () => {
    const input = document.getElementById('member-talk-message');
    const text = input.value.trim();
    if (!text) return;
    const id = Date.now().toString();
    const newTalk = { id, sender: currentMember.name, text, time: new Date().toLocaleString() };
    set(ref(db, 'talks/' + id), newTalk);
    input.value = '';
});

document.getElementById('member-logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('currentMember');
    location.reload();
});

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.content-section');
    const sectionTitle = document.getElementById('section-title');
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
                sections.forEach(s => {
                    s.classList.remove('active');
                    if (s.id === sectionId) s.classList.add('active');
                });
                sectionTitle.textContent = link.querySelector('span').textContent;
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

// Expose to window
window.toggleAuth = toggleAuth;
