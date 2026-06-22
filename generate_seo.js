const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT_DIR = __dirname;
const DOMAIN = 'https://dartpro.duckdns.org';
const DB_PATH = path.join(__dirname, 'lean_engine.db');

// 1. Generate robots.txt
const robotsContent = `User-agent: *
Allow: /
Sitemap: ${DOMAIN}/sitemap.xml
`;
fs.writeFileSync(path.join(ROOT_DIR, 'robots.txt'), robotsContent, 'utf8');
console.log('✅ robots.txt 생성 완료');

// 2. Generate sitemap.xml dynamically from DB
async function generateSitemap() {
  const routes = [
    { path: '/', priority: 1.0, changefreq: 'always' }
  ];

  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.warn('DB 연결 실패, 기본 라우트만 포함된 sitemap을 생성합니다.', err.message);
      writeSitemap(routes);
      return;
    }
  });

  db.all('SELECT rcept_no, created_at FROM summaries ORDER BY created_at DESC LIMIT 1000', [], (err, rows) => {
    if (err) {
      console.warn('요약본 조회 실패, 기본 라우트만 포함합니다.', err.message);
    } else if (rows) {
      rows.forEach(row => {
        // created_at format is "YYYY-MM-DD HH:MM:SS", we want YYYY-MM-DD
        const dateStr = row.created_at ? row.created_at.split(' ')[0] : new Date().toISOString().split('T')[0];
        routes.push({
          path: `/d/${row.rcept_no}`,
          priority: 0.8,
          changefreq: 'weekly',
          lastmod: dateStr
        });
      });
      console.log(`✅ DB에서 ${rows.length}개의 개별 공시 블로그 라우터를 추출했습니다.`);
    }

    writeSitemap(routes);
    db.close();
  });
}

function writeSitemap(routes) {
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(r => `  <url>
    <loc>${DOMAIN}${r.path}</loc>
    ${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ''}
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(ROOT_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
  console.log('✅ sitemap.xml 생성 완료');
}

generateSitemap();
