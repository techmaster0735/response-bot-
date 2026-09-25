require("dotenv").config();
const express=require("express");
const cors=require("cors");
const cheerio=require("cheerio");
const path=require("path");

const app=express();
const PORT=process.env.PORT||3000;
app.use(cors({origin:false}));
app.use((req,res,next)=>{
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({limit:"4mb"}));
const publicDir=path.join(__dirname,"..","public");
app.use(express.static(publicDir));

const first=["Aarav","Aditya","Akash","Ananya","Arjun","Aisha","Diya","Ishaan","Kabir","Karan","Kavya","Meera","Neha","Nikhil","Pooja","Rahul","Riya","Rohan","Sahil","Sneha","Tanvi","Varun","Vikram","Yash","Priya","Manav","Nandini","Om","Sanya","Rohit"];
const last=["Sharma","Patil","Deshmukh","Joshi","Kulkarni","Nair","Menon","Iyer","Pillai","Shetty","Shah","Mehta","Gupta","Verma","Jadhav","Pawar","Naik","Mishra","Singh","Kadam"];
const pick=a=>a[Math.floor(Math.random()*a.length)];
const name=()=>`${pick(first)} ${pick(last)}`;

function validUrl(u){try{const x=new URL(u);return x.protocol==="https:"&&x.hostname==="docs.google.com"&&x.pathname.startsWith("/forms/")}catch{return false}}
function cleanUrl(u){
  const x=new URL(u);
  x.hash="";
  return x.href;
}

async function fetchWithTimeout(url,options={},timeoutMs=7500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}

async function getForm(url){
  if(!validUrl(url)) throw new Error("Use a Google Forms responder URL.");
  const u=cleanUrl(url);
  let r;
  try{
    r=await fetchWithTimeout(u,{
      redirect:"follow",
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":"en-US,en;q=0.9",
        "Cache-Control":"no-cache"
      }
    });
  }catch(e){
    if(e.name==="AbortError") throw new Error("Google Forms took too long to respond. Check that the responder URL is publicly accessible and try again.");
    throw new Error(`Could not reach Google Forms: ${e.message}`);
  }
  const text=await r.text();
  if(!r.ok){
    const hint=responseBodyHint(text);
    if(r.status===401||r.status===403) throw new Error(`Google Forms requires access or rejected the server request (HTTP ${r.status}). Make sure the form accepts responses without requiring sign-in. ${hint}`.trim());
    if(r.status>=500) throw new Error(`Google Forms returned a temporary server error (HTTP ${r.status}). Please retry in a moment. ${hint}`.trim());
    throw new Error(`Google Forms returned HTTP ${r.status}. ${hint}`.trim());
  }
  return {html:text,finalUrl:r.url};
}

function extractPublicLoadData(html){
  const marker="var FB_PUBLIC_LOAD_DATA_";
  const start=html.indexOf(marker);
  if(start<0)return null;
  const eq=html.indexOf("=",start);
  if(eq<0)return null;
  const first=html.indexOf("[",eq);
  if(first<0)return null;
  let depth=0,inString=false,escape=false;
  for(let i=first;i<html.length;i++){
    const ch=html[i];
    if(inString){
      if(escape)escape=false;
      else if(ch==="\\")escape=true;
      else if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue}
    if(ch==='[')depth++;
    else if(ch===']'){
      depth--;
      if(depth===0){
        const raw=html.slice(first,i+1);
        try{return JSON.parse(raw)}catch{return null}
      }
    }
  }
  return null;
}

function typeFromId(id){
  return ({0:"short_answer",1:"paragraph",2:"multiple_choice",3:"dropdown",4:"checkbox",5:"linear_scale",9:"date",10:"time"})[id]||"short_answer";
}

