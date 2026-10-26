// Facts for the Windows / UEFI port (impacifist/Windows-GPU-UNLOCK).
//
// Everything here is taken from that repository's README and its compatibility guide.
// It is a different implementation from the Linux kernel modules this site documents:
// an EFI payload that runs before Windows boots, not a module that loads from an
// initramfs. The two must not be described with the same vocabulary, and the port
// publishes no stock-vs-unlocked pair, so no gain number is claimed here.

export const WINDOWS_REPO = "https://github.com/impacifist/Windows-GPU-UNLOCK";
export const WINDOWS_RELEASE = "v0.3.1";

/**
 * Guides are pinned to the release tag by default, so a link cannot drift silently.
 * The USB route landed after v0.3.1 was tagged, so that one guide only exists on main.
 */
export function windowsDocUrl(path: string, ref: string = WINDOWS_RELEASE): string {
  return `${WINDOWS_REPO}/blob/${ref}/${path}`;
}

/** Reports are per card *and* per system; the same GPU model elsewhere is not covered. */
export interface WindowsCard {
  card: string;
  chip: string;
  status: "recorded" | "reported" | "upstream-target";
  route: string;
}

export const WINDOWS_CARDS: WindowsCard[] = [
  {
    card: "RTX 3090 FE 24 GB",
    chip: "GA102",
    status: "recorded",
    route: "Internal headless — default profile (ASUS TUF B650M)",
  },
  {
    card: "RTX 3070 Ti 8 GB",
    chip: "GA104",
    status: "reported",
    route: "Internal headless (ASUS TUF B660M-E D4)",
  },
  {
    card: "RTX 3090 Ti 24 GB",
    chip: "GA102",
    status: "reported",
    route: "Headless USB only (Gigabyte X870 Aorus Elite WiFi7)",
  },
  {
    card: "RTX 3060 12 GB",
    chip: "GA104",
    status: "reported",
    route: "Headless USB only (ASUS Prime B660-Plus D4)",
  },
  {
    card: "RTX 3080",
    chip: "GA102",
    status: "upstream-target",
    route: "No dedicated profile in this port",
  },
];

export interface WindowsPath {
  name: string;
  display: string;
  guide: string;
  /** Only set when the guide is absent from the tagged release. */
  ref?: string;
}

export const WINDOWS_PATHS: WindowsPath[] = [
  {
    name: "Internal headless",
    display: "Monitors on the RTX card, display temporarily removed, no T/U/Enter input",
    guide: "docs/HEADLESS.en.md",
  },
  {
    name: "Headless USB",
    display: "Profile-specific wrapper and child staged on a FAT32 USB stick",
    guide: "docs/HEADLESS-USB.en.md",
    ref: "main",
  },
  {
    name: "Internal AMD-display manual / auto",
    display: "Motherboard or iGPU display preserved; the manual variant needs U",
    guide: "docs/INTERNAL-BOOT.en.md",
  },
  {
    name: "Legacy USB manual",
    display: "AMD/iGPU display profile; U once, then Boot Override to Windows without a reset",
    guide: "docs/GUIDE.en.md",
  },
];

export const WINDOWS_REQUIREMENTS: string[] = [
  "Exact supported hardware from a recorded profile — a matching GPU model on another board is not covered.",
  "A separate GPT FAT32 EFI System Partition of at least 1 GiB. An ordinary FAT32 data partition does not qualify.",
  "The existing Windows ESP and recovery partition preserved; the tools never create, shrink or format partitions.",
  "Secure Boot disabled, a fully decrypted Windows C: with BitLocker protection off, and a connected keyboard.",
  "Python 3.9+, clang/lld-link 20.1.8, the pinned repository dependencies and five firmware assets obtained locally.",
];

export interface WindowsStep {
  id: string;
  title: string;
  body: string;
  code?: string;
  note?: string;
}

