require("dotenv").config();
const express=require("express");
const cors=require("cors");
const cheerio=require("cheerio");
const path=require("path");
let chromium=null;
try{({chromium}=require("playwright"));}catch(_){/* Optional browser fallback; raw HTTP mode still works without Playwright. */}

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

const first=[
  {name:"Aarav",gender:"male"},{name:"Aditya",gender:"male"},{name:"Akash",gender:"male"},
  {name:"Arjun",gender:"male"},{name:"Ishaan",gender:"male"},{name:"Kabir",gender:"male"},
  {name:"Karan",gender:"male"},{name:"Nikhil",gender:"male"},{name:"Rahul",gender:"male"},
  {name:"Rohan",gender:"male"},{name:"Sahil",gender:"male"},{name:"Varun",gender:"male"},
  {name:"Vikram",gender:"male"},{name:"Yash",gender:"male"},{name:"Manav",gender:"male"},
  {name:"Om",gender:"male"},{name:"Rohit",gender:"male"},{name:"Ananya",gender:"female"},
  {name:"Aisha",gender:"female"},{name:"Diya",gender:"female"},{name:"Kavya",gender:"female"},
  {name:"Meera",gender:"female"},{name:"Neha",gender:"female"},{name:"Pooja",gender:"female"},
  {name:"Riya",gender:"female"},{name:"Sneha",gender:"female"},{name:"Tanvi",gender:"female"},
  {name:"Priya",gender:"female"},{name:"Nandini",gender:"female"},{name:"Sanya",gender:"female"},
  {name:"Vedika",gender:"female"},{name:"Isha",gender:"female"},{name:"Aditi",gender:"female"},
  {name:"Shreya",gender:"female"},{name:"Simran",gender:"female"},{name:"Kriti",gender:"female"},
  {name:"Avni",gender:"female"},{name:"Radhika",gender:"female"},{name:"Ishita",gender:"female"}
];
const last=["Sharma","Patil","Deshmukh","Joshi","Kulkarni","Nair","Menon","Iyer","Pillai","Shetty","Shah","Mehta","Gupta","Verma","Jadhav","Pawar","Naik","Mishra","Singh","Kadam"];
const pick=a=>a[Math.floor(Math.random()*a.length)];
const nameForGender=g=>{
  const pool=first.filter(x=>x.gender===g);
  const f=pool.length?pick(pool):pick(first);
  return `${f.name} ${pick(last)}`;
};
const randomPersona=()=>{
  const f=pick(first);
  const className=Math.random()<0.55?"11th":"12th";
  const age=className==="11th" ? 15+Math.floor(Math.random()*2) : 17+Math.floor(Math.random()*2);
  return {firstName:f.name,gender:f.gender,fullName:`${f.name} ${pick(last)}`,className,age};
};
const name=()=>randomPersona().fullName;

