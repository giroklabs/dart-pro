const fs = require('fs');
const https = require('https');
const envFile = fs.readFileSync('.env', 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    if(json.models) {
      console.log("지원하는 모델 목록:");
      json.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')).forEach(m => console.log(m.name));
    } else {
      console.log("에러:", json);
    }
  });
}).on('error', console.error);
