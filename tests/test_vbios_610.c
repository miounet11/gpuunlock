// SPDX-License-Identifier: GPL-2.0-only
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vbios_610.h"

static void w32(u8 *p, u32 v)
{
	for (int i = 0; i < 4; i++)
		p[i] = v >> (8 * i);
}

#include "vbios_fixture.h"

int main(int argc, char **argv)
{
	u8 rom[4096], image[1280] = {0};
	struct gpu_unlock_fwsec fw;
	u32 offset;

	for (int stride = 6; stride <= 8; stride += 2) {
		vbios_fixture(rom, stride);
		assert(!gpu_unlock_vbios_fwsec(rom, sizeof(rom), &fw));
		assert(fw.image_off == 684 && fw.image_size == 1280);
	}
	/* Allocate the actual short length: a larger backing array hides overreads. */
	for (size_t len = 0; len < 4096; len++) {
		u8 *short_rom = malloc(len ? len : 1);
		assert(short_rom);
		memcpy(short_rom, rom, len);
		assert(gpu_unlock_vbios_fwsec(short_rom, len, &fw));
		free(short_rom);
	}
	/* Legacy + EFI with NPDE continuation + VN/NPDS extension. The BIT
	 * pointers address the extension as if it followed the legacy image. */
	for (int ext_len = 10; ext_len <= 11; ext_len++) {
		u8 chain[8192] = {0};
		vbios_fixture(rom, 6);
		memcpy(chain, rom, 4096);
		chain[53] = 0;
		chain[4096] = 0x55; chain[4097] = 0xaa; chain[4096+0x18] = 32;
		memcpy(chain+4096+32, "PCIR", 4);
		chain[4096+42] = 24; chain[4096+48] = 8;
		chain[4096+52] = 3; chain[4096+53] = 0x80;
		memcpy(chain+4096+64, "NPDE", 4);
		chain[4096+69] = 1; chain[4096+70] = ext_len;
		chain[4096+72] = 1; /* one 512-byte subimage */
		chain[4608] = 'V'; chain[4609] = 'N'; chain[4608+0x18] = 32;
		memcpy(chain+4608+32, "NPDS", 4);
		chain[4608+42] = 24; chain[4608+48] = 7;
		chain[4608+52] = 0xe0; chain[4608+53] = 0x80;
		w32(chain+100, 4096+128);
		memcpy(chain+4608+128, rom+128, 18);
		w32(chain+4608+142, 4096+256);
		memcpy(chain+4608+256, rom+256, 428+1280);
		assert(!gpu_unlock_vbios_fwsec(chain, sizeof(chain), &fw));
		assert(fw.image_off == 4608+684);
		assert(gpu_unlock_vbios_fwsec(chain, 4608, &fw) == -EINVAL);
		/* RGIS/BB77 is also supported, malformed data signatures are not. */
		chain[4608] = 0x77; chain[4609] = 0xbb;
		memcpy(chain+4608+32, "RGIS", 4);
		assert(!gpu_unlock_vbios_fwsec(chain, sizeof(chain), &fw));
		chain[4096+70] = 9;
		assert(gpu_unlock_vbios_fwsec(chain, sizeof(chain), &fw) == -EINVAL);
		chain[4096+70] = ext_len; chain[4096+72] = 0;
		assert(gpu_unlock_vbios_fwsec(chain, sizeof(chain), &fw) == -EINVAL);
	}
	vbios_fixture(rom, 8);
	w32(rom + 264, 0xffffffff);
	assert(gpu_unlock_vbios_fwsec(rom, sizeof(rom), &fw) == -EINVAL);
	vbios_fixture(rom, 8);
	w32(rom + 288, 0xffffffff);
	assert(gpu_unlock_vbios_fwsec(rom, sizeof(rom), &fw) == -EINVAL);
	vbios_fixture(rom, 8);
	assert(!gpu_unlock_vbios_fwsec(rom, sizeof(rom), &fw));
	image[256] = 1; image[257] = 4; image[258] = 8; image[259] = 2;
	w32(image + 260, 4); w32(image + 264, 32);
	image[292] = 3; image[294] = 64;
	w32(image + 296, 128); w32(image + 300, 44);
	assert(!gpu_unlock_fwsec_patch_frts(image, &fw, 0x100000));
	assert(image[332] == 0x15 && image[384] == 1);
	fw.interface_off = fw.dmem_size - 1;
	assert(gpu_unlock_fwsec_patch_frts(image, &fw, 0x100000) == -EINVAL);
	fw.interface_off = 0;
	w32(image + 264, 0xfffffff0);
	assert(gpu_unlock_fwsec_patch_frts(image, &fw, 0x100000) == -EINVAL);
	assert(!gpu_unlock_fwsec_sig_offset(7, 0, 384, &offset) && offset == 0);
	assert(!gpu_unlock_fwsec_sig_offset(5, 2, 384, &offset) && offset == 384);
	assert(gpu_unlock_fwsec_sig_offset(1, 1, 384, &offset) == -ERANGE);
	/* Optional integration check; normal tests contain no board-owned blobs. */
	if (argc == 2) {
		FILE *prom = fopen(argv[1], "rb");
		u8 *image;
		size_t got;

		assert(prom);
		assert(!fseek(prom, 0, SEEK_END));
		got = ftell(prom);
		assert(got == 1024 * 1024);
		rewind(prom);
		image = malloc(got);
		assert(image && fread(image, 1, got, prom) == got);
		fclose(prom);
		assert(!gpu_unlock_vbios_fwsec(image, got, &fw));
		assert(fw.ucode_id == 9 && fw.sig_count == 3 && fw.sig_versions == 7);
		assert(fw.engine_mask == 0x400 && fw.imem_size == 0xda00 && fw.dmem_size == 0x800);
		assert(fw.image_off == 0x4289c && fw.image_size == 0xe200);
		assert(fw.pkc_off == 0x5a4 && fw.interface_off == 0x1c);
		/* Revision 05 recorded Booter fuse version 1. That selects signature slot 1. */
		assert(!gpu_unlock_fwsec_sig_offset(fw.sig_versions, 1, 384, &offset) && offset == 384);
		assert(!gpu_unlock_fwsec_patch_frts(image + fw.image_off, &fw, 0x5ffe00000ull));
		{
			const u8 *cmd = image + fw.image_off + fw.data_off + 0x7c0;
			u32 frts4k = (u32)cmd[32] | ((u32)cmd[33] << 8) | ((u32)cmd[34] << 16) | ((u32)cmd[35] << 24);

			assert(frts4k == (0x5ffe00000ull >> 12));
			assert(cmd[36] == 0 && cmd[37] == 1 && cmd[40] == 2);
		}
		free(image);
	}
	puts("vbios valid-chain, malformed range, patch and signature checks passed");
	return 0;
}
