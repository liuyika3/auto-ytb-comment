import fs from 'node:fs';
import { google } from 'googleapis';
import { tokenPath, getOAuthRedirectUri, getOAuthClientCredentials } from '../paths.mjs';

/** @returns {Promise<import('googleapis').Auth.OAuth2Client>} */
export async function getOAuth2Client() {
  const creds = await getOAuthClientCredentials();
  if (!fs.existsSync(tokenPath)) {
    throw new Error('未登录 YouTube。打开 http://127.0.0.1:8766/ 走向导完成授权（或 npm run oauth）。');
  }
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    getOAuthRedirectUri()
  );
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

export async function getYoutube() {
  return google.youtube({ version: 'v3', auth: await getOAuth2Client() });
}
