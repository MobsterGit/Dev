// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: wand-magic-sparkles;
// Spray GenX WRA Manager - Clipboard Import Installer
// Installs a reversible menu/clipboard update into the existing WRA Manager.
// Does not upload customer records, invoices, financials, or backups.

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();
const marker = "// WRA_CLIPBOARD_IMPORT_V1";
const menuAnchor = 'pair(t, "+ Proposal", () => flow(blank("proposal"), "proposal"), "+ Invoice", () => flow(blank("invoice"), "invoice"));';
const flowAnchor = "async function flow(d,k){";
const menu = '  pair(t, "Paste Invoice", () => pasteDocument("invoice"), "Paste Proposal", () => pasteDocument("proposal"));';
const importer = `
${marker}
// Imports only allowed fields. Numbers and dates are assigned by WRA Manager.
// Source document is saved only after the user explicitly confirms.
async function pasteDocument(k) {
  try {
    const raw = Pasteboard.pasteString();
    if (!raw || !raw.trim()) throw new Error("Clipboard is empty. Copy invoice or proposal JSON first.");
    const input = JSON.parse(raw);
    if (!input || Array.isArray(input) || typeof input !== "object") {
      throw new Error("Clipboard must contain a JSON object.");
    }
    if (input.kind && input.kind !== k) throw new Error("Wrong document type. Choose the matching Paste button.");

    const d = blank(k);
    for (const field of ["customer","contact","phone","email","title","site","city","category","summary","details","notes"]) {
      if (input[field] !== undefined && input[field] !== null && typeof input[field] !== "string") {
        throw new Error("Field " + field + " must be text.");
      }
      d[field] = clean(input[field] ?? "");
    }
    if (!d.customer.trim() || !d.title.trim()) throw new Error("Customer and project title are required.");
    if (typeof input.total !== "number" || !Number.isFinite(input.total) || input.total <= 0) {
      throw new Error("Total must be a positive number.");
    }
    if (input.deposit !== undefined && (typeof input.deposit !== "number" ||
        !Number.isFinite(input.deposit) || input.deposit < 0 || input.deposit > input.total)) {
      throw new Error("Paid/deposit must be between zero and total.");
    }
    d.total = input.total;
    d.deposit = input.deposit ?? 0;
    d.balance_due = d.total - d.deposit;
    d.status = k === "invoice" ? "unpaid" : "open";

    const a = new Alert();
    a.title = "Create " + cap(k);
    a.message = "Customer: " + d.customer + "\\nProject: " + d.title +
      "\\nTotal: " + money(d.total) + "\\nPaid / Deposit: " + money(d.deposit) +
      "\\nBalance: " + money(d.balance_due) + "\\nNext ID: " + d.id +
      "\\n\\nReview before saving.";
    a.addAction("Create Document");
    a.addCancelAction("Cancel");
    if (await a.presentAlert() === -1) return;

    // Preserve existing save, HTML, numbering, and preview behavior.
    save(d, k);
    await buildHtml(d, k);
    bump(d.id, k);
    await after(d, k);
  } catch (err) {
    await note("Clipboard Import Failed", String(err.message || err));
  }
}
`;

async function alert(title,message, buttons=["OK"]) {
  const a = new Alert(); a.title = title; a.message = message;
  for (const b of buttons) a.addAction(b);
  a.addCancelAction("Cancel");
  return await a.presentAlert();
}
const names = fm.listContents(dir);
const exact = fm.joinPath(dir, "Spray GenX WRA Manager.js");
let targets = fm.fileExists(exact) ? [exact] : names
  .filter(n => /\\.js$/i.test(n) && /WRA.*Manager|Spray.*GenX.*Manager/i.test(n) && !/Install|Installer|Backup/i.test(n))
  .map(n => fm.joinPath(dir,n));
if (!targets.length) {
  await alert("WRA Manager Not Found", "Rename your existing Scriptable script to 'Spray GenX WRA Manager', or keep it in the same Scriptable iCloud folder and rerun this installer.");
} else {
  let target = targets[0];
  if (targets.length > 1) {
    const a = new Alert(); a.title = "Select WRA Manager";
    targets.forEach(p => a.addAction(p.split("/").pop()));
    a.addCancelAction("Cancel");
    const ix = await a.presentSheet();
    if (ix < 0) throw new Error("Installation cancelled");
    target = targets[ix];
  }
  if (fm.isFileDownloaded && !fm.isFileDownloaded(target)) await fm.downloadFileFromiCloud(target);
  const original = fm.readString(target);
  if (original.includes(marker)) {
    await alert("Already Installed", "Clipboard import is already present. Your existing script was not changed.");
  } else if (!original.includes(menuAnchor) || !original.includes(flowAnchor)) {
    await alert("Version Mismatch", "Installer stopped safely: the expected WRA Manager code was not found. No changes made.");
  } else {
    const backDir = fm.joinPath(dir, "SprayGenX/Backups/WRA_Script");
    if (!fm.fileExists(backDir)) fm.createDirectory(backDir, true);
    const stamp = new Date().toISOString().replace(/[:.]/g,"-");
    const backup = fm.joinPath(backDir, "WRA_Manager_before_clipboard_" + stamp + ".js");
    const ok = await alert("Install Clipboard Import?", "This backs up the existing script, then adds Paste Invoice and Paste Proposal. Existing documents and numbering remain unchanged.", ["Back Up & Install"]);
    if (ok === 0) {
      fm.writeString(backup, original);
      const revised = original
        .replace(menuAnchor, menuAnchor + "\\n" + menu)
        .replace(flowAnchor, importer + "\\n" + flowAnchor);
      if (!revised.includes(marker) || revised === original) throw new Error("Installer validation failed");
      fm.writeString(target, revised);
      await alert("Installation Complete", "WRA Manager updated. Original script backed up to:\\n" + backup + "\\n\\nOpen WRA Manager and use Paste Invoice / Paste Proposal.");
    }
  }
}
