// Lumen Fabricate — presentation export.
// Builds a valid PowerPoint .pptx (OOXML) with no dependencies: slides carry
// a title + bullet body. STORE-only ZIP keeps the writer tiny and portable;
// PowerPoint, LibreOffice and Google Slides all open it.

import { buildZip } from './exporters';

export interface Slide {
  title: string;
  bullets: string[];
}

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CONTENT_TYPES = `${XML_HEAD}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${Array.from({ length: 30 }, (_, i) => `  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n')}
</Types>`;

const ROOT_RELS = `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

const PRESENTATION_RELS = (slideCount: number): string => `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
${Array.from({ length: slideCount }, (_, i) => `  <Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('\n')}
</Relationships>`;

const PRESENTATION = (slideCount: number): string => `${XML_HEAD}
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${Array.from({ length: slideCount }, (_, i) => `  <p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst>
<p:sldSz cx="9144000" cy="6858000"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

const MASTER = `${XML_HEAD}
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Lumen"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B0E1A"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;

const MASTER_RELS = `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const LAYOUT = `${XML_HEAD}
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title">
<p:cSld name="Title"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`;

const LAYOUT_RELS = `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const THEME = `${XML_HEAD}
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lumen"><a:themeElements>
<a:clrScheme name="Lumen"><a:dk1><a:srgbClr val="DCE1FF"/></a:dk1><a:lt1><a:srgbClr val="0B0E1A"/></a:lt1>
<a:dk2><a:srgbClr val="8B5CF6"/></a:dk2><a:lt2><a:srgbClr val="22D3EE"/></a:lt2>
<a:accent1><a:srgbClr val="8B5CF6"/></a:accent1><a:accent2><a:srgbClr val="22D3EE"/></a:accent2>
<a:accent3><a:srgbClr val="E879F9"/></a:accent3><a:accent4><a:srgbClr val="60A5FA"/></a:accent4>
<a:accent5><a:srgbClr val="34D399"/></a:accent5><a:accent6><a:srgbClr val="FBBF24"/></a:accent6>
<a:hlink><a:srgbClr val="22D3EE"/></a:hlink><a:folHlink><a:srgbClr val="8B5CF6"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Lumen"><a:majorFont><a:latin typeface="Segoe UI"/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Lumen"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
</a:themeElements></a:theme>`;

function slideXml(i: number, slide: Slide): string {
  const bullets = slide.bullets
    .map(
      (b) => `<a:p><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="B9C2E8"/></a:solidFill></a:rPr><a:t>${esc(b)}</a:t></a:r></a:p>`,
    )
    .join('');
  return `${XML_HEAD}
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Title ${i + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"><a:solidFill><a:srgbClr val="8B5CF6"/></a:solidFill></a:rPr><a:t>${esc(slide.title)}</a:t></a:r></a:p></p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="3" name="Body ${i + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="457200" y="1500000"/><a:ext cx="8229600" cy="5000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/>${bullets}</p:txBody>
</p:sp>
</p:spTree></p:cSld>
</p:sld>`;
}

const SLIDE_RELS = `${XML_HEAD}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

/** Builds a .pptx file (Uint8Array) for the given deck. */
export function buildPptx(slides: Slide[]): Uint8Array {
  const enc = new TextEncoder();
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'ppt/presentation.xml', data: enc.encode(PRESENTATION(slides.length)) },
    { name: 'ppt/_rels/presentation.xml.rels', data: enc.encode(PRESENTATION_RELS(slides.length)) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: enc.encode(MASTER) },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: enc.encode(MASTER_RELS) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: enc.encode(LAYOUT) },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: enc.encode(LAYOUT_RELS) },
    { name: 'ppt/theme/theme1.xml', data: enc.encode(THEME) },
  ];
  slides.forEach((s, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: enc.encode(slideXml(i, s)) });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: enc.encode(SLIDE_RELS) });
  });
  return buildZip(files);
}

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Standalone HTML slide deck — opens in any browser, printable to PDF. */
export function slidesHtml(title: string, slides: Slide[]): string {
  const body = slides
    .map(
      (s, i) => `<section class="slide"><div class="num">${String(i + 1).padStart(2, '0')}</div>
<h1>${escHtml(s.title)}</h1><ul>${s.bullets.map((b) => `<li>${escHtml(b)}</li>`).join('')}</ul></section>`,
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
:root{color-scheme:dark}body{margin:0;background:#04050d;color:#e6e9ff;font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif}
.slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:8vh 10vw;box-sizing:border-box;border-bottom:1px solid #1c2140}
.num{font-family:ui-monospace,monospace;color:#22d3ee;font-size:12px;letter-spacing:.2em;margin-bottom:2vh}
h1{font-size:clamp(28px,4.5vw,56px);margin:0 0 4vh;background:linear-gradient(90deg,#8b5cf6,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
li{font-size:clamp(15px,2vw,22px);line-height:1.7;color:#b9c2e8;margin-bottom:1.2vh}
@media print{.slide{page-break-after:always;border:none}}
</style></head><body>${body}</body></html>`;
}
