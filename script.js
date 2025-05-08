const firebaseConfig = {
    apiKey: "AIzaSyBJmnErOKgB5Pp45A00A1J_agJQFSPAyjY",
    authDomain: "edutech-a9b19.firebaseapp.com",
    databaseURL: "https://edutech-a9b19-default-rtdb.firebaseio.com",
    projectId: "edutech-a9b19",
    storageBucket: "edutech-a9b19.firebasestorage.app",
    messagingSenderId: "436628237784",
    appId: "1:436628237784:web:0683a574cdb0b9401616ad",
    measurementId: "G-FK8CSTSW64"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
} catch (error) {
    console.error('Firebase initialization failed:', error);
    showError('login-error', `Failed to initialize application: ${error.message}`);
}

const auth = firebase.auth();
const db = firebase.database();

// Valid plan types and their amounts
const PLAN_AMOUNTS = {
    'Core Monthly': 1000,
    'Core Yearly': 9000,
    'Pro Monthly': 2000,
    'Pro Yearly': 18000,
    'Elite Monthly': 3000,
    'Elite Yearly': 27000
};

const VALID_PLANS = Object.keys(PLAN_AMOUNTS);

// DOM Elements (cached for performance)
const DOM = {
    sections: document.querySelectorAll('.content-section'),
    navLinks: document.querySelectorAll('.nav-link'),
    userTableBody: document.getElementById('user-table-body'),
    paymentTableBody: document.getElementById('payment-table-body'),
    subscriptionTableBody: document.getElementById('subscription-table-body'),
    revenueTableBody: document.getElementById('revenue-table-body'),
    recentActivity: document.getElementById('recent-activity'),
    adminName: document.getElementById('admin-name'),
    revenueFilter: document.getElementById('revenue-filter'),
    loginView: document.getElementById('login-view'),
    adminPanel: document.getElementById('admin-panel'),
    searchInput: document.getElementById('search-input'),
    userFilter: document.getElementById('user-filter'),
    paymentFilter: document.getElementById('payment-filter'),
    totalUsers: document.getElementById('total-users'),
    activeSubs: document.getElementById('active-subs'),
    pendingPayments: document.getElementById('pending-payments'),
    revenue: document.getElementById('revenue'),
    totalRevenue: document.getElementById('total-revenue'),
};

// State
let currentUserId = null;
let subscriptionChart = null;
let listeners = [];

// Utility Functions
function showError(elementId, message, isSuccess = false) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        element.style.color = isSuccess ? '#10b981' : '#ef4444';
        setTimeout(() => { element.style.display = 'none'; }, 5000);
    }
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.style.display = 'block';
}

function hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.style.display = 'none';
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    return phone ? /^\+?[1-9]\d{1,14}$/.test(phone) : true;
}

function validatePassword(password) {
    return password.length >= 6;
}

function validateName(name) {
    return name.trim().length > 0 && name.trim().length <= 100;
}

function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        const firstInput = modal.querySelector('input, select');
        if (firstInput) firstInput.focus();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        const error = modal.querySelector('.error-message');
        if (error) error.style.display = 'none';
        const inputs = modal.querySelectorAll('input, select');
        inputs.forEach(input => input.value = '');
    }
}

// Handle Escape key to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
            closeModal(activeModal.id);
        }
    }
});

// Show Section
function showSection(sectionId) {
    DOM.sections.forEach(section => section.style.display = 'none');
    const section = document.getElementById(sectionId);
    if (section) {
        section.style.display = 'block';
    }
    DOM.navLinks.forEach(link => {
        link.classList.remove('active');
        link.setAttribute('aria-current', 'false');
    });
    const activeLink = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
        activeLink.setAttribute('aria-current', 'true');
    }
    detachListeners(sectionId);
    if (sectionId === 'dashboard') loadDashboard();
    else if (sectionId === 'users') loadUsers();
    else if (sectionId === 'payments') loadPayments();
    else if (sectionId === 'subscriptions') loadSubscriptions();
    else if (sectionId === 'revenue') loadRevenue();
    else if (sectionId === 'profile') loadProfile(auth.currentUser, { name: DOM.adminName.textContent });
}

// Detach Listeners
function detachListeners(activeSection) {
    listeners.forEach(({ ref, handler }) => {
        if (
            (activeSection === 'users' && ref !== 'users') ||
            (activeSection === 'payments' && ref !== 'pending_payments') ||
            (activeSection === 'subscriptions' && ref !== 'users') ||
            (activeSection === 'revenue' && ref !== 'users')
        ) {
            db.ref(ref).off('value', handler);
        }
    });
    listeners = listeners.filter(({ ref }) => (
        (activeSection === 'users' && ref === 'users') ||
        (activeSection === 'payments' && ref === 'pending_payments') ||
        (activeSection === 'subscriptions' && ref === 'users') ||
        (activeSection === 'revenue' && ref === 'users')
    ));
    console.log(`Active listeners: ${listeners.length}`);
}

