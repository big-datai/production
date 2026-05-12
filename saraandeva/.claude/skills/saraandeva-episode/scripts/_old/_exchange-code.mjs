import fs from "node:fs";
import { OAuth2Client } from "google-auth-library";

const CODE = "4/0Aci98E_JAju0AcFszty9fnBZBO4IabDt1_Xc19fdwEKySn87WN-LabHrrReOWyK7BI7Pog";
const CRED_PATH = "/Volumes/Samsung500/goreadling/credentials-saraandeva.json";
const TOK_PATH  = "/Volumes/Samsung500/goreadling/token-saraandeva.json";

const cred = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
const k = cred.installed || cred.web;
const oauth = new OAuth2Client(k.client_id, k.client_secret, k.redirect_uris[0]);

const { tokens } = await oauth.getToken(CODE);
fs.writeFileSync(TOK_PATH, JSON.stringify(tokens, null, 2));
console.log("✓ Token saved to", TOK_PATH);
console.log("  Has refresh_token:", !!tokens.refresh_token);
console.log("  Scope:", tokens.scope);
