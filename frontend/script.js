const API_URL = '/api';
let currentPage = 1;
let currentQuery = 'Digital Marketing';
let currentLocation = 'Kolkata';

const jobsGrid = document.getElementById('jobsGrid');
const searchBtn = document.getElementById('searchBtn');
const aiSearchBtn = document.getElementById('aiSearchBtn');
const searchInput = document.getElementById('searchInput');
const locationInput = document.getElementById('locationInput');
const aiSummarySection = document.getElementById('aiSummarySection');
const aiSummaryContent = document.getElementById('aiSummaryContent');
const closeAiBtn = document.getElementById('closeAiBtn');

// Filters
const jobTypeFilter = document.getElementById('jobTypeFilter');
const remoteFilter = document.getElementById('remoteFilter');
const experienceFilter = document.getElementById('experienceFilter');

// Pagination
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

async function fetchJobs() {
    currentQuery = searchInput.value.trim() || 'Digital Marketing';
    currentLocation = locationInput.value.trim() || 'Kolkata';
    
    const jobType = jobTypeFilter.value;
    const remote = remoteFilter.value;
    const experience = experienceFilter.value;

    jobsGrid.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;

    try {
        const url = `${API_URL}/jobs?query=${encodeURIComponent(currentQuery)}&location=${encodeURIComponent(currentLocation)}&page=${currentPage}&job_type=${jobType}&remote=${remote}&experience=${experience}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.jobs.length > 0) {
            renderJobs(data.jobs);
            updatePagination();
        } else {
            jobsGrid.innerHTML = `<div class="loading"><i class="fas fa-search"></i><h3>No jobs found</h3><p>Try changing filters or keywords.</p></div>`;
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        }
    } catch (error) {
        jobsGrid.innerHTML = `<div class="loading"><i class="fas fa-exclamation-triangle"></i><h3>Error loading jobs</h3></div>`;
    }
}

function renderJobs(jobs) {
    jobsGrid.innerHTML = jobs.map(job => `
        <div class="job-card">
            <div class="source-badge jsearch">${job.jobType || 'Full-time'}</div>
            <div class="job-title">${job.title}</div>
            <div class="company"><i class="fas fa-building"></i> ${job.company}</div>
            <div class="details">
                <span><i class="fas fa-map-marker-alt"></i> ${job.location}</span>
                <span class="salary-badge"><i class="fas fa-wallet"></i> ${job.salary}</span>
            </div>
            <div class="desc">${job.description}...</div>
            <a href="${job.applyLink}" target="_blank" class="apply-btn"><i class="fas fa-paper-plane"></i> Apply Now</a>
        </div>
    `).join('');
}

function updatePagination() {
    pageInfo.textContent = `Page ${currentPage}`;
    prevBtn.disabled = currentPage === 1;
    // JSearch usually has max 10-20 pages. We enable next by default unless empty.
    nextBtn.disabled = false; 
}

async function fetchAIJobs() {
    aiSummarySection.style.display = 'block';
    aiSummaryContent.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> AI is thinking...</div>`;
    aiSummarySection.scrollIntoView({ behavior: 'smooth' });

    try {
        const url = `${API_URL}/ai-jobs?query=${encodeURIComponent(currentQuery)}&location=${encodeURIComponent(currentLocation)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) {
            aiSummaryContent.innerHTML = marked.parse(data.ai_summary);
        }
    } catch (error) {
        aiSummaryContent.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

// Event Listeners
searchBtn.addEventListener('click', () => { currentPage = 1; fetchJobs(); });
prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; fetchJobs(); window.scrollTo(0,0); } });
nextBtn.addEventListener('click', () => { currentPage++; fetchJobs(); window.scrollTo(0,0); });
aiSearchBtn.addEventListener('click', fetchAIJobs);
closeAiBtn.addEventListener('click', () => aiSummarySection.style.display = 'none');

// Auto-fetch when filters change
[jobTypeFilter, remoteFilter, experienceFilter].forEach(filter => {
    filter.addEventListener('change', () => { currentPage = 1; fetchJobs(); });
});

document.addEventListener('DOMContentLoaded', fetchJobs);