// Navigation
DOM.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        showSection(section);
    });
});

// Search Functionality
function setupSearch() {
    if (DOM.searchInput) {
        let debounceTimeout;
        DOM.searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const query = sanitizeInput(e.target.value.toLowerCase().trim());
                const activeSection = document.querySelector('.content-section[style*="block"]')?.id;
                if (activeSection === 'users') loadUsers(query);
                else if (activeSection === 'payments') loadPayments(query);
                else if (activeSection === 'subscriptions') loadSubscriptions(query);
            }, 300);
        });
    }
}

// Redirect to Users Section
function redirectToUsers() {
    showSection('users');
}

// Load Profile Data
async function loadProfile(user, userData) {
    showLoading('profile-loading');
    try {
        const profileName = document.getElementById('profile-name');
        const profileRole = document.getElementById('profile-role');
        const profileEmail = document.getElementById('profile-email');
        const profilePhone = document.getElementById('profile-phone');
        const profileLastLogin = document.getElementById('profile-last-login');
        const profileCreated = document.getElementById('profile-created');
        const profileSubscription = document.getElementById('profile-subscription');

        const snapshot = await db.ref('users/' + user.uid).once('value');
        const dbData = snapshot.val() || {};

        if (profileName) profileName.textContent = sanitizeInput(dbData.name || userData.name || 'Admin User');
        if (profileRole) profileRole.textContent = sanitizeInput(dbData.role ? dbData.role.charAt(0).toUpperCase() + dbData.role.slice(1) : 'Admin');
        if (profileEmail) profileEmail.textContent = sanitizeInput(dbData.email || user.email || 'N/A');
        if (profilePhone) profilePhone.textContent = sanitizeInput(dbData.phone || 'Not provided');
        if (profileLastLogin) profileLastLogin.textContent = dbData.lastLogin ? new Date(dbData.lastLogin).toLocaleString() : 'N/A';
        if (profileCreated) profileCreated.textContent = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleString() : 'N/A';
        if (profileSubscription) profileSubscription.textContent = sanitizeInput(dbData.subscription_plan || 'N/A');
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('profile-error', `Failed to load profile: ${error.message}`);
    } finally {
        hideLoading('profile-loading');
    }
}

// Handle Login
async function handleLogin() {
    const email = sanitizeInput(document.getElementById('login-email')?.value?.trim());
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
        showError('login-error', 'Please enter both email and password.');
        return;
    }

    if (!validateEmail(email)) {
        showError('login-error', 'Invalid email format.');
        return;
    }

    showLoading('login-loading');
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        if (!user) {
            throw new Error('Authentication failed.');
        }
        console.log('User logged in:', { uid: user.uid, email: user.email });
    } catch (error) {
        console.error('Login error:', error);
        showError('login-error', `Login failed: ${error.message}`);
    } finally {
        hideLoading('login-loading');
    }
}

// Authentication Check
auth.onAuthStateChanged(user => {
    if (user) {
        db.ref('users/' + user.uid).once('value').then(snapshot => {
            const userData = snapshot.val();
            if (userData && userData.role === 'admin') {
                currentUserId = user.uid;
                if (DOM.loginView) DOM.loginView.style.display = 'none';
                if (DOM.adminPanel) DOM.adminPanel.style.display = 'flex';
                if (DOM.adminName) DOM.adminName.textContent = sanitizeInput(userData.name || 'Admin');
                loadProfile(user, userData);
                showSection('dashboard');
                setupSearch();
                db.ref('users/' + user.uid).update({ lastLogin: Date.now() }).catch(error => {
                    console.error('Error updating last login:', error);
                });
            } else {
                showError('login-error', 'Access denied: Not an admin user.');
                auth.signOut().then(() => {
                    if (DOM.loginView) DOM.loginView.style.display = 'flex';
                    if (DOM.adminPanel) DOM.adminPanel.style.display = 'none';
                });
            }
        }).catch(error => {
            console.error('Error fetching user data:', error);
            showError('login-error', `Failed to verify user: ${error.message}`);
            auth.signOut().then(() => {
                if (DOM.loginView) DOM.loginView.style.display = 'flex';
                if (DOM.adminPanel) DOM.adminPanel.style.display = 'none';
            });
        });
    } else {
        currentUserId = null;
        if (DOM.loginView) DOM.loginView.style.display = 'flex';
        if (DOM.adminPanel) DOM.adminPanel.style.display = 'none';
        detachListeners('');
    }
});