function parseEmbeddedQuestions(data){
  const items=Array.isArray(data?.[1]?.[1])?data[1][1]:[];
  if(!items.length)return null;

  const sections=[];
  let current=[];
  for(const item of items){
    if(!Array.isArray(item))continue;
    const type=item[3];
    if(type===8){
      if(current.length)sections.push(current);
      current=[item];
    }else{
      current.push(item);
    }
  }
  if(current.length)sections.push(current);
  if(!sections.length)sections.push(items);

  const pageIdToIndex=new Map();
  sections.forEach((section,index)=>{
    const sectionItem=section.find(x=>Array.isArray(x)&&x[3]===8);
    if(sectionItem)pageIdToIndex.set(sectionItem[0],index);
  });

  const questions=[];
  const pages=[];
  sections.forEach((section,pageIndex)=>{
    const sectionItem=section.find(x=>Array.isArray(x)&&x[3]===8);
    const sectionTitle=sectionItem?.[1]||`Page ${pageIndex+1}`;
    const pageQuestions=[];
    for(const item of section){
      if(!Array.isArray(item)||item[3]===8)continue;
      const entryType=item[3];
      const subs=Array.isArray(item[4])?item[4]:[];
      for(const sub of subs){
        if(!Array.isArray(sub)||sub[0]===undefined||sub[0]===null)continue;
        const entry=`entry.${sub[0]}`;
        const options=[];
        if(Array.isArray(sub[1])){
          for(const opt of sub[1]){
            if(Array.isArray(opt)&&opt.length){
              const value=opt[0]===null||opt[0]===undefined?"":String(opt[0]);
              if(value)options.push({value,text:value,nextPageId:opt[2]??null});
            }
          }
        }
        const q={
          id:`q${questions.length+1}`,
          entry,
          title:String(item[1]||(Array.isArray(sub[3])?sub[3].join(" - "):"")||entry),
          type:typeFromId(entryType),
          googleType:entryType,
          options,
          required:sub[2]===1,
          multiple:entryType===4,
          page:pageIndex,
          section:sectionTitle
        };
        questions.push(q); pageQuestions.push(q);
      }
    }
    pages.push({index:pageIndex,id:sectionItem?.[0]??pageIndex,title:sectionTitle,questions:pageQuestions,nextPageIndex:null});
  });

  // Resolve each section's normal next page and conditional jumps.
  pages.forEach((page,index)=>{
    const section=sections[index]?.find(x=>Array.isArray(x)&&x[3]===8);
    const target=section?.[5];
    if(target===section?.[0])page.nextPageIndex=-1;
    else if(target!==null&&target!==undefined&&pageIdToIndex.has(target))page.nextPageIndex=pageIdToIndex.get(target);
    else if(index+1<pages.length)page.nextPageIndex=index+1;
    else page.nextPageIndex=-1;
  });

  // Attach conditional routing metadata to choice options.
  for(const q of questions){
    for(const option of q.options){
      if(option.nextPageId!==null&&option.nextPageId!==undefined){
        option.nextPageIndex=option.nextPageId<=0?-1:(pageIdToIndex.get(option.nextPageId)??-1);
      }
    }
  }

  return {questions,pages,sections:pages.length};
}

