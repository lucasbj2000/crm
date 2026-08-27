function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`V25.7 patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

export function applyV257FormPatches(source) {
  let out = source;

  out = replaceOne(
    out,
    /function sanitizeSurveyDefinition\(input = \{\}, existing = null\) \{/,
    `function sanitizeV257AssetUrl(value){
  const url=cleanText(value,1000);
  if(!url)return "";
  if(url==="/api/branding/logo")return url;
  if(/^\\/api\\/public\\/form-assets\\/[a-zA-Z0-9._-]+$/.test(url))return url;
  return "";
}
function sanitizeV257Href(value){
  const href=cleanText(value,1000);
  if(!href)return "";
  if(/^https?:\\/\\//i.test(href)||/^mailto:/i.test(href)||/^tel:/i.test(href))return href;
  return "";
}
function sanitizeV257DesignBlocks(input, existing=[]){
  const source=Array.isArray(input)?input:(Array.isArray(existing)?existing:[]);
  const allowed=new Set(["title","subtitle","text","separator","image","button","spacer"]);
  return source.slice(0,40).map((entry,index)=>{
    const raw=entry&&typeof entry==="object"?entry:{};
    const type=allowed.has(raw.type)?raw.type:"text";
    return {
      id: cleanText(raw.id,100)||\`block_\${index+1}\`,
      type,
      text: cleanText(raw.text,1200),
      url: sanitizeV257AssetUrl(raw.url),
      href: sanitizeV257Href(raw.href),
      alt: cleanText(raw.alt,240),
      align: ["left","center","right"].includes(raw.align)?raw.align:"left",
      size: ["small","medium","large","xl"].includes(raw.size)?raw.size:"medium",
      showOn: ["all","landing","questions","completed"].includes(raw.showOn)?raw.showOn:"all",
    };
  }).filter((entry)=>entry.type==="separator"||entry.type==="spacer"||entry.text||entry.url);
}
function sanitizeSurveyDefinition(input = {}, existing = null) {`,
    "helpers de diseño de formularios",
  );

  out = replaceOne(
    out,
    /theme: \{\n      primaryColor: sanitizeFormColor\(themeInput\.primaryColor,"#171717"\),\n      accentColor: sanitizeFormColor\(themeInput\.accentColor,"#FF7A00"\),\n    \},/,
    `theme: {
      primaryColor: sanitizeFormColor(themeInput.primaryColor,"#171717"),
      accentColor: sanitizeFormColor(themeInput.accentColor,"#FF7A00"),
      backgroundColor: sanitizeFormColor(themeInput.backgroundColor,"#F3F3F4"),
      surfaceColor: sanitizeFormColor(themeInput.surfaceColor,"#FFFFFF"),
      textColor: sanitizeFormColor(themeInput.textColor,"#1B1B1D"),
      mutedColor: sanitizeFormColor(themeInput.mutedColor,"#6F7178"),
      borderColor: sanitizeFormColor(themeInput.borderColor,"#E1E2E6"),
      buttonColor: sanitizeFormColor(themeInput.buttonColor,sanitizeFormColor(themeInput.primaryColor,"#171717")),
      buttonTextColor: sanitizeFormColor(themeInput.buttonTextColor,"#FFFFFF"),
      radius: Math.max(0,Math.min(40,Number(themeInput.radius)||20)),
      logoUrl: sanitizeV257AssetUrl(themeInput.logoUrl),
      coverUrl: sanitizeV257AssetUrl(themeInput.coverUrl),
      showProgress: themeInput.showProgress !== false,
      startButtonLabel: cleanText(themeInput.startButtonLabel,80)||"Comenzar",
      nextButtonLabel: cleanText(themeInput.nextButtonLabel,80)||"Continuar",
      brandName: cleanText(themeInput.brandName,120),
      footerText: cleanText(themeInput.footerText,400),
    },
    designBlocks: sanitizeV257DesignBlocks(input.designBlocks,existing?.designBlocks),`,
    "tema visual ampliado",
  );

  out = replaceOne(
    out,
    /function publicFormDefinitionPayload\(survey\)\{\n  if\(!survey\)return null;\n  return \{\n    company:\{name:data\.settings\.branding\?\.systemName\|\|"CRM",primaryColor:survey\.theme\?\.primaryColor\|\|"#171717",accentColor:survey\.theme\?\.accentColor\|\|"#FF7A00"\},\n    form:\{id:survey\.id,name:survey\.name,description:survey\.description\|\|"",formType:survey\.formType\|\|"survey",collectIdentity:survey\.collectIdentity\|\|"optional",questionCount:\(survey\.questions\|\|\[\]\)\.length,introMessage:survey\.introMessage\|\|"Completá este formulario\."\},\n  \};\n\}/,
    `function v257PublicTheme(survey){
  const theme=survey?.theme||{};
  return {
    primaryColor:theme.primaryColor||"#171717",accentColor:theme.accentColor||"#FF7A00",backgroundColor:theme.backgroundColor||"#F3F3F4",surfaceColor:theme.surfaceColor||"#FFFFFF",textColor:theme.textColor||"#1B1B1D",mutedColor:theme.mutedColor||"#6F7178",borderColor:theme.borderColor||"#E1E2E6",buttonColor:theme.buttonColor||theme.primaryColor||"#171717",buttonTextColor:theme.buttonTextColor||"#FFFFFF",radius:Number(theme.radius)||20,logoUrl:theme.logoUrl||"",coverUrl:theme.coverUrl||"",showProgress:theme.showProgress!==false,startButtonLabel:theme.startButtonLabel||"Comenzar",nextButtonLabel:theme.nextButtonLabel||"Continuar",brandName:theme.brandName||"",footerText:theme.footerText||""
  };
}
function publicFormDefinitionPayload(survey){
  if(!survey)return null;
  return {
    company:{name:data.settings.branding?.systemName||"CRM",...v257PublicTheme(survey)},
    form:{id:survey.id,name:survey.name,description:survey.description||"",formType:survey.formType||"survey",collectIdentity:survey.collectIdentity||"optional",questionCount:(survey.questions||[]).length,introMessage:survey.introMessage||"Completá este formulario.",designBlocks:survey.designBlocks||[]},
  };
}`,
    "payload público inicial",
  );

  out = replaceOne(
    out,
    /return \{ company:\{name:data\.settings\.branding\?\.systemName\|\|"CRM",primaryColor:survey\.theme\?\.primaryColor\|\|"#171717",accentColor:survey\.theme\?\.accentColor\|\|"#FF7A00"\}, form:\{name:survey\.name,description:survey\.description\|\|"",formType:survey\.formType\|\|"survey",closingMessage:survey\.closingMessage\|\|"Gracias por completar el formulario\."\}, session:/,
    `return { company:{name:data.settings.branding?.systemName||"CRM",...v257PublicTheme(survey)}, form:{name:survey.name,description:survey.description||"",formType:survey.formType||"survey",closingMessage:survey.closingMessage||"Gracias por completar el formulario.",designBlocks:survey.designBlocks||[]}, session:`,
    "payload público de sesión",
  );

  out = replaceOne(
    out,
    /const publicFormPagePath=path\.join\(publicDirectory,"form-public\.html"\);/,
    `const formAssetsDirectory=path.join(dataDirectory,"form-assets");
app.get("/api/public/form-assets/:fileName", async(request,response)=>{
  const fileName=path.basename(String(request.params.fileName||""));
  if(!/^[a-zA-Z0-9._-]+$/.test(fileName))return response.sendStatus(404);
  const full=path.join(formAssetsDirectory,fileName);try{await access(full)}catch{return response.sendStatus(404)}
  const ext=path.extname(fileName).toLowerCase();const mime={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"}[ext]||"application/octet-stream";
  response.setHeader("Content-Type",mime);response.setHeader("Cache-Control","public, max-age=86400");response.sendFile(full);
});
app.post("/api/forms/assets", express.raw({type:["image/png","image/jpeg","image/webp"],limit:"3mb"}), requireManagerOrAdmin, async(request,response,next)=>{try{
  if(!canManageSurveys(request.currentUser))return response.status(403).json({error:"No tenés permisos para gestionar formularios."});
  if(!Buffer.isBuffer(request.body)||!request.body.length)throw new Error("Seleccioná una imagen PNG, JPG o WEBP de hasta 3 MB.");
  const mime=String(request.headers["content-type"]||"").split(";")[0].toLowerCase();const ext={"image/png":".png","image/jpeg":".jpg","image/webp":".webp"}[mime];if(!ext)throw new Error("Formato no permitido. Usá PNG, JPG o WEBP.");
  await mkdir(formAssetsDirectory,{recursive:true});const fileName=\`form-\${Date.now()}-\${randomBytes(8).toString("hex")}\${ext}\`;await writeFile(path.join(formAssetsDirectory,fileName),request.body,{mode:0o600});
  response.status(201).json({url:\`/api/public/form-assets/\${fileName}\`});
}catch(error){next(error)}});

const publicFormPagePath=path.join(publicDirectory,"form-public.html");`,
    "assets aislados de formularios",
  );

  return out;
}
