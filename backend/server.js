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
        if (max > 100000) {
            return `₹${Math.round(min/100000)}L - ₹${Math.round(max/100000)}L per annum`;
        }
        return `₹${min.toLocaleString()} - ${max.toLocaleString()}/month`;
    }
    return 'Salary not disclosed';
}

// JSearch API - REAL JOBS
async function fetchJSearchJobs(query, location) {
    const cacheKey = `jsearch_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios({
            method: 'GET',
            url: 'https://jsearch.p.rapidapi.com/search',
            params: {
                query: `${query} fresher entry level junior`,
                location: location,
                page: 1,
                num_pages: 2,
                radius: 30
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_HOST
            }
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
            const jobs = response.data.data
                .filter(job => {
                    const title = (job.job_title || '').toLowerCase();
                    return !title.includes('senior') && !title.includes('lead') && !title.includes('director');
                })
                .slice(0, 20)
                .map(job => ({
                    id: `jsearch_${Date.now()}_${Math.random()}`,
                    title: job.job_title || 'Digital Marketing Role',
                    company: job.employer_name || 'Company',
                    location: job.job_city || job.job_location || location,
                    salary: formatSalary(job.job_min_salary, job.job_max_salary),
                    description: (job.job_description || 'Entry-level digital marketing role.').substring(0, 200),
                    applyLink: job.job_apply_link || job.job_google_link || '#',
                    source: 'jsearch',
                    posted: new Date().toISOString()
                }));
            
            cache.set(cacheKey, jobs);
            console.log(`✅ JSearch: Found ${jobs.length} jobs`);
            return jobs;
        }
        console.log(`⚠️ JSearch: No jobs found`);
        return [];
    } catch (error) {
        console.error(`❌ JSearch Error: ${error.message}`);
        return [];
    }
}

// Indeed RSS - REAL JOBS
async function fetchIndeedJobs(query, location) {
    const cacheKey = `indeed_${query}_${location}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const rssUrl = `https://rss.indeed.com/rss?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date`;
        const feed = await parser.parseURL(rssUrl);
        
        if (feed.items && feed.items.length > 0) {
            const jobs = feed.items.slice(0, 20).map((item, index) => {
                let titleParts = item.title.split(' - ');
                let jobTitle = titleParts[0];
                let company = titleParts[1] || 'Company';
                
                return {
                    id: `indeed_${Date.now()}_${index}`,
                    title: jobTitle,
                    company: company,
                    location: location,
                    salary: 'Salary not disclosed',
                    description: (item.contentSnippet || item.content || '').substring(0, 200),
                    applyLink: item.link,
                    source: 'indeed',
                    posted: item.pubDate || new Date().toISOString()
                };
            });
            
            cache.set(cacheKey, jobs);
            console.log(`✅ Indeed: Found ${jobs.length} jobs`);
            return jobs;
        }
        console.log(`⚠️ Indeed: No jobs found`);
        return [];
    } catch (error) {
        console.error(`❌ Indeed Error: ${error.message}`);
        return [];
    }
}

// LinkedIn jobs (simulated - real LinkedIn requires OAuth)
function getLinkedInJobs(query, location) {
    const linkedInJobs = [
        { title: 'Digital Marketing Associate', company: 'Tech Mahindra', location: location, salary: '₹3.5L - ₹4.5L per annum', desc: 'Entry-level role for BBA graduates. SEO, social media, analytics.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=digital%20marketing%20fresher&location=Kolkata', source: 'linkedin' },
        { title: 'Social Media Executive', company: 'Wipro Digital', location: location, salary: '₹2.8L - ₹3.8L per annum', desc: 'Manage social media campaigns, content creation, analytics reporting.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=social%20media%20fresher&location=Kolkata', source: 'linkedin' },
        { title: 'SEO Analyst', company: 'Cognizant', location: location, salary: '₹3L - ₹4L per annum', desc: 'Keyword research, on-page optimization, SEO audits.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=seo%20fresher&location=Kolkata', source: 'linkedin' },
        { title: 'Content Marketing Specialist', company: 'Infosys', location: location, salary: '₹3.2L - ₹4.2L per annum', desc: 'Content strategy, blog writing, email marketing.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=content%20marketing%20fresher&location=Kolkata', source: 'linkedin' },
        { title: 'Performance Marketing Trainee', company: 'GroupM', location: location, salary: '₹2.5L - ₹3.5L per annum', desc: 'Google Ads, Facebook Ads, campaign optimization.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=performance%20marketing%20fresher&location=Kolkata', source: 'linkedin' },
        { title: 'Marketing Coordinator', company: 'Deloitte', location: location, salary: '₹3.5L - ₹4.5L per annum', desc: 'Coordinate marketing activities, vendor management, analytics.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=marketing%20coordinator%20fresher&location=Kolkata', source: 'linkedin' },
        { title: 'Junior Digital Marketer', company: 'Accenture', location: location, salary: '₹3L - ₹4L per annum', desc: 'Campaign management, social media, PPC basics.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=digital%20marketing%20entry%20level&location=Kolkata', source: 'linkedin' },
        { title: 'Email Marketing Associate', company: 'Swiggy', location: location, salary: '₹3.2L - ₹4.2L per annum', desc: 'Email campaigns, automation, CRM management.', applyLink: 'https://www.linkedin.com/jobs/search/?keywords=email%20marketing%20fresher&location=Kolkata', source: 'linkedin' }
    ];
    
    return linkedInJobs.map((job, index) => ({
        id: `linkedin_${Date.now()}_${index}`,
        ...job,
        description: job.desc,
        posted: new Date().toISOString()
    }));
}

app.get('/api/jobs', async (req, res) => {
    const { query = 'digital marketing', location = 'Kolkata', source = 'all' } = req.query;
    
    try {
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
            const linkedinJobs = getLinkedInJobs(query, location);
            jobs.push(...linkedinJobs);
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
        
        console.log(`📊 TOTAL: ${uniqueJobs.length} jobs (JSearch: ${jobs.filter(j=>j.source==='jsearch').length}, Indeed: ${jobs.filter(j=>j.source==='indeed').length}, LinkedIn: ${jobs.filter(j=>j.source==='linkedin').length})`);
        
        res.json({
            success: true,
            total: uniqueJobs.length,
            jobs: uniqueJobs,
            timestamp: new Date().toISOString(),
            sources: {
                jsearch: jobs.filter(j => j.source === 'jsearch').length,
                indeed: jobs.filter(j => j.source === 'indeed').length,
                linkedin: jobs.filter(j => j.source === 'linkedin').length
            }
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
    console.log(`🚀 Server running on port ${PORT}`);
});