// Handle Logout
async function handleLogout() {
    try {
        await auth.signOut();
        detachListeners('');
        listeners = [];
        if (subscriptionChart) {
            subscriptionChart.destroy();
            subscriptionChart = null;
        }
        console.log('User logged out');
    } catch (error) {
        console.error('Logout error:', error);
        showError('settings-error', `Failed to log out: ${error.message}`);
    }
}

// Change Admin Credentials
async function changeAdminCredentials() {
    const newEmail = sanitizeInput(document.getElementById('new-admin-email')?.value.trim());
    const newPassword = document.getElementById('new-admin-password')?.value;

    if (!newEmail && !newPassword) {
        showError('settings-error', 'Please enter a new email or password.');
        return;
    }

    if (newEmail && !validateEmail(newEmail)) {
        showError('settings-error', 'Invalid email format.');
        return;
    }

    if (newPassword && !validatePassword(newPassword)) {
        showError('settings-error', 'Password must be at least 6 characters.');
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        showError('settings-error', 'No user is logged in.');
        return;
    }

    showLoading('settings-loading');
    try {
        const promises = [];
        if (newEmail) {
            await user.updateEmail(newEmail);
            promises.push(db.ref('users/' + user.uid).update({ email: newEmail }));
        }
        if (newPassword) {
            await user.updatePassword(newPassword);
        }
        await Promise.all(promises);
        showError('settings-error', 'Credentials updated successfully.', true);
        if (document.getElementById('new-admin-email')) document.getElementById('new-admin-email').value = '';
        if (document.getElementById('new-admin-password')) document.getElementById('new-admin-password').value = '';
        logActivity(user.email, 'changed admin credentials');
    } catch (error) {
        console.error('Error updating credentials:', error);
        showError('settings-error', `Failed to update credentials: ${error.message}`);
    } finally {
        hideLoading('settings-loading');
    }
}

// Save Settings
async function saveSettings() {
    const trialDuration = document.getElementById('trial-duration')?.value;
    const mfaEnabled = document.getElementById('mfa-enabled')?.checked;

    if (!trialDuration || trialDuration < 1) {
        showError('settings-error', 'Trial duration must be at least 1 hour.');
        return;
    }

    showLoading('settings-loading');
    try {
        await db.ref('settings').update({
            trial_duration: parseInt(trialDuration),
            mfa_enabled: mfaEnabled
        });
        showError('settings-error', 'Settings saved successfully.', true);
        logActivity(auth.currentUser.email, 'updated system settings');
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('settings-error', `Failed to save settings: ${error.message}`);
    } finally {
        hideLoading('settings-loading');
    }
}

// Log Activity
function logActivity(userEmail, action) {
    db.ref('activity').push({
        user: sanitizeInput(userEmail),
        action: sanitizeInput(action),
        timestamp: Date.now()
    }).catch(error => {
        console.error('Error logging activity:', error);
    });
}

