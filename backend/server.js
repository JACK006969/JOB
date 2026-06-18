const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const OpenAI = require('openai');
const path = require('path');
const Parser = require('rss-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 1800 });
const parser = new Parser();

// ============================================
// GROQ AI CLIENT
// ============================================
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// API KEYS (Adzuna removed!)
// ============================================
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// Helper: format salary
function formatSalary(min, max, currency) {
    if (min && max && min > 0 && max > 0) {
        if (max > 100000) return `₹${Math.round(min / 100000)}L - ₹${Math.round(max / 100000)}L`;
        return `₹${min.toLocaleString()} - ₹${max.toLocaleString()}`;
    }
    return 'Not disclosed';
}

// ============================================
// 1. JSEARCH API
// ============================================
async function fetchJSearchJobs(query, location, page, jobType, isRemote, experience) {
    let expKeywords = '';
    if (experience === 'fresher') expKeywords = ' fresher OR entry level';
    if (experience === '1-3') expKeywords = ' 1 to 3 years';
    if (experience === '4+') expKeywords = ' 4+ years senior';

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://jsearch.p.rapidapi.com/search',
            params: {
                query: `${query} in ${location}${expKeywords}`,
                page: page,
                num_pages: 1,
                job_type: jobType,
                remote_jobs: isRemote === 'true'
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            },
            timeout: 8000
        });

        if (response.data?.data?.length > 0) {
            return response.data.data.slice(0, 10).map(job => ({
                id: `jsearch_${job.job_id}`,
                title: job.job_title,
                company: job.employer_name || 'Company',
                location: job.job_city || location,
                salary: formatSalary(job.job_min_salary, job.job_max_salary, 'USD'),
                description: (job.job_description || '').replace(/<[^>]*>?/gm, '').substring(0, 150),
                applyLink: job.job_apply_link || '#',
                source: 'JSearch',
                jobType: job.job_employment_type || 'Full-time',
                posted: job.job_posted_at_datetime_utc
            }));
        }
        return [];
    } catch (error) {
        console.error('❌ JSearch Error:', error.message);
        return [];
    }
}

// ============================================
// 2. INDEED RSS FEEDS (FREE, NO API KEY!)
// ============================================
async function fetchIndeedRSSJobs(query, location) {
    try {
        const indeedLocation = location.toLowerCase().replace(/\s+/g, '-');
        const indeedQuery = query.replace(/\s+/g, '-');
        const rssUrl = `https://in.indeed.com/rss?q=${indeedQuery}&l=${indeedLocation}`;
        
        const feed = await parser.parseURL(rssUrl);
        
        return feed.items.slice(0, 10).map((item, index) => ({
            id: `indeed_${Date.now()}_${index}`,
            title: item.title,
            company: 'Indeed',
            location: location,
            salary: 'Not disclosed',
            description: (item.contentSnippet || item.summary || '').substring(0, 150),
            applyLink: item.link,
            source: 'Indeed RSS',
            jobType: 'Full-time',
            posted: item.pubDate || new Date().toISOString()
        }));
    } catch (error) {
        console.error('❌ Indeed RSS Error:', error.message);
        return [];
    }
}

// ============================================
// 3. SERPAPI - GOOGLE JOBS (BEST FOR INDIA!)
// ============================================
async function fetchGoogleJobs(query, location, experience) {
    if (!SERPAPI_KEY) return [];

    let expKeyword = '';
    if (experience === 'fresher') expKeyword = ' fresher entry level';
    if (experience === '1-3') expKeyword = ' 1-3 years experience';
    if (experience === '4+') expKeyword = ' 4+ years senior';

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://serpapi.com/search.json',
            params: {
                engine: 'google_jobs',
                q: `${query} ${expKeyword} in ${location}`,
                location: 'India',
                hl: 'en',
                gl: 'in',
                api_key: SERPAPI_KEY
            },
            timeout: 8000
        });

        if (response.data.jobs_results) {
            return response.data.jobs_results.slice(0, 10).map(job => ({
                id: `google_${job.job_id || Date.now()}`,
                title: job.title,
                company: job.company_name,
                location: job.location,
                salary: job.detected_extensions?.schedule || 'Not disclosed',
                description: (job.description || '').substring(0, 150),
                applyLink: job.related_links?.[0]?.link || job.share_link || '#',
                source: 'Google Jobs',
                jobType: job.detected_extensions?.work_schedule || 'Full-time',
                posted: job.detected_extensions?.posted_time || new Date().toISOString()
            }));
        }
        return [];
    } catch (error) {
        console.error('❌ Google Jobs Error:', error.message);
        return [];
    }
}

// ============================================
// MAIN JOBS ROUTE - COMBINES ALL 3 SOURCES
// ============================================
app.get('/api/jobs', async (req, res) => {
    let { 
        query = 'digital marketing', 
        location = 'Kolkata', 
        page = 1, 
        job_type = 'fulltime,parttime', 
        remote = 'false', 
        experience = 'fresher' 
    } = req.query;

    console.log(`🔍 Searching: ${query} in ${location} (Exp: ${experience})`);

    try {
        // Fetch from 3 sources in parallel
        const [jsearchJobs, indeedJobs, googleJobs] = await Promise.all([
            fetchJSearchJobs(query, location, page, job_type, remote, experience),
            fetchIndeedRSSJobs(query, location),
            fetchGoogleJobs(query, location, experience)
        ]);

        // Combine all jobs
        let allJobs = [...jsearchJobs, ...indeedJobs, ...googleJobs];

        // Remove duplicates (same title + company)
        const uniqueJobs = [];
        const seen = new Set();
        for (const job of allJobs) {
            const key = `${job.title}_${job.company}`.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueJobs.push(job);
            }
        }

        // Sort by posted date (newest first)
        uniqueJobs.sort((a, b) => new Date(b.posted) - new Date(a.posted));

        console.log(`✅ Found: JSearch(${jsearchJobs.length}) + Indeed(${indeedJobs.length}) + Google(${googleJobs.length}) = ${uniqueJobs.length} total jobs`);

        res.json({
            success: true,
            total: uniqueJobs.length,
            jobs: uniqueJobs,
            currentPage: parseInt(page),
            sources: {
                jsearch: jsearchJobs.length,
                indeed: indeedJobs.length,
                google: googleJobs.length
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🤖 AI JOBS ROUTE
// ============================================
app.get('/api/ai-jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata' } = req.query;
    try {
        // Re-use the main jobs logic to get data for the AI
        const [jsearchJobs, indeedJobs, googleJobs] = await Promise.all([
            fetchJSearchJobs(query, location, 1, 'fulltime,parttime', 'false', 'fresher'),
            fetchIndeedRSSJobs(query, location),
            fetchGoogleJobs(query, location, 'fresher')
        ]);
        
        const allJobs = [...jsearchJobs, ...indeedJobs, ...googleJobs];

        if (allJobs.length === 0) {
            return res.json({ success: true, ai_summary: "No jobs found." });
        }

        const prompt = `Analyze these ${allJobs.length} jobs for "${query}" in "${location}". Provide a 2-sentence market summary and top 5 jobs with direct apply links.`;

        const completion = await groqClient.chat.completions.create({
            model: "qwen/qwen3.6-27b",
            messages: [{ role: "user", content: `${prompt}\n\nJobs: ${JSON.stringify(allJobs.slice(0, 10))}` }],
            temperature: 0.6,
            max_tokens: 2048
        });

        res.json({ success: true, ai_summary: completion.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
    console.log(`✅ Active Sources: JSearch + Indeed RSS + Google Jobs (SerpAPI)`);
});