function normalizeGender(value){
  const v=String(value??"").trim().toLowerCase();
  if(/^(m|male|man|boy|gentleman|masculine)$/.test(v))return "male";
  if(/^(f|female|woman|girl|lady|feminine)$/.test(v))return "female";
  if(/non[- ]?binary|other|prefer not|rather not/.test(v))return "other";
  return null;
}
function isNameQuestion(q){
  return /(^|\b)(full\s*name|your\s*name|name)(\b|$)/i.test(q.title||"") && !/user(name|id)|brand|company|business|father|mother|husband|wife/i.test(q.title||"");
}
function isGenderQuestion(q){
  return /\b(gender|sex)\b/i.test(q.title||"");
}
function isAgeQuestion(q){
  return /\bage\b|how\s*old/i.test(q.title||"");
}
function isClassQuestion(q){
  return /\bclass\b|standard|grade|year/i.test(q.title||"");
}
function classOptionFor(q,className){
  const target=String(className||"").toLowerCase().replace(/\s+/g,"");
  return (q.options||[]).find(o=>{
    const v=String(o.text||o.value||"").toLowerCase().replace(/\s+/g,"");
    return v===target || (target==="11th" && /^(11|xi)(st|th)?$/.test(v)) || (target==="12th" && /^(12|xii)(th)?$/.test(v));
  })?.value || null;
}
function parseAgeOption(text){
  const s=String(text||"").trim().toLowerCase().replace(/\u2013|\u2014/g,"-");
  let m=s.match(/(?:below|under|less than)\s*(\d+)/i);
  if(m)return {kind:"below",max:Number(m[1])-1};
  m=s.match(/(?:above|over|more than)\s*(\d+)/i);
  if(m)return {kind:"above",min:Number(m[1])+1};
  m=s.match(/(\d+)\s*(?:-|to)\s*(\d+)/i);
  if(m)return {kind:"range",min:Number(m[1]),max:Number(m[2])};
  m=s.match(/^\s*(\d+)\s*$/);
  if(m)return {kind:"exact",min:Number(m[1]),max:Number(m[1])};
  return null;
}
function ageOptionFor(q,className){
  const opts=q.options||[];
  if(!opts.length)return null;

  // Prefer the class-linked age only when the form actually provides that bracket.
  const classAge=className==="11th" ? 16 : className==="12th" ? 17 : null;
  if(classAge!==null){
    const linked=opts.find(o=>{
      const p=parseAgeOption(o.text||o.value);
      return p && ((p.min??-Infinity)<=classAge) && ((p.max??Infinity)>=classAge);
    });
    if(linked)return linked.value;
  }

  // Generic forms can have brackets such as "Below 20", "21-30", etc.
  // Pick a valid option instead of returning a hard-coded 15-18 value.
  const parsed=opts.map(o=>({o,p:parseAgeOption(o.text||o.value)})).filter(x=>x.p);
  if(parsed.length){
    return parsed[Math.floor(Math.random()*parsed.length)].o.value;
  }
  return opts[Math.floor(Math.random()*opts.length)].value;
}
function genderOptionFor(q,gender){
  const opts=q.options||[];
  return opts.find(o=>{
    const g=normalizeGender(o.text||o.value);
    return g===gender;
  })?.value || null;
}
function detectGenderFromName(fullName){
  const firstPart=String(fullName||"").trim().split(/\s+/)[0].toLowerCase();
  const hit=first.find(x=>x.name.toLowerCase()===firstPart);
  return hit?.gender||null;
}
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

