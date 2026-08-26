import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const $=id=>document.getElementById(id);
let pdf=null,raw=null,file=null,current=1,scale=1,editMode=false,annotations=[],textItems=[];
const status=s=>$("status").textContent=s;
const download=(data,name,type)=>{const u=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
const requirePDF=()=>{if(!pdf){alert("Open a PDF first.");return false}return true};

$("openBtn").onclick=()=>$("pdfInput").click();
$("uploadBtn").onclick=()=>$("pdfInput").click();
$("pdfInput").onchange=e=>e.target.files[0]&&openPDF(e.target.files[0]);

async function openPDF(f){
 try{raw=new Uint8Array(await f.arrayBuffer());file=f;pdf=await pdfjsLib.getDocument({data:raw.slice()}).promise;current=1;
 $("welcome").classList.add("hidden");$("viewerScroll").classList.remove("hidden");$("filename").textContent=f.name;$("pageCount").textContent=pdf.numPages;await renderAll();await thumbnails();status("PDF opened");updateControls()
 }catch(e){console.error(e);alert("Unable to open this PDF.")}}
async function renderAll(){
 $("pages").innerHTML="";textItems=[];
 for(let i=1;i<=pdf.numPages;i++){
  const wrap=document.createElement("div");wrap.className="pageWrap";wrap.dataset.page=i;
  const c=document.createElement("canvas");c.className="pdfCanvas";const overlay=document.createElement("div");overlay.className="overlay";const tl=document.createElement("div");tl.className="textLayer";
  wrap.append(c,overlay,tl);$("pages").append(wrap);
  const p=await pdf.getPage(i),v=p.getViewport({scale});c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
  const tc=await p.getTextContent();textItems[i]=tc.items.map((x,idx)=>({idx,text:x.str,x:x.transform[4],y:x.transform[5],w:x.width||20,h:Math.abs(x.transform[3])||12,size:Math.abs(x.transform[3])||12}));
  for(const t of textItems[i]){if(!t.text.trim())continue;const e=document.createElement("div");e.className="pdfEditableText";e.contentEditable="true";e.textContent=t.text;e.style.left=t.x*scale+"px";e.style.top=(v.height-(t.y+t.h)*scale)+"px";e.style.width=Math.max(t.w*scale,15)+"px";e.style.height=Math.max(t.h*scale,14)+"px";e.style.fontSize=Math.max(t.size*scale,8)+"px";e.dataset.idx=t.idx;
   e.oninput=()=>{let a=annotations.find(a=>a.type==="replace"&&a.page===i&&a.idx===t.idx);if(a)a.text=e.textContent;else annotations.push({id:crypto.randomUUID(),type:"replace",page:i,idx:t.idx,x:t.x,y:t.y,w:t.w,h:t.h,size:t.size,text:e.textContent})};
  }
  tl.append(...[...tl.children]);
  annotations.filter(a=>a.page===i&&a.type==="text").forEach(a=>drawAnno(a,overlay));
 }
 applyEditMode();
}
function drawAnno(a,layer){const e=document.createElement("div");e.className="anno";e.textContent=a.text;e.style.left=a.x*scale+"px";e.style.top=a.y*scale+"px";e.style.fontSize=a.size*scale+"px";e.ondblclick=()=>{annotations=annotations.filter(x=>x.id!==a.id);renderAll()};layer.append(e)}
async function thumbnails(){const box=$("thumbnails");box.innerHTML="";for(let i=1;i<=pdf.numPages;i++){const d=document.createElement("div");d.className="thumb";const c=document.createElement("canvas"),p=await pdf.getPage(i),v=p.getViewport({scale:.18});c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;d.append(c);d.onclick=()=>go(i);box.append(d)}}
function go(n){if(!pdf)return;current=Math.max(1,Math.min(pdf.numPages,n));document.querySelector(`.pageWrap[data-page="${current}"]`)?.scrollIntoView({behavior:"smooth"});updateControls()}
function updateControls(){$("pageInput").value=current;$("pageCount").textContent=pdf?pdf.numPages:0}
$("prevBtn").onclick=()=>go(current-1);$("nextBtn").onclick=()=>go(current+1);$("pageInput").onchange=e=>go(+e.target.value||1);
$("zoomIn").onclick=async()=>{if(!requirePDF())return;scale=Math.min(2.5,scale+.1);await renderAll()};$("zoomOut").onclick=async()=>{if(!requirePDF())return;scale=Math.max(.5,scale-.1);await renderAll()};
$("zoomSelect").onchange=async e=>{scale=parseInt(e.target.value)/100;await renderAll()};$("fitBtn").onclick=async()=>{if(!requirePDF())return;const p=await pdf.getPage(current),v=p.getViewport({scale:1});scale=Math.max(.5,Math.min(2,($("viewerScroll").clientWidth-60)/v.width));await renderAll();go(current)};
$("editBtn").onclick=()=>{if(!requirePDF())return;editMode=true;applyEditMode();$("editHint").classList.remove("hidden");status("Edit PDF mode enabled")};
function applyEditMode(){document.querySelectorAll(".textLayer").forEach(x=>x.classList.toggle("editableMode",editMode))}
$("pages").ondblclick=e=>{if(!editMode)return;const w=e.target.closest(".pageWrap");if(!w||e.target.closest(".pdfEditableText"))return;const r=w.getBoundingClientRect();const a={id:crypto.randomUUID(),type:"text",page:+w.dataset.page,x:(e.clientX-r.left)/scale,y:(e.clientY-r.top)/scale,text:"New text",size:18};annotations.push(a);drawAnno(a,w.querySelector(".overlay"));status("New text added")};
document.addEventListener("keydown",e=>{if(e.key==="Escape"){editMode=false;$("editHint").classList.add("hidden");applyEditMode();status("Edit mode off")}});
$("saveBtn").onclick=async()=>{if(!requirePDF())return;try{const src=await PDFLib.PDFDocument.load(raw.slice()),out=await PDFLib.PDFDocument.create(),pages=await out.copyPages(src,src.getPageIndices()),font=await out.embedFont(PDFLib.StandardFonts.Helvetica);pages.forEach(p=>out.addPage(p));for(let i=1;i<=pdf.numPages;i++){const p=out.getPage(i-1),h=p.getHeight();for(const a of annotations.filter(x=>x.page===i&&x.type==="replace")){p.drawRectangle({x:a.x-1,y:a.y-2,width:Math.max(a.w+6,25),height:Math.max(a.h+5,12),color:PDFLib.rgb(1,1,1)});p.drawText(a.text,{x:a.x,y:a.y,size:a.size,font,color:PDFLib.rgb(.05,.05,.05)})}for(const a of annotations.filter(x=>x.page===i&&x.type==="text"))p.drawText(a.text,{x:a.x,y:h-a.y-a.size,size:a.size,font,color:PDFLib.rgb(.05,.05,.05)})}download(await out.save(),"edited.pdf","application/pdf");status("Saved edited.pdf")}catch(e){alert(e.message)}};
$("printBtn").onclick=()=>{if(!requirePDF())return;const u=URL.createObjectURL(new Blob([raw],{type:"application/pdf"}));const w=window.open(u);if(w)w.onload=()=>w.print()};
$("emailBtn").onclick=()=>{if(!requirePDF())return;location.href="mailto:?subject=PDF&body="+encodeURIComponent("I am sharing a PDF document.")};
$("searchBtn").onclick=async()=>{if(!requirePDF())return;const q=prompt("Search PDF:");if(!q)return;let found=[];for(let i=1;i<=pdf.numPages;i++){if(textItems[i]?.some(x=>x.text.toLowerCase().includes(q.toLowerCase())))found.push(i)}alert(found.length?"Found on pages: "+found.join(", "):"Not found")};
$("shareBtn").onclick=async()=>{if(navigator.share&&file){try{await navigator.share({title:file.name,text:"PDF document"})}catch{}}else{alert("Share is available when the browser supports Web Share.")}};
document.querySelectorAll("[data-panel]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".page-panel").forEach(x=>x.classList.add("hidden"));$(b.dataset.panel).classList.remove("hidden");document.querySelectorAll(".rail").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
$("closePanel").onclick=()=>$("pagesPanel").classList.add("hidden");
document.querySelectorAll("[data-expand]").forEach(b=>b.onclick=()=>$(b.dataset.expand).classList.toggle("hidden"));
$("commentBtn").onclick=()=>{if(!requirePDF())return;const t=prompt("Comment:");if(t){annotations.push({id:crypto.randomUUID(),type:"text",page:current,x:50,y:50,text:"💬 "+t,size:14});renderAll()}};
$("redactBtn").onclick=async()=>{if(!requirePDF())return;const d=await PDFLib.PDFDocument.load(raw.slice()),p=d.getPage(current-1);p.drawRectangle({x:50,y:50,width:180,height:35,color:PDFLib.rgb(0,0,0)});raw=new Uint8Array(await d.save());pdf=await pdfjsLib.getDocument({data:raw.slice()}).promise;await renderAll();status("Redaction applied")};
$("organizeBtn").onclick=async()=>{if(!requirePDF())return;const a=prompt("Organize Pages:\n1 Delete current page\n2 Duplicate current page\n3 Rotate current page");if(a==="1"&&pdf.numPages>1){const d=await PDFLib.PDFDocument.load(raw.slice()),o=await PDFLib.PDFDocument.create();for(let i=0;i<d.getPageCount();i++)if(i!==current-1)o.addPage((await o.copyPages(d,[i]))[0]);raw=new Uint8Array(await o.save());pdf=await pdfjsLib.getDocument({data:raw.slice()}).promise;current=Math.min(current,pdf.numPages);await renderAll();await thumbnails()}else if(a==="2"){const d=await PDFLib.PDFDocument.load(raw.slice()),p=d.getPage(current-1),o=await PDFLib.PDFDocument.create();for(let i=0;i<d.getPageCount();i++){o.addPage((await o.copyPages(d,[i]))[0]);if(i===current-1)o.addPage((await o.copyPages(d,[i]))[0])}raw=new Uint8Array(await o.save());pdf=await pdfjsLib.getDocument({data:raw.slice()}).promise;await renderAll();await thumbnails()}else if(a==="3"){const d=await PDFLib.PDFDocument.load(raw.slice()),p=d.getPage(current-1);p.setRotation(PDFLib.degrees((p.getRotation().angle+90)%360));raw=new Uint8Array(await d.save());pdf=await pdfjsLib.getDocument({data:raw.slice()}).promise;await renderAll()}};
$("combineBtn").onclick=$("combineTool").onclick=()=>$("multiInput").click();
$("multiInput").onchange=async e=>{const fs=[...e.target.files];if(!fs.length)return;const o=await PDFLib.PDFDocument.create();for(const f of fs){const d=await PDFLib.PDFDocument.load(await f.arrayBuffer());(await o.copyPages(d,d.getPageIndices())).forEach(p=>o.addPage(p))}download(await o.save(),"combined.pdf","application/pdf");status("Combined PDF downloaded")};
$("blankBtn").onclick=async()=>{const o=await PDFLib.PDFDocument.create();o.addPage([595,842]);download(await o.save(),"blank.pdf","application/pdf")};
$("signBtn").onclick=()=>alert("Fill & Sign: use Edit PDF to add text. Signature drawing can be added in the next tool update.");
$("toWord").onclick=async()=>{if(!requirePDF())return;let h="<html><body>";for(let i=1;i<=pdf.numPages;i++){h+="<h2>Page "+i+"</h2><p>"+(textItems[i]||[]).map(x=>x.text).join(" ")+"</p>"}h+="</body></html>";download(h,"converted.doc","application/msword")};
$("toExcel").onclick=async()=>{if(!requirePDF())return;let c="Page,Text\n";for(let i=1;i<=pdf.numPages;i++)c+=i+',"' +(textItems[i]||[]).map(x=>x.text).join(" ").replaceAll('"','""')+'"\n';download(c,"converted.csv","text/csv")};
$("toImage").onclick=async()=>{if(!requirePDF())return;for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),v=p.getViewport({scale:1.5}),c=document.createElement("canvas");c.width=v.width;c.height=v.height;await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;await new Promise(r=>c.toBlob(b=>{download(b,"page-"+i+".png","image/png");r()},"image/png"))}};
$("proBtn").onclick=()=>alert("PDF Reader Web Pro features are available in this web app without an account.");
$("toolSearch").oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll(".tool-row").forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?"grid":"none")};
