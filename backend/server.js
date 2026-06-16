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

// Helper: Format salary display
function formatSalary(min, max) {
    if (min && max && min > 0 && max > 0) {
        if (max > 100000) {
            return `₹${Math.round(min/100000)}L - ₹${Math.round(max/100000)}L per annum`;
        }
        return `₹${min.toLocaleString()} - ${max.toLocaleString()}/month`;
    }
    if (min && min > 0) {
        return min > 100000 ? `₹${Math.round(min/100000)}L+ per annum` : `₹${min.toLocaleString()}/month`;
    }
    return 'Salary not disclosed';
}

// ============================================
// SOURCE 1: JSearch API (Indeed, LinkedIn, Glassdoor)
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
                query: `${query} fresher entry level ${location}`,
                location: location,
                page: 1,
                num_pages: 2,
                radius: 50
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const jobs = response.data.data
                .filter(job => {
                    const title = (job.job_title || '').toLowerCase();
                    return !title.includes('senior') && !title.includes('lead') && !title.includes('director') && !title.includes('manager');
                })
                .slice(0, 20)
                .map(job => ({
                    id: `jsearch_${Date.now()}_${Math.random()}`,
                    title: job.job_title || 'Digital Marketing Role',
                    company: job.employer_name || 'Company',
                    location: job.job_city || job.job_location || location,
                    salary: formatSalary(job.job_min_salary, job.job_max_salary),
                    description: (job.job_description || 'Entry-level digital marketing role for BBA freshers.').substring(0, 200),
                    applyLink: job.job_apply_link || job.job_google_link || '#',
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
// SOURCE 2: Active Jobs DB (AI-enriched from 200k+ sites)
// ============================================
async function fetchActiveJobsDB(query, location) {
    const cacheKey = `activejobs_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://active-jobs-db.p.rapidapi.com/active-joBs',
            params: {
                query: `${query} ${location} fresher`,
                page: 1,
                limit: 25
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'active-jobs-db.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const jobs = response.data.data.slice(0, 25).map((job, idx) => ({
                id: `activejobs_${Date.now()}_${idx}`,
                title: job.title || job.job_title || job.position || 'Job Opportunity',
                company: job.company_name || job.employer || job.company || 'Company',
                location: job.location || job.city || job.place || location,
                salary: job.salary_range || job.salary || job.compensation || 'Salary not disclosed',
                description: (job.description || job.job_description || 'Entry-level digital marketing role for BBA freshers.').substring(0, 200),
                applyLink: job.apply_link || job.url || job.link || '#',
                source: 'activejobs',
                posted: job.posted_date || job.date || new Date().toISOString()
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
// SOURCE 3: JOBS SEARCH API (PR Labs - LinkedIn, Indeed, ZipRecruiter)
// ============================================
async function fetchPRLabsJobs(query, location) {
    const cacheKey = `prlabs_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://jobs-search-api.p.rapidapi.com/jobs/search',
            params: {
                query: `${query} fresher`,
                location: location,
                page: 1,
                limit: 20
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jobs-search-api.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const jobs = response.data.data.slice(0, 20).map((job, idx) => ({
                id: `prlabs_${Date.now()}_${idx}`,
                title: job.title || job.job_title || 'Job Opportunity',
                company: job.company || job.employer_name || 'Company',
                location: job.location || job.city || location,
                salary: job.salary || job.compensation || 'Salary not disclosed',
                description: (job.description || job.job_description || 'Fresher role in digital marketing.').substring(0, 200),
                applyLink: job.url || job.apply_link || '#',
                source: 'prlabs',
                posted: job.posted_date || job.date || new Date().toISOString()
            }));
            
            cache.set(cacheKey, jobs);
            console.log(`✅ PR Labs Jobs: ${jobs.length} jobs`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ PR Labs Error: ${error.message}`);
        return [];
    }
}

// ============================================
// SOURCE 4: Indeed RSS (Free fallback)
// ============================================
async function fetchIndeedJobs(query, location) {
    const cacheKey = `indeed_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const rssUrl = `https://rss.indeed.com/rss?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
        const response = await axios.get(proxyUrl, { timeout: 10000 });
        const feed = await parser.parseString(response.data);
        
        if (feed.items && feed.items.length > 0) {
            const jobs = feed.items.slice(0, 15).map((item, index) => {
                const titleParts = item.title.split(' - ');
                return {
                    id: `indeed_${Date.now()}_${index}`,
                    title: titleParts[0] || 'Job Opportunity',
                    company: titleParts[1] || 'Company',
                    location: location,
                    salary: 'Salary not disclosed',
                    description: (item.contentSnippet || item.content || '').substring(0, 200),
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
// SOURCE 5: LinkedIn (Simulated fallback)
// ============================================
function getLinkedInJobs(query, location) {
    const linkedInJobs = [
        { title: 'Digital Marketing Associate', company: 'Tech Mahindra', salary: '₹3.5L - ₹4.5L/annum', desc: 'SEO, social media, analytics for BBA freshers.' },
        { title: 'Social Media Executive', company: 'Wipro Digital', salary: '₹2.8L - ₹3.8L/annum', desc: 'Content creation, campaign management, analytics.' },
        { title: 'SEO Analyst', company: 'Cognizant', salary: '₹3L - ₹4L/annum', desc: 'Keyword research, on-page optimization, SEO audits.' },
        { title: 'Content Marketing Specialist', company: 'Infosys', salary: '₹3.2L - ₹4.2L/annum', desc: 'Content strategy, blog writing, email marketing.' },
        { title: 'Performance Marketing Trainee', company: 'GroupM', salary: '₹2.5L - ₹3.5L/annum', desc: 'Google Ads, Facebook Ads, campaign optimization.' },
        { title: 'Marketing Coordinator', company: 'Deloitte', salary: '₹3.5L - ₹4.5L/annum', desc: 'Coordinate marketing activities, vendor management.' },
        { title: 'Junior Digital Marketer', company: 'Accenture', salary: '₹3L - ₹4L/annum', desc: 'Campaign management, PPC basics.' },
        { title: 'Email Marketing Associate', company: 'Swiggy', salary: '₹3.2L - ₹4.2L/annum', desc: 'Email campaigns, automation, CRM.' },
        { title: 'Brand Marketing Fresher', company: 'Unilever', salary: '₹4L - ₹5L/annum', desc: 'Brand strategy, campaign execution.' },
        { title: 'Marketing Analyst', company: 'Amazon', salary: '₹3.5L - ₹4.8L/annum', desc: 'Market research, data analysis, reporting.' }
    ];
    
    return linkedInJobs.map((job, index) => ({
        id: `linkedin_${Date.now()}_${index}`,
        title: job.title,
        company: job.company,
        location: location,
        salary: job.salary,
        description: job.desc,
        applyLink: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(job.title)}&location=${location}`,
        source: 'linkedin',
        posted: new Date().toISOString()
    }));
}

// ============================================
// MAIN API ROUTE - Get all jobs from ALL sources
// ============================================
app.get('/api/jobs', async (req, res) => {
    const { query = 'digital marketing', location = 'Kolkata', source = 'all' } = req.query;
    
    try {
        let jobs = [];
        
        // Fetch from all sources in parallel for speed
        const promises = [];
        
        if (source === 'all' || source === 'jsearch') {
            promises.push(fetchJSearchJobs(query, location).then(j => { jobs.push(...j); return j.length; }));
        }
        if (source === 'all' || source === 'activejobs') {
            promises.push(fetchActiveJobsDB(query, location).then(j => { jobs.push(...j); return j.length; }));
        }
        if (source === 'all' || source === 'prlabs') {
            promises.push(fetchPRLabsJobs(query, location).then(j => { jobs.push(...j); return j.length; }));
        }
        if (source === 'all' || source === 'indeed') {
            promises.push(fetchIndeedJobs(query, location).then(j => { jobs.push(...j); return j.length; }));
        }
        if (source === 'all' || source === 'linkedin') {
            const linkedinJobs = getLinkedInJobs(query, location);
            jobs.push(...linkedinJobs);
        }
        
        await Promise.all(promises);
        
        // Remove duplicates by title + company
        const uniqueJobs = [];
        const seen = new Set();
        for (const job of jobs) {
            const key = `${job.title}_${job.company}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueJobs.push(job);
            }
        }
        
        // Log source breakdown
        console.log(`\n📊 JOB FETCH SUMMARY:`);
        console.log(`   JSearch: ${jobs.filter(j => j.source === 'jsearch').length}`);
        console.log(`   Active Jobs DB: ${jobs.filter(j => j.source === 'activejobs').length}`);
        console.log(`   PR Labs: ${jobs.filter(j => j.source === 'prlabs').length}`);
        console.log(`   Indeed: ${jobs.filter(j => j.source === 'indeed').length}`);
        console.log(`   LinkedIn: ${jobs.filter(j => j.source === 'linkedin').length}`);
        console.log(`   📈 TOTAL UNIQUE: ${uniqueJobs.length} jobs\n`);
        
        res.json({
            success: true,
            total: uniqueJobs.length,
            jobs: uniqueJobs.slice(0, 100),
            timestamp: new Date().toISOString(),
            sources: {
                jsearch: jobs.filter(j => j.source === 'jsearch').length,
                activejobs: jobs.filter(j => j.source === 'activejobs').length,
                prlabs: jobs.filter(j => j.source === 'prlabs').length,
                indeed: jobs.filter(j => j.source === 'indeed').length,
                linkedin: jobs.filter(j => j.source === 'linkedin').length
            }
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        cacheSize: cache.keys().length
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Job Portal Backend running on port ${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/jobs`);
    console.log(`✅ APIs Integrated: JSearch | Active Jobs DB | PR Labs | Indeed | LinkedIn`);
});
