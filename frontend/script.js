// ============================================
// API CONFIGURATION
// ============================================
const API_URL = '/api';
let currentJobs = [];

// ============================================
// DOM ELEMENTS
// ============================================
const jobsGrid = document.getElementById('jobsGrid');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const locationSelect = document.getElementById('locationSelect');
const sourceSelect = document.getElementById('sourceSelect');
const sortSelect = document.getElementById('sortSelect');
const jobCountSpan = document.getElementById('jobCount');
const lastUpdateSpan = document.getElementById('lastUpdate');

// ============================================
// FETCH JOBS FROM BACKEND
// ============================================
async function fetchJobs() {
    const query = searchInput.value.trim() || 'digital marketing';
    const location = locationSelect.value || 'Kolkata';
    const source = sourceSelect.value || 'all';

    jobsGrid.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            Loading jobs from ${source === 'all' ? 'all sources' : source}...
        </div>
    `;

    try {
        const url = `${API_URL}/jobs?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&source=${source}`;
        console.log('📡 Fetching:', url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('📊 Response:', data);

        if (data.success) {
            currentJobs = data.jobs || [];
            const total = data.total || currentJobs.length;

            jobCountSpan.textContent = total;
            const date = new Date(data.timestamp);
            lastUpdateSpan.textContent = date.toLocaleTimeString();

            renderJobs();
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ Fetch error:', error);
        jobsGrid.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i>
                <h3>Cannot connect to backend</h3>
                <p>Please make sure the backend server is running.</p>
                <p style="font-size: 0.8rem; color: #7f8c8d; margin-top: 0.5rem;">
                    Error: ${error.message}
                </p>
            </div>
        `;
    }
}

// ============================================
// RENDER JOBS
// ============================================
function renderJobs() {
    if (!currentJobs || currentJobs.length === 0) {
        jobsGrid.innerHTML = `
            <div class="loading">
                <i class="fas fa-search" style="color: #1b5e7a;"></i>
                <h3>No jobs found</h3>
                <p>Try different search terms or location.</p>
            </div>
        `;
        return;
    }

    let jobsToRender = [...currentJobs];

    const sortBy = sortSelect.value;
    if (sortBy === 'salary') {
        jobsToRender.sort((a, b) => {
            const salaryA = extractSalaryNumber(a.salary);
            const salaryB = extractSalaryNumber(b.salary);
            return salaryB - salaryA;
        });
    }

    const html = jobsToRender.map(job => `
        <div class="job-card">
            <div class="source-badge ${job.source || 'unknown'}">${(job.source || 'unknown').toUpperCase()}</div>
            <div class="job-title">${escapeHtml(job.title || 'Job Opportunity')}</div>
            <div class="company">
                <i class="fas fa-building"></i>
                ${escapeHtml(job.company || 'Company')}
            </div>
            <div class="details">
                <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location || 'Not specified')}</span>
                <span class="salary-badge"><i class="fas fa-wallet"></i> ${escapeHtml(job.salary || 'Not specified')}</span>
                <span><i class="fas fa-briefcase"></i> Full-time</span>
            </div>
            <div class="desc">${escapeHtml((job.description || '').substring(0, 200))}...</div>
            <a href="${job.applyLink || '#'}" target="_blank" rel="noopener noreferrer" class="apply-btn">
                <i class="fas fa-paper-plane"></i> Apply Now →
            </a>
        </div>
    `).join('');

    jobsGrid.innerHTML = html;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function extractSalaryNumber(salaryStr) {
    if (!salaryStr) return 0;
    const numbers = salaryStr.match(/\d+(?:\.\d+)?/g);
    if (!numbers) return 0;
    return Math.max(...numbers.map(Number));
}

function escapeHtml(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// ============================================
// EVENT LISTENERS
// ============================================
searchBtn.addEventListener('click', fetchJobs);
sortSelect.addEventListener('change', renderJobs);

searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        fetchJobs();
    }
});

// ============================================
// LOAD ON PAGE OPEN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Job Portal Frontend Loaded');
    console.log('📡 API URL:', API_URL);
    fetchJobs();
});

// ============================================
// AUTO-REFRESH EVERY 5 MINUTES
// ============================================
setInterval(() => {
    console.log('🔄 Auto-refreshing jobs...');
    fetchJobs();
}, 300000);
