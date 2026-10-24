// Reconstructed from the two upstream READMEs. Command lines are copied from them; the prose is
// condensed, not invented. Where the upstreams differ the Ada fork is named explicitly.

export const REQUIREMENTS: string[] = [
  "Linux with kernel headers and a working DKMS toolchain (both forks).",
  "GPL-2.0-only source built locally — the pinned NVIDIA firmware is downloaded and generated on your own machine.",
  "An unmodified stock boot entry kept available, so a failed unlock is recoverable.",
  "A card whose PCI ID is in the module's accepted list (see the cards index).",
];

export interface InstallStep {
  id: string;
  title: string;
  body: string;
  code?: string;
  note?: string;
}

export const INSTALL_STEPS: InstallStep[] = [
  {
    id: "pick-fork",
    title: "One repository covers both card families",
    body:
      "The Ampere fork (Zagitta/gpu-unlock, v1.0.0) covers GA102, GA103, GA104 and GA106. The Ada fork (JustAResearcher/gpu-unlock-ada, v1.1.1) is that same module with AD102 (RTX 4090) and an experimental AD103 canary added. This repository merges the two, and additionally carries the suspend/resume re-unlock path, so a single clone covers Ampere and Ada.",
    note:
      "The merged module keeps the original GeForce/CMP GA102 and GA104 lists plus the GA103/GA106 list and the AD102/AD103 entries. Professional RTX A-series and data-centre parts are not accepted.",
  },
  {
    id: "clone",
    title: "Clone and build the packages locally",
    body:
      "The module builds on the target machine rather than shipping prebuilt binaries, because the firmware generation step is pinned to the NVIDIA firmware you already have installed.",
    code: "git clone https://github.com/miounet11/gpuunlock.git\ncd gpuunlock\nmake install",
    note:
      "`make install` detects the distribution family. Explicit targets are `make install-arch`, `make install-deb` and `make install-rpm`. Kernel headers and a DKMS toolchain must already be present.",
  },
  {
    id: "initramfs",
    title: "Let the package wire the module into the initramfs",
    body:
      "The unlock only applies if `gpu_unlock` loads before the NVIDIA driver binds the card. Loading the module manually afterwards cannot unlock it, so the packages put the module and its firmware into the initramfs and load it there.",
    code:
      "# mkinitcpio: /etc/mkinitcpio.conf.d/zz-gpu-unlock.conf\n# initramfs-tools: /usr/share/initramfs-tools/modules.d/gpu-unlock.conf\n# dracut: /usr/lib/dracut/dracut.conf.d/gpu-unlock.conf",
    note:
      "With initramfs-tools and dracut the module is rebuilt for every installed kernel that has headers, and images are rebuilt on install and on removal. Kernels installed later get the module from their own install hooks. mkinitcpio ignores drop-ins for an image built with `-c <config>` or a preset `_config` — put `gpu_unlock` right before `nvidia` in that config's MODULES yourself.",
  },
  {
    id: "opt-in",
    title: "Opt in on the kernel command line",
    body:
      "The module does nothing unless the kernel command line asks for it. Set `gpu_unlock.targets=` to `all` for the Ampere path, or to explicit PCI addresses.",
    code: "gpu_unlock.targets=all",
    note:
      "There is no `softdep nvidia pre:` rule on purpose: kmod honours only the first `softdep nvidia` line it reads, so another package's rule would silently win. Boot order is handled by the initramfs drop-in instead.",
  },
  {
    id: "ad103",
    title: "AD103 needs two opt-ins and one exact address",
    body:
      "RTX 4070 Ti SUPER (`10de:2705`) is experimental and validated on a single card. It requires both `gpu_unlock.ad103_experimental=1` and `gpu_unlock.targets=` set to that card's single exact PCI address. `targets=all` never selects it.",
    code: "gpu_unlock.ad103_experimental=1 gpu_unlock.targets=0000:21:00.0",
    note:
      "Other Ada IDs, professional A-series and data-centre parts are not accepted. Shared firmware across Ada chips does not establish support for untested cards.",
  },
  {
    id: "resume",
    title: "Know what happens across suspend",
    body:
      "The module reapplies the override on resume, which can reset a display card. Add `gpu_unlock.resume=0` to the kernel command line — or write `0` to `/sys/module/gpu_unlock/parameters/resume` — to turn that off. Hibernation is not covered either way.",
  },
  {
    id: "make-persistent",
    title: "Persist the boot entry only after a cold boot works",
    body:
      "Validate one cold boot and one warm reboot on the exact card first. Only then make the bootloader entry persistent. Keep an unmodified stock entry available, and re-verify `gpu_unlock: unlocked`, the rate readback and GPU health after each boot.",
    note:
      "The tested canary uses a kernel-version-specific image; regenerate and revalidate it before removing its pinned kernel during an upgrade.",
  },
  {
    id: "avoid",
    title: "Do not let the driver load early",
    body:
      "Avoid `nvidia-smi`, CUDA, NVML and `nvidia-modprobe` before a manual cold-card attempt: they can load NVIDIA by name, and ordinary modprobe blacklist rules do not block explicit named loads. The packaged initramfs flow avoids the need for manual firmware staging.",
  },
];

export interface FailureMode {
  symptom: string;
  cause: string;
}

export const FAILURE_MODES: FailureMode[] = [
  {
    symptom: "Card stays unlocked but tensor throughput is unchanged",
    cause:
      "Some cards complete the unlock without gaining the rate (RTX 3080 Ti 20 GB OEM reports BF16 staying at half rate). Verify with a same-card stock-vs-unlocked benchmark rather than assuming the unlock implies the speedup.",
  },
  {
    symptom: "Display stays blank after the unlock",
    cause:
      "Expected during handoff: the firmware framebuffer is removed just before FLR and the display stays blank until `nvidia-drm` takes over. Display handoff was not part of the RTX 4090 validation.",
  },
  {
    symptom: "`gpu_unlock` appears in the log but the card is not unlocked",
    cause:
      "The module loaded after NVIDIA had already bound the card, or `gpu_unlock.targets=` is missing/wrong. The override must run from the initramfs, before the driver binds.",
  },
  {
    symptom: "Firmware on a card never stops",
    cause:
      "The module logs it and keeps the DMA buffers that firmware may still use until the next power off. Power off before trying again.",
  },
];
