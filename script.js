import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const $=id=>document.getElementById(id);
let source=null,file=null,pdf=null,pageOrder=[],current=1,scale=1,mode=null,fieldData=null,selectedField=null;
const fields=[];

function stat(s){$("status").textContent=s}
function controls(){$("pageNo").value=current;$("pageTotal").textContent=pageOrder.length;$("zoom").textContent=Math.round(scale*100)+"%";$("prevBtn").disabled=current<=1;$("nextBtn").disabled=current>=pageOrder.length;$("saveBtn").disabled=!pdf}
$("openBtn").onclick=()=>$("fileInput").click();$("chooseBtn").onclick=()=>$("fileInput").click();
$("fileInput").onchange=e=>e.target.files[0]&&openFile(e.target.files[0]);

async function openFile(f){
 if(!f.name.toLowerCase().endsWith(".pdf"))return alert("Please choose a PDF.");
 file=f;source=new Uint8Array(await f.arrayBuffer());pdf=await pdfjsLib.getDocument({data:source.slice()}).promise;
 pageOrder=Array.from({length:pdf.numPages},(_,i)=>i);current=1;scale=1;fields.length=0;
 $("filename").textContent=f.name;$("welcome").classList.add("hidden");$("viewerScroll").classList.remove("hidden");
 controls();await render();await renderThumbs();stat("Ready")
}
async function pageCanvas(realIndex,c){
 const p=await pdf.getPage(realIndex+1),v=p.getViewport({scale});c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise
}
async function render(){
 $("pages").innerHTML="";
 for(let pos=0;pos<pageOrder.length;pos++){
  const real=pageOrder[pos],w=document.createElement("div");w.className="pageWrap";w.dataset.pos=pos;
  const c=document.createElement("canvas");c.className="pdfCanvas";w.append(c);const o=document.createElement("div");o.className="overlay";w.append(o);$("pages").append(w);
  await pageCanvas(real,c);fields.filter(x=>x.pos===pos).forEach(x=>addFieldDOM(x,o))
 }
}
async function renderThumbs(){
 $("thumbs").innerHTML="";
 for(let pos=0;pos<pageOrder.length;pos++){
  const d=document.createElement("div");d.className="thumb";d.draggable=true;d.dataset.pos=pos;
  const c=document.createElement("canvas"),p=await pdf.getPage(pageOrder[pos]+1),v=p.getViewport({scale:.18});c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
  const s=document.createElement("span");s.textContent=pos+1;d.append(c,s);d.onclick=()=>go(pos);
  d.ondragstart=e=>e.dataTransfer.setData("text/plain",pos);
  d.ondragover=e=>e.preventDefault();
  d.ondrop=e=>{e.preventDefault();const from=+e.dataTransfer.getData("text/plain"),to=+d.dataset.pos;if(from===to)return;const x=pageOrder.splice(from,1)[0];pageOrder.splice(to,0,x);fields.forEach(f=>{if(f.pos===from)f.pos=to});current=to+1;render().then(renderThumbs)};
  $("thumbs").append(d)
 }
 document.querySelectorAll(".thumb").forEach(x=>x.classList.toggle("active",+x.dataset.pos===current-1))
}
function go(pos){current=Math.max(1,Math.min(pageOrder.length,pos+1));document.querySelector(`.pageWrap[data-pos="${current-1}"]`)?.scrollIntoView({behavior:"smooth",block:"start"});controls();renderThumbs()}
$("prevBtn").onclick=()=>go(current-2);$("nextBtn").onclick=()=>go(current);$("pageNo").onchange=e=>go(+e.target.value-1);
$("zoomIn").onclick=async()=>{scale=Math.min(3,scale+.1);await render();controls()};$("zoomOut").onclick=async()=>{scale=Math.max(.4,scale-.1);await render();controls()};
$("fitBtn").onclick=async()=>{const p=await pdf.getPage(pageOrder[current-1]+1),v=p.getViewport({scale:1});scale=Math.max(.4,Math.min(2.5,($("viewerScroll").clientWidth-70)/v.width));await render();controls();go(current-1)};

