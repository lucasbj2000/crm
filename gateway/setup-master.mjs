import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'..');const p=path.join(root,'storage','gateway','companies.json');
const password=process.argv[2];if(!password||password.length<10){console.error('Uso: node gateway/setup-master.mjs "UnaClaveSeguraDe10OMas"');process.exit(1)}
await mkdir(path.dirname(p),{recursive:true});const cfg=existsSync(p)?JSON.parse(await readFile(p,'utf8')):{version:23,companies:[]};const salt=randomBytes(16).toString('hex');cfg.masterPasswordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;await writeFile(p,JSON.stringify(cfg,null,2),{mode:0o600});console.log('Contraseña maestra configurada correctamente.');