export const WINDOWS_STEPS: WindowsStep[] = [
  {
    id: "prepare",
    title: "Prepare a second ESP, not a data partition",
    body:
      "The port boots from its own EFI System Partition and leaves Windows' ESP and recovery partition untouched. It does not create, shrink, delete or format anything: you prepare a GPT FAT32 partition of at least 1 GiB and give it a letter.",
    note:
      "An ordinary FAT32 data partition is not a substitute. The tools also do not disable BitLocker — decrypt C: and turn protection off first.",
  },
  {
    id: "configure",
    title: "Configure and build from an elevated PowerShell",
    body:
      "Both scripts run from the repository root in an administrator PowerShell. Configuration and build stage no boot entry by themselves.",
    code:
      ".\\internal-boot\\Configure.ps1 -UnlockDriveLetter U `\n  -WindowsEspGuid 'YOUR-WINDOWS-ESP-GUID'\n.research\\headless\\build-unlock.ps1 `\n  -Clang 'C:\\TOOLS\\LLVM20\\bin\\clang.exe' `\n  -LldLink 'C:\\TOOLS\\LLVM20\\bin\\lld-link.exe'",
    note:
      "Use your own partition GUID and tool paths. Without an action switch, `Headless.ps1 -Assets '.\\assets'` only stages files.",
  },
  {
    id: "register",
    title: "Register a separate F8 test entry first",
    body:
      "Registering adds its own test entry and keeps your existing boot priority. Automatic boot is a separate, explicit action and stays off until the F8 test has actually worked.",
    code: ".\\internal-boot\\Headless.ps1 -Assets '.\\assets' -Register",
    note:
      "On the tested ASUS firmware the entry appears as F8 → GPU Headless UNLOCK - EXPERIMENTAL.",
  },
  {
    id: "test",
    title: "Run one F8 test and wait",
    body:
      "Save your work and fully power off, then pick the test entry. Do not press T, U or Enter. The screen goes black while the RTX GOP is removed; the child attempts once and the wrapper starts Windows directly.",
    note:
      "Do not reset between the unlock and Windows. The two Esc windows differ: Esc in the initial wrapper boots Windows without the release, while Esc in the later three-second child window cancels into a stop and does not restore the display.",
  },
  {
    id: "automatic",
    title: "Only then enable automatic boot",
    body:
      "After the F8 test succeeds and the display recovers, automatic boot can be enabled. That action places headless first, Windows Boot Manager second, and disables Windows Fast Startup. Registering the test entry alone does nothing like this.",
    code: ".\\internal-boot\\Headless.ps1 -EnableAutomatic -ConfirmedSuccess",
    note:
      "`-ConfirmedSuccess` is the acknowledgement that you personally saw the test boot work.",
  },
  {
    id: "recover",
    title: "Recovery is Windows-first and independent of the build",
    body:
      "If the handoff fails or Windows does not return, power off fully and choose F8 → Windows Boot Manager, or run the restore switch. Windows-first recovery works without saved state.",
    code: ".\\internal-boot\\Headless.ps1 -RestoreWindowsFirst",
    note:
      "Restoring the previous Fast Startup setting does need the saved state, so keep it and keep backups.",
  },
];

export interface WindowsMeasurement {
  path: string;
  value: string;
}

/** Recorded on the original B650M profile; CUDA 12.6 / cuBLAS 12.6, 4096 x 4096, median of three runs. */
export const WINDOWS_MEASUREMENTS: WindowsMeasurement[] = [
  { path: "FP32 pedantic", value: "22.85 TFLOPS" },
  { path: "FP16 Tensor / FP32 accumulate", value: "124.97 TFLOPS" },
  { path: "BF16 Tensor / FP32 accumulate", value: "128.93 TFLOPS" },
];

/** The register write and teardown the recording run reported. */
export const WINDOWS_TEARDOWN: string[] = [
  "SS0 read back as 0x88888888",
  "SS1 read back as 0x8",
  "Bus-master enable disabled",
  "Zero remaining mappings",
  "Cleanup completed and one FLR performed",
];

export const WINDOWS_SCOPE: string[] = [
  "Later main-branch hardening added host and build checks, not a new physical boot or recovery test.",
  `The latest tag, ${WINDOWS_RELEASE}, is a source-only pre-release; the tree carries changes beyond it, including the USB route and the X870 profile.`,
  "Firmware assets and partition-specific EFI binaries are not bundled — you build locally with your own partition GUIDs.",
  "A generated local profile does not add another verified machine profile.",
];

export const WINDOWS_LICENSE: string =
  "GPL-2.0-only for the port and the reused core; EDK2 and separately attributed components keep their own licences. Based on rough2515-hub/rtx3080-unlock-public and Zagitta/gpu-unlock. NVIDIA firmware, PROM/BIOS images, drivers and CUDA DLLs are not redistributed in the source release.";