// Load Dashboard Data
async function loadDashboard() {
    showLoading('dashboard-loading');
    try {
        // Total Users
        const userSnapshot = await db.ref('users').once('value');
        if (DOM.totalUsers) DOM.totalUsers.textContent = userSnapshot.numChildren() || 0;

        // Active Subscriptions
        let activeSubs = 0;
        userSnapshot.forEach(child => {
            const user = child.val();
            if (user.subscription_status && user.subscription_expiry > Date.now()) {
                activeSubs++;
            }
        });
        if (DOM.activeSubs) DOM.activeSubs.textContent = activeSubs;

        // Pending Payments
        const paymentSnapshot = await db.ref('pending_payments').once('value');
        if (DOM.pendingPayments) DOM.pendingPayments.textContent = paymentSnapshot.numChildren() || 0;

        // Revenue (This Month)
        let totalRevenue = 0;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        userSnapshot.forEach(child => {
            const user = child.val();
            if (
                user.subscription_status &&
                user.subscription_expiry > Date.now() &&
                user.subscription_amount &&
                user.subscription_start &&
                user.payment_status === 'Approved'
            ) {
                const startDate = new Date(user.subscription_start);
                if (!isNaN(startDate) && startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear) {
                    totalRevenue += parseFloat(user.subscription_amount) || 0;
                }
            }
        });
        if (DOM.revenue) DOM.revenue.textContent = `₹${totalRevenue.toFixed(2)}`;

        // Recent Activity
        const activitySnapshot = await db.ref('activity').orderByChild('timestamp').limitToLast(5).once('value');
        if (DOM.recentActivity) {
            DOM.recentActivity.innerHTML = '';
            if (activitySnapshot.exists()) {
                activitySnapshot.forEach(child => {
                    const activity = child.val();
                    const li = document.createElement('li');
                    li.textContent = `${sanitizeInput(activity.user)} ${sanitizeInput(activity.action)} at ${new Date(activity.timestamp).toLocaleString()}`;
                    DOM.recentActivity.appendChild(li);
                });
            } else {
                DOM.recentActivity.innerHTML = '<li>No recent activity.</li>';
            }
        }

        // Subscription Chart (Dynamic Data)
        const months = Array.from({ length: 5 }, (_, i) => {
            const date = new Date();
            date.setMonth(date.getMonth() - (4 - i));
            return date.toLocaleString('default', { month: 'short' });
        });
        const subCounts = Array(5).fill(0);
        userSnapshot.forEach(child => {
            const user = child.val();
            if (user.subscription_start && user.payment_status === 'Approved') {
                const startDate = new Date(user.subscription_start);
                const monthDiff = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
                if (monthDiff >= 0 && monthDiff < 5) {
                    subCounts[4 - monthDiff]++;
                }
            }
        });

        if (window.Chart && document.getElementById('subscription-chart')) {
            const ctx = document.getElementById('subscription-chart').getContext('2d');
            if (!ctx) throw new Error('Chart canvas context not found');
            if (subscriptionChart) subscriptionChart.destroy();
            subscriptionChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Subscriptions',
                        data: subCounts,
                        borderColor: '#4f46e5',
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        } else {
            const chartContainer = document.getElementById('subscription-chart')?.parentElement;
            if (chartContainer) {
                chartContainer.innerHTML = '<p>Chart unavailable: Library not loaded.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('dashboard-error', `Failed to load dashboard: ${error.message}`);
        if (DOM.totalUsers) DOM.totalUsers.textContent = 'N/A';
        if (DOM.activeSubs) DOM.activeSubs.textContent = 'N/A';
        if (DOM.pendingPayments) DOM.pendingPayments.textContent = 'N/A';
        if (DOM.revenue) DOM.revenue.textContent = '₹0';
        if (DOM.recentActivity) DOM.recentActivity.innerHTML = '<li>Error loading activity.</li>';
    } finally {
        hideLoading('dashboard-loading');
    }
}

// Load Users
async function loadUsers(searchQuery = '') {
    showLoading('users-loading');
    const roleFilter = DOM.userFilter?.value || 'all';
    try {
        const handler = snapshot => {
            if (DOM.userTableBody) {
                DOM.userTableBody.innerHTML = '';
                if (snapshot.exists()) {
                    let hasUsers = false;
                    snapshot.forEach(child => {
                        const user = child.val();
                        const matchesSearch = !searchQuery || 
                            user.name?.toLowerCase().includes(searchQuery) || 
                            user.email?.toLowerCase().includes(searchQuery);
                        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
                        if (matchesSearch && matchesRole) {
                            hasUsers = true;
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${sanitizeInput(user.name || 'N/A')}</td>
                                <td>${sanitizeInput(user.email || 'N/A')}</td>
                                <td>${sanitizeInput(user.role || 'user')}</td>
                                <td>${user.subscription_status ? 'Active' : 'Inactive'}</td>
                                <td>
                                    <button class="edit-btn" onclick="editUser('${child.key}')" aria-label="Edit User ${sanitizeInput(user.name || 'User')}">Edit</button>
                                    <button class="delete-btn" onclick="deleteUser('${child.key}')" aria-label="Delete User ${sanitizeInput(user.name || 'User')}">Delete</button>
                                </td>
                            `;
                            DOM.userTableBody.appendChild(row);
                        }
                    });
                    if (!hasUsers) {
                        DOM.userTableBody.innerHTML = '<tr><td colspan="5">No users match the criteria.</td></tr>';
                    }
                } else {
                    DOM.userTableBody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
                }
            }
        };
        db.ref('users').off('value');
        db.ref('users').on('value', handler);
        listeners.push({ ref: 'users', handler });
    } catch (error) {
        console.error('Error loading users:', error);
        showError('users-error', `Failed to load users: ${error.message}`);
        if (DOM.userTableBody) DOM.userTableBody.innerHTML = '<tr><td colspan="5">Error loading users.</td></tr>';
    } finally {
        hideLoading('users-loading');
    }
}

// Load Payments
async function loadPayments(searchQuery = '') {
    showLoading('payments-loading');
    const statusFilter = DOM.paymentFilter?.value || 'all';
    try {
        const handler = async snapshot => {
            if (DOM.paymentTableBody) {
                DOM.paymentTableBody.innerHTML = '';
                if (snapshot.exists()) {
                    const fragment = document.createDocumentFragment();
                    const paymentPromises = [];
                    let hasPayments = false;
                    snapshot.forEach(child => {
                        const payment = child.val();
                        const userId = child.key;
                        paymentPromises.push(
                            db.ref('users/' + userId).once('value').then(userSnapshot => {
                                const user = userSnapshot.val() || {};
                                const matchesSearch = !searchQuery || 
                                    user.name?.toLowerCase().includes(searchQuery) || 
                                    payment.plan?.toLowerCase().includes(searchQuery);
                                const matchesStatus = statusFilter === 'all' || payment.status?.toLowerCase() === statusFilter;
                                if (matchesSearch && matchesStatus) {
                                    hasPayments = true;
                                    const plan = payment.plan && typeof payment.plan === 'string' && VALID_PLANS.includes(payment.plan) ? payment.plan : 'Unknown Plan';
                                    const amount = payment.amount && !isNaN(payment.amount) ? payment.amount : (PLAN_AMOUNTS[plan] || 0);
                                    const row = document.createElement('tr');
                                    row.innerHTML = `
                                        <td>${sanitizeInput(user.name || 'N/A')}</td>
                                        <td>${sanitizeInput(plan)}</td>
                                        <td>₹${amount}</td>
                                        <td>${sanitizeInput(payment.unique_id || 'N/A')}</td>
                                        <td>${sanitizeInput(payment.status || 'Pending')}</td>
                                        <td>
                                            <button class="approve-btn" onclick="approvePayment('${userId}')" aria-label="Approve Payment for ${sanitizeInput(user.name || 'User')}">Approve</button>
                                            <button class="reject-btn" onclick="rejectPayment('${userId}')" aria-label="Reject Payment for ${sanitizeInput(user.name || 'User')}">Reject</button>
                                        </td>
                                    `;
                                    return row;
                                }
                                return null;
                            }).catch(error => {
                                console.error(`Error fetching user ${userId}:`, error);
                                return null;
                            })
                        );
                    });
                    const rows = await Promise.all(paymentPromises);
                    rows.forEach(row => {
                        if (row) fragment.appendChild(row);
                    });
                    DOM.paymentTableBody.appendChild(fragment);
                    if (!hasPayments) {
                        DOM.paymentTableBody.innerHTML = '<tr><td colspan="6">No payments match the criteria.</td></tr>';
                    }
                } else {
                    DOM.paymentTableBody.innerHTML = '<tr><td colspan="6">No payments found.</td></tr>';
                }
            }
        };
        db.ref('pending_payments').off('value');
        db.ref('pending_payments').on('value', handler);
        listeners.push({ ref: 'pending_payments', handler });
    } catch (error) {
        console.error('Error loading payments:', error);
        showError('payments-error', `Failed to load payments: ${error.message}`);
        if (DOM.paymentTableBody) DOM.paymentTableBody.innerHTML = '<tr><td colspan="6">Error loading payments.</td></tr>';
    } finally {
        hideLoading('payments-loading');
    }
}

// Load Subscriptions
async function loadSubscriptions(searchQuery = '') {
    showLoading('subscriptions-loading');
    try {
        const handler = snapshot => {
            if (DOM.subscriptionTableBody) {
                DOM.subscriptionTableBody.innerHTML = '';
                if (snapshot.exists()) {
                    let hasActiveSubscriptions = false;
                    snapshot.forEach(child => {
                        const user = child.val();
                        const matchesSearch = !searchQuery || 
                            user.name?.toLowerCase().includes(searchQuery) || 
                            user.email?.toLowerCase().includes(searchQuery) || 
                            user.subscription_plan?.toLowerCase().includes(searchQuery);
                        if (user.subscription_status && user.subscription_expiry > Date.now() && matchesSearch && user.payment_status === 'Approved') {
                            hasActiveSubscriptions = true;
                            const startDate = user.subscription_start ? new Date(user.subscription_start).toLocaleDateString() : 'N/A';
                            const expiryDate = user.subscription_expiry ? new Date(user.subscription_expiry).toLocaleDateString() : 'N/A';
                            const timeLeftMs = user.subscription_expiry - Date.now();
                            const daysLeft = Math.floor(timeLeftMs / (1000 * 60 * 60 * 24));
                            const hoursLeft = Math.floor((timeLeftMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                            const timeLeft = `${daysLeft} days, ${hoursLeft} hours`;
                            const plan = VALID_PLANS.includes(user.subscription_plan) ? user.subscription_plan : user.subscription_plan || 'Core Monthly';

                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${sanitizeInput(user.name || 'N/A')}</td>
                                <td>${sanitizeInput(user.email || 'N/A')}</td>
                                <td>${sanitizeInput(plan)}</td>
                                <td>${startDate}</td>
                                <td>${expiryDate}</td>
                                <td>${timeLeft}</td>
                            `;
                            DOM.subscriptionTableBody.appendChild(row);
                        }
                    });
                    if (!hasActiveSubscriptions) {
                        DOM.subscriptionTableBody.innerHTML = '<tr><td colspan="6">No active subscriptions found.</td></tr>';
                    }
                } else {
                    DOM.subscriptionTableBody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
                }
            }
        };
        db.ref('users').off('value');
        db.ref('users').on('value', handler);
        listeners.push({ ref: 'users', handler });
    } catch (error) {
        console.error('Error loading subscriptions:', error);
        showError('subscriptions-error', `Failed to load subscriptions: ${error.message}`);
        if (DOM.subscriptionTableBody) DOM.subscriptionTableBody.innerHTML = '<tr><td colspan="6">Error loading subscriptions.</td></tr>';
    } finally {
        hideLoading('subscriptions-loading');
    }
}

// Load Revenue
async function loadRevenue() {
    showLoading('revenue-loading');
    if (!DOM.revenueTableBody) {
        console.error('Revenue table body element not found.');
        showError('revenue-error', 'Failed to load revenue: Table element missing.');
        hideLoading('revenue-loading');
        return;
    }
    const filter = DOM.revenueFilter?.value || 'all-active';
    console.log('Loading revenue with filter:', filter);
    try {
        const handler = snapshot => {
            DOM.revenueTableBody.innerHTML = '';
            let totalRevenue = 0;
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            let hasApprovedSubscriptions = false;

            if (snapshot.exists()) {
                let subscriptionCount = 0;
                snapshot.forEach(child => {
                    const user = child.val();
                    const userId = child.key;
                    if (
                        user.subscription_status &&
                        user.subscription_expiry > Date.now() &&
                        user.payment_status === 'Approved'
                    ) {
                        hasApprovedSubscriptions = true;
                        subscriptionCount++;
                        const plan = VALID_PLANS.includes(user.subscription_plan) ? user.subscription_plan : 'Core Monthly';
                        const amount = user.subscription_amount && !isNaN(user.subscription_amount) && user.subscription_amount > 0 ? parseFloat(user.subscription_amount) : (PLAN_AMOUNTS[plan] || 0);
                        const startDate = user.subscription_start ? new Date(user.subscription_start) : null;

                        let includeInTable = false;
                        if (filter === 'all-active') {
                            includeInTable = true;
                            totalRevenue += amount;
                        } else if (filter === 'this-month' && startDate && !isNaN(startDate) && startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear) {
                            includeInTable = true;
                            totalRevenue += amount;
                        }

                        if (includeInTable) {
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${sanitizeInput(user.name || 'N/A')}</td>
                                <td>${sanitizeInput(user.email || 'N/A')}</td>
                                <td>${sanitizeInput(plan)}</td>
                                <td>₹${amount.toFixed(2)}</td>
                                <td>${startDate ? startDate.toLocaleDateString() : 'N/A'}</td>
                            `;
                            DOM.revenueTableBody.appendChild(row);
                        }
                    }
                });
                console.log(`Found ${subscriptionCount} approved subscriptions.`);

                if (!hasApprovedSubscriptions) {
                    DOM.revenueTableBody.innerHTML = '<tr><td colspan="5">No approved subscriptions found.</td></tr>';
                } else if (DOM.revenueTableBody.innerHTML === '') {
                    DOM.revenueTableBody.innerHTML = '<tr><td colspan="5">No subscriptions match the selected filter.</td></tr>';
                }
            } else {
                DOM.revenueTableBody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
            }

            if (DOM.totalRevenue) {
                DOM.totalRevenue.textContent = `₹${totalRevenue.toFixed(2)}`;
                console.log('Total revenue:', totalRevenue);
            } else {
                console.error('Total revenue element not found.');
            }
        };

        db.ref('users').off('value');
        db.ref('users').on('value', handler);
        listeners.push({ ref: 'users', handler });
    } catch (error) {
        console.error('Error loading revenue:', error);
        showError('revenue-error', `Failed to load revenue: ${error.message}`);
        DOM.revenueTableBody.innerHTML = '<tr><td colspan="5">Error loading revenue.</td></tr>';
        if (DOM.totalRevenue) DOM.totalRevenue.textContent = '₹0';
    } finally {
        hideLoading('revenue-loading');
    }
}

// Show Add User Modal
function showAddUserModal() {
    showModal('add-user-modal');
}

// Add User
async function addUser() {
    const name = sanitizeInput(document.getElementById('user-name')?.value.trim());
    const email = sanitizeInput(document.getElementById('user-email')?.value.trim());
    const role = document.getElementById('user-role')?.value;

    if (!validateName(name)) {
        showError('add-user-error', 'Please enter a valid name (1-100 characters).');
        return;
    }

    if (!validateEmail(email)) {
        showError('add-user-error', 'Invalid email format.');
        return;
    }

    if (!['admin', 'instructor', 'student'].includes(role)) {
        showError('add-user-error', 'Invalid role selected.');
        return;
    }

    showLoading('users-loading');
    try {
        // Create user in Firebase Authentication
        const tempPassword = Math.random().toString(36).slice(-8); // Temporary password
        const userCredential = await auth.createUserWithEmailAndPassword(email, tempPassword);
        const user = userCredential.user;

        // Save user data to Realtime Database
        await db.ref('users/' + user.uid).set({
            name,
            email,
            role,
            created_at: Date.now(),
            subscription_status: false
        });

        // Send password reset email
        await auth.sendPasswordResetEmail(email);

        showError('add-user-error', 'User added successfully. A password reset email has been sent.', true);
        closeModal('add-user-modal');
        logActivity(auth.currentUser.email, `added user ${email}`);
        loadUsers();
    } catch (error) {
        console.error('Error adding user:', error);
        showError('add-user-error', `Failed to add user: ${error.message}`);
    } finally {
        hideLoading('users-loading');
    }
}

// Edit User
async function editUser(userId) {
    try {
        const snapshot = await db.ref('users/' + userId).once('value');
        const user = snapshot.val();
        if (!user) {
            showError('users-error', 'User not found.');
            return;
        }

        const nameInput = document.getElementById('edit-user-name');
        const emailInput = document.getElementById('edit-user-email');
        const roleSelect = document.getElementById('edit-user-role');

        if (nameInput) nameInput.value = user.name || '';
        if (emailInput) emailInput.value = user.email || '';
        if (roleSelect) roleSelect.value = user.role || 'student';

        // Store userId in modal for saving
        const modal = document.getElementById('edit-user-modal');
        if (modal) modal.dataset.userId = userId;

        showModal('edit-user-modal');
    } catch (error) {
        console.error('Error loading user for edit:', error);
        showError('users-error', `Failed to load user: ${error.message}`);
    }
}

// Save User
async function saveUser() {
    const modal = document.getElementById('edit-user-modal');
    const userId = modal?.dataset.userId;
    const name = sanitizeInput(document.getElementById('edit-user-name')?.value.trim());
    const email = sanitizeInput(document.getElementById('edit-user-email')?.value.trim());
    const role = document.getElementById('edit-user-role')?.value;

    if (!userId) {
        showError('edit-user-error', 'Invalid user ID.');
        return;
    }

    if (!validateName(name)) {
        showError('edit-user-error', 'Please enter a valid name (1-100 characters).');
        return;
    }

    if (!validateEmail(email)) {
        showError('edit-user-error', 'Invalid email format.');
        return;
    }

    if (!['admin', 'instructor', 'student'].includes(role)) {
        showError('edit-user-error', 'Invalid role selected.');
        return;
    }

    showLoading('users-loading');
    try {
        const updates = { name, email, role };
        await db.ref('users/' + userId).update(updates);

        // Update email in Firebase Authentication
        const user = auth.currentUser;
        if (user && user.uid === userId && user.email !== email) {
            await user.updateEmail(email);
        }

        showError('edit-user-error', 'User updated successfully.', true);
        closeModal('edit-user-modal');
        logActivity(auth.currentUser.email, `edited user ${email}`);
        loadUsers();
    } catch (error) {
        console.error('Error saving user:', error);
        showError('edit-user-error', `Failed to save user: ${error.message}`);
    } finally {
        hideLoading('users-loading');
    }
}

// Delete User
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }

    showLoading('users-loading');
    try {
        const snapshot = await db.ref('users/' + userId).once('value');
        const user = snapshot.val();
        if (!user) {
            showError('users-error', 'User not found.');
            return;
        }

        // Remove user data from Realtime Database
        await db.ref('users/' + userId).remove();
        await db.ref('pending_payments/' + userId).remove();

        showError('users-error', 'User deleted successfully.', true);
        logActivity(auth.currentUser.email, `deleted user ${user.email || 'unknown'}`);
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        showError('users-error', `Failed to delete user: ${error.message}`);
    } finally {
        hideLoading('users-loading');
    }
}

// Approve Payment
async function approvePayment(userId) {
    showLoading('payments-loading');
    try {
        const paymentSnapshot = await db.ref('pending_payments/' + userId).once('value');
        const payment = paymentSnapshot.val();
        if (!payment) {
            showError('payments-error', 'Payment not found.');
            return;
        }

        const userSnapshot = await db.ref('users/' + userId).once('value');
        const user = userSnapshot.val();
        if (!user) {
            showError('payments-error', 'User not found.');
            return;
        }

        if (!payment.plan || !VALID_PLANS.includes(payment.plan)) {
            console.warn(`Invalid or missing plan for user ${userId}: ${payment.plan}, defaulting to Core Monthly`);
        }
        if (!payment.amount || isNaN(payment.amount) || payment.amount <= 0) {
            console.warn(`Invalid or missing amount for user ${userId}: ${payment.amount}`);
        }

        const plan = payment.plan && VALID_PLANS.includes(payment.plan) ? payment.plan : 'Core Monthly';
        const amount = payment.amount && !isNaN(payment.amount) && payment.amount > 0 ? payment.amount : PLAN_AMOUNTS[plan];
        if (!amount || amount <= 0) {
            throw new Error('Invalid payment amount.');
        }

        const isYearly = plan.toLowerCase().includes('yearly');
        const duration = isYearly ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; // 1 year or 1 month
        const startDate = Date.now();
        const expiryDate = startDate + duration;

        // Update user subscription
        const updates = {
            subscription_status: true,
            subscription_plan: plan,
            subscription_amount: amount,
            subscription_start: startDate,
            subscription_expiry: expiryDate,
            payment_status: 'Approved'
        };
        console.log(`Approving payment for user ${userId}:`, updates);
        await db.ref('users/' + userId).update(updates);

        // Remove payment from pending_payments
        await db.ref('pending_payments/' + userId).remove();

        showError('payments-error', 'Payment approved successfully.', true);
        logActivity(auth.currentUser.email, `approved payment for ${user.email || 'unknown'}`);
        loadPayments();
    } catch (error) {
        console.error('Error approving payment:', error);
        showError('payments-error', `Failed to approve payment: ${error.message}`);
    } finally {
        hideLoading('payments-loading');
    }
}

// Reject Payment
async function rejectPayment(userId) {
    showLoading('payments-loading');
    try {
        const paymentSnapshot = await db.ref('pending_payments/' + userId).once('value');
        const payment = paymentSnapshot.val();
        if (!payment) {
            showError('payments-error', 'Payment not found.');
            return;
        }

        const userSnapshot = await db.ref('users/' + userId).once('value');
        const user = userSnapshot.val();
        if (!user) {
            showError('payments-error', 'User not found.');
            return;
        }

        // Update user payment status
        await db.ref('users/' + userId).update({
            payment_status: 'Rejected'
        });

        // Remove payment from pending_payments
        await db.ref('pending_payments/' + userId).remove();

        showError('payments-error', 'Payment rejected successfully.', true);
        logActivity(auth.currentUser.email, `rejected payment for ${user.email || 'unknown'}`);
        loadPayments();
    } catch (error) {
        console.error('Error rejecting payment:', error);
        showError('payments-error', `Failed to reject payment: ${error.message}`);
    } finally {
        hideLoading('payments-loading');
    }
}

// Edit Profile
async function editProfile() {
    try {
        const user = auth.currentUser;
        if (!user) {
            showError('profile-error', 'No user is logged in.');
            return;
        }

        const snapshot = await db.ref('users/' + user.uid).once('value');
        const userData = snapshot.val() || {};

        const nameInput = document.getElementById('edit-name');
        const phoneInput = document.getElementById('edit-phone');

        if (nameInput) nameInput.value = userData.name || '';
        if (phoneInput) phoneInput.value = userData.phone || '';

        showModal('edit-profile-modal');
    } catch (error) {
        console.error('Error loading profile for edit:', error);
        showError('profile-error', `Failed to load profile: ${error.message}`);
    }
}

// Save Profile
async function saveProfile() {
    const name = sanitizeInput(document.getElementById('edit-name')?.value.trim());
    const phone = sanitizeInput(document.getElementById('edit-phone')?.value.trim());

    if (!validateName(name)) {
        showError('edit-profile-error', 'Please enter a valid name (1-100 characters).');
        return;
    }

    if (!validatePhone(phone)) {
        showError('edit-profile-error', 'Invalid phone number format.');
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        showError('edit-profile-error', 'No user is logged in.');
        return;
    }

    showLoading('profile-loading');
    try {
        const updates = { name };
        if (phone) updates.phone = phone;
        await db.ref('users/' + user.uid).update(updates);

        if (DOM.adminName) DOM.adminName.textContent = sanitizeInput(name);
        showError('edit-profile-error', 'Profile updated successfully.', true);
        closeModal('edit-profile-modal');
        logActivity(user.email, 'updated profile');
        loadProfile(user, { name });
    } catch (error) {
        console.error('Error saving profile:', error);
        showError('edit-profile-error', `Failed to save profile: ${error.message}`);
    } finally {
        hideLoading('profile-loading');
    }
}
