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
const aiSearchBtn = document.getElementById('aiSearchBtn');
const searchInput = document.getElementById('searchInput');
const locationSelect = document.getElementById('locationSelect');
const sortSelect = document.getElementById('sortSelect');
const jobCountSpan = document.getElementById('jobCount');
const lastUpdateSpan = document.getElementById('lastUpdate');
const aiSummarySection = document.getElementById('aiSummarySection');
const aiSummaryContent = document.getElementById('aiSummaryContent');
const closeAiBtn = document.getElementById('closeAiBtn');

// ============================================
// FETCH JOBS FROM BACKEND
// ============================================
async function fetchJobs() {
    const query = searchInput.value.trim() || 'digital marketing';
    const location = locationSelect.value || 'Kolkata';

    jobsGrid.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            Loading jobs...
        </div>
    `;

    try {
        const url = `${API_URL}/jobs?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;
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
// 🤖 AI SEARCH
// ============================================
async function fetchAIJobs() {
    const query = searchInput.value.trim() || 'digital marketing';
    const location = locationSelect.value || 'Kolkata';

    // Show AI section
    aiSummarySection.style.display = 'block';
    aiSummaryContent.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <h3>AI is analyzing jobs...</h3>
            <p>This may take 10-20 seconds</p>
        </div>
    `;

    // Scroll to AI section
    aiSummarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const url = `${API_URL}/ai-jobs?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;
        console.log('🤖 AI Fetching:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('🤖 AI Response:', data);

        if (data.success) {
            // Convert Markdown to HTML using marked.js
            const htmlContent = marked.parse(data.ai_summary);
            aiSummaryContent.innerHTML = htmlContent;
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ AI Fetch error:', error);
        aiSummaryContent.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i>
                <h3>AI Error</h3>
                <p>${error.message}</p>
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

    const html = jobsToRender.map(job => {
        const source = job.source || 'unknown';
        const title = job.title || 'Job Opportunity';
        const company = job.company || 'Company';
        const location = job.location || 'Not specified';
        const salary = job.salary || 'Not specified';
        const description = job.description || '';
        const applyLink = job.applyLink || '#';

        return `
            <div class="job-card">
                <div class="source-badge ${source}">${source.toUpperCase()}</div>
                <div class="job-title">${escapeHtml(title)}</div>
                <div class="company">
                    <i class="fas fa-building"></i>
                    ${escapeHtml(company)}
                </div>
                <div class="details">
                    <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(location)}</span>
                    <span class="salary-badge"><i class="fas fa-wallet"></i> ${escapeHtml(salary)}</span>
                    <span><i class="fas fa-briefcase"></i> Full-time</span>
                </div>
                <div class="desc">${escapeHtml(description.substring(0, 200))}...</div>
                <a href="${applyLink}" target="_blank" rel="noopener noreferrer" class="apply-btn">
                    <i class="fas fa-paper-plane"></i> Apply Now →
                </a>
            </div>
        `;
    }).join('');

    jobsGrid.innerHTML = html;
}

// ============================================
// HELPER: Extract salary number
// ============================================
function extractSalaryNumber(salaryStr) {
    if (!salaryStr || typeof salaryStr !== 'string') return 0;
    const numbers = salaryStr.match(/\d+(?:\.\d+)?/g);
    if (!numbers) return 0;
    return Math.max(...numbers.map(Number));
}

// ============================================
// HELPER: Escape HTML (SAFE VERSION)
// ============================================
function escapeHtml(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }
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
aiSearchBtn.addEventListener('click', fetchAIJobs);
closeAiBtn.addEventListener('click', () => {
    aiSummarySection.style.display = 'none';
});
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
