import { FORMATS } from '../formats';
import { serializeProject, slugify } from '../model/project';
import { fmtInt, fmtLen, sewMinutes } from '../model/units';
import type { FileFormat, Project, StitchPattern, StitchPlan } from '../model/types';
import { getFabric, getMachine, hoopLabel, THREAD_CHARTS } from '../presets';

export function planToPattern(project: Project, plan: StitchPlan): StitchPattern {
  return {
    name: project.name,
    xs: plan.xs,
    ys: plan.ys,
    cmds: plan.cmds,
    threads: plan.colorBlocks.map((id) => {
      const t = project.threads.find((x) => x.id === id);
      return { hex: t?.hex ?? '#000000', name: t?.name ?? 'Thread', chartCode: t?.chartCode ?? null };
    }),
  };
}

export function encodeFormat(format: FileFormat, project: Project, plan: StitchPlan): Uint8Array {
  return FORMATS[format].write(planToPattern(project, plan));
}

export function downloadBytes(bytes: Uint8Array | string, fileName: string, mime = 'application/octet-stream') {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadProjectJson(project: Project) {
  downloadBytes(serializeProject(project), `${slugify(project.name)}.tatami.json`, 'application/json');
}

/** Printable color sheet: thumbnail, colors in order, size, stitch count. jsPDF loads on demand. */
export async function colorSheetPdf(project: Project, plan: StitchPlan, thumbnail?: string): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const chart = THREAD_CHARTS.find((c) => c.id === project.threadChart)?.name ?? 'Madeira';
  const b = plan.bounds;
  const w = b ? b.maxX - b.minX : 0;
  const h = b ? b.maxY - b.minY : 0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(project.name, 18, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('Color sheet · tatami.ninja', 18, 28);
  doc.setTextColor(20);
  if (thumbnail) {
    try {
      doc.addImage(thumbnail, 'PNG', 18, 36, 80, 60);
    } catch {
      /* thumbnail is optional */
    }
  }
  const rows: [string, string][] = [
    ['Stitches', fmtInt(plan.stitchCount)],
    ['Size', `${fmtLen(w, 'mm')} × ${fmtLen(h, 'mm')} mm`],
    ['Hoop', `${hoopLabel(project.hoop)} mm`],
    ['Fabric', getFabric(project.fabricPreset).name],
    ['Machine', getMachine(project.machine.brand).name],
    ['Colors', String(plan.colorBlocks.length)],
    ['Color changes', String(plan.colorChanges)],
    ['Trims', String(plan.trims)],
    ['Est. sew time', `≈ ${Math.max(1, Math.round(sewMinutes(plan.stitchCount, project.spm ?? 800)))} min`],
  ];
  let y = 42;
  for (const [k, v] of rows) {
    doc.setTextColor(110);
    doc.text(k, 108, y);
    doc.setTextColor(20);
    doc.text(v, 192, y, { align: 'right' });
    y += 6.5;
  }
  y = Math.max(y, 104) + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Thread order · ${chart}`, 18, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 8;
  const stats = colorBlockStats(project, plan);
  stats.forEach((s, i) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    const [r, g, bb] = [1, 3, 5].map((k) => parseInt(s.hex.slice(k, k + 2), 16));
    doc.setFillColor(r, g, bb);
    doc.setDrawColor(160);
    doc.circle(24, y - 1.3, 3, 'FD');
    doc.setTextColor(110);
    doc.text(String(i + 1), 18, y);
    doc.setTextColor(20);
    doc.text(s.name, 31, y);
    doc.setTextColor(110);
    doc.text(s.hex, 90, y);
    doc.text(s.chartCode ?? '—', 120, y);
    doc.text(`${fmtInt(s.stitches)} stitches`, 192, y, { align: 'right' });
    doc.setTextColor(20);
    y += 9;
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

export function colorBlockStats(project: Project, plan: StitchPlan) {
  const counts = plan.colorBlocks.map(() => 0);
  let block = 0;
  for (let i = 0; i < plan.cmds.length; i++) {
    if (plan.cmds[i] === 3) block++;
    else if (plan.cmds[i] === 0 && counts[block] !== undefined) counts[block]++;
  }
  return plan.colorBlocks.map((id, i) => {
    const t = project.threads.find((x) => x.id === id);
    return { id, name: t?.name ?? 'Thread', hex: t?.hex ?? '#000000', chartCode: t?.chartCode ?? null, stitches: counts[i] };
  });
}

export function fileBaseName(project: Project): string {
  const n = project.source === 'stitch-file' ? project.name.replace(/\.[^.]+$/, '') : project.name;
  return slugify(n);
}
