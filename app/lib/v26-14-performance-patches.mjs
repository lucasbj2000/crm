import { readFileSync } from "node:fs";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.14 rendimiento: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.14 rendimiento: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function optimizeUnifiedInbox(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    '  let socialGridObserver = null;',
    '  let socialGridObserver = null;\n  let inboxLoading = false;\n  let inboxSignature = "";\n  let lastInboxRenderAt = 0;\n  let oauthLoading = false;\n  let lastOAuthLoadAt = 0;',
    "estado de sincronización de bandeja",
  );

  patched = replaceOnce(
    patched,
    '  async function loadInbox({quiet=false}={}) {\n    if(!appVisible())return;createUnifiedInbox();suppressLegacyInbox();try{const data=await request("/api/omnichannel/inbox");inbox=Array.isArray(data.conversations)?data.conversations:[];if(activeId&&!inbox.some((item)=>item.id===activeId))activeId="";renderInbox();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar la bandeja unificada.","warning");}\n  }',
    `  function inboxVisualSignature(items) {
    return (items || []).map((item) => {
      const messages = Array.isArray(item.messages) ? item.messages : [];
      const messagePart = item.id === activeId
        ? messages.map((message) => [message.id, message.text, message.createdAt, message.editedAt, message.status, message.attachment?.id, message.attachment?.url].join("|")).join("~")
        : String(messages.length);
      return [item.id, item.name, item.handle, item.ownerName, item.lastMessage, item.lastMessageAt, item.lastDirection, messagePart].join("¦");
    }).join("§");
  }

  async function loadInbox({quiet=false,force=false}={}) {
    if(!appVisible() || inboxLoading)return;
    createUnifiedInbox();
    suppressLegacyInbox();
    inboxLoading=true;
    try{
      const data=await request("/api/omnichannel/inbox");
      const nextInbox=Array.isArray(data.conversations)?data.conversations:[];
      inbox=nextInbox;
      if(activeId&&!inbox.some((item)=>item.id===activeId))activeId="";
      const signature=inboxVisualSignature(inbox);
      const minuteRefresh=Date.now()-lastInboxRenderAt>=60000;
      if(force||signature!==inboxSignature||minuteRefresh){
        inboxSignature=signature;
        lastInboxRenderAt=Date.now();
        renderInbox();
      }
    }catch(error){if(!quiet)notify(error.message||"No se pudo cargar la bandeja unificada.","warning");}
    finally{inboxLoading=false;}
  }`,
    "carga incremental de bandeja",
  );

  patched = replaceOnce(
    patched,
    '  async function loadOAuthConfig({quiet=false}={}) { if(!appVisible())return;try{oauthConfig=await request("/api/social/oauth/config");enhanceSocialCards();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar OAuth.","warning");} }',
    '  async function loadOAuthConfig({quiet=false,force=false}={}) { if(!appVisible()||oauthLoading)return;if(!quiet)force=true;if(!force&&lastOAuthLoadAt&&Date.now()-lastOAuthLoadAt<60000)return;oauthLoading=true;try{oauthConfig=await request("/api/social/oauth/config");lastOAuthLoadAt=Date.now();enhanceSocialCards();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar OAuth.","warning");}finally{oauthLoading=false;} }',
    "carga espaciada de OAuth",
  );

  patched = replaceOnce(
    patched,
    '    clearInterval(poll);poll=setInterval(()=>{if(appVisible()&&channelViewActive()){suppressLegacyInbox();void loadInbox({quiet:true});void loadOAuthConfig({quiet:true});}},5000);',
    '    clearInterval(poll);poll=setInterval(()=>{if(appVisible()&&channelViewActive()){suppressLegacyInbox();void loadInbox({quiet:true});if(!lastOAuthLoadAt||Date.now()-lastOAuthLoadAt>=60000)void loadOAuthConfig({quiet:true});}},4000);',
    "polling de bandeja",
  );

  return patched;
}

const optimizedV2511 = optimizeUnifiedInbox(readFileSync(new URL("../public/v25-11.js", import.meta.url), "utf8"));

const assetRoute = `
app.get("/v25-11.js", (request, response) => {
  response.type("application/javascript");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(optimizedV2511)});
});
`;

export function applyV2614PerformancePatches(source) {
  return replaceOnce(
    source,
    'app.use(express.static(publicDirectory, { extensions: ["html"] }));',
    assetRoute + '\napp.use(express.static(publicDirectory, { extensions: ["html"] }));',
    "middleware estático",
  );
}

export { optimizeUnifiedInbox };
