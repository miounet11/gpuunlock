import { DEVICES, ACCEPTED_IDS } from "@/data/devices";
import { BENCH_RUNS } from "@/data/benchmarks";
import { REPOS, SITE } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [];
  // Count the two modules separately: the merge covers GA10x/AD10x, Turing is its own project,
  // and one combined number would read as if a single module handled all eight architectures.
  const mergedIds = Object.entries(ACCEPTED_IDS)
    .filter(([chip]) => !chip.startsWith("TU"))
    .reduce((n, [, ids]) => n + ids.length, 0);
  const turingIds = Object.entries(ACCEPTED_IDS)
    .filter(([chip]) => chip.startsWith("TU"))
    .reduce((n, [, ids]) => n + ids.length, 0);
  const measured = DEVICES.filter((d) => d.status === "measured");

  lines.push("# GPU Unlock");
  lines.push("");
  lines.push(
    "> Documentation for the GPU Unlock NVIDIA kernel module, which enables the SM speed-select override. The merged module is maintained here from two upstream projects: Zagitta/gpu-unlock (Ampere) and JustAResearcher/gpu-unlock-ada (Ada), plus a suspend/resume re-unlock path. RTX 20 series cards use a separate module, nlzy/turing-unlock. Every number on this site comes from those repositories' evidence folders.",
  );
  lines.push("");
  lines.push("Key facts:");
  lines.push(`- ${mergedIds} PCI device IDs are accepted by the merged Ampere/Ada module across AD102, AD103, GA102, GA103, GA104 and GA106.`);
  lines.push(`- ${turingIds} more PCI device IDs are accepted by the separate Turing module across TU102, TU104 and TU106.`);
  lines.push(`- Exactly ${measured.length} cards have published same-card stock-vs-unlocked measurements: ${measured.map((d) => d.name.replace("GeForce ", "")).join(", ")}.`);
  lines.push("- Peak tensor gain is 2x, and only on f16/f32 and bf16/f32 on RTX 4090. FP32, INT8 and FP8 paths were never rate-limited.");
  lines.push("- Linux only. The module must load before the stock NVIDIA driver, via initramfs.");
  lines.push("");
  lines.push("## Pages");
  lines.push(`- [Home](${SITE}/en): overview, headline numbers, quick table`);
  lines.push(`- [Cards](${SITE}/en/gpus): every device the module matches, with status per card`);
  lines.push(`- [Benchmarks](${SITE}/en/benchmarks): full stock-vs-unlocked rows, including the rows that did not move`);
  lines.push(`- [Install](${SITE}/en/install): initramfs ordering, kernel parameters, verification, rollback`);
  lines.push(`- [FAQ](${SITE}/en/faq): Windows support, safety, driver requirements, failure modes`);
  lines.push("");
  lines.push("## Confirmed cards");
  lines.push("");
  for (const d of measured) {
    lines.push(`### ${d.name} (${d.chip}, ${d.pciId})`);
    lines.push(`- Status: measured on the same card`);
    lines.push(`- Gain: +${d.gainMin}${d.gainMax && d.gainMax !== d.gainMin ? `-${d.gainMax}` : ""}% on tensor f16/f32 paths`);
    lines.push(`- Page: ${SITE}/en/gpus/${d.slug}`);
    lines.push(`- Evidence: ${d.sources[0]}`);
    lines.push("");
  }
  lines.push("## Benchmark rows");
  lines.push("");
  for (const run of BENCH_RUNS) {
    lines.push(`### ${run.card} (${run.chip})`);
    for (const r of run.rows) {
      lines.push(`- ${r.mode}: ${r.stock} -> ${r.unlocked} ${r.unit} (${r.ratio}x)`);
    }
    lines.push("");
  }
  lines.push("## Source repositories");
  lines.push(`- Ampere module: ${REPOS.ampere}`);
  lines.push(`- Ada module: ${REPOS.ada}`);
  lines.push(`- Merged module and install walkthrough: ${REPOS.usage}`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
