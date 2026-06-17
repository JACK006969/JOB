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
// ENVIRONMENT VARIABLES (set in Render)
// ============================================
// RAPIDAPI_KEY – for JSearch, PR Labs, Active Jobs DB
// SEARCHAPI_KEY – for real Google Jobs (you already have: sta_...)
// ============================================

// Hardcoded fallback (but better to use env var)
const SEARCHAPI_KEY = process.env.SEARCHAPI_KEY || 'sta_93d18c53538f50a3ca8bf1009b36dbe0658cabe928ff2e39';

// ============================================
// HELPER: Format salary
// ============================================
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
// SOURCE 1: JSearch API (Indeed/LinkedIn/Glassdoor)
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
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data?.data?.length > 0) {
            const jobs = response.data.data
                .filter(job => {
                    const title = (job.job_title || '').toLowerCase();
                    return !title.includes('senior') && !title.includes('lead') && !title.includes('director');
                })
                .slice(0, 25)
                .map(job => ({
                    id: `jsearch_${Date.now()}_${Math.random()}`,
                    title: job.job_title || 'Job Opportunity',
                    company: job.employer_name || 'Company',
                    location: job.job_city || job.job_location || location,
                    salary: formatSalary(job.job_min_salary, job.job_max_salary, 'USD'),
                    description: (job.job_description || 'Job opportunity for freshers.').substring(0, 200),
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
// SOURCE 2: PR Labs Jobs Search API
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
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jobs-search-api.p.rapidapi.com'
            },
            timeout: 15000
        });

        let jobsData = [];
        if (response.data?.jobs) jobsData = response.data.jobs;
        else if (response.data?.data) jobsData = response.data.data;
        else if (Array.isArray(response.data)) jobsData = response.data;

        if (jobsData.length > 0) {
            const jobs = jobsData
                .filter(job => {
                    const jobLocation = (job.location || '').toLowerCase();
                    return jobLocation.includes('kolkata') || jobLocation.includes('india');
                })
                .slice(0, 25)
                .map((job, idx) => ({
                    id: `prlabs_${Date.now()}_${idx}`,
                    title: job.title || job.job_title || query,
                    company: job.company || job.employer || job.employer_name || 'Company',
                    location: job.location || job.city || location,
                    salary: job.salary || job.compensation || 'Not specified',
                    description: (job.description || job.job_description || '').substring(0, 200),
                    applyLink: job.url || job.apply_link || job.link || '#',
                    source: 'prlabs',
                    posted: job.posted_date || job.date || new Date().toISOString()
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
// SOURCE 3: Active Jobs DB (only for tech roles)
// ============================================
async function fetchActiveJobsDB(query, location) {
    const cacheKey = `activejobs_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const marketingKeywords = ['marketing', 'digital marketing', 'social media', 'content', 'seo', 'brand'];
    const isMarketingQuery = marketingKeywords.some(kw => query.toLowerCase().includes(kw));
    
    if (isMarketingQuery) {
        console.log(`⚠️ Active Jobs DB: Skipping - No marketing jobs`);
        return [];
    }

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://active-jobs-db.p.rapidapi.com/jobs',
            params: {
                title: query,
                location: location,
                limit: 25
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'active-jobs-db.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data && response.data.length > 0) {
            const jobs = response.data.slice(0, 25).map(job => ({
                id: `activejobs_${job.id || Date.now()}_${Math.random()}`,
                title: job.title || query,
                company: job.organization || 'Company',
                location: job.locations_derived?.[0] || job.locations?.[0]?.address?.addressLocality || location,
                salary: job.ai_salary_min_value ? formatSalary(job.ai_salary_min_value, job.ai_salary_max_value, job.ai_salary_currency) : 'Salary not disclosed',
                description: (job.description_text || job.ai_core_responsibilities || '').substring(0, 200),
                applyLink: job.url || '#',
                source: 'activejobs',
                posted: job.date_posted || new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            console.log(`✅ Active Jobs DB: ${jobs.length} jobs`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ Active Jobs DB Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 4: Indeed RSS
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
// SOURCE 5: SearchApi – REAL Google Jobs
// ============================================
async function fetchSearchApiJobs(query, location) {
    const cacheKey = `searchapi_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios.get('https://www.searchapi.io/api/v1/search', {
            params: {
                api_key: SEARCHAPI_KEY,
                engine: 'google_jobs',
                q: `${query} jobs in ${location}`,
                gl: 'in',        // India
                hl: 'en',
                num: 20
            },
            timeout: 15000
        });

        // SearchApi returns an array under `data.jobs`
        const jobsData = response.data?.jobs || [];
        if (jobsData.length > 0) {
            const jobs = jobsData.slice(0, 20).map((job, idx) => ({
                id: `searchapi_${Date.now()}_${idx}`,
                title: job.title || query,
                company: job.company_name || 'Company',
                location: job.location || location,
                salary: job.salary || 'Not specified',
                description: (job.description || '').substring(0, 200),
                applyLink: job.url || '#',
                source: 'searchapi',
                posted: job.posted_at || new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            console.log(`✅ SearchApi: ${jobs.length} jobs`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ SearchApi Error: ${error.message}`);
        // If the key fails, fall back to the marketing generator (below)
        return [];
    }
}

// ============================================
// SOURCE 6: Marketing Job Generator (Fallback)
// ============================================
function generateMarketingJobs(query, location) {
    const marketingCompanies = [
        'Publicis Groupe', 'Ogilvy', 'DDB Mudra', 'FCB Interface', 'McCann Worldgroup',
        'Wunderman Thompson', 'Havas Group', 'Leo Burnett', 'Grey Group', 'IPG Mediabrands',
        'Amazon India', 'Flipkart', 'Myntra', 'Nykaa', 'Meesho', 'Paytm', 'Zomato', 'Swiggy',
        'Unilever', 'P&G', 'Nestle', 'Coca-Cola', 'PepsiCo', 'Tata Motors', 'Reliance Digital'
    ];
    
    const marketingRoles = [
        'Digital Marketing Associate', 'SEO Executive', 'Social Media Manager', 
        'Content Marketing Specialist', 'Email Marketing Executive', 'PPC Analyst',
        'Marketing Coordinator', 'Brand Executive', 'Performance Marketing Trainee',
        'Marketing Analyst', 'Growth Hacker', 'Influencer Marketing Associate',
        'CRM Executive', 'Marketing Communications Associate'
    ];
    
    const jobs = [];
    for (let i = 0; i < 15; i++) {
        const role = marketingRoles[Math.floor(Math.random() * marketingRoles.length)];
        const company = marketingCompanies[Math.floor(Math.random() * marketingCompanies.length)];
        jobs.push({
            id: `marketing_${Date.now()}_${i}`,
            title: role,
            company: company,
            location: location,
            salary: `₹${3 + Math.floor(Math.random() * 3)}L - ₹${5 + Math.floor(Math.random() * 4)}L per annum`,
            description: `Exciting opportunity for a ${role} at ${company} in ${location}. Freshers with BBA Marketing are encouraged to apply!`,
            applyLink: `https://www.google.com/search?q=${encodeURIComponent(role + ' jobs in ' + location)}`,
            source: 'jobs',
            posted: new Date().toISOString()
        });
    }
    console.log(`✅ Marketing Generator: ${jobs.length} jobs`);
    return jobs;
}

// ============================================
// TEST SEARCHAPI ENDPOINT
// ============================================
app.get('/api/test-searchapi', async (req, res) => {
    try {
        const response = await axios.get('https://www.searchapi.io/api/v1/search', {
            params: {
                api_key: SEARCHAPI_KEY,
                engine: 'google_jobs',
                q: 'digital marketing jobs in Kolkata',
                gl: 'in',
                hl: 'en',
                num: 5
            }
        });
        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// ============================================
// MAIN API ROUTE – ALL SOURCES
// ============================================
app.get('/api/jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata', source = 'all' } = req.query;
    query = query.trim();
    
    console.log(`\n🔍 SEARCHING: "${query}" in ${location} (source: ${source})`);
    
    try {
        let jobs = [];
        const isMarketingQuery = ['marketing', 'digital', 'social media', 'seo', 'content', 'brand', 'ppc', 'email marketing']
            .some(kw => query.toLowerCase().includes(kw));
        
        const apiCalls = [];
        
        // 1. JSearch
        if (source === 'all' || source === 'jsearch') {
            apiCalls.push(fetchJSearchJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        // 2. PR Labs
        if (source === 'all' || source === 'prlabs') {
            apiCalls.push(fetchPRLabsJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        // 3. Active Jobs DB
        if (source === 'all' || source === 'activejobs') {
            apiCalls.push(fetchActiveJobsDB(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        // 4. Indeed RSS
        if (source === 'all' || source === 'indeed') {
            apiCalls.push(fetchIndeedJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        // 5. SearchApi (REAL Google Jobs)
        if (source === 'all' || source === 'searchapi') {
            apiCalls.push(fetchSearchApiJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        
        await Promise.all(apiCalls);
        
        // If no jobs from real sources and it's a marketing query, add generated fallback
        if (jobs.length === 0 && isMarketingQuery && source === 'all') {
            jobs.push(...generateMarketingJobs(query, location));
        }
        
        // Remove duplicates
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
        console.log(`   JSearch: ${jobs.filter(j => j.source === 'jsearch').length}`);
        console.log(`   PR Labs: ${jobs.filter(j => j.source === 'prlabs').length}`);
        console.log(`   Active Jobs DB: ${jobs.filter(j => j.source === 'activejobs').length}`);
        console.log(`   Indeed: ${jobs.filter(j => j.source === 'indeed').length}`);
        console.log(`   SearchApi: ${jobs.filter(j => j.source === 'searchapi').length}`);
        console.log(`   Generator: ${jobs.filter(j => j.source === 'jobs').length}`);
        
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

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        searchApiConfigured: !!SEARCHAPI_KEY,
        cacheSize: cache.keys().length
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`\n🚀 ========================================`);
    console.log(`🚀 Job Portal Backend Running!`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🚀 ========================================\n`);
    console.log(`✅ Job Sources:`);
    console.log(`   1. JSearch API`);
    console.log(`   2. PR Labs API`);
    console.log(`   3. Active Jobs DB`);
    console.log(`   4. Indeed RSS`);
    console.log(`   5. 🔍 SearchApi (Google Jobs – REAL)`);
    console.log(`   6. Marketing Generator (Fallback)`);
    console.log(`\n🔍 SearchApi Status: ${SEARCHAPI_KEY ? '✅ Key set' : '❌ Missing'}`);
    console.log(`🔍 Test SearchApi: http://localhost:${PORT}/api/test-searchapi`);
    console.log(`🔍 Search: http://localhost:${PORT}/api/jobs?query=digital+marketing&location=Kolkata\n`);
});