$("organizeBtn").onclick=()=>{$("organizePanel").classList.remove("hidden");$("editPanel").classList.add("hidden")};
$("closeOrganize").onclick=()=>$("organizePanel").classList.add("hidden");
$("deletePage").onclick=()=>{if(pageOrder.length<=1)return alert("A PDF must have at least one page.");pageOrder.splice(current-1,1);fields.splice(0,fields.length,...fields.filter(f=>f.pos!==current-1));fields.forEach(f=>{if(f.pos>current-1)f.pos--});current=Math.min(current,pageOrder.length);render().then(renderThumbs);controls()};
$("duplicatePage").onclick=()=>{pageOrder.splice(current,0,pageOrder[current-1]);fields.filter(f=>f.pos===current-1).forEach(f=>fields.push({...f,id:crypto.randomUUID(),pos:current}));current++;render().then(renderThumbs);controls()};
$("rotatePage").onclick=async()=>{const real=pageOrder[current-1];const bytes=await makePDF();const doc=await PDFLib.PDFDocument.load(bytes);doc.getPage(real).setRotation(PDFLib.degrees((doc.getPage(real).getRotation().angle+90)%360));source=new Uint8Array(await doc.save());pdf=await pdfjsLib.getDocument({data:source.slice()}).promise;await render();await renderThumbs();stat("Page rotated. Save PDF to export.")};
$("extractPage").onclick=async()=>{const doc=await PDFLib.PDFDocument.load(source.slice()),out=await PDFLib.PDFDocument.create();const [p]=await out.copyPages(doc,[pageOrder[current-1]]);out.addPage(p);download(await out.save(),"extracted-page.pdf","application/pdf")};
$("insertPdf").onclick=()=>$("insertInput").click();$("insertInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;const a=await PDFLib.PDFDocument.load(source.slice()),b=await PDFLib.PDFDocument.load(await f.arrayBuffer()),pages=await a.copyPages(b,b.getPageIndices());pages.forEach(p=>a.addPage(p));source=new Uint8Array(await a.save());pdf=await pdfjsLib.getDocument({data:source.slice()}).promise;pageOrder=Array.from({length:pdf.numPages},(_,i)=>i);await render();await renderThumbs();controls();stat("PDF inserted.")};

$("fillSignBtn").onclick=()=>{$("editPanel").classList.remove("hidden");$("organizePanel").classList.add("hidden")};$("closeFill").onclick=()=>{$("editPanel").classList.add("hidden")};
$("typeTool").onclick=()=>openField("text");$("dateTool").onclick=()=>openField("date");$("checkTool").onclick=()=>openField("check");$("crossTool").onclick=()=>openField("cross");
function openField(type){mode=type;$("textPanel").classList.remove("hidden");$("fieldText").value=type==="date"?new Date().toLocaleDateString():type==="check"?"✓":type==="cross"?"✕":"Text";$("fieldSize").value=type==="check"||type==="cross"?28:18}
$("cancelField").onclick=()=>{$("textPanel").classList.add("hidden");mode=null};$("placeField").onclick=()=>{fieldData={text:$("fieldText").value,size:+$("fieldSize").value,color:$("fieldColor").value};$("textPanel").classList.add("hidden");stat("Click a page to place the field.")};
$("pages").onclick=e=>{if(!fieldData)return;const w=e.target.closest(".pageWrap");if(!w)return;const r=w.getBoundingClientRect(),o={id:crypto.randomUUID(),pos:+w.dataset.pos,x:(e.clientX-r.left)/scale,y:(e.clientY-r.top)/scale,text:fieldData.text,size:fieldData.size,color:fieldData.color};fields.push(o);fieldData=null;addFieldDOM(o,w.querySelector(".overlay"));stat("Field added.")};

function addFieldDOM(o,layer){
 const el=document.createElement("div");el.className="field";el.dataset.id=o.id;el.style.left=o.x*scale+"px";el.style.top=o.y*scale+"px";el.style.fontSize=o.size*scale+"px";el.style.color=o.color;
 if(o.image){const im=document.createElement("img");im.src=o.image;el.append(im)}else el.textContent=o.text;
 el.onpointerdown=e=>drag(e,o,el);el.ondblclick=()=>{if(confirm("Delete this field?")){const i=fields.findIndex(x=>x.id===o.id);fields.splice(i,1);el.remove()}};
 layer.append(el)
}
function drag(e,o,el){const sx=e.clientX,sy=e.clientY,ox=o.x,oy=o.y;el.setPointerCapture(e.pointerId);el.onpointermove=v=>{o.x=Math.max(0,ox+(v.clientX-sx)/scale);o.y=Math.max(0,oy+(v.clientY-sy)/scale);el.style.left=o.x*scale+"px";el.style.top=o.y*scale+"px"};el.onpointerup=()=>el.onpointermove=null}

$("signatureTool").onclick=()=>{$("signPanel").classList.remove("hidden");setupSign()};
$("cancelSign").onclick=()=>$("signPanel").classList.add("hidden");$("clearSign").onclick=()=>setupSign();
function setupSign(){const c=$("signCanvas"),ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);ctx.lineWidth=3;ctx.lineCap="round";let down=false;c.onpointerdown=e=>{down=true;ctx.beginPath();ctx.moveTo(e.offsetX,e.offsetY)};c.onpointermove=e=>{if(down){ctx.lineTo(e.offsetX,e.offsetY);ctx.stroke()}};c.onpointerup=()=>down=false;c.onpointerleave=()=>down=false}
$("useSign").onclick=()=>{const img=$("signCanvas").toDataURL("image/png");fields.push({id:crypto.randomUUID(),pos:current-1,x:60,y:80,size:1,text:"",image:img});$("signPanel").classList.add("hidden");render();stat("Signature added. Drag it to position.")};
$("uploadSignature").onclick=()=>$("sigInput").click();$("sigInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{fields.push({id:crypto.randomUUID(),pos:current-1,x:60,y:80,size:1,text:"",image:r.result});render();stat("Signature image added.")};r.readAsDataURL(f)};

$("convertBtn").onclick=async()=>{if(!pdf)return alert("Open a PDF first.");const choice=prompt("Convert to: WORD, IMAGE, or EXCEL");if(!choice)return;const c=choice.toLowerCase();if(c==="image"){for(let i=0;i<pageOrder.length;i++){const canvas=document.createElement("canvas");await pageCanvas(pageOrder[i],canvas);canvas.toBlob(b=>download(b,`page-${i+1}.png`,"image/png"),"image/png")}return}if(c==="word"){let html="<html><body>";for(let i=0;i<pageOrder.length;i++){const p=await pdf.getPage(pageOrder[i]+1),tc=await p.getTextContent();html+="<h3>Page "+(i+1)+"</h3><p>"+tc.items.map(x=>escape(x.str)).join(" ")+"</p>"}html+="</body></html>";download(new Blob([html],{type:"application/msword"}),"converted-document.doc","application/msword");return}if(c==="excel"){let csv="Page,Text\\n";for(let i=0;i<pageOrder.length;i++){const p=await pdf.getPage(pageOrder[i]+1),tc=await p.getTextContent(),t=tc.items.map(x=>x.str).join(" ").replaceAll('"','""');csv+=(i+1)+',"'+t+'"\\n'}download(new Blob([csv],{type:"text/csv"}),"converted-document.csv","text/csv");return}};
function escape(s){return s.replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]))}

async function makePDF(){const out=await PDFLib.PDFDocument.create(),src=await PDFLib.PDFDocument.load(source.slice());const ps=await out.copyPages(src,pageOrder);ps.forEach(p=>out.addPage(p));return await out.save()}
$("saveBtn").onclick=async()=>{stat("Saving PDF...");const out=await PDFLib.PDFDocument.create(),src=await PDFLib.PDFDocument.load(source.slice()),ps=await out.copyPages(src,pageOrder);const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);for(let i=0;i<ps.length;i++){out.addPage(ps[i]);const p=out.getPage(i),h=p.getHeight();for(const f of fields.filter(x=>x.pos===i)){if(f.image){const im=await out.embedPng(f.image);p.drawImage(im,{x:f.x,y:h-f.y-80,width:Math.min(250,im.width),height:Math.min(100,im.height)})}else{const n=parseInt(f.color.slice(1),16);p.drawText(f.text,{x:f.x,y:h-f.y-f.size,size:f.size,font,color:PDFLib.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)})}}}download(await out.save(),"edited-organized.pdf","application/pdf");stat("PDF saved.")};
function download(data,name,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
controls();
