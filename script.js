import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const $=id=>document.getElementById(id);
let pdf=null,source=null,current=1,scale=0.9,order=[],file=null,annotations=[],toolMode=null,dragging=false;

function status(s){$("status").textContent=s}
function controls(){ $("pageNo").value=current; $("pageCount").textContent=order.length; $("zoomLabel").textContent=Math.round(scale*100)+"%"; $("prevBtn").disabled=current<=1; $("nextBtn").disabled=current>=order.length; $("saveBtn").disabled=!pdf; highlightThumbs() }
function download(data,name,type){const u=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function requirePDF(){if(!pdf){alert("Please open a PDF first.");return false}return true}

async function openPDF(f){
 try{
  if(!f)return;
  source=new Uint8Array(await f.arrayBuffer()); file=f;
  pdf=await pdfjsLib.getDocument({data:source.slice()}).promise;
  order=Array.from({length:pdf.numPages},(_,i)=>i);current=1;scale=.9;annotations=[];
  $("docTitle").textContent=f.name+" - PDF Reader Web";$("fileName").textContent=f.name;
  $("welcome").classList.add("hidden");$("pdfScroll").classList.remove("hidden");
  await renderPages();await renderThumbs();controls();status("PDF opened successfully");
 }catch(e){console.error(e);alert("Could not open this PDF. Make sure it is a valid PDF.");}
}
$("openBtn").onclick=()=>$("pdfInput").click();$("openWelcome").onclick=()=>$("pdfInput").click();$("pdfInput").onchange=e=>openPDF(e.target.files[0]);

async function renderPages(){
 const holder=$("pages");holder.innerHTML="";
 for(let pos=0;pos<order.length;pos++){
  const wrap=document.createElement("div");wrap.className="pageWrap";wrap.dataset.pos=pos;
  const canvas=document.createElement("canvas");canvas.className="pdfCanvas";
  const overlay=document.createElement("div");overlay.className="overlay";
  wrap.append(canvas,overlay);holder.append(wrap);
  const p=await pdf.getPage(order[pos]+1),v=p.getViewport({scale});
  canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  await p.render({canvasContext:canvas.getContext("2d"),viewport:v}).promise;
  annotations.filter(a=>a.pos===pos).forEach(a=>drawAnnotation(a,overlay));
 }
}
async function renderThumbs(){
 const holder=$("thumbs");holder.innerHTML="";
 for(let pos=0;pos<order.length;pos++){
  const d=document.createElement("div");d.className="thumb";d.dataset.pos=pos;
  const c=document.createElement("canvas");const p=await pdf.getPage(order[pos]+1),v=p.getViewport({scale:.18});
  c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);
  await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
  const n=document.createElement("div");n.className="thumbNum";n.textContent=pos+1;d.append(c,n);
  d.onclick=()=>goPage(pos);holder.append(d);
 }
 highlightThumbs();
}
function highlightThumbs(){document.querySelectorAll(".thumb").forEach(x=>x.classList.toggle("active",+x.dataset.pos===current-1))}
function goPage(pos){if(!pdf)return;current=Math.max(1,Math.min(order.length,pos+1));const target=document.querySelector(`.pageWrap[data-pos="${current-1}"]`);if(target)target.scrollIntoView({behavior:"smooth",block:"start"});controls()}
$("prevBtn").onclick=()=>goPage(current-2);$("nextBtn").onclick=()=>goPage(current);$("pageNo").onchange=()=>goPage(Number($("pageNo").value)-1);
$("zoomIn").onclick=async()=>{if(!requirePDF())return;scale=Math.min(3,scale+.1);await renderPages();controls()};
$("zoomOut").onclick=async()=>{if(!requirePDF())return;scale=Math.max(.4,scale-.1);await renderPages();controls()};
$("fitBtn").onclick=async()=>{if(!requirePDF())return;const p=await pdf.getPage(order[current-1]+1),v=p.getViewport({scale:1});scale=Math.max(.4,Math.min(2.5,($("pdfScroll").clientWidth-60)/v.width));await renderPages();controls();goPage(current-1)};
$("searchBtn").onclick=async()=>{if(!requirePDF())return;const q=prompt("Search text in PDF:");if(!q)return;let found=[];for(let i=0;i<order.length;i++){const p=await pdf.getPage(order[i]+1),tc=await p.getTextContent();if(tc.items.some(x=>x.str.toLowerCase().includes(q.toLowerCase())))found.push(i+1)}alert(found.length?"Found on page(s): "+found.join(", "):"Text not found.")};
$("moreBtn").onclick=()=>alert("Available: Edit PDF, Comment, Combine Files, Organize Pages, Fill & Sign, Redact, Export and Save.");

