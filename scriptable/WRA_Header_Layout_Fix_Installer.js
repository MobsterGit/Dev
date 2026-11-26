// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: file-text;
// Spray GenX WRA Manager — Header Layout Fix Installer
// Fixes ONLY the top header in the existing WRA Manager.
// It backs up the original .js and scans both iCloud and local Scriptable directories.
// No customer/invoice data or numbering is modified.

const PATCH_MARKER = "WRA_HEADER_LAYOUT_FIX_2026_11";
const first = '<div class="customer"><div class="label">Customer</div>';
const last = '</section>${pic}<section class="box">';
const replacement = '<div class="invoice-header"><div class="invoice-kind">${k.toUpperCase()}</div><div class="invoice-id">${esc(d.id)}</div><div class="invoice-date">${esc(d.created)}</div><div class="invoice-status">${esc(d.status)}</div></div></section><section class="customer-project"><div class="customer"><div class="label">Customer</div><div class="name">${esc(d.customer)}</div><p>${esc([d.contact,d.phone,d.email].filter(Boolean).join(" | "))}</p><p>${esc([d.site,d.city].filter(Boolean).join(", "))}</p></div><div class="project-details"><div class="label">Project</div><div class="name">${esc(d.title)}</div><p>${esc(d.category)}</p></div>';
const css = `
/* WRA_HEADER_LAYOUT_FIX_2026_11: document ID always upper right. */
.invoice-header { text-align:right; flex:0 1 42%; min-width:0; align-self:flex-start; overflow-wrap:anywhere; }
.invoice-kind { font-size:27px; font-weight:800; line-height:1.1; letter-spacing:.02em; }
.invoice-id { font-size:17px; font-weight:750; margin-top:6px; }
.invoice-date,.invoice-status { font-size:12px; margin-top:3px; color:#444; }
.customer-project { display:flex; justify-content:space-between; gap:18px; padding:13px 0 6px; border-bottom:1px solid #ddd; }
.customer-project .customer { text-align:left; max-width:50%; flex:1; overflow-wrap:anywhere; }
.project-details { flex:1; text-align:right; max-width:50%; overflow-wrap:anywhere; }
.project-details .name {font-size:18px;font-weight:800;}
.project-details p {margin:2px 0;color:#444;}
@media print {
  .top,.customer-project {display:flex!important;}
  .invoice-header {text-align:right!important;}
  .customer-project .customer {text-align:left!important;}
  .project-details {text-align:right!important;}
}
`;

function candidateSource(src) {
  return src.includes("async function buildHtml(d,k)") &&
    src.includes(first) &&
    src.includes('<section class="docline">') &&
    src.includes(last) &&
    src.includes("Spray GenX WRA Manager");
}
const candidates=[];
for (const store of [{fm:FileManager.iCloud(),name:"iCloud"},{fm:FileManager.local(),name:"On My iPhone"}]) {
  const root=store.fm.documentsDirectory();
  const folders=[root];
  // Some Scriptable installations store scripts in one subfolder.
  for (const n of store.fm.listContents(root)) {
    const p=store.fm.joinPath(root,n);
    if (store.fm.isDirectory(p) && /spray|script|manager/i.test(n)) folders.push(p);
  }
  for (const folder of folders) {
    for (const n of store.fm.listContents(folder)) {
      if (!/\\.js$/i.test(n) || /installer|backup/i.test(n)) continue;
      const p=store.fm.joinPath(folder,n);
      try {
        if (store.fm.isFileDownloaded && !store.fm.isFileDownloaded(p)) {
          await store.fm.downloadFileFromiCloud(p);
        }
        const src=store.fm.readString(p);
        if (candidateSource(src) || (src.includes(PATCH_MARKER) && src.includes("async function buildHtml(d,k)"))) {
          candidates.push({fm:store.fm,location:store.name,path:p,name:n,src});
        }
      } catch (err) { /* Do not change unreadable scripts. */ }
    }
  }
}
const a=new Alert();
if (!candidates.length) {
  a.title="WRA Manager Not Found";
  a.message="I checked both iCloud and local Scriptable script folders. No matching WRA Manager source was found. No files were changed.";
  a.addAction("OK"); await a.presentAlert();
} else {
  let selected=candidates[0];
  if (candidates.length>1) {
    const pick=new Alert(); pick.title="Choose WRA Manager";
    for (const c of candidates) pick.addAction(c.name + " (" + c.location + ")");
    pick.addCancelAction("Cancel");
    const j=await pick.presentSheet();
    if (j<0) throw new Error("Cancelled — no changes made.");
    selected=candidates[j];
  }
  if (selected.src.includes(PATCH_MARKER)) {
    a.title="Already Updated"; a.message="The header correction is already installed in " + selected.name + ".";
    a.addAction("OK"); await a.presentAlert();
  } else {
    const src=selected.src;
    const start=src.indexOf(first);
    const end=src.indexOf(last,start+first.length);
    const docline=src.indexOf('<section class="docline">',start);
    if (start<0 || end<0 || docline<start || docline>end) throw new Error("Unexpected layout: no changes made.");
    const closeStyle=src.indexOf("</style>",end);
    if (closeStyle<0) throw new Error("Stylesheet marker not found: no changes made.");
    let fixed=src.slice(0,start)+replacement+src.slice(end);
    const stylePos=fixed.indexOf("</style>");
    fixed=fixed.slice(0,stylePos)+css+fixed.slice(stylePos);
    if (!fixed.includes(PATCH_MARKER) || !fixed.includes('class="customer-project"') ||
      fixed.includes('<section class="docline">')) throw new Error("Validation failed. Original unchanged.");
    const confirm=new Alert();confirm.title="Fix Invoice Header";
    confirm.message="File: " + selected.name + " (" + selected.location + ")\\n\\nMove invoice title/number/date to the top right; move customer/project below the logo. Keep all pricing, numbering and records unchanged.\\n\\nA timestamped backup is created before the edit.";
    confirm.addAction("Back Up & Fix");confirm.addCancelAction("Cancel");
    if (await confirm.presentAlert()===0) {
      const fm=selected.fm;
      const backupDir=fm.joinPath(fm.documentsDirectory(),"SprayGenX/Backups/WRA_Script");
      if (!fm.fileExists(backupDir)) fm.createDirectory(backupDir,true);
      const backup=fm.joinPath(backupDir,"WRA_before_header_fix_"+new Date().toISOString().replace(/[:.]/g,"-")+".js");
      fm.writeString(backup,src);
      fm.writeString(selected.path,fixed);
      const done=new Alert();done.title="Header Updated";
      done.message="Open WRA Manager and preview an invoice.\\n\\nBackup: " + backup;
      done.addAction("OK");await done.presentAlert();
    }
  }
}
