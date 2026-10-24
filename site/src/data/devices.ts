// Every entry here is taken from one of the two upstream repositories, not invented.
//
//   Zagitta/gpu-unlock        v1.0.0  — GA102/GA103/GA104/GA106 module + packaging
//   JustAResearcher/gpu-unlock-ada v1.1.1 — adds AD102 (RTX 4090) and an experimental AD103 canary
//
// `status` records what the upstream reports say, and nothing stronger:
//   measured   the fork published a same-card stock-vs-unlocked measurement
//   reported   a user filed a compatibility report; the fork did not revalidate it
//   partial    the unlock completes but the throughput gain does not materialise
//   untested   the module accepts the device id, nobody has reported a result
//   unsupported  deliberately not accepted by the module

export type DeviceStatus = "measured" | "reported" | "partial" | "untested" | "unsupported";

export interface Device {
  slug: string;
  chip: string;
  name: string;
  pciId: string;
  vendor: "NVIDIA";
  status: DeviceStatus;
  /** Same-card floor of the reported GEMM gain, in percent. Null when nobody measured it. */
  gainMin: number | null;
  gainMax: number | null;
  /** Which upstream fork carries support. */
  fork: "both" | "ada" | "ampere";
  notes: string;
  sources: string[];
}

export const DEVICES: Device[] = [
  {
    slug: "rtx-4090",
    chip: "AD102",
    name: "GeForce RTX 4090",
    pciId: "10de:2684",
    vendor: "NVIDIA",
    status: "measured",
    gainMin: 99,
    gainMax: 100,
    fork: "ada",
    notes:
      "The only Ada card with published same-card numbers. The signed firmware runs, the payload's completion marker and permissions are checked, SS0 is written 0x88888888 and SS1 0x8, then FLR happens before the unmodified NVIDIA driver binds. No patched driver and no UEFI application.",
    sources: [
      "https://github.com/JustAResearcher/gpu-unlock-ada/blob/main/docs/evidence/rtx4090/README.md",
    ],
  },
  {
    slug: "rtx-4070-ti-super",
    chip: "AD103",
    name: "GeForce RTX 4070 Ti SUPER",
    pciId: "10de:2705",
    vendor: "NVIDIA",
    status: "measured",
    gainMin: 99,
    gainMax: 99,
    fork: "ada",
    notes:
      "Experimental, validated on one card. Requires both gpu_unlock.ad103_experimental=1 and gpu_unlock.targets= set to that single exact PCI address; targets=all never selects it. Two cold boots and later warm reboots confirmed driver 580.178.04 handoff.",
    sources: [
      "https://github.com/JustAResearcher/gpu-unlock-ada/blob/main/docs/evidence/ada2705/README.md",
    ],
  },
  {
    slug: "rtx-3090-ti",
    chip: "GA102",
    name: "GeForce RTX 3090 Ti",
    pciId: "10de:2203",
    vendor: "NVIDIA",
    status: "reported",
    gainMin: 68,
    gainMax: 80,
    fork: "both",
    notes: "Unlocked according to the compatibility report. BF16 GEMM gain of +68–80%.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/1"],
  },
  {
    slug: "rtx-3090",
    chip: "GA102",
    name: "GeForce RTX 3090",
    pciId: "10de:2204",
    vendor: "NVIDIA",
    status: "reported",
    gainMin: 25,
    gainMax: 67,
    fork: "both",
    notes:
      "The most-reported card on the Ampere fork, across seven issue threads. Gain spread is wide because the reports come from different workloads.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/5"],
  },
  {
    slug: "rtx-3080-ti-20gb",
    chip: "GA102",
    name: "GeForce RTX 3080 Ti 20 GB (OEM, GA102-250)",
    pciId: "10de:2205",
    vendor: "NVIDIA",
    status: "partial",
    gainMin: null,
    gainMax: null,
    fork: "both",
    notes:
      "The unlock completes but BF16 stays at half rate. This is the clearest example of the gap between 'the module loaded' and 'the card is faster'.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/28"],
  },
  {
    slug: "rtx-3080-10gb",
    chip: "GA102",
    name: "GeForce RTX 3080 10 GB",
    pciId: "10de:2206",
    vendor: "NVIDIA",
    status: "reported",
    gainMin: 70,
    gainMax: 73,
    fork: "both",
    notes: "Unlocked. BF16 GEMM gain of +70–73%.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/14"],
  },
  {
    slug: "rtx-3080-20gb",
    chip: "GA102",
    name: "GeForce RTX 3080 20 GB (memory upgrade)",
    pciId: "10de:2206",
    vendor: "NVIDIA",
    status: "reported",
    gainMin: 56,
    gainMax: 59,
    fork: "both",
    notes:
      "Same device id as the 10 GB board, different memory configuration, different gain. Worth knowing that a device id does not pin down the result.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/10"],
  },
  {
    slug: "rtx-3070",
    chip: "GA104",
    name: "GeForce RTX 3070",
    pciId: "10de:2484",
    vendor: "NVIDIA",
    status: "reported",
    gainMin: 73,
    gainMax: 81,
    fork: "both",
    notes: "Unlocked. BF16 GEMM gain of +73–81%.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/12"],
  },
  {
    slug: "rtx-3070-ti",
    chip: "GA104",
    name: "GeForce RTX 3070 Ti",
    pciId: "10de:2482",
    vendor: "NVIDIA",
    status: "untested",
    gainMin: null,
    gainMax: null,
    fork: "ampere",
    notes:
      "Not tested with this module. The same unlock was reported to work from a UEFI port on Windows, which is a different mechanism and does not transfer.",
    sources: ["https://github.com/Zagitta/gpu-unlock/issues/32"],
  },
  {
    slug: "rtx-3060-12gb",
    chip: "GA106",
    name: "GeForce RTX 3060 12 GB",
    pciId: "10de:2504",
    vendor: "NVIDIA",
    status: "reported",
    gainMin: 80,
    gainMax: 80,
    fork: "both",
    notes:
      "Unlocked, about +80% BF16 GEMM. This is also the only GA106 device the fork validated.",
    sources: ["https://github.com/Zagitta/gpu-unlock/pull/13"],
  },
  {
    slug: "ga103-2414",
    chip: "GA103",
    name: "GA103 (any board)",
    pciId: "10de:2414",
    vendor: "NVIDIA",
    status: "untested",
    gainMin: null,
    gainMax: null,
    fork: "both",
    notes:
      "The module accepts this id. Upstream marks it untested and there are no compatibility reports, so there is nothing to promise.",
    sources: ["https://github.com/Zagitta/gpu-unlock"],
  },
];

