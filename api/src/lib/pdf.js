const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const CREST_PATH = path.join(__dirname, "..", "..", "assets", "crest.jpeg");
const NAVY = rgb(0x1f / 255, 0x38 / 255, 0x64 / 255);
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.35, 0.35, 0.35);

const CONSENT_PARAGRAPHS = [
  "I understand that driving a company vehicle (or my own vehicle, as required) is a requirement of the position I am being considered for and that having and maintaining a satisfactory driving record is a condition of my employment. I agree to allow the Archdiocese of Miami to check my driving record prior to hire and to check it periodically thereafter. I further agree to report to my supervisor immediately any license suspensions, serious accidents or offenses, or any other condition that may affect my ability to drive a Archdiocese of Miami vehicle (or my own vehicle, if I am required to drive it) after I am hired.",
  "I understand that the Archdiocese of Miami will use this information for employment purposes only and will not furnish this information to a third party without my written consent.",
  "I agree to release the Archdiocese of Miami its employees and those who supplied the company with the information from any liability for any damage that may result from furnishing the requested information or my failure to be hired for the position for which I am applying.",
];

// Simple greedy word-wrap since pdf-lib has no built-in text layout.
function wrapText(text, font, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncateToWidth(text, font, size, maxWidth) {
  if (!text) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(truncated + "…", size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

function drawLabelValue(page, font, boldFont, label, value, x, y, size = 9) {
  page.drawText(label, { x, y, size, font: boldFont, color: BLACK });
  const labelWidth = boldFont.widthOfTextAtSize(label, size);
  page.drawText(value || "", { x: x + labelWidth + 4, y, size, font, color: BLACK });
}

async function buildApprovalPage(pdfDoc, font, boldFont, crestImage, requestInfo, driver, dateOfRequest) {
  const page = pdfDoc.addPage([612, 792]);
  const marginX = 50;
  let y = 742;

  page.drawImage(crestImage, { x: marginX, y: y - 10, width: 55, height: 55 });
  page.drawText("Archdiocese of Miami", { x: marginX + 65, y: y + 32, size: 10, font: boldFont, color: BLACK });
  page.drawText("Pastoral Center", { x: marginX + 65, y: y + 20, size: 9, font, color: BLACK });
  page.drawText("9401 Biscayne Boulevard", { x: marginX + 65, y: y + 9, size: 9, font, color: BLACK });
  page.drawText("Miami Shores, FL 33138", { x: marginX + 65, y: y - 2, size: 9, font, color: BLACK });

  y -= 80;
  const title = "Driver's License MVR Request Approval Form";
  const titleWidth = boldFont.widthOfTextAtSize(title, 15);
  page.drawText(title, { x: (612 - titleWidth) / 2, y, size: 15, font: boldFont, color: BLACK });

  y -= 40;
  drawLabelValue(page, font, boldFont, "Location Name:", requestInfo.LocationName, marginX, y);
  drawLabelValue(page, font, boldFont, "Contact Name:", requestInfo.ContactName, 320, y);
  y -= 16;
  drawLabelValue(page, font, boldFont, "Address:", requestInfo.Address, marginX, y);
  drawLabelValue(page, font, boldFont, "Phone No.:", requestInfo.Phone, 320, y);
  y -= 16;
  drawLabelValue(page, font, boldFont, "Email:", requestInfo.ContactEmail, 320, y);

  y -= 30;
  drawLabelValue(page, font, boldFont, "Date of Request:", dateOfRequest, marginX, y);
  y -= 16;
  drawLabelValue(page, font, boldFont, "Department/Field Trip:", requestInfo.Department, marginX, y);

  y -= 30;
  page.drawText("Additional Contact (to be CC'd with request results)", { x: marginX, y, size: 9, font, color: GRAY });
  y -= 16;
  drawLabelValue(page, font, boldFont, "Contact Name:", requestInfo.CCContactName, marginX, y);
  drawLabelValue(page, font, boldFont, "Email:", requestInfo.CCContactEmail, 320, y);

  // Driver table
  y -= 40;
  const cols = [
    { label: "Drivers' Name", width: 140 },
    { label: "Classification", width: 118 },
    { label: "State", width: 40 },
    { label: "License No.", width: 114 },
    { label: "Date of Birth", width: 100 },
  ];
  let cx = marginX;
  const tableTop = y;
  const rowHeight = 22;
  page.drawRectangle({ x: marginX, y: y - rowHeight, width: 612 - marginX * 2, height: rowHeight, color: NAVY });
  for (const col of cols) {
    page.drawText(col.label, { x: cx + 4, y: y - 15, size: 8.5, font: boldFont, color: rgb(1, 1, 1) });
    cx += col.width;
  }
  y -= rowHeight;
  page.drawRectangle({
    x: marginX, y: y - rowHeight, width: 612 - marginX * 2, height: rowHeight,
    borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5,
  });
  const values = [driver.name, driver.position, driver.state, driver.licenseNumber, driver.dateOfBirth];
  cx = marginX;
  for (let i = 0; i < cols.length; i++) {
    const cellText = truncateToWidth(values[i], font, 8.5, cols[i].width - 8);
    page.drawText(cellText, { x: cx + 4, y: y - 15, size: 8.5, font, color: BLACK });
    cx += cols[i].width;
  }

  y -= 60;
  const footer1 = wrapText(
    "Once this form has been completed, please fax it, along with a COPY OF DRIVER'S LICENSE to the attention of Yanel Koenitzer at The Archdiocese of Miami Pastoral Center., Finance Department, fax number 305-762-1026 or email at ykoenitzer@theadom.org.",
    font, 9, 612 - marginX * 2
  );
  for (const line of footer1) {
    page.drawText(line, { x: marginX, y, size: 9, font, color: BLACK });
    y -= 12;
  }
  y -= 12;
  page.drawText("NOTE: MVR Results will be processed within 48 hours of receipt.", {
    x: marginX, y, size: 9, font: boldFont, color: BLACK,
  });

  return page;
}

async function buildAuthorizationPage(pdfDoc, font, boldFont, crestImage, driver) {
  const page = pdfDoc.addPage([612, 792]);
  const marginX = 72;
  let y = 742;

  const crestWidth = 60, crestHeight = 60;
  page.drawImage(crestImage, { x: (612 - crestWidth) / 2, y: y - crestHeight + 10, width: crestWidth, height: crestHeight });
  y -= 75;
  const orgTitle = "ARCHDIOCESE OF MIAMI";
  const orgWidth = boldFont.widthOfTextAtSize(orgTitle, 16);
  page.drawText(orgTitle, { x: (612 - orgWidth) / 2, y, size: 16, font: boldFont, color: BLACK });

  y -= 45;
  const formTitle = "Authorization to Obtain Motor Vehicle Records";
  const formTitleWidth = boldFont.widthOfTextAtSize(formTitle, 11);
  page.drawText(formTitle, { x: (612 - formTitleWidth) / 2, y, size: 11, font: boldFont, color: BLACK });

  y -= 40;
  drawLabelValue(page, font, boldFont, "Name:", driver.name, marginX, y, 10);
  y -= 22;
  drawLabelValue(page, font, boldFont, "Position:", driver.position, marginX, y, 10);
  y -= 22;
  drawLabelValue(page, font, boldFont, "Driver's License Number:", driver.licenseNumber, marginX, y, 10);
  y -= 22;
  drawLabelValue(page, font, boldFont, "Date:", driver.signatureDate, marginX, y, 10);

  y -= 30;
  for (const para of CONSENT_PARAGRAPHS) {
    const lines = wrapText(para, font, 10, 612 - marginX * 2);
    for (const line of lines) {
      page.drawText(line, { x: marginX, y, size: 10, font, color: BLACK });
      y -= 14;
    }
    y -= 8;
  }

  y -= 20;
  page.drawText("Signature:", { x: marginX, y, size: 10, font: boldFont, color: BLACK });
  page.drawText(driver.signature || "", {
    x: marginX + 65, y, size: 12, font: StandardFonts ? font : font, color: BLACK,
  });
  page.drawText("Date:", { x: 400, y, size: 10, font: boldFont, color: BLACK });
  page.drawText(driver.signatureDate || "", { x: 435, y, size: 10, font, color: BLACK });
  page.drawLine({ start: { x: marginX + 60, y: y - 3 }, end: { x: 390, y: y - 3 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  page.drawLine({ start: { x: 430, y: y - 3 }, end: { x: 540, y: y - 3 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });

  y = 60;
  const footer = "9401 Biscayne Boulevard, Miami Shores, FL  33138";
  const footerWidth = font.widthOfTextAtSize(footer, 9);
  page.drawText(footer, { x: (612 - footerWidth) / 2, y: y + 12, size: 9, font, color: GRAY });
  const footer2 = "Phone: 305-762-1281";
  const footer2Width = font.widthOfTextAtSize(footer2, 9);
  page.drawText(footer2, { x: (612 - footer2Width) / 2, y, size: 9, font, color: GRAY });

  return page;
}

function extForFileName(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

async function appendLicenseFile(pdfDoc, licenseFileName, licenseFileBase64) {
  const ext = extForFileName(licenseFileName);
  const buffer = Buffer.from(licenseFileBase64, "base64");

  if (ext === "pdf") {
    const licenseDoc = await PDFDocument.load(buffer);
    const copiedPages = await pdfDoc.copyPages(licenseDoc, licenseDoc.getPageIndices());
    copiedPages.forEach((p) => pdfDoc.addPage(p));
    return;
  }

  let image;
  if (ext === "png") {
    image = await pdfDoc.embedPng(buffer);
  } else {
    // Treat anything else (jpg/jpeg or unknown) as JPEG — matches the form's accept list.
    image = await pdfDoc.embedJpg(buffer);
  }
  const page = pdfDoc.addPage([612, 792]);
  const maxWidth = 612 - 100;
  const maxHeight = 792 - 150;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (612 - w) / 2, y: (792 - h) / 2, width: w, height: h });
}

// Builds one combined MVR packet PDF for a single driver: the Request Approval
// Form page, the Authorization consent page, then the driver's license
// photo/scan appended as additional page(s) — mirrors the packet Gaston
// currently assembles by hand (Approval form + Authorization form + license copy).
async function generateMvrPacket({ requestInfo, dateOfRequest, driver, licenseFileName, licenseFileBase64 }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const crestBytes = fs.readFileSync(CREST_PATH);
  const crestImage = await pdfDoc.embedJpg(crestBytes);

  await buildApprovalPage(pdfDoc, font, boldFont, crestImage, requestInfo, driver, dateOfRequest);
  await buildAuthorizationPage(pdfDoc, font, boldFont, crestImage, driver);
  if (licenseFileBase64 && licenseFileName) {
    await appendLicenseFile(pdfDoc, licenseFileName, licenseFileBase64);
  }

  return pdfDoc.save();
}

// Matches Gaston's existing naming convention (e.g. "GonzalezJ.pdf" for
// "Gonzalez, Janelys Marie" or "Janelys Gonzalez") — last name + first initial.
function packetFileName(name) {
  let first = "", last = "";
  if (name.includes(",")) {
    const [l, rest] = name.split(",");
    last = l.trim();
    first = (rest.trim().split(/\s+/)[0] || "");
  } else {
    const parts = name.trim().split(/\s+/);
    first = parts[0] || "";
    last = parts[parts.length - 1] || "";
  }
  const safeLast = last.replace(/[^A-Za-z]/g, "") || "Driver";
  const safeInitial = (first[0] || "X").toUpperCase();
  return `${safeLast}${safeInitial}.pdf`;
}

module.exports = { generateMvrPacket, packetFileName };
