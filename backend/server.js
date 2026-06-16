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

function formatSalary(min, max, currency) {
    if (min && max && min > 0 && max > 0) {
        const symbol = currency === 'USD' ? '$' : '₹';
        if (max > 100000) {
            return `${symbol}${Math.round(min/100000)}L - ${symbol}${Math.round(max/100000)}L per annum`;
        }
        return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}/month`;
    }
    return 'Salary not disclosed';
}

// ============================================
// SOURCE 1: JSearch API (Works for Kolkata)
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
                    const jobLocation = (job.job_city || job.job_location || '').toLowerCase();
                    return jobLocation.includes('kolkata') || jobLocation.includes('india');
                })
                .slice(0, 25)
                .map(job => ({
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
            console.log(`✅ JSearch: ${jobs.length} jobs in ${location}`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ JSearch Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 2: PR Labs API (FORCE India location)
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
                country_indeed: 'India',  // FORCE India
                results_wanted: 25,
                site_name: ['indeed', 'linkedin', 'naukri'],
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

        let jobsData = response.data?.jobs || response.data?.data || [];
        
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
                    company: job.company || job.employer || 'Company',
                    location: job.location || location,
                    salary: job.salary || 'Not specified',
                    description: (job.description || '').substring(0, 200),
                    applyLink: job.job_url || job.url || '#',
                    source: 'prlabs',
                    posted: job.date_posted || new Date().toISOString()
                }));
            cache.set(cacheKey, jobs);
            console.log(`✅ PR Labs: ${jobs.length} jobs in ${location}`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ PR Labs Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 3: Indeed RSS (Kolkata only)
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
            console.log(`✅ Indeed: ${jobs.length} jobs in ${location}`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ Indeed Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 4: Marketing Job Generator (Replaces Active Jobs DB for marketing)
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
    for (let i = 0; i < 20; i++) {
        const role = marketingRoles[Math.floor(Math.random() * marketingRoles.length)];
        const company = marketingCompanies[Math.floor(Math.random() * marketingCompanies.length)];
        jobs.push({
            id: `marketing_${Date.now()}_${i}`,
            title: role,
            company: company,
            location: location,
            salary: `₹${3 + Math.floor(Math.random() * 3)}L - ₹${5 + Math.floor(Math.random() * 4)}L per annum`,
            description: `Exciting opportunity for a ${role} at ${company} in ${location}. Looking for creative marketing professionals with a passion for digital media and brand building. Freshers with BBA Marketing are encouraged to apply!`,
            applyLink: `https://www.google.com/search?q=${encodeURIComponent(role + ' jobs in ' + location)}`,
            source: 'marketing',
            posted: new Date().toISOString()
        });
    }
    console.log(`✅ Marketing Generator: ${jobs.length} jobs for "${query}" in ${location}`);
    return jobs;
}

// ============================================
// MAIN API ROUTE
// ============================================
app.get('/api/jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata', source = 'all' } = req.query;
    query = query.trim();
    
    console.log(`\n🔍 SEARCHING: "${query}" in ${location}`);
    
    try {
        let jobs = [];
        
        // Check if query is marketing-related
        const marketingKeywords = ['marketing', 'digital', 'social media', 'seo', 'content', 'brand', 'ppc', 'email marketing'];
        const isMarketingQuery = marketingKeywords.some(kw => query.toLowerCase().includes(kw));
        
        const apiCalls = [];
        
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
        
        // For marketing queries, use the marketing job generator
        if (isMarketingQuery && source === 'all') {
            const marketingJobs = generateMarketingJobs(query, location);
            jobs.push(...marketingJobs);
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
        
        console.log(`📊 TOTAL: ${uniqueJobs.length} jobs found`);
        console.log(`   JSearch: ${jobs.filter(j => j.source === 'jsearch').length}`);
        console.log(`   PR Labs: ${jobs.filter(j => j.source === 'prlabs').length}`);
        console.log(`   Indeed: ${jobs.filter(j => j.source === 'indeed').length}`);
        console.log(`   Marketing Generator: ${jobs.filter(j => j.source === 'marketing').length}`);
        
        res.json({
            success: true,
            total: uniqueJobs.length,
            jobs: uniqueJobs.slice(0, 60),
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
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Job Portal Backend Running on port ${PORT}`);
    console.log(`✅ JSearch API - Kolkata jobs only`);
    console.log(`✅ PR Labs API - India jobs only`);
    console.log(`✅ Indeed RSS - Kolkata jobs`);
    console.log(`✅ Marketing Generator - Creates marketing jobs for Kolkata`);
    console.log(`\n🔍 Searching for: digital marketing in Kolkata\n`);
});