document.querySelectorAll(".rail").forEach(b=>b.onclick=()=>{document.querySelectorAll(".sideContent").forEach(x=>x.classList.add("hidden"));$(b.dataset.panel).classList.remove("hidden");document.querySelectorAll(".rail").forEach(x=>x.classList.remove("active"));b.classList.add("active")});

function menu(id){$(id).classList.toggle("hidden")}
$("exportBtn").onclick=()=>menu("exportMenu");$("createBtn").onclick=()=>menu("createMenu");
$("combineBtn").onclick=()=>$("multiInput").click();$("createFilesBtn").onclick=()=>$("multiInput").click();
$("multiInput").onchange=async e=>{const fs=[...e.target.files];if(!fs.length)return;try{status("Combining files...");const out=await PDFLib.PDFDocument.create();for(const f of fs){const d=await PDFLib.PDFDocument.load(await f.arrayBuffer());const pages=await out.copyPages(d,d.getPageIndices());pages.forEach(p=>out.addPage(p))}download(await out.save(),"combined.pdf","application/pdf");status("Combined PDF created.");}catch(err){console.error(err);alert("Could not combine the selected PDFs.")}};

$("editBtn").onclick=()=>{if(!requirePDF())return;toolMode="text";$("floatingText").classList.remove("hidden");status("Enter text, then click Place and click anywhere on a page.")};
$("placeText").onclick=()=>{toolMode="text";$("floatingText").classList.add("hidden");status("Click on a page to place the text.")};
$("cancelText").onclick=()=>{toolMode=null;$("floatingText").classList.add("hidden")};

$("pages").addEventListener("click",e=>{
 if(toolMode!=="text")return;const wrap=e.target.closest(".pageWrap");if(!wrap)return;
 const r=wrap.getBoundingClientRect();const a={id:crypto.randomUUID(),pos:+wrap.dataset.pos,x:(e.clientX-r.left)/scale,y:(e.clientY-r.top)/scale,text:$("textValue").value,size:Number($("textSize").value),color:"#111111"};
 annotations.push(a);toolMode=null;drawAnnotation(a,wrap.querySelector(".overlay"));status("Text added. Drag it to move."); 
});
function drawAnnotation(a,layer){
 const el=document.createElement("div");el.className="field";el.dataset.id=a.id;el.style.left=a.x*scale+"px";el.style.top=a.y*scale+"px";el.style.fontSize=a.size*scale+"px";el.style.color=a.color;
 if(a.image){const im=document.createElement("img");im.src=a.image;el.appendChild(im)}else el.textContent=a.text;
 el.onpointerdown=e=>startDrag(e,a,el);el.ondblclick=()=>{if(confirm("Delete this item?")){annotations=annotations.filter(x=>x.id!==a.id);renderPages()}};
 layer.appendChild(el);
}
function startDrag(e,a,el){const sx=e.clientX,sy=e.clientY,ox=a.x,oy=a.y;el.setPointerCapture(e.pointerId);const move=v=>{a.x=Math.max(0,ox+(v.clientX-sx)/scale);a.y=Math.max(0,oy+(v.clientY-sy)/scale);el.style.left=a.x*scale+"px";el.style.top=a.y*scale+"px"};el.onpointermove=move;el.onpointerup=()=>{el.onpointermove=null};}

$("commentBtn").onclick=()=>{if(!requirePDF())return;const t=prompt("Comment for page "+current+":");if(t){annotations.push({id:crypto.randomUUID(),pos:current-1,x:50,y:50,text:"💬 "+t,size:15,color:"#d29b00"});renderPages();status("Comment added.")}};
$("redactBtn").onclick=async()=>{if(!requirePDF())return;const d=await PDFLib.PDFDocument.load(source.slice()),p=d.getPage(order[current-1]);p.drawRectangle({x:50,y:70,width:180,height:28,color:PDFLib.rgb(0,0,0)});source=new Uint8Array(await d.save());pdf=await pdfjsLib.getDocument({data:source.slice()}).promise;await renderPages();status("Black redaction box added. Save PDF to export.");};

$("organizeBtn").onclick=async()=>{if(!requirePDF())return;const cmd=prompt("Organize Pages:\n1 = Delete current\n2 = Duplicate current\n3 = Rotate current\n4 = Extract current\n5 = Move current to first\n\nEnter 1-5");if(!cmd)return;
if(cmd==="1"){if(order.length===1)return alert("Cannot delete the only page.");order.splice(current-1,1);annotations=annotations.filter(a=>a.pos!==current-1);annotations.forEach(a=>{if(a.pos>current-1)a.pos--});current=Math.min(current,order.length)}
else if(cmd==="2"){order.splice(current,0,order[current-1]);annotations.filter(a=>a.pos===current-1).forEach(a=>annotations.push({...a,id:crypto.randomUUID(),pos:current}));current++}
else if(cmd==="3"){const d=await PDFLib.PDFDocument.load(source.slice()),p=d.getPage(order[current-1]);p.setRotation(PDFLib.degrees((p.getRotation().angle+90)%360));source=new Uint8Array(await d.save());pdf=await pdfjsLib.getDocument({data:source.slice()}).promise}
else if(cmd==="4"){const d=await PDFLib.PDFDocument.load(source.slice()),o=await PDFLib.PDFDocument.create();o.addPage((await o.copyPages(d,[order[current-1]]))[0]);download(await o.save(),"extracted-page.pdf","application/pdf");return}
else if(cmd==="5"){const x=order.splice(current-1,1)[0];order.unshift(x);current=1}
await renderPages();await renderThumbs();controls();status("Pages organized.")};

