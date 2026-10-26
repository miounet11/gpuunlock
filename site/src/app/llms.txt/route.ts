import { DEVICES, ACCEPTED_IDS } from "@/data/devices";
import { BENCH_RUNS } from "@/data/benchmarks";
import { MODE_GROUPS, groupSlug } from "@/data/modes";
import { INSTALL_SITE, REPOS, SITE } from "@/lib/site";

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
  lines.push("- The kernel modules are Linux only. They must load before the stock NVIDIA driver, via initramfs.");
  lines.push(
    "- Windows is covered by a separate EFI implementation, impacifist/Windows-GPU-UNLOCK, which runs before Windows boots instead of inside it. It publishes no stock-vs-unlocked pair, so no gain is quoted for it.",
  );
  lines.push("");
  lines.push("## Pages");
  lines.push(`- [Home](${SITE}/en): overview, headline numbers, quick table`);
  lines.push(`- [Cards](${SITE}/en/gpus): every device the module matches, with status per card`);
  lines.push(`- [Benchmarks](${SITE}/en/benchmarks): full stock-vs-unlocked rows, including the rows that did not move`);
  lines.push(
    `- [Windows port](${SITE}/en/windows): the UEFI route for Windows, its recorded profiles, boot paths and requirements`,
  );
  lines.push(
    `- [Install guide](${INSTALL_SITE}/en/install): initramfs ordering, kernel parameters, verification, rollback`,
  );
  lines.push(
    `- [FAQ](${INSTALL_SITE}/en/faq): module choice, Windows support, safety, failure modes`,
  );
  lines.push("");
  // One line per mode, generated from MODE_GROUPS so a new measured mode appears here
  // without a second edit. These pages answer "what can this card do on this path", which
  // is the question the flat benchmark table does not answer directly.
  lines.push("## Mode pages");
  lines.push("");
  for (const g of MODE_GROUPS) {
    lines.push(
      `- [${g.id}](${SITE}/en/benchmarks/${groupSlug(g.id)}): ${g.exercises}${g.gated ? " (rate-limited by the speed-select fuse)" : " (not rate-limited)"}`,
    );
  }
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
    // The 2080 Ti rows are four GEMM sizes of the same mode, so printing mode alone gives
    // four identical lines and the reader cannot tell them apart. When a mode repeats, the
    // row's own leading note ("M.N.K 1024: ...") is the discriminator the data already
    // carries; it is used rather than the iteration count, which means something different
    // per card (M.N.K size here, timed iterations elsewhere).
    const counts = new Map<string, number>();
    for (const r of run.rows) counts.set(r.mode, (counts.get(r.mode) ?? 0) + 1);
    for (const r of run.rows) {
      const repeated = (counts.get(r.mode) ?? 0) > 1;
      const label = repeated && r.note ? ` [${r.note.split(":")[0].trim()}]` : "";
      lines.push(`- ${r.mode}${label}: ${r.stock} -> ${r.unlocked} ${r.unit} (${r.ratio}x)`);
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
