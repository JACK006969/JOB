const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const Parser = require('rss-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 1800 });
const parser = new Parser();

app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// ============================================
// API KEYS (Hardcoded)
// ============================================
const JOBDATALAKE_KEY = 'jdl_3e4d08cc69dab0040b28af5f3daba8be1f45f8ffc0f19281';
const RAPIDAPI_KEY = '99c293cf43mshd7968eedbb0a14cp1d0d7ajsn1dbebbcc0307';

// Helper: format salary
function formatSalary(min, max, currency) {
    if (min && max && min > 0 && max > 0) {
        const symbol = currency === 'USD' ? '$' : '₹';
        if (max > 100000) {
            return `${symbol}${Math.round(min/100000)}L - ${symbol}${Math.round(max/100000)}L per annum`;
        }
        return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}/month`;
    }
    if (min && min > 0) {
        return min > 100000 ? `₹${Math.round(min/100000)}L+ per annum` : `₹${min.toLocaleString()}/month`;
    }
    return 'Salary not disclosed';
}

// ============================================
// SOURCE 1: JOBDATALAKE API (REAL JOBS)
// ============================================
async function fetchJobDataLakeJobs(query, location) {
    const cacheKey = `jobdatalake_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://api.jobdatalake.com/v1/jobs',  // ← CORRECT URL
            params: {
                q: `${query} in ${location}`,
                per_page: 30
            },
            headers: {
                'X-API-Key': JOBDATALAKE_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        let jobsData = [];
        if (response.data?.data) jobsData = response.data.data;
        else if (response.data?.jobs) jobsData = response.data.jobs;
        else if (Array.isArray(response.data)) jobsData = response.data;

        if (jobsData.length > 0) {
            const jobs = jobsData.slice(0, 30).map((job, idx) => ({
                id: `jobdatalake_${Date.now()}_${idx}`,
                title: job.title || job.job_title || query,
                company: job.company || job.employer || job.company_name || 'Company',
                location: job.location || job.city || job.locations || location,
                salary: job.salary || job.salary_range || 'Not specified',
                description: (job.description || job.job_description || '').substring(0, 200),
                applyLink: job.url || job.apply_link || job.link || '#',
                source: 'jobdatalake',
                posted: job.posted_date || job.date || new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            console.log(`✅ JobDataLake: ${jobs.length} jobs`);
            return jobs;
        }
        console.log(`⚠️ JobDataLake: No jobs found`);
        return [];
    } catch (error) {
        console.error(`❌ JobDataLake Error: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, error.response.data);
        }
        return [];
    }
}

// ============================================
// SOURCE 2: JSearch API (BACKUP)
// ============================================
async function fetchJSearchJobs(query, location) {
    const cacheKey = `jsearch_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://jsearch.p.rapidapi.com/search',
            params: {
                query: `${query} in ${location}`,
                page: 1,
                num_pages: 2
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data?.data?.length > 0) {
            const jobs = response.data.data.slice(0, 25).map(job => ({
                id: `jsearch_${Date.now()}_${Math.random()}`,
                title: job.job_title || 'Job Opportunity',
                company: job.employer_name || 'Company',
                location: job.job_city || job.job_location || location,
                salary: formatSalary(job.job_min_salary, job.job_max_salary, 'USD'),
                description: (job.job_description || '').substring(0, 200),
                applyLink: job.job_apply_link || '#',
                source: 'jsearch',
                posted: job.job_posted_at_datetime_utc || new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            console.log(`✅ JSearch: ${jobs.length} jobs`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ JSearch Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 3: PR Labs API
// ============================================
async function fetchPRLabsJobs(query, location) {
    const cacheKey = `prlabs_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'POST',
            url: 'https://jobs-search-api.p.rapidapi.com/getjobs_excel',
            data: {
                search_term: query,
                location: location,
                country_indeed: 'India',
                results_wanted: 25,
                site_name: ['indeed', 'linkedin', 'zip_recruiter', 'glassdoor', 'naukri'],
                distance: 50,
                job_type: 'fulltime',
                is_remote: false,
                hours_old: 720
            },
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jobs-search-api.p.rapidapi.com'
            },
            timeout: 15000
        });

        let jobsData = [];
        if (response.data?.jobs) jobsData = response.data.jobs;
        else if (response.data?.data) jobsData = response.data.data;
        else if (Array.isArray(response.data)) jobsData = response.data;

        if (jobsData.length > 0) {
            const jobs = jobsData.slice(0, 25).map((job, idx) => ({
                id: `prlabs_${Date.now()}_${idx}`,
                title: job.title || job.job_title || query,
                company: job.company || job.employer || 'Company',
                location: job.location || job.city || location,
                salary: job.salary || 'Not specified',
                description: (job.description || '').substring(0, 200),
                applyLink: job.url || job.apply_link || '#',
                source: 'prlabs',
                posted: job.posted_date || new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            console.log(`✅ PR Labs: ${jobs.length} jobs`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ PR Labs Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 4: Indeed RSS (FREE)
// ============================================
async function fetchIndeedJobs(query, location) {
    const cacheKey = `indeed_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const rssUrl = `https://rss.indeed.com/rss?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date`;
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        const response = await axios.get(proxyUrl, { timeout: 10000 });
        
        if (response.data?.items?.length > 0) {
            const jobs = response.data.items.slice(0, 20).map((item, idx) => {
                const parts = item.title.split(' - ');
                return {
                    id: `indeed_${Date.now()}_${idx}`,
                    title: parts[0] || 'Job Opportunity',
                    company: parts[1] || 'Company',
                    location: location,
                    salary: 'Salary on Indeed',
                    description: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 200),
                    applyLink: item.link,
                    source: 'indeed',
                    posted: item.pubDate || new Date().toISOString()
                };
            });
            cache.set(cacheKey, jobs);
            console.log(`✅ Indeed: ${jobs.length} jobs`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ Indeed Error: ${error.message}`);
        return [];
    }
}

// ============================================
// TEST JOBDATALAKE
// ============================================
app.get('/api/test-jobdatalake', async (req, res) => {
    try {
        const response = await axios({
            method: 'GET',
            url: 'https://api.jobdatalake.com/v1/jobs',
            params: {
                q: 'digital marketing Kolkata',
                per_page: 5
            },
            headers: {
                'X-API-Key': JOBDATALAKE_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        res.json({ 
            success: true, 
            data: response.data,
            keyUsed: JOBDATALAKE_KEY ? '✅ Key set' : '❌ Missing'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.response?.data || error.message,
            keyUsed: JOBDATALAKE_KEY ? '✅ Key set' : '❌ Missing'
        });
    }
});

// ============================================
// MAIN JOBS ROUTE
// ============================================
app.get('/api/jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata', source = 'all' } = req.query;
    query = query.trim();
    
    console.log(`\n🔍 SEARCHING: "${query}" in ${location} (source: ${source})`);
    
    try {
        let jobs = [];
        const apiCalls = [];
        
        if (source === 'all' || source === 'jobdatalake') {
            apiCalls.push(fetchJobDataLakeJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        if (source === 'all' || source === 'jsearch') {
            apiCalls.push(fetchJSearchJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        if (source === 'all' || source === 'prlabs') {
            apiCalls.push(fetchPRLabsJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        if (source === 'all' || source === 'indeed') {
            apiCalls.push(fetchIndeedJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        
        await Promise.all(apiCalls);
        
        const uniqueJobs = [];
        const seen = new Set();
        for (const job of jobs) {
            const key = `${job.title}_${job.company}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueJobs.push(job);
            }
        }
        
        console.log(`📊 TOTAL: ${uniqueJobs.length} jobs`);
        console.log(`   JobDataLake: ${jobs.filter(j => j.source === 'jobdatalake').length}`);
        console.log(`   JSearch: ${jobs.filter(j => j.source === 'jsearch').length}`);
        console.log(`   PR Labs: ${jobs.filter(j => j.source === 'prlabs').length}`);
        console.log(`   Indeed: ${jobs.filter(j => j.source === 'indeed').length}`);
        
        res.json({
            success: true,
            total: uniqueJobs.length,
            jobs: uniqueJobs.slice(0, 100),
            timestamp: new Date().toISOString(),
            searchQuery: query,
            location: location
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        jobdatalakeConfigured: !!JOBDATALAKE_KEY,
        cacheSize: cache.keys().length
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`✅ JobDataLake: ${JOBDATALAKE_KEY ? 'Key set' : 'Missing'}`);
    console.log(`🔍 Test: http://localhost:${PORT}/api/test-jobdatalake\n`);
});