$("fillSignBtn").onclick=()=>{if(!requirePDF())return;$("signBox").classList.remove("hidden");setupSignature();};
function setupSignature(){const c=$("signCanvas"),ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);ctx.lineWidth=3;ctx.lineCap="round";let down=false;c.onpointerdown=e=>{down=true;ctx.beginPath();ctx.moveTo(e.offsetX,e.offsetY)};c.onpointermove=e=>{if(down){ctx.lineTo(e.offsetX,e.offsetY);ctx.stroke()}};c.onpointerup=()=>down=false;c.onpointerleave=()=>down=false}
$("clearSign").onclick=setupSignature;$("cancelSign").onclick=()=>$("signBox").classList.add("hidden");
$("useSign").onclick=()=>{const a={id:crypto.randomUUID(),pos:current-1,x:60,y:80,size:1,image:$("signCanvas").toDataURL("image/png")};annotations.push(a);$("signBox").classList.add("hidden");renderPages();status("Signature added. Drag it to position.")};

async function exportWord(){if(!requirePDF())return;let html="<html><body>";for(let i=0;i<order.length;i++){const p=await pdf.getPage(order[i]+1),tc=await p.getTextContent();html+="<h2>Page "+(i+1)+"</h2><p>"+tc.items.map(x=>escapeHtml(x.str)).join(" ")+"</p>"}html+="</body></html>";download(html,"converted.doc","application/msword");status("Word document created.")}
async function exportExcel(){if(!requirePDF())return;let csv="Page,Text\\n";for(let i=0;i<order.length;i++){const p=await pdf.getPage(order[i]+1),tc=await p.getTextContent(),t=tc.items.map(x=>x.str).join(" ").replaceAll('"','""');csv+=(i+1)+',"'+t+'"\\n'}download(csv,"converted.csv","text/csv");status("Excel-compatible CSV created.")}
async function exportImages(){if(!requirePDF())return;status("Creating images...");for(let i=0;i<order.length;i++){const p=await pdf.getPage(order[i]+1),v=p.getViewport({scale:1.5}),c=document.createElement("canvas");c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await p.render({canvasContext:c.getContext("2d"),viewport:v}).promise;await new Promise(resolve=>c.toBlob(b=>{download(b,"page-"+(i+1)+".png","image/png");resolve()}, "image/png"))}status("Images created.")}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("wordBtn").onclick=exportWord;$("excelBtn").onclick=exportExcel;$("imageBtn").onclick=exportImages;

$("saveBtn").onclick=async()=>{if(!requirePDF())return;try{status("Saving PDF...");const src=await PDFLib.PDFDocument.load(source.slice()),out=await PDFLib.PDFDocument.create(),copied=await out.copyPages(src,order),font=await out.embedFont(PDFLib.StandardFonts.Helvetica);for(let i=0;i<copied.length;i++){out.addPage(copied[i]);const p=out.getPage(i),h=p.getHeight();for(const a of annotations.filter(x=>x.pos===i)){if(a.image){const im=await out.embedPng(a.image);const w=Math.min(220,im.width),hh=Math.min(90,im.height);p.drawImage(im,{x:a.x,y:h-a.y-hh,width:w,height:hh})}else{const n=parseInt(a.color.slice(1),16);p.drawText(a.text,{x:a.x,y:h-a.y-a.size,size:a.size,font,color:PDFLib.rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)})}}}download(await out.save(),"edited-organized.pdf","application/pdf");status("PDF saved successfully.");}catch(e){console.error(e);alert("Could not save PDF. Please try again.")}};
$("printBtn").onclick=()=>{if(!requirePDF())return;const u=URL.createObjectURL(new Blob([source],{type:"application/pdf"}));const w=window.open(u);if(w)w.onload=()=>w.print()};
$("shareBtn").onclick=async()=>{if(navigator.share&&file){try{await navigator.share({title:file.name,text:"PDF document"})}catch{}}else{await navigator.clipboard?.writeText(location.href);alert("Share link copied.")}};
$("helpBtn").onclick=()=>alert("PDF Reader Web: Open, edit, comment, redact, fill & sign, combine, organize, convert and save PDF files.");
controls();