/** Every device id the module matches, including ones with no report and no page. */
export const ACCEPTED_IDS = {
  AD102: ["0x2684"],
  AD103: ["0x2705"],
  GA102: [
    "0x2200", "0x2203", "0x2204", "0x2205", "0x2206", "0x2207", "0x2208",
    "0x220a", "0x220d", "0x2216", "0x222b", "0x222f",
  ],
  GA103: ["0x2414"],
  GA104: [
    "0x2480", "0x2482", "0x2483", "0x2484", "0x2486", "0x2487", "0x2488", "0x2489",
    "0x248a", "0x248c", "0x248d", "0x248e", "0x249c", "0x249d", "0x249f", "0x24a0",
    "0x24a4", "0x24ac", "0x24ad", "0x24af", "0x24bf", "0x24c0", "0x24c7", "0x24c8",
    "0x24c9", "0x24dc", "0x24dd", "0x24df", "0x24e0",
  ],
  GA106: [
    "0x2501", "0x2503", "0x2504", "0x2505", "0x2507", "0x2508", "0x2509", "0x252f",
    "0x2544",
  ],
} as const;

export function getDevice(slug: string): Device | undefined {
  return DEVICES.find((d) => d.slug === slug);
}

export function acceptedCount(): number {
  return Object.values(ACCEPTED_IDS).reduce((n, ids) => n + ids.length, 0);
}
