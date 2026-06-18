const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const OpenAI = require('openai');
const path = require('path'); // Required for fixing the CSS path
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 1800 }); // 30 min cache

// ============================================
// GROQ AI CLIENT INITIALIZATION
// ============================================
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// CRITICAL FIX: This line makes your CSS and frontend load correctly on Render
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// API KEYS
// ============================================
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; 

// Helper: format salary
function formatSalary(min, max, currency) {
    if (min && max && min > 0 && max > 0) {
        const symbol = currency === 'USD' ? '$' : '₹';
        if (max > 100000) {
            return `${symbol}${Math.round(min / 100000)}L - ${symbol}${Math.round(max / 100000)}L per annum`;
        }
        return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}/month`;
    }
    if (min && min > 0) {
        return min > 100000 ? `₹${Math.round(min / 100000)}L+ per annum` : `₹${min.toLocaleString()}/month`;
    }
    return 'Salary not disclosed';
}

// ============================================
// JSEARCH API (ONLY WORKING SOURCE)
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
            console.log(`✅ JSearch: ${jobs.length} jobs found`);
            return jobs;
        }
        return [];
    } catch (error) {
        console.error(`❌ JSearch Error: ${error.message}`);
        return [];
    }
}

// ============================================
// MAIN JOBS ROUTE
// ============================================
app.get('/api/jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata' } = req.query;
    query = query.trim();
    console.log(`\n🔍 SEARCHING: "${query}" in ${location}`);

    try {
        const jobs = await fetchJSearchJobs(query, location);
        
        console.log(` TOTAL: ${jobs.length} jobs from JSearch`);

        res.json({
            success: true,
            total: jobs.length,
            jobs: jobs,
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
// 🤖 AI JOBS ROUTE (Powered by Groq + Qwen 3.6)
// ============================================
app.get('/api/ai-jobs', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata' } = req.query;
    console.log(`\n🤖 AI SEARCH: "${query}" in ${location}`);

    try {
        // 1. Fetch jobs using JSearch
        const jobs = await fetchJSearchJobs(query, location);
        
        if (!jobs || jobs.length === 0) {
            return res.json({ 
                success: true, 
                ai_summary: "I couldn't find any jobs for that search. Try different keywords or location!" 
            });
        }

        // Take top 15 jobs to keep it fast and save tokens
        const topJobs = jobs.slice(0, 15);

        // 2. Send to Groq (Qwen) to format and summarize
        const prompt = `You are an expert career assistant. I have found ${topJobs.length} job openings for "${query}" in "${location}". 

Please analyze these jobs and provide:
1. A brief 2-sentence summary of the job market for this role
2. A clean, numbered list of the top jobs with:
   - **Job Title** at **Company**
   - Location
   - Salary (if available, otherwise say "Salary not disclosed")
   - A direct clickable link: [Apply Here](url)

Format everything in clean Markdown.

Here are the jobs:
${JSON.stringify(topJobs, null, 2)}`;

        console.log('🚀 Calling Groq API with qwen/qwen3.6-27b...');
        
        const completion = await groqClient.chat.completions.create({
            model: "qwen/qwen3.6-27b", // THE NEW WORKING MODEL!
            messages: [
                { role: "user", content: prompt }
            ],
            temperature: 0.6,
            max_tokens: 4096,
            top_p: 0.95
        });

        console.log('✅ Groq responded successfully!');
        const aiResponse = completion.choices[0].message.content;

        res.json({
            success: true,
            ai_summary: aiResponse,
            raw_jobs_count: jobs.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ AI Error Details:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// 🧪 TEST GROQ ROUTE (To verify connection)
// ============================================
app.get('/api/test-groq', async (req, res) => {
    console.log('🧪 Testing Groq connection...');
    try {
        const testResponse = await groqClient.chat.completions.create({
            model: "qwen/qwen3.6-27b",
            messages: [
                { role: "user", content: "Say 'Hello, Groq and Qwen are working perfectly!' in one sentence" }
            ],
            max_tokens: 50
        });
        
        res.json({
            success: true,
            message: testResponse.choices[0].message.content,
            groqConfigured: !!process.env.GROQ_API_KEY
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            groqConfigured: !!process.env.GROQ_API_KEY
        });
    }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cacheSize: cache.keys().length,
        groqConfigured: !!process.env.GROQ_API_KEY,
        rapidApiConfigured: !!RAPIDAPI_KEY
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`✅ Groq AI: ${process.env.GROQ_API_KEY ? 'Configured' : 'Missing GROQ_API_KEY'}`);
    console.log(`✅ RapidAPI: ${RAPIDAPI_KEY ? 'Configured' : 'Missing RAPIDAPI_KEY'}`);
    console.log(`🔍 Test Jobs: http://localhost:${PORT}/api/jobs?query=python&location=remote`);
    console.log(`🤖 Test AI: http://localhost:${PORT}/api/ai-jobs?query=python&location=remote`);
    console.log(`🧪 Test Groq: http://localhost:${PORT}/api/test-groq`);
});
