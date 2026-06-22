export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/c\+\+/g, 'cpp')
    .replace(/c#/g, 'csharp')
    .replace(/\.net/g, 'dotnet')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildSearchUrl(search, page = 1) {
  const keywordSlug = slugify(search.keywords);
  const locationSlug = slugify(search.location || 'india');
  const pathSuffix = page > 1 ? `-${page}` : '';
  const url = new URL(`https://www.naukri.com/${keywordSlug}-jobs-in-${locationSlug}${pathSuffix}`);

  if (search.experienceYears !== undefined && search.experienceYears !== '') {
    url.searchParams.set('experience', String(search.experienceYears));
  }

  if (search.maxAgeDays) {
    url.searchParams.set('fage', String(search.maxAgeDays));
  }

  // Salary filter — Naukri accepts LPA values like 4, 5, 6, 7.5, 10 etc.
  if (search.minSalaryLpa) {
    url.searchParams.set('salary', String(search.minSalaryLpa));
  }

  // Always sort by date (Recent) to ensure we get the latest
  url.searchParams.set('sort', 'r');

  return url.toString();
}

export function relevanceScore(job, includeKeywords = [], excludeKeywords = []) {
  // Normalize punctuation to spaces so things like "ui/ux" become "ui ux"
  const haystack = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  
  const excluded = excludeKeywords.some((keyword) => {
    const normalizedKeyword = String(keyword).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (!normalizedKeyword) return false;
    const regex = new RegExp(`\\b${normalizedKeyword}\\b`);
    return regex.test(haystack);
  });

  if (excluded) return -10;

  return includeKeywords.reduce((score, keyword) => {
    const normalizedKeyword = String(keyword).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (!normalizedKeyword) return score;
    const regex = new RegExp(`\\b${normalizedKeyword}\\b`);
    return regex.test(haystack) ? score + 1 : score;
  }, 0);
}

export async function scrapeJobs(page, config, log) {
  const allJobs = [];
  const seen = new Set();
  const searches = config.jobs?.searches || [];

  const maxResults = config.jobs?.maxResultsPerSearch || 25;
  const maxPages = Math.max(1, Math.ceil(maxResults / 20));

  for (const search of searches) {
    let searchJobs = [];
    const maxAgeDays = search.maxAgeDays;
    let skippedOldCount = 0;

    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      if (searchJobs.length >= maxResults) break;

      const searchUrl = buildSearchUrl(search, currentPage);
      const pageJobs = await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).then(async () => {
        try {
          await page.waitForSelector('article.jobTuple, .srp-jobtuple-wrapper, .jobTuple, .cust-job-tuple', { state: 'attached', timeout: 15000 });
        } catch (err) { console.error('Caught error waiting for job wrapper:', err.message); }

        return page.evaluate((maxResultsToGet) => {
          const selectors = [
            '.srp-jobtuple-wrapper',
            'article.jobTuple',
            '.jobTuple',
            '.cust-job-tuple'
          ];
          const cards = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
          const uniqueCards = Array.from(new Set(cards)).slice(0, maxResultsToGet);

          return uniqueCards.map((card) => {
            const link = card.querySelector('a[href*="/job-listings"], a.title, a');
            const title = card.querySelector('.title, .jobTitle, a[href*="/job-listings"]')?.textContent?.trim() || link?.textContent?.trim() || '';
            const company = card.querySelector('.comp-name, .companyName, .subTitle')?.textContent?.trim() || '';
            const location = card.querySelector('.locWdth, .location, .loc')?.textContent?.trim() || '';
            const experience = card.querySelector('.expwdth, .experience, .exp')?.textContent?.trim() || '';
            const salary = card.querySelector('.sal-wrap, .salary, .sal')?.textContent?.trim() || '';
            const description = card.querySelector('.job-desc, .job-description, .jobDesc')?.textContent?.trim() || '';
            const postedText = card.querySelector('.job-post-day, .postDate, [class*="post-day"], [class*="postDate"]')?.textContent?.trim() || '';

            return {
              title,
              company,
              location,
              experience,
              salary,
              description,
              postedText,
              url: link?.href || ''
            };
          }).filter((job) => job.title || job.company || job.url);
        }, maxResults - searchJobs.length);
      }).catch((err) => {
        console.error(`Error loading page ${currentPage}:`, err.message);
        return [];
      });

      if (!pageJobs || pageJobs.length === 0) {
        break; // No more results or navigation failed
      }

      for (const job of pageJobs) {
        const key = job.url || `${job.title}-${job.company}-${job.location}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Relaxed freshness filter
        if (maxAgeDays !== undefined && maxAgeDays !== null) {
          if (job.postedText) {
            const text = job.postedText.toLowerCase();
            const isFresh =
              text.includes('just now') ||
              text.includes('few hours') ||
              text.includes('today') ||
              text.match(/^(\d+)\s*hour/) ||
              (text.match(/(\d+)\s*day/) && parseInt(text.match(/(\d+)\s*day/)[1]) <= maxAgeDays);

            if (!isFresh) {
              skippedOldCount++;
              continue;
            }
          }
          // We DO NOT skip jobs without dates anymore, as Naukri hides them for premium listings
        }

        const score = relevanceScore(job, config.jobs?.includeKeywords, config.jobs?.excludeKeywords);
        
        // Default to 0 to avoid dropping partial matches that the user might want
        if (score >= (config.jobs?.minRelevanceScore ?? 0)) {
          const jobObj = {
            ...job,
            relevanceScore: score,
            searchKeywords: search.keywords,
            searchLocation: search.location,
            capturedAt: new Date().toISOString()
          };
          allJobs.push(jobObj);
          searchJobs.push(jobObj);
        }
      }
    }

    log.actions.push(`Scraped ${searchJobs.length} jobs for "${search.keywords}" in "${search.location}".`);
    if (skippedOldCount > 0) {
      log.actions.push(`Scraped ${searchJobs.length} jobs for "${search.keywords}" in "${search.location}".`);
      log.actions.push(`Skipped ${skippedOldCount} older listings (posted ${maxAgeDays}+ days ago).`);
    }
  }

  return allJobs.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