function parseForm(html,finalUrl){
  const $=cheerio.load(html);
  const form=$("form").first();
  if(!form.length) throw new Error("Could not find a responder form. Make sure the form is published and accepts responses.");
  const rawAction=form.attr("action")||`${finalUrl.replace(/\/viewform.*$/,"")}/formResponse`;
  const action=new URL(rawAction,finalUrl).href;
  const hidden={};
  form.find('input[type="hidden"]').each((_,e)=>{const n=$(e).attr("name"),v=$(e).attr("value");if(n)hidden[n]=v??""});

  const embedded=extractPublicLoadData(html);
  const meta=parseEmbeddedQuestions(embedded);
  if(meta?.questions?.length){
    return {
      url:finalUrl,
      action,
      hidden,
      questions:meta.questions,
      pages:meta.pages.length,
      pageMeta:meta.pages.map(p=>({index:p.index,id:p.id,title:p.title,nextPageIndex:p.nextPageIndex})),
      formTitle:String(embedded?.[1]?.[8]||$("h1").first().text().trim()||$("title").text().trim()),
      parser:"FB_PUBLIC_LOAD_DATA_"
    };
  }

  // Fallback for older/atypical forms where the embedded metadata is unavailable.
  const map=new Map();
  form.find('input[name^="entry."], textarea[name^="entry."], select[name^="entry."]').each((_,e)=>{
    const n=$(e).attr("name"); if(!n)return;
    if(!map.has(n))map.set(n,{name:n,el:e});
  });
  const questions=[];
  for(const [entry,{el}] of map){
    const $el=$(el);
    let container=$el.closest('[role="listitem"]');
    if(!container.length)container=$el.closest(".freebirdFormviewerViewItemsItemItem");
    if(!container.length)container=$el.parent();
    let title=container.find('[role="heading"],.freebirdFormviewerComponentsQuestionBaseTitle,.ss-q-title').first().text().trim();
    if(!title)title=$el.attr("aria-label")||$el.attr("placeholder")||entry;
    const type=$el.is("select")?"dropdown":$el.is("textarea")?"paragraph":$el.attr("type")==="checkbox"?"checkbox":$el.attr("type")==="radio"?"multiple_choice":"short_answer";
    const options=[];
    if($el.is("select"))$el.find("option").each((_,o)=>{const v=$(o).attr("value");const t=$(o).text().trim();if(v)options.push({value:v,text:t})});
    container.find(`input[name="${entry}"]`).each((_,x)=>{const v=$(x).attr("value");if(v&&!options.some(o=>o.value===v))options.push({value:v,text:$(x).closest("label").text().trim()||v})});
    questions.push({id:`q${questions.length+1}`,entry,title,type,options,required:container.find('[required],.freebirdFormviewerComponentsQuestionBaseRequiredAsterisk').length>0,multiple:type==="checkbox",page:0,section:"Page 1"});
  }
  return {url:finalUrl,action,hidden,questions,pages:1,pageMeta:[{index:0,id:0,title:"Page 1",nextPageIndex:-1}],formTitle:$("h1").first().text().trim()||$("title").text().trim(),parser:"DOM fallback"};
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"ai-form-test-bot",mode:"synthetic-test"}));

app.post("/api/analyze",async(req,res)=>{
  try{
    const {url}=req.body||{};
    const raw=await getForm(url);
    const parsed=parseForm(raw.html,raw.finalUrl);
    res.json({ok:true,...parsed});
  }catch(e){res.status(400).json({ok:false,error:e.message})}
});

function randomBetween(min,max){
  return min + Math.random()*(max-min);
}

function shuffled(arr){
  return [...arr].sort(()=>Math.random()-0.5);
}

// Build a different, intentionally uneven probability distribution for each
// categorical question. This avoids the old round-robin 25/25/25/25 pattern.
function buildNaturalDistributions(questions){
  const distributions={};
  for(const q of questions){
    if(!Array.isArray(q.options)||q.options.length<2) continue;

    const count=q.options.length;
    // Random weights are drawn from a broad range so each option can receive
    // a noticeably different share, while no option is permanently favored.
    let weights=q.options.map(()=>randomBetween(0.25,2.75));
    const total=weights.reduce((a,b)=>a+b,0);
    weights=weights.map(w=>w/total);

    // Shuffle the weights so the first option is not systematically favored.
    weights=shuffled(weights);
    distributions[q.id]=q.options.map((option,index)=>({
      value:option.value,
      weight:weights[index]
    }));
  }
  return distributions;
}

function weightedChoice(q,distribution){
  const options=Array.isArray(q.options)?q.options:[];
  if(!options.length) return "";
  if(!distribution?.length) return options[Math.floor(Math.random()*options.length)].value;

  let r=Math.random();
  for(const item of distribution){
    r-=item.weight;
    if(r<=0) return item.value;
  }
  return distribution[distribution.length-1].value;
}

