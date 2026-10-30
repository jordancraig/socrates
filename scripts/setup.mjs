import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const content=`POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nWORKER_TOKEN=${randomBytes(32).toString('hex')}\nATELIER_URL=http://127.0.0.1:8080\n`;
try{await writeFile('.env',content,{flag:'wx',mode:0o600});console.log('Created .env with independent local database and worker secrets. Start docker compose up --build -d, then npm run worker on this host.');}catch(e){if(e.code==='EEXIST')console.log('.env already exists; left unchanged.');else throw e;}