function heuristic(q,i,distributions={},persona=null){
  const t=(q.title||"").toLowerCase();
  if(isNameQuestion(q)) return persona?.fullName||name();
  if(isClassQuestion(q)){
    const mapped=classOptionFor(q,persona?.className);
    if(mapped!==null)return mapped;
    return persona?.className||"11th";
  }
  if(isGenderQuestion(q)){
    if(q.options?.length){
      const mapped=genderOptionFor(q,persona?.gender);
      if(mapped!==null)return mapped;
    }
    return persona?.gender==="female"?"Female":persona?.gender==="male"?"Male":"Other";
  }
  if(isAgeQuestion(q)){
    const mapped=ageOptionFor(q,persona?.className);
    if(mapped!==null)return mapped;
    return String(persona?.age??16);
  }
  if(q.options?.length){
    if(q.multiple){
      const picked=[];
      for(const option of shuffled(q.options)){
        if(Math.random()<0.35) picked.push(option.value);
      }
      return picked.length ? picked : [weightedChoice(q,distributions[q.id])];
    }
    return weightedChoice(q,distributions[q.id]);
  }
  if(q.type==="email")return `synthetic.${Math.floor(Math.random()*1000000)}@example.test`;
  if(q.type==="number")return String(persona?.age??(18+Math.floor(Math.random()*43)));
  if(/city|location|place/.test(t))return pick(["Mumbai","Pune","Nashik","Thane","Nagpur","Surat","Ahmedabad","Bengaluru"]);
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

function generateSyntheticResponse(questions,i,distributions){
  const persona=randomPersona();
  const answers={};
  for(const q of questions) answers[q.id]=heuristic(q,i,distributions,persona);
  return {respondent:persona.fullName,persona,answers};
}

function enforcePersonaConsistency(response,questions){
  const answers={...(response?.answers||{})};
  let fullName=response?.respondent||"";
  const nameQ=questions.find(isNameQuestion);
  const genderQ=questions.find(isGenderQuestion);
  const ageQ=questions.find(isAgeQuestion);
  const classQ=questions.find(isClassQuestion);

  if(nameQ && answers[nameQ.id]){
    fullName=String(answers[nameQ.id]).trim();
  }
  if(!fullName) fullName=response?.respondent||nameForGender("female");

  let gender=response?.persona?.gender||detectGenderFromName(fullName);
  if(!gender && genderQ) gender=normalizeGender(answers[genderQ.id]);
  if(!gender) gender=Math.random()<0.5?"female":"male";

  let className=response?.persona?.className;
  if(!className && classQ) {
    const raw=String(answers[classQ.id]||"").toLowerCase();
    className=/12/.test(raw)?"12th":"11th";
  }
  if(!className) className=Math.random()<0.55?"11th":"12th";

  if(nameQ) answers[nameQ.id]=fullName;
  if(classQ){
    const mapped=classOptionFor(classQ,className);
    if(mapped!==null) answers[classQ.id]=mapped;
  }
  if(genderQ){
    const mapped=genderOptionFor(genderQ,gender);
    if(mapped!==null) answers[genderQ.id]=mapped;
  }
  const age = className==="11th" ? 15+Math.floor(Math.random()*2) : 17+Math.floor(Math.random()*2);
  if(ageQ){
    const mapped=ageOptionFor(ageQ,className);
    answers[ageQ.id]=mapped!==null ? mapped : String(age);
  }

  return {
    ...response,
    respondent:fullName,
    persona:{...(response?.persona||{}),gender,className,age,fullName,firstName:fullName.split(/\s+/)[0]},
    answers
  };
}

function validateConsistency(response,questions){
  const issues=[];
  const nameQ=questions.find(isNameQuestion);
  const genderQ=questions.find(isGenderQuestion);
  if(nameQ&&genderQ){
    const inferred=detectGenderFromName(response.answers?.[nameQ.id]);
    const selected=normalizeGender(response.answers?.[genderQ.id]);
    if(inferred && selected && inferred!==selected){
      issues.push(`Name "${response.answers?.[nameQ.id]}" is normally ${inferred}, but gender is "${response.answers?.[genderQ.id]}".`);
    }
  }
  return issues;
}

async function aiGenerate(questions,count){
  if(!process.env.OPENAI_API_KEY)return null;
  const prompt=`Generate ${count} clearly synthetic test respondents for a Google Form. Indian names only. Think through each respondent as one consistent persona before answering. IMPORTANT: name and gender must agree (for example Vedika is female, not male); age must be numeric and consistent wherever asked. If a gender option exists, use the option that matches the name. Never claim these are real people. Return ONLY JSON: {"responses":[{"respondent":"Indian Name","answers":{"questionId":"answer"}}]}. Questions: ${JSON.stringify(questions)}`;
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
      responses=Array.from({length:n},(_,i)=>generateSyntheticResponse(questions,i,distributions));
    }else{
      responses=responses.map((response,i)=>{
        const base={
          respondent:response.respondent||name(),
          answers:{...response.answers}
        };
        // Keep AI free text but rebuild identity-sensitive fields from one persona.
        const nameQ=questions.find(isNameQuestion);
        const suppliedName=nameQ?base.answers[nameQ.id]:base.respondent;
        const inferred=detectGenderFromName(suppliedName);
        const persona={
          fullName:suppliedName||base.respondent||name(),
          gender:inferred||normalizeGender(
            questions.find(isGenderQuestion)
              ? base.answers[questions.find(isGenderQuestion).id]
              : null
          )||"female",
          age:Number(base.answers?.[questions.find(isAgeQuestion)?.id])||18+Math.floor(Math.random()*43)
        };
        return enforcePersonaConsistency({...base,persona},questions);
      });
    }

    responses=responses.map((r,i)=>enforcePersonaConsistency({
      ...r,
      answers:Object.fromEntries(questions.map(q=>{
        if(Array.isArray(q.options)&&q.options.length){
          // Identity questions are handled by the persona layer, not random distribution.
          if(isGenderQuestion(q)||isNameQuestion(q)||isAgeQuestion(q)) return [q.id,r.answers?.[q.id]??heuristic(q,i,distributions,r.persona)];
          return [q.id,q.multiple
            ? heuristic(q,i,distributions,r.persona)
            : weightedChoice(q,distributions[q.id])];
        }
        return [q.id,r.answers?.[q.id] ?? heuristic(q,i,distributions,r.persona)];
      }))
    },questions));

    const validation=responses.flatMap((r,index)=>
      validateConsistency(r,questions).map(message=>({index,message}))
    );

    const distributionSummary=Object.fromEntries(
      questions
        .filter(q=>Array.isArray(q.options)&&q.options.length>1&&!isGenderQuestion(q))
        .map(q=>[q.id,(distributions[q.id]||[]).map(x=>({
          value:x.value,
          percent:Math.round(x.weight*100)
        }))])
    );

    res.json({
      ok:true,
      responses,
      ai:!!process.env.OPENAI_API_KEY,
      distributionMode:"natural-random + persona-consistency",
      distributionSummary,
      consistency:{valid:validation.length===0,issues:validation}
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

async function submitGoogleFormInBrowser(form,response){
  if(!chromium){
    return {
      ok:false,
      status:501,
      message:"Browser fallback is not installed.",
      details:"This Google Form requires a real browser because Google returned a JavaScript-required responder page. Run npm install, then npx playwright install chromium, and retry."
    };
  }

  let browser=null;
  try{
    browser=await chromium.launch({headless:false});
    const context=await browser.newContext({
      viewport:{width:1280,height:900},
      userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36"
    });
    const page=await context.newPage();
    await page.goto(form.url,{waitUntil:"domcontentloaded",timeout:30000});

    // If Google asks for authentication, do not bypass it. Keep the visible
    // browser open long enough for the owner to sign in manually.
    if(/accounts\.google\.com/i.test(page.url())){
      return {
        ok:false,
        status:401,
        message:"Google sign-in is required.",
        details:"The browser fallback opened Google sign-in. Sign in manually in the visible browser, then run the test again. No credentials or CAPTCHA are automated."
      };
    }

    const questions=form.questions||[];
    const pages=Array.isArray(form.pageMeta)&&form.pageMeta.length?form.pageMeta:[{index:0,nextPageIndex:-1}];
    const visited=new Set();
    let current=0;
    let guard=0;

    const textOf=async loc=>{try{return (await loc.innerText()).trim()}catch{return ""}};
    const clickButton=async patterns=>{
      for(const pattern of patterns){
        const loc=page.getByRole("button",{name:pattern}).first();
        if(await loc.count()){
          await loc.click({timeout:5000});
          return true;
        }
      }
      const fallback=page.locator('[role="button"]').filter({hasText:/^(Next|Submit|Send|Done|Continue)$/i}).first();
      if(await fallback.count()){await fallback.click({timeout:5000});return true;}
      return false;
    };

    const fillQuestion=async q=>{
      let value=response.answers?.[q.id];
      if(value===undefined||value===null)return;
      const values=Array.isArray(value)?value.map(String):[String(value)];
      const selector=`[name="${String(q.entry).replace(/\\/g,"\\\\").replace(/"/g,'\\"')}"]`;
      const fields=page.locator(selector);

      if(q.type==="paragraph"){
        const field=fields.first();
        if(await field.count()) await field.fill(values[0]);
        return;
      }
      if(q.type==="short_answer"||q.type==="email"||q.type==="number"||q.type==="date"||q.type==="time"){
        const field=fields.first();
        if(await field.count()) await field.fill(values[0]);
        return;
      }
      if(q.type==="dropdown"){
        const field=fields.first();
        if(await field.count()){
          try{await field.selectOption({value:values[0]});return;}catch(_){
            try{await field.selectOption({label:values[0]});return;}catch(__){}
          }
        }
        const dropdownText=page.getByText(values[0],{exact:true}).last();
        if(await dropdownText.count()){
          try{await dropdownText.click({force:true});return;}catch(_){ }
        }
      }

      for(const v of values){
        let field=fields.first();
        const exact=fields.filter({hasText:v}).first();
        if(await exact.count()) field=exact;
        if(await fields.count()){
          const byValue=fields.locator(`xpath=self::*[@value=${JSON.stringify(v)}]`).first();
          if(await byValue.count())field=byValue;
        }
        if(await field.count()){
          try{await field.check({force:true});continue;}catch(_){
            try{await field.click({force:true});continue;}catch(__){}
          }
        }

        // Google Forms frequently renders the input inside a label/span. Use
        // the option text as a second, DOM-oriented fallback.
        const optionText=page.getByText(v,{exact:true}).last();
        if(await optionText.count()){
          try{await optionText.click({force:true});}catch(_){ }
        }
      }
    };

    while(current>=0 && current<pages.length && guard++<pages.length+3){
      if(visited.has(current))break;
      visited.add(current);
      const currentQuestions=questions.filter(q=>q.page===current);
      for(const q of currentQuestions) await fillQuestion(q);

      const isLast=current===pages.length-1 || pages[current]?.nextPageIndex===-1;
      if(isLast){
        const clicked=await clickButton([/Submit/i,/Send/i,/Done/i]);
        if(!clicked) throw new Error("Could not find the final Submit button in the Google Forms browser page.");
        break;
      }

      const nextIndex=pages[current]?.nextPageIndex;
      const clicked=await clickButton([/Next/i,/Continue/i]);
      if(!clicked) throw new Error("Could not find the Next button for this Google Forms section.");
      await page.waitForLoadState("domcontentloaded").catch(()=>{});
      await page.waitForTimeout(500);
      current=Number.isInteger(nextIndex)&&nextIndex>=0?nextIndex:current+1;
    }

    await page.waitForTimeout(1200);
    const body=(await page.locator("body").innerText()).replace(/\\s+/g," ").trim().toLowerCase();
    const recorded=[
      "your response has been recorded",
      "response recorded",
      "thanks for submitting",
      "thank you for completing",
      "thank you for submitting",
      "submit another response"
    ].some(x=>body.includes(x));
    const rejected=[
      "this form is no longer accepting responses",
      "your response was not submitted",
      "sign in to continue"
    ].some(x=>body.includes(x));

    if(recorded && !rejected){
      return {ok:true,status:200,finalUrl:page.url(),message:"Submission accepted by Google Forms (browser fallback)."};
    }
    if(rejected){
      return {ok:false,status:400,message:"Google Forms rejected the browser submission.",details:body.slice(0,700)};
    }
    return {ok:false,status:502,message:"Browser submission was not confirmed.",details:body.slice(0,700)||"No Google Forms confirmation text was found."};
  }catch(e){
    return {ok:false,status:502,message:"Browser submission failed.",details:e.message};
  }finally{
    // Keep the visible browser session available briefly so manual sign-in or
    // inspection is possible. Successful test runs close it automatically.
    if(browser) await browser.close().catch(()=>{});
  }
}

async function submitGoogleForm(form,response){
  const target=new URL(form.action);

  if(
    target.protocol!=="https:" ||
    target.hostname!=="docs.google.com" ||
    !/^\/forms\/d\/e\/[^/]+\/formResponse$/.test(target.pathname)
  ){
    throw new Error(
      "Invalid Google Forms submission endpoint. Re-analyze the published responder URL."
    );
  }

  const body=formDataFor(form,response);

  const headers={
    "Content-Type":"application/x-www-form-urlencoded",
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36",
    "Referer":form.url||target.href,
    "Origin":"https://docs.google.com",
    "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":"en-US,en;q=0.9",
    "Cache-Control":"no-cache"
  };

  try{
    const r=await fetchWithTimeout(
      target.href,
      {
        method:"POST",
        redirect:"manual",
        headers,
        body:body.toString()
      },
      7500
    );

    const location=r.headers.get("location")||"";
    const text=await r.text();

    if(r.status>=300 && r.status<400 && location){
      const finalUrl=new URL(location,target.href);

      if(
        finalUrl.hostname==="docs.google.com" &&
        finalUrl.pathname.includes("/formResponse")
      ){
        return {
          ok:true,
          status:r.status,
          finalUrl:finalUrl.href,
          message:"Submission accepted by Google Forms."
        };
      }
    }

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
      "thanks for submitting",
      "thank you for completing",
      "thank you for submitting",
      "submit another response"
    ].some(x=>lower.includes(x));

    if(r.ok && !rejected && recorded){
      return {
        ok:true,
        status:r.status,
        finalUrl:r.url,
        message:"Submission accepted by Google Forms."
      };
    }

    const hint=responseBodyHint(text);

    if(lower.includes("javascript isn't enabled in your browser") || lower.includes("javascript is not enabled in your browser")){
      return await submitGoogleFormInBrowser(form,response);
    }

    if(rejected){
      return {
        ok:false,
        status:r.status,
        message:"Google Forms rejected the submission.",
        details:hint||"Google returned a rejection page."
      };
    }

    if(r.status===429){
      return {
        ok:false,
        status:r.status,
        message:"Google Forms rate-limited the test request.",
        details:"Slow down the submission delay and try again later."
      };
    }

    if(r.status>=500){
      return {
        ok:false,
        status:r.status,
        message:`Google Forms returned HTTP ${r.status}.`,
        details:hint||"Google returned a temporary server/gateway error."
      };
    }

    return {
      ok:false,
      status:r.status,
      message:"Google Forms did not confirm the submission.",
      details:hint||`Google returned HTTP ${r.status}, but no confirmation was found.`
    };

  }catch(e){
    if(e.name==="AbortError"){
      return {
        ok:false,
        status:504,
        message:"Google Forms request timed out.",
        details:"The request exceeded 7.5 seconds."
      };
    }

    return {
      ok:false,
      status:502,
      message:"Could not reach Google Forms.",
      details:e.message
    };
  }
}
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI Form Test Bot: http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.app = app;

app.post("/api/submit-one", async (req, res) => {
  try {
    const { form, response } = req.body || {};

    if (!form || !response) {
      return res.status(400).json({
        ok: false,
        message: "Missing form or response data."
      });
    }

    const result = await submitGoogleForm(form, response);

    return res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Submission test failed.",
      details: e.message
    });
  }
});