function heuristic(q,i,distributions={}){
  const t=q.title.toLowerCase();
  if(q.options?.length){
    if(q.multiple){
      // Keep checkbox responses varied without forcing every respondent to
      // select the same number of boxes.
      const picked=[];
      const shuffledOptions=shuffled(q.options);
      for(const option of shuffledOptions){
        if(Math.random()<0.35) picked.push(option.value);
      }
      return picked.length ? picked : [weightedChoice(q,distributions[q.id])];
    }
    return weightedChoice(q,distributions[q.id]);
  }
  if(q.type==="email")return `synthetic.${Math.floor(Math.random()*1000000)}@example.test`;
  if(q.type==="number")return String(18+Math.floor(Math.random()*43));
  if(/name|full name/.test(t))return name();
  if(/city|location|place/.test(t))return pick(["Mumbai","Pune","Nashik","Thane","Nagpur","Surat","Ahmedabad","Bengaluru"]);
  if(/age/.test(t))return String(18+Math.floor(Math.random()*35));
  if(/phone|mobile/.test(t))return `90000${String(Math.floor(10000+Math.random()*90000))}`;
  const a=[
    "This is a synthetic test response.",
    "The form was clear and easy to complete.",
    "This answer is generated for controlled testing.",
    "Everything worked as expected.",
    "This is a varied sample response.",
    "The question was straightforward.",
    "This response is part of a controlled test."
  ];
  return a[Math.floor(Math.random()*a.length)];
}

async function aiGenerate(questions,count){
  if(!process.env.OPENAI_API_KEY)return null;
  const prompt=`Generate ${count} clearly synthetic test respondents for a Google Form. Indian names only. Keep answers logically consistent across questions. Never claim these are real people. Return ONLY JSON: {"responses":[{"respondent":"Indian Name","answers":{"questionId":"answer"}}]}. Questions: ${JSON.stringify(questions)}`;
  const r=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})
  });
  if(!r.ok) throw new Error(`AI provider returned HTTP ${r.status}.`);
  const d=await r.json();
  const txt=d.output_text||d.output?.map(x=>x.content?.map(y=>y.text||"").join("")).join("")||"";
  const parsed=JSON.parse(txt.replace(/^```json|```$/g,"").trim());
  return parsed.responses;
}

