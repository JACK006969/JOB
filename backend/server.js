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

function formatSalary(min, max) {
    if (min && max && min > 0 && max > 0) {
        if (max > 100000) return `₹${Math.round(min/100000)}L - ₹${Math.round(max/100000)}L/annum`;
        return `₹${min.toLocaleString()} - ${max.toLocaleString()}/month`;
    }
    return 'Salary not disclosed';
}

// JSearch API
async function fetchJSearchJobs(query, location) {
    const cacheKey = `jsearch_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://jsearch.p.rapidapi.com/search',
            params: {
                query: `${query} Kolkata`,
                location: location,
                page: 1,
                num_pages: 2,
                radius: 50
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_HOST
            }
        });

        if (response.data?.data?.length > 0) {
            const jobs = response.data.data.slice(0, 25).map(job => ({
                id: `jsearch_${Date.now()}_${Math.random()}`,
                title: job.job_title || 'Digital Marketing Role',
                company: job.employer_name || 'Company',
                location: job.job_city || job.job_location || location,
                salary: formatSalary(job.job_min_salary, job.job_max_salary),
                description: (job.job_description || 'Entry-level role for BBA freshers.').substring(0, 200),
                applyLink: job.job_apply_link || '#',
                source: 'jsearch',
                posted: new Date().toISOString()
            }));
            cache.set(cacheKey, jobs);
            return jobs;
        }
        return [];
    } catch (error) {
        console.log(`JSearch: ${error.message}`);
        return [];
    }
}

// Indeed with proxy
async function fetchIndeedJobs(query, location) {
    const cacheKey = `indeed_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const rssUrl = `https://rss.indeed.com/rss?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
        const response = await axios.get(proxyUrl, { timeout: 10000 });
        const feed = await parser.parseString(response.data);
        
        if (feed.items?.length > 0) {
            const jobs = feed.items.slice(0, 20).map((item, idx) => {
                const parts = item.title.split(' - ');
                return {
                    id: `indeed_${Date.now()}_${idx}`,
                    title: parts[0] || 'Marketing Role',
                    company: parts[1] || 'Company',
                    location: location,
                    salary: 'Salary not disclosed',
                    description: (item.contentSnippet || '').substring(0, 200),
                    applyLink: item.link,
                    source: 'indeed',
                    posted: new Date().toISOString()
                };
            });
            cache.set(cacheKey, jobs);
            return jobs;
        }
        return [];
    } catch (error) {
        console.log(`Indeed: ${error.message}`);
        return [];
    }
}

// More LinkedIn-style jobs
function getLinkedInJobs(query, location) {
    const jobsList = [
        { title: 'Digital Marketing Associate', company: 'Tech Mahindra', salary: '₹3.5L - ₹4.5L/annum', desc: 'SEO, social media, analytics for BBA freshers.' },
        { title: 'Social Media Executive', company: 'Wipro Digital', salary: '₹2.8L - ₹3.8L/annum', desc: 'Content creation, campaign management, analytics.' },
        { title: 'SEO Analyst', company: 'Cognizant', salary: '₹3L - ₹4L/annum', desc: 'Keyword research, on-page optimization, SEO audits.' },
        { title: 'Content Marketing Specialist', company: 'Infosys', salary: '₹3.2L - ₹4.2L/annum', desc: 'Content strategy, blog writing, email marketing.' },
        { title: 'Performance Marketing Trainee', company: 'GroupM', salary: '₹2.5L - ₹3.5L/annum', desc: 'Google Ads, Facebook Ads, campaign optimization.' },
        { title: 'Marketing Coordinator', company: 'Deloitte', salary: '₹3.5L - ₹4.5L/annum', desc: 'Marketing coordination, vendor management.' },
        { title: 'Junior Digital Marketer', company: 'Accenture', salary: '₹3L - ₹4L/annum', desc: 'Campaign management, PPC basics.' },
        { title: 'Email Marketing Associate', company: 'Swiggy', salary: '₹3.2L - ₹4.2L/annum', desc: 'Email campaigns, automation, CRM.' },
        { title: 'Brand Marketing Fresher', company: 'Unilever', salary: '₹4L - ₹5L/annum', desc: 'Brand strategy, campaign execution.' },
        { title: 'Marketing Analyst', company: 'Amazon', salary: '₹3.5L - ₹4.8L/annum', desc: 'Market research, data analysis, reporting.' }
    ];
    
    return jobsList.map((job, idx) => ({
        id: `linkedin_${Date.now()}_${idx}`,
        ...job,
        location: location,
        description: job.desc,
        applyLink: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(job.title)}&location=${location}`,
        source: 'linkedin',
        posted: new Date().toISOString()
    }));
}

app.get('/api/jobs', async (req, res) => {
    const { query = 'digital marketing', location = 'Kolkata', source = 'all' } = req.query;
    
    let jobs = [];
    
    if (source === 'all' || source === 'jsearch') {
        const jsearchJobs = await fetchJSearchJobs(query, location);
        jobs.push(...jsearchJobs);
    }
    
    if (source === 'all' || source === 'indeed') {
        const indeedJobs = await fetchIndeedJobs(query, location);
        jobs.push(...indeedJobs);
    }
    
    if (source === 'all' || source === 'linkedin') {
        jobs.push(...getLinkedInJobs(query, location));
    }
    
    // Remove duplicates
    const seen = new Set();
    const uniqueJobs = jobs.filter(job => {
        const key = `${job.title}_${job.company}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    
    console.log(`📊 Total: ${uniqueJobs.length} jobs (JSearch: ${jobs.filter(j=>j.source==='jsearch').length}, Indeed: ${jobs.filter(j=>j.source==='indeed').length}, LinkedIn: ${jobs.filter(j=>j.source==='linkedin').length})`);
    
    res.json({
        success: true,
        total: uniqueJobs.length,
        jobs: uniqueJobs.slice(0, 60),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
