const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 1800 });

const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; 

function formatSalary(min, max, currency) {
    if (min && max && min > 0 && max > 0) {
        const symbol = currency === 'USD' ? '$' : '₹';
        if (max > 100000) return `${symbol}${Math.round(min / 100000)}L - ${symbol}${Math.round(max / 100000)}L`;
        return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}`;
    }
    return 'Not disclosed';
}

// ============================================
// JSEARCH WITH FILTERS & PAGINATION
// ============================================
async function fetchJSearchJobs(query, location, page, jobType, isRemote, experience) {
    const cacheKey = `jsearch_${query}_${location}_${page}_${jobType}_${isRemote}_${experience}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Map experience to search keywords
    let expKeywords = '';
    if (experience === 'fresher') expKeywords = ' fresher OR entry level OR internship';
    if (experience === '1-3') expKeywords = ' 1 to 3 years experience OR associate';
    if (experience === '4+') expKeywords = ' 4+ years experience OR senior OR lead';

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://jsearch.p.rapidapi.com/search',
            params: {
                query: `${query} in ${location}${expKeywords}`,
                page: page,
                num_pages: 2, // 2 pages = ~20 jobs
                job_type: jobType, // fulltime, parttime, contract
                remote_jobs: isRemote === 'true'
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            },
            timeout: 10000
        });

        if (response.data?.data?.length > 0) {
            const jobs = response.data.data.map(job => ({
                id: `jsearch_${job.job_id}`,
                title: job.job_title || 'Job Opportunity',
                company: job.employer_name || 'Company',
                location: job.job_city || job.job_location || location,
                salary: formatSalary(job.job_min_salary, job.job_max_salary, 'USD'),
                description: (job.job_description || '').replace(/<[^>]*>?/gm, '').substring(0, 150),
                applyLink: job.job_apply_link || '#',
                source: 'JSearch',
                jobType: job.job_employment_type || 'Full-time',
                posted: job.job_posted_at_datetime_utc || new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(` JSearch Error: ${error.message}`);
        return [];
    }
}

// ============================================
// MAIN JOBS ROUTE (With Filters)
// ============================================
app.get('/api/jobs', async (req, res) => {
    let { 
        query = 'digital marketing', 
        location = 'Kolkata', 
        page = 1, 
        job_type = 'fulltime,parttime,contract', 
        remote = 'false', 
        experience = 'fresher' 
    } = req.query;

    try {
        const jobs = await fetchJSearchJobs(query, location, page, job_type, remote, experience);
        
        res.json({
            success: true,
            total: jobs.length,
            jobs: jobs,
            currentPage: parseInt(page),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🤖 AI SUMMARY ROUTE
// ============================================
app.get('/api/ai-jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata' } = req.query;
    try {
        const jobs = await fetchJSearchJobs(query, location, 1, 'fulltime,parttime', 'false', 'fresher');
        if (!jobs || jobs.length === 0) {
            return res.json({ success: true, ai_summary: "No jobs found." });
        }

        const prompt = `Analyze these ${jobs.length} jobs for "${query}" in "${location}". Provide a 2-sentence market summary and a numbered list of the top 5 jobs with Title, Company, and [Apply Link](url). Use Markdown.`;

        const completion = await groqClient.chat.completions.create({
            model: "qwen/qwen3.6-27b",
            messages: [{ role: "user", content: `${prompt}\n\nJobs: ${JSON.stringify(jobs.slice(0, 10))}` }],
            temperature: 0.6,
            max_tokens: 2048
        });

        res.json({ success: true, ai_summary: completion.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
});
