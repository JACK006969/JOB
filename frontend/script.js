const API_URL = 'https://job-56f5.onrender.com//api';
let currentJobs = [];

const jobsGrid = document.getElementById('jobsGrid');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const locationSelect = document.getElementById('locationSelect');
const sourceSelect = document.getElementById('sourceSelect');
const sortSelect = document.getElementById('sortSelect');
const jobCountSpan = document.getElementById('jobCount');
const lastUpdateSpan = document.getElementById('lastUpdate');

async function fetchJobs() {
    const query = searchInput.value;
    const location = locationSelect.value;
    const source = sourceSelect.value;
    
    jobsGrid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading jobs from Indeed, JSearch & LinkedIn...</div>';
    
    try {
        const url = `${API_URL}/jobs?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&source=${source}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error('Network error');
        
        const data = await response.json();
        
        if (data.success) {
            currentJobs = data.jobs;
            jobCountSpan.textContent = data.total;
            const date = new Date(data.timestamp);
            lastUpdateSpan.textContent = date.toLocaleTimeString();
            renderJobs();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Fetch error:', error);
        jobsGrid.innerHTML = `
            <div class="loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Backend not running. Please start the backend server:</p>
                <code style="display: block; margin-top: 1rem;">cd backend && npm start</code>
            </div>
        `;
    }
}

function renderJobs() {
    if (!currentJobs.length) {
        jobsGrid.innerHTML = '<div class="loading">No jobs found. Try different search terms.</div>';
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
            <div class="source-badge ${job.source}">${job.source.toUpperCase()}</div>
            <div class="job-title">${escapeHtml(job.title)}</div>
            <div class="company"><i class="fas fa-building"></i> ${escapeHtml(job.company)}</div>
            <div class="details">
                <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</span>
                <span class="salary-badge"><i class="fas fa-wallet"></i> ${escapeHtml(job.salary)}</span>
                <span><i class="fas fa-briefcase"></i> Full-time</span>
            </div>
            <div class="desc">${escapeHtml(job.description)}...</div>
            <a href="${job.applyLink}" target="_blank" class="apply-btn">
                <i class="fas fa-paper-plane"></i> Apply Now →
            </a>
        </div>
    `).join('');
    
    jobsGrid.innerHTML = html;
}

function extractSalaryNumber(salaryStr) {
    const numbers = salaryStr.match(/\d+(?:\.\d+)?/g);
    if (!numbers) return 0;
    return Math.max(...numbers.map(Number));
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

searchBtn.addEventListener('click', fetchJobs);
sortSelect.addEventListener('change', renderJobs);

fetchJobs();
