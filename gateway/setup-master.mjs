import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'..');const p=path.join(root,'storage','gateway','companies.json');
const password=String(process.argv[2]||'');
const weak=new Set(['password','password123','admin','admin123','qwerty','qwerty123','12345678','123456789','whatsapp','whatsapp123','crm12345','contraseña','contrasena']);
const groups=[/[a-záéíóúñ]/i.test(password),/[A-ZÁÉÍÓÚÑ]/.test(password),/\d/.test(password),/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]/.test(password)].filter(Boolean).length;
if(password.length<12||password.length>128||weak.has(password.toLowerCase().replace(/\s+/g,''))||(password.length<16&&groups<3)){console.error('Uso: node gateway/setup-master.mjs "UnaClaveFuerteDe12OMas"\nLa clave debe tener 12-128 caracteres y al menos 3 tipos de caracteres, o ser una frase de 16+ caracteres.');process.exit(1)}
await mkdir(path.dirname(p),{recursive:true});const cfg=existsSync(p)?JSON.parse(await readFile(p,'utf8')):{version:23,companies:[]};const salt=randomBytes(16).toString('hex');cfg.masterPasswordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;await writeFile(p,JSON.stringify(cfg,null,2),{mode:0o600});console.log('Contraseña maestra configurada correctamente.');
