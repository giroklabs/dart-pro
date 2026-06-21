const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const saPath = path.resolve(__dirname, 'service-account.json');

async function test() {
  try {
    const auth = new GoogleAuth({
      keyFile: saPath,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    console.log("Response typeof:", typeof tokenResponse);
    console.log("Response keys:", typeof tokenResponse === 'object' && tokenResponse ? Object.keys(tokenResponse) : 'N/A');
    console.log("Response value:", tokenResponse);
  } catch(e) {
    console.error(e);
  }
}
test();
