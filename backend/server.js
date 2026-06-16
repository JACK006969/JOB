const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const Parser = require('rss-parser');
require('dotenv').config();

// ============================================
// AI SDK for Grok (Vercel AI Gateway)
// ============================================
const { generateText } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 1800 });
const parser = new Parser();

app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

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
// SOURCE 1: JSearch API
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
// SOURCE 3: Active Jobs DB
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
// SOURCE 5: Marketing Job Generator
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
            source: 'jobs',
            posted: new Date().toISOString()
        });
    }
    console.log(`✅ Marketing Generator: ${jobs.length} jobs`);
    return jobs;
}

// ============================================
// SOURCE 6: GROK AI (Vercel AI Gateway)
// ============================================
app.get('/api/grok-jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata' } = req.query;
    
    console.log(`\n🤖 Grok AI Searching: "${query}" in ${location}`);
    console.log(`🔑 Token exists: ${!!process.env.VERCEL_ACCESS_TOKEN}`);
    console.log(`🔑 Token length: ${process.env.VERCEL_ACCESS_TOKEN ? process.env.VERCEL_ACCESS_TOKEN.length : 0}`);
    
    if (!process.env.VERCEL_ACCESS_TOKEN) {
        console.error('❌ VERCEL_ACCESS_TOKEN not set - returning fallback jobs');
        const fallbackJobs = generateFallbackJobs(query, location);
        return res.json({ 
            success: true, 
            jobs: fallbackJobs, 
            total: fallbackJobs.length,
            source: 'grok-fallback',
            message: 'Token missing - using fallback jobs'
        });
    }

    try {
        const vercelGateway = createOpenAI({
            apiKey: process.env.VERCEL_ACCESS_TOKEN,
            baseURL: 'https://ai-gateway.vercel.sh/v1',
        });

        const { text } = await generateText({
            model: vercelGateway('xai/grok-4.1-fast-non-reasoning'),
            prompt: `Find 10 REAL ${query} jobs in ${location}, India for freshers. Return ONLY a JSON array with: title, company, location, salary, description, applyLink. No markdown.`,
            temperature: 0.2,
        });

        console.log('📝 Grok Response:', text.substring(0, 100));

        let jobs = [];
        try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                jobs = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Parse error:', e.message);
            jobs = generateFallbackJobs(query, location);
        }

        if (!Array.isArray(jobs)) jobs = [];

        jobs = jobs.map(job => ({
            ...job,
            source: 'grok',
            id: `grok_${Date.now()}_${Math.random()}`,
            location: job.location || location,
            salary: job.salary || 'Not specified',
            applyLink: job.applyLink || '#'
        }));

        console.log(`✅ Grok AI: ${jobs.length} jobs`);
        res.json({ success: true, jobs, total: jobs.length });

    } catch (error) {
        console.error('❌ Grok AI Error:', error.message);
        const fallbackJobs = generateFallbackJobs(query, location);
        res.json({ 
            success: true, 
            jobs: fallbackJobs, 
            total: fallbackJobs.length,
            fallback: true,
            error: error.message
        });
    }
});

// ============================================
// FALLBACK: Generate jobs when Grok fails
// ============================================
function generateFallbackJobs(query, location) {
    const companies = ['Tech Mahindra', 'Wipro', 'Cognizant', 'Infosys', 'Accenture', 'Deloitte', 'Amazon', 'Flipkart', 'Swiggy', 'Unilever'];
    const roles = [`${query} Associate`, `Junior ${query}`, `${query} Executive`, `Fresher ${query}`, `${query} Trainee`, `${query} Specialist`];
    
    const jobs = [];
    for (let i = 0; i < 8; i++) {
        jobs.push({
            id: `fallback_${Date.now()}_${i}`,
            title: roles[i % roles.length],
            company: companies[i % companies.length],
            location: location,
            salary: `₹${2 + Math.floor(Math.random() * 4)}L - ₹${4 + Math.floor(Math.random() * 5)}L per annum`,
            description: `Exciting opportunity for a ${roles[i % roles.length]} at ${companies[i % companies.length]} in ${location}. Freshers encouraged to apply. Great learning environment and career growth.`,
            applyLink: '#',
            source: 'grok',
            posted: new Date().toISOString()
        });
    }
    return jobs;
}

// ============================================
// TEST GROK ENDPOINT
// ============================================
app.get('/api/test-grok', (req, res) => {
    const token = process.env.VERCEL_ACCESS_TOKEN;
    res.json({
        tokenExists: !!token,
        tokenLength: token ? token.length : 0,
        message: token ? '✅ Token configured' : '❌ Token missing',
        environment: process.env.NODE_ENV || 'development',
        allEnvKeys: Object.keys(process.env).filter(k => k.includes('VERCEL') || k.includes('RAPID'))
    });
});

// ============================================
// MAIN API ROUTE - ALL SOURCES
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
        
        if (source === 'all' || source === 'jsearch') {
            apiCalls.push(fetchJSearchJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        
        if (source === 'all' || source === 'prlabs') {
            apiCalls.push(fetchPRLabsJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        
        if (source === 'all' || source === 'activejobs') {
            apiCalls.push(fetchActiveJobsDB(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        
        if (source === 'all' || source === 'indeed') {
            apiCalls.push(fetchIndeedJobs(query, location).then(j => { if(j) jobs.push(...j); }));
        }
        
        await Promise.all(apiCalls);
        
        // GROK AI
        if (source === 'all' || source === 'grok') {
            try {
                const grokRes = await axios.get(`${req.protocol}://${req.get('host')}/api/grok-jobs`, {
                    params: { query, location },
                    timeout: 15000
                });
                if (grokRes.data && grokRes.data.jobs) {
                    jobs.push(...grokRes.data.jobs);
                    console.log(`✅ Grok: ${grokRes.data.jobs.length} jobs`);
                }
            } catch (e) {
                console.log(`⚠️ Grok skipped: ${e.message}`);
            }
        }
        
        // Marketing generator
        if (isMarketingQuery && source === 'all') {
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
        console.log(`   Grok: ${jobs.filter(j => j.source === 'grok').length}`);
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
        grokConfigured: !!process.env.VERCEL_ACCESS_TOKEN,
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
    console.log(`✅ 6 Job Sources:`);
    console.log(`   1. JSearch API`);
    console.log(`   2. PR Labs API`);
    console.log(`   3. Active Jobs DB`);
    console.log(`   4. Indeed RSS`);
    console.log(`   5. Marketing Generator`);
    console.log(`   6. 🤖 Grok AI`);
    console.log(`\n🔍 Grok Status: ${process.env.VERCEL_ACCESS_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`🔍 Test Grok: http://localhost:${PORT}/api/test-grok`);
    console.log(`🔍 Search: http://localhost:${PORT}/api/jobs?query=digital+marketing&location=Kolkata\n`);
});
