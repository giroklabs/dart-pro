const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const DOMAIN = 'https://dartpro.duckdns.org';

// 1. Generate robots.txt
const robotsContent = `User-agent: *
Allow: /
Sitemap: ${DOMAIN}/sitemap.xml
`;

fs.writeFileSync(path.join(ROOT_DIR, 'robots.txt'), robotsContent, 'utf8');
console.log('✅ robots.txt 생성 완료');

// 2. Generate sitemap.xml
// 향후 SSR이나 라우팅 구조 변경을 대비해 기본 뼈대 구성
const routes = [
  { path: '/', priority: 1.0, changefreq: 'always' },
  // SPA의 Hash(#) 라우팅은 검색엔진이 무시하므로, 나중에 History API로 전환 시 아래 라우트들 활성화
  // { path: '/disclosures', priority: 0.8, changefreq: 'hourly' },
  // { path: '/statistics', priority: 0.6, changefreq: 'daily' }
];

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(r => `  <url>
    <loc>${DOMAIN}${r.path}</loc>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
  </url>`).join('\n')}
</urlset>`;

fs.writeFileSync(path.join(ROOT_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
console.log('✅ sitemap.xml 생성 완료');
