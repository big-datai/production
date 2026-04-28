#!/usr/bin/env node

/**
 * YouTube OAuth2 Authentication Helper
 * Generates an auth URL, starts a local server to catch the callback,
 * and saves the token to token.json.
 *
 * Usage: node content/podcast/youtubeAuth.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { URL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.resolve(process.cwd(), 'token.json');
const REDIRECT_PORT = 3333;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

async function main() {
  if (fs.existsSync(TOKEN_PATH)) {
    console.log('✅ token.json already exists. Delete it to re-authenticate.');
    return;
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const key = creds.installed || creds.web;

  const oauth2Client = new OAuth2Client(
    key.client_id,
    key.client_secret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n🔗 Open this URL in your browser to authorize:\n');
  console.log(authUrl);
  console.log('\n⏳ Waiting for authorization callback on port', REDIRECT_PORT, '...\n');

  // Start local server to catch the OAuth callback
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Error: No authorization code received</h1>');
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Save as authorized_user format for googleapis
      const payload = {
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: tokens.refresh_token,
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(payload, null, 2));

      console.log('✅ Token saved to token.json');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Authorization successful! You can close this tab.</h1>');
    } catch (err) {
      console.error('❌ Error exchanging code for token:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error: ${err.message}</h1>`);
    }

    server.close();
    process.exit(0);
  });

  server.listen(REDIRECT_PORT);
}

main().catch(console.error);
