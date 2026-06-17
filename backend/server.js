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
// ENVIRONMENT VARIABLES
// ============================================
// RAPIDAPI_KEY – for JSearch, PR Labs, Active Jobs DB
// LLM7_API_KEY – for AI chat and web search (use the key you just gave)
// ============================================

const LLM7_API_KEY = process.env.LLM7_API_KEY || 'nSD8bZg/YVtAzyPVDhXVnTY37Ck5bVtNv4yktaB0x/cXfoEk4VkyvpzJgANHxN3imqh8oFsjn+gmF9M8Iv4UhsVNomsaKZXtgrqr+f80ebm1K8ivAbI1AKozCCwCaCD2OfJj9TIlMvd7HH8D2RM=';

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
// REAL JOB SOURCES (keep these)
// ============================================

async function fetchJSearchJobs(query, location) {
    // ... existing code (same as before)
}

async function fetchPRLabsJobs(query, location) {
    // ... existing code (same as before)
}

async function fetchActiveJobsDB(query, location) {
    // ... existing code (same as before)
}

async function fetchIndeedJobs(query, location) {
    // ... existing code (same as before)
}

// ============================================
// MARKETING GENERATOR (fallback)
// ============================================
function generateMarketingJobs(query, location) {
    // ... existing code (same as before)
}

// ============================================
// LLM7.io AI CHAT ASSISTANT
// ============================================
const OpenAI = require('openai');
const llm7 = new OpenAI({
    apiKey: LLM7_API_KEY,
    baseURL: 'https://api.llm7.io/v1'
});

app.post('/api/ai-chat', async (req, res) => {
    const { message } = req.body;
    try {
        const completion = await llm7.chat.completions.create({
            model: 'fast',         // fast = low latency, pro = highest quality (paid)
            messages: [
                { role: 'system', content: 'You are a career assistant for freshers. Provide helpful advice.' },
                { role: 'user', content: message }
            ],
            temperature: 0.7
        });
        res.json({ reply: completion.choices[0].message.content });
    } catch (error) {
        console.error('LLM7 chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// LLM7.io WEB SEARCH (for real‑time job search)
// ============================================
app.get('/api/llm7-search', async (req, res) => {
    let { query = 'digital marketing', location = 'Kolkata' } = req.query;
    try {
        // Use the context endpoint for web search
        const searchClient = new OpenAI({
            apiKey: LLM7_API_KEY,
            baseURL: 'https://api.context.llm7.io'   // experimental web search endpoint
        });

        const completion = await searchClient.chat.completions.create({
            model: 'fast',
            messages: [
                { role: 'system', content: `You are a job search assistant. Search the web for real ${query} jobs in ${location}, India. Return a JSON array with fields: title, company, location, salary, description, applyLink. Only return JSON.` },
                { role: 'user', content: `Search for ${query} jobs in ${location}` }
            ],
            temperature: 0.3
        });

        let jobs = [];
        try {
            const text = completion.choices[0].message.content;
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) jobs = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error('Parse error:', e.message);
            jobs = [];
        }

        // Tag as LLM7 search
        jobs = jobs.map(j => ({ ...j, source: 'llm7', id: `llm7_${Date.now()}_${Math.random()}` }));
        res.json({ success: true, jobs, total: jobs.length });
    } catch (error) {
        console.error('LLM7 search error:', error);
        res.status(500).json({ success: false, error: error.message, jobs: [] });
    }
});

// ============================================
// MAIN JOBS ROUTE – combines real sources + fallback
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

        // If user selects 'llm7' source, we call the llm7-search endpoint internally
        if (source === 'all' || source === 'llm7') {
            try {
                const llmRes = await axios.get(`${req.protocol}://${req.get('host')}/api/llm7-search`, {
                    params: { query, location }
                });
                if (llmRes.data.success) jobs.push(...llmRes.data.jobs);
            } catch (e) {
                console.log('⚠️ LLM7 search failed:', e.message);
            }
        }

        await Promise.all(apiCalls);

        // Fallback generator if no jobs found and it's a marketing query
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
        llm7Configured: !!LLM7_API_KEY,
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
    console.log(`✅ Real Job Sources:`);
    console.log(`   1. JSearch API`);
    console.log(`   2. PR Labs API`);
    console.log(`   3. Active Jobs DB`);
    console.log(`   4. Indeed RSS`);
    console.log(`   5. 🤖 LLM7.io AI Assistant + Web Search`);
    console.log(`   6. Marketing Generator (Fallback)`);
    console.log(`\n🔍 LLM7 Status: ${LLM7_API_KEY ? '✅ Key set' : '❌ Missing'}`);
    console.log(`🔍 AI Chat: POST /api/ai-chat`);
    console.log(`🔍 LLM7 Search: GET /api/llm7-search?query=software engineer&location=Kolkata`);
    console.log(`🔍 Main Search: GET /api/jobs?query=...&location=...&source=...\n`);
});