app.post("/api/generate",async(req,res)=>{
  try{
    const {questions=[],count=10}=req.body||{};
    if(!Array.isArray(questions)||questions.length>200) throw new Error("Invalid question list.");
    const n=Math.min(500,Math.max(1,Number(count)||1));
    const distributions=buildNaturalDistributions(questions);
    let responses=null;
    if(process.env.OPENAI_API_KEY){
      try{responses=await aiGenerate(questions,n)}catch(_){}
    }

    if(!Array.isArray(responses)||responses.length!==n){
      responses=Array.from({length:n},(_,i)=>({
        respondent:name(),
        answers:Object.fromEntries(questions.map(q=>[q.id,heuristic(q,i,distributions)]))
      }));
    }else{
      // Keep AI-generated free-text answers, but normalize categorical fields
      // through the same natural random distributions so they cannot collapse
      // into an artificial equal split.
      responses=responses.map((response,i)=>({
        respondent:response.respondent||name(),
        answers:Object.fromEntries(questions.map(q=>{
          if(Array.isArray(q.options)&&q.options.length){
            return [q.id, q.multiple
              ? heuristic(q,i,distributions)
              : weightedChoice(q,distributions[q.id])];
          }
          return [q.id,response.answers?.[q.id] ?? heuristic(q,i,distributions)];
        }))
      }));
    }

    const distributionSummary=Object.fromEntries(
      questions
        .filter(q=>Array.isArray(q.options)&&q.options.length>1)
        .map(q=>[q.id,(distributions[q.id]||[]).map(x=>({
          value:x.value,
          percent:Math.round(x.weight*100)
        }))])
    );

    res.json({
      ok:true,
      responses,
      ai:!!process.env.OPENAI_API_KEY,
      distributionMode:"natural-random",
      distributionSummary
    });
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});

function getVisitedPages(form,response){
  const pages=Array.isArray(form.pageMeta)?form.pageMeta:[];
  if(!pages.length)return [0];
  const visited=[];
  const seen=new Set();
  let current=0;
  while(current>=0 && current<pages.length && !seen.has(current)){
    seen.add(current);
    visited.push(current);
    const page=pages[current];
    let next=page.nextPageIndex;
    const pageQuestions=(form.questions||[]).filter(q=>q.page===current);
    for(const q of pageQuestions){
      const answer=response.answers?.[q.id];
      const values=Array.isArray(answer)?answer:[answer];
      const routed=q.options?.find(o=>values.includes(o.value)&&Number.isInteger(o.nextPageIndex));
      if(routed){next=routed.nextPageIndex;break;}
    }
    if(next===undefined||next===null)next=current+1<pages.length?current+1:-1;
    current=next;
  }
  return visited;
}

function formDataFor(form,res){
  const p=new URLSearchParams();
  for(const [k,v] of Object.entries(form.hidden||{})) if(k && k!=="pageHistory") p.append(k,String(v??""));

  const visited=getVisitedPages(form,res);
  // Google Forms uses pageHistory to track the sections a responder traversed.
  if(visited.length>1 || (form.pageMeta||[]).length>1) p.set("pageHistory",visited.join(","));
  if(!p.has("fvv"))p.set("fvv","1");

  const allowed=new Set(visited);
  for(const q of form.questions||[]){
    if(!allowed.has(q.page))continue;
    let v=res.answers?.[q.id];
    if(v===undefined||v===null)v="";
    if(Array.isArray(v)) for(const x of v) p.append(q.entry,String(x));
    else p.append(q.entry,String(v));
  }
  return p;
}

async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

function responseBodyHint(text){
  const $=cheerio.load(text||"");
  const body=$("body").text().replace(/\s+/g," ").trim();
  return body.slice(0,700);
}

async function submitGoogleForm(form,response){
  const target=new URL(form.action);
  if(target.protocol!=="https:" || target.hostname!=="docs.google.com" || !/^\/forms\/d\/e\/[^/]+\/formResponse$/.test(target.pathname)){
    throw new Error("Invalid Google Forms submission endpoint. Re-analyze the published responder URL.");
  }

  const body=formDataFor(form,response);
  const headers={
    "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8",
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36",
    "Referer":form.url||target.href,
    "Origin":"https://docs.google.com",
    "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":"en-US,en;q=0.9",
    "Cache-Control":"no-cache"
  };

  try{
    // One bounded request per response avoids Vercel timeouts and prevents accidental duplicate submissions.
    const r=await fetchWithTimeout(target.href,{method:"POST",redirect:"follow",headers,body},7500);
    const text=await r.text();
    const lower=text.toLowerCase();
    const rejected=[
      "this form is no longer accepting responses",
      "form not found",
      "your response was not submitted",
      "something went wrong",
      "there was a problem",
      "sign in to continue"
    ].some(x=>lower.includes(x));
    const recorded=[
      "your response has been recorded",
      "response recorded",
      "thanks for submitting"
    ].some(x=>lower.includes(x));

    if(r.ok && !rejected && recorded){
      return {ok:true,status:r.status,finalUrl:r.url,message:"Submission accepted by Google Forms."};
    }

    const hint=responseBodyHint(text);
    if(rejected){
      return {ok:false,status:r.status,message:"Google Forms rejected the submission.",details:hint||"Google returned a rejection page."};
    }
    if(r.status===429){
      return {ok:false,status:r.status,message:"Google Forms rate-limited the test request.",details:"Slow down the submission delay and try again later."};
    }
    if(r.status>=500){
      return {ok:false,status:r.status,message:`Google Forms returned HTTP ${r.status}.`,details:hint||"Google returned a temporary server/gateway error. No automatic retry was made to avoid duplicate submissions."};
    }
    return {ok:false,status:r.status,message:"Google Forms did not confirm the submission.",details:hint||`Google returned HTTP ${r.status}, but no response-recorded confirmation was found.`};
  }catch(e){
    if(e.name==="AbortError"){
      return {ok:false,status:504,message:"Google Forms request timed out.",details:"The request exceeded 7.5 seconds. Increase the delay between submissions or try again later."};
    }
    return {ok:false,status:502,message:"Could not reach Google Forms.",details:e.message};
  }
}
