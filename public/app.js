const $=id=>document.getElementById(id);
const S={form:null,responses:[],stop:false,delay:1000,submitted:0,failed:0,lastError:""};
function go(n){document.querySelectorAll(".screen").forEach(x=>x.classList.add("hidden"));$(n).classList.remove("hidden");document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.screen===n));$("screenTitle").textContent=n.replace(/^./,x=>x.toUpperCase()).replace(/([A-Z])/g," $1").trim()}
document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>go(b.dataset.screen)));
$("toGeneratorBtn").addEventListener("click",()=>go("generator"));
$("toSubmissionBtn").addEventListener("click",()=>go("submission"));
const msg=(id,t,c="muted")=>{$(id).textContent=t;$(id).className=`notice ${c}`};
const jsonFetch=async(url,options={})=>{const r=await fetch(url,options);let d=null;try{d=await r.json()}catch(_){throw new Error(`Server returned HTTP ${r.status}.`)}if(!r.ok||d?.ok===false)throw new Error(d?.error||`Request failed (HTTP ${r.status}).`);return d};
$("analyzeBtn").addEventListener("click",async()=>{
  const url=$("formUrl").value.trim(); if(!url){msg("dashMsg","Enter a Google Form URL.","error");return}
  msg("dashMsg","Loading and analyzing the form...");
  try{
    const d=await jsonFetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
    S.form=d; $("statPages").textContent=d.pages; $("statQuestions").textContent=d.questions.length;
    const pageLines=(d.pageMeta||[]).map(p=>`Page ${p.index+1}: ${esc(p.title)}`).join("<br>");
    $("analysisState").innerHTML=`<span class="success">✓ Form detected</span><br>✓ ${d.questions.length} questions identified<br>✓ ${d.pages} page(s) detected<br>✓ ${d.questions.filter(q=>q.type==="multiple_choice").length} choice fields<br>✓ ${d.questions.filter(q=>q.type==="checkbox").length} checkbox fields<br><br><span class="muted">${pageLines}</span>`;
    $("questionRows").innerHTML=d.questions.map((q,i)=>`<tr><td>${i+1}</td><td>${esc(q.title)}</td><td>${q.type}</td><td>${q.required?"Yes":"No"}</td></tr>`).join("");
    msg("dashMsg",`Analyzed ${d.questions.length} questions successfully.`,"success"); go("analyzer");
  }catch(e){msg("dashMsg",e.message,"error")}
});
$("generateBtn").addEventListener("click",async()=>{
  if(!S.form){go("analyzer");return}
  const n=Math.min(500,Math.max(1,Number($("count").value)||1)); msg("genMsg","Generating...");
  try{
    const d=await jsonFetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({questions:S.form.questions,count:n})});
    S.responses=Array.isArray(d.responses)?d.responses:[]; $("statResponses").textContent=S.responses.length;
    msg("genMsg",d.ai?"AI-generated synthetic responses created.":"Synthetic responses created. Add OPENAI_API_KEY for richer AI generation.","success"); renderPreview(); go("preview");
  }catch(e){msg("genMsg",e.message,"error")}
});
function renderPreview(){$("previewList").innerHTML=S.responses.map((r,i)=>`<div class="response"><strong>#${i+1} — ${esc(r.respondent)}</strong>${S.form.questions.map(q=>`<div class="answer"><span class="muted">${esc(q.title)}:</span> ${esc(Array.isArray(r.answers[q.id])?r.answers[q.id].join(", "):r.answers[q.id])}</div>`).join("")}</div>`).join("")}
$("runBtn").addEventListener("click",async()=>{
  if(!S.form||!S.responses.length){msg("submitState","Generate responses before starting a test.","error");return}
  S.stop=false;$("runBtn").disabled=true;$("stopBtn").disabled=false;S.submitted=0;S.failed=0;S.delay=Math.min(10000,Math.max(100,Number($("delay").value)||1000));$("bar").style.width="0%";go("submission");msg("submitState","Submitting TEST data to the configured form...");
  for(let i=0;i<S.responses.length;i++){
    if(S.stop)break;
    try{
      const d=await jsonFetch("/api/submit-one",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({form:S.form,response:S.responses[i]})});
      if(d.ok)S.submitted++;else{S.failed++;S.lastError=d.details||d.message||"Submission rejected.";}
    }catch(e){S.failed++;S.lastError=e.message;}
    const pct=Math.round(((i+1)/S.responses.length)*100);$("bar").style.width=pct+"%";$("progressText").textContent=`${i+1} / ${S.responses.length} processed • ${S.submitted} successful • ${S.failed} failed`;
    await new Promise(resolve=>setTimeout(resolve,S.delay));
  }
  $("rRequested").textContent=S.responses.length;$("rSuccess").textContent=S.submitted;$("rFailed").textContent=S.failed;$("resultError").textContent=S.lastError?`Last failure: ${S.lastError}`:"";
  $("runBtn").disabled=false;$("stopBtn").disabled=true;
  msg("submitState",S.stop?"Run stopped by user.":"Test run complete.",S.stop?"error":"success");$("statStatus").textContent=S.stop?"Stopped":"Complete";go("results");
});
$("stopBtn").addEventListener("click",()=>S.stop=true);
$("againBtn").addEventListener("click",()=>go("dashboard"));
$("csvBtn").addEventListener("click",()=>{
  if(!S.responses.length)return;const escv=v=>`"${String(Array.isArray(v)?v.join(" | "):v??"").replaceAll('"','""')}"`;
  const lines=[[escv("Respondent"),...S.form.questions.map(q=>escv(q.title))].join(",")];
  for(const r of S.responses)lines.push([escv(r.respondent),...S.form.questions.map(q=>escv(r.answers[q.id]))].join(","));
  const a=document.createElement("a");const url=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"}));a.href=url;a.download="synthetic-test-responses.csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
});
